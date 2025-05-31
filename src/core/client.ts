import { CoinStruct, SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { getAlphafiConstants, getConstants } from "../constants/index.js";
import {
  Transaction,
  TransactionObjectArgument,
  TransactionResult,
  TransactionArgument,
} from "@mysten/sui/transactions";
import {
  getPriceInfoObjectIdsWithUpdate,
  updatePriceTransaction,
} from "../utils/oracle.js";
import {
  priceInfoObjectIdMap,
  pythPriceFeedIdMap,
} from "../utils/priceFeedIds.js";
import {
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
  ClaimRewardsParams,
  LiquidateParams,
  MarketData,
  UserPortfolio,
  ProtocolStats,
} from "./types.js";
import {
  getAlphaReceipt,
  getClaimRewardInput,
  getEstimatedGasBudget,
  setPrices,
} from "../utils/helper.js";
import { Receipt } from "../utils/queryTypes.js";
import { Constants } from "../constants/types.js";
import { getUserPositionCapId } from "../models/position/functions.js";
import { LendingProtocol } from "../models/lendingProtocol.js";
import { Market } from "../models/market.js";

/**
 * AlphaLend Client
 *
 * The main entry point for interacting with the AlphaLend protocol:
 * - Provides methods for all protocol actions (supply, borrow, withdraw, repay, claimRewards, liquidate)
 * - Handles connection to the Sui blockchain and Pyth oracle
 * - Manages transaction building for protocol interactions
 * - Exposes query methods for protocol state, markets, and user positions
 * - Initializes and coordinates price feed updates
 */

export class AlphalendClient {
  client: SuiClient;
  pythClient: SuiPythClient;
  pythConnection: SuiPriceServiceConnection;
  network: string;
  constants: Constants;
  lendingProtocol: LendingProtocol;

  /**
   * Creates a new AlphaLend client instance
   *
   * @param network Network to connect to ("mainnet", "testnet", or "devnet")
   * @param client SuiClient instance for blockchain interaction
   */
  constructor(network: string, client: SuiClient) {
    this.network = network;
    this.client = client;
    this.constants = getConstants(network);
    this.pythClient = new SuiPythClient(
      client,
      this.constants.PYTH_STATE_ID,
      this.constants.WORMHOLE_STATE_ID,
    );
    this.pythConnection = new SuiPriceServiceConnection(
      network === "mainnet"
        ? "https://hermes.pyth.network"
        : "https://hermes-beta.pyth.network",
    );
    this.lendingProtocol = new LendingProtocol(network, client);
  }

  /**
   * Updates price information for assets from Pyth oracle
   *
   * This method:
   * 1. Gathers price feed IDs for the specified coins
   * 2. Fetches the latest price data from Pyth oracle
   * 3. Adds price update instructions to the transaction
   * 4. Updates the protocol with new price information
   *
   * @param tx - Transaction object to add price update calls to
   * @param coinTypes - Array of fully qualified coin types (e.g., "0x2::sui::SUI")
   * @returns Transaction object with price update calls
   */
  async updatePrices(tx: Transaction, coinTypes: string[]) {
    const updatePriceFeedIds: string[] = [];
    if (
      coinTypes.includes(
        "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
      )
    ) {
      updatePriceFeedIds.push(
        pythPriceFeedIdMap[
          "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI"
        ],
      );
    }
    if (
      coinTypes.includes(
        "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
      )
    ) {
      updatePriceFeedIds.push(
        pythPriceFeedIdMap[
          "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL"
        ],
      );
    }
    if (updatePriceFeedIds.length > 0) {
      await getPriceInfoObjectIdsWithUpdate(
        tx,
        updatePriceFeedIds,
        this.pythClient,
        this.pythConnection,
      );
    }

    for (const coinType of coinTypes) {
      const priceInfoObjectId = priceInfoObjectIdMap[coinType];
      updatePriceTransaction(
        tx,
        {
          priceInfoObject: priceInfoObjectId,
          coinType: coinType,
        },
        this.constants,
      );
    }
  }

  /**
   * Supplies token collateral to the AlphaLend protocol
   *
   * @param params Supply parameters
   * @param params.marketId Market ID where collateral is being added
   * @param params.amount Amount to supply as collateral in base units (bigint, in mists)
   * @param params.coinType Fully qualified coin type to supply (e.g., "0x2::sui::SUI")
   * @param params.positionCapId Optional: Object ID of the position capability object
   * @param params.address Address of the user supplying collateral
   * @returns Transaction object ready for signing and execution
   */
  async supply(params: SupplyParams): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // Get coin object
    const isSui = params.coinType === this.constants.SUI_COIN_TYPE;
    let supplyCoinA: TransactionObjectArgument | undefined;
    if (!isSui) {
      const coin = await this.getCoinObject(
        tx,
        params.coinType,
        params.address,
      );
      if (!coin) {
        console.error("Coin object not found");
        return undefined;
      }

      supplyCoinA = tx.splitCoins(coin, [params.amount]);
      tx.transferObjects([coin], params.address);
    } else {
      supplyCoinA = tx.splitCoins(tx.gas, [params.amount]);
    }

    if (params.positionCapId) {
      // Build add_collateral transaction
      tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
          tx.object(params.positionCapId), // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoinA, // Coin to supply as collateral
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
        ],
      });
    } else {
      const positionCapId = await getUserPositionCapId(
        this.client,
        this.network,
        params.address,
      );
      let positionCap: TransactionObjectArgument;
      if (positionCapId) {
        positionCap = tx.object(positionCapId);
      } else {
        positionCap = this.createPosition(tx);
      }
      // Build add_collateral transaction
      tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
          positionCap, // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoinA, // Coin to supply as collateral
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
        ],
      });
      tx.transferObjects([positionCap], params.address);
    }

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);
    return tx;
  }

  /**
   * Withdraws token collateral from the AlphaLend protocol
   *
   * @param params Withdraw parameters
   * @param params.marketId Market ID from which to withdraw
   * @param params.amount Amount to withdraw in base units (bigint, in mists, use MAX_U64 to withdraw all)
   * @param params.coinType Fully qualified coin type to withdraw (e.g., "0x2::sui::SUI")
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user withdrawing collateral
   * @param params.priceUpdateCoinTypes Array of coin types to update prices for
   * @returns Transaction object ready for signing and execution
   */
  async withdraw(params: WithdrawParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    if (this.network === "mainnet") {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    } else {
      await setPrices(tx);
    }

    const promise = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::remove_collateral`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount), // Amount to withdraw
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    const isSui = params.coinType === this.constants.SUI_COIN_TYPE;
    let coin: string | TransactionObjectArgument | undefined;
    if (isSui) {
      coin = tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::fulfill_promise_SUI`,
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(this.constants.SUI_SYSTEM_STATE_ID),
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else {
      coin = await this.handlePromise(tx, promise, params.coinType);
    }
    if (coin) {
      tx.transferObjects([coin], params.address);
    }

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);
    return tx;
  }

  /**
   * Borrows tokens from the AlphaLend protocol
   *
   * @param params Borrow parameters
   * @param params.marketId Market ID to borrow from
   * @param params.amount Amount to borrow in base units (bigint, in mists)
   * @param params.coinType Fully qualified coin type to borrow (e.g., "0x2::sui::SUI")
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user borrowing tokens
   * @param params.priceUpdateCoinTypes Array of coin types to update prices for
   * @returns Transaction object ready for signing and execution
   */
  async borrow(params: BorrowParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    if (this.network === "mainnet") {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    } else {
      await setPrices(tx);
    }

    const promise = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::borrow`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount), // Amount to borrow
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    const isSui = params.coinType === this.constants.SUI_COIN_TYPE;
    let coin;
    if (isSui) {
      coin = tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::fulfill_promise_SUI`,
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(this.constants.SUI_SYSTEM_STATE_ID),
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else {
      coin = tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::fulfill_promise`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    }
    tx.transferObjects([coin], params.address);

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);

    return tx;
  }

  /**
   * Repays borrowed tokens to the AlphaLend protocol
   *
   * @param params Repay parameters
   * @param params.marketId Market ID where debt exists
   * @param params.amount Amount to repay in base units (bigint, in mists)
   * @param params.coinType Fully qualified coin type to repay (e.g., "0x2::sui::SUI")
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user repaying the debt
   * @returns Transaction object ready for signing and execution
   */
  async repay(params: RepayParams): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // Get coin object
    // Add 1 to the amount to repay to avoid rounding errors since contract returns the remaining amount.
    const isSui = params.coinType === this.constants.SUI_COIN_TYPE;
    let repayCoinA: TransactionObjectArgument | undefined;
    if (!isSui) {
      const coin = await this.getCoinObject(
        tx,
        params.coinType,
        params.address,
      );
      if (!coin) {
        console.error("Coin object not found");
        return undefined;
      }
      repayCoinA = tx.splitCoins(coin, [params.amount]);
      tx.transferObjects([coin], params.address);
    } else {
      repayCoinA = tx.splitCoins(tx.gas, [params.amount]);
    }

    // Build repay transaction
    const repayCoin = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        repayCoinA, // Coin to repay with
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    tx.transferObjects([repayCoin], params.address);

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);
    return tx;
  }

  /**
   * Claims rewards from the AlphaLend protocol
   *
   * @param params ClaimRewards parameters
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user claiming rewards
   * @param params.claimAlpha Whether to claim and deposit Alpha token rewards
   * @param params.claimAll Whether to claim and deposit all other reward tokens
   * @returns Transaction object ready for signing and execution
   */
  async claimRewards(params: ClaimRewardsParams): Promise<Transaction> {
    const tx = new Transaction();

    const rewardInput = await getClaimRewardInput(
      this.client,
      this.network,
      params.address,
    );

    let alphaCoin: TransactionObjectArgument | undefined = undefined;
    for (const data of rewardInput) {
      for (let coinType of data.coinTypes) {
        coinType = "0x" + coinType;
        let coin1: TransactionObjectArgument | undefined;
        let promise: TransactionObjectArgument | undefined;
        if (params.claimAll && coinType !== this.constants.ALPHA_COIN_TYPE) {
          [coin1, promise] = tx.moveCall({
            target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::collect_reward_and_deposit`,
            typeArguments: [coinType],
            arguments: [
              tx.object(this.constants.LENDING_PROTOCOL_ID),
              tx.pure.u64(data.marketId),
              tx.object(params.positionCapId),
              tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
            ],
          });
        } else {
          [coin1, promise] = tx.moveCall({
            target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::collect_reward`,
            typeArguments: [coinType],
            arguments: [
              tx.object(this.constants.LENDING_PROTOCOL_ID),
              tx.pure.u64(data.marketId),
              tx.object(params.positionCapId),
              tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
            ],
          });
        }

        if (promise) {
          const coin2 = await this.handlePromise(tx, promise, coinType);
          if (
            params.claimAlpha &&
            coinType === this.constants.ALPHA_COIN_TYPE
          ) {
            if (coin2) {
              alphaCoin = this.mergeAlphaCoins(tx, alphaCoin, [coin2]);
            }
            if (coin1) {
              alphaCoin = this.mergeAlphaCoins(tx, alphaCoin, [coin1]);
            }
          } else {
            if (coin2) {
              tx.transferObjects([coin2], params.address);
            }
            if (coin1) {
              tx.transferObjects([coin1], params.address);
            }
          }
        } else if (coin1) {
          if (
            params.claimAlpha &&
            coinType === this.constants.ALPHA_COIN_TYPE
          ) {
            alphaCoin = this.mergeAlphaCoins(tx, alphaCoin, [coin1]);
          } else {
            tx.transferObjects([coin1], params.address);
          }
        }
      }
    }
    if (alphaCoin) {
      await this.depositAlphaTransaction(tx, alphaCoin, params.address);
    }

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);
    return tx;
  }

  /**
   * Merges multiple Alpha token coins into a single coin
   *
   * @param tx Transaction to add merge operation to
   * @param alphaCoin Existing Alpha coin to merge into (or undefined)
   * @param coins Array of Alpha coins to merge
   * @returns Transaction argument representing the merged coin
   */
  private mergeAlphaCoins(
    tx: Transaction,
    alphaCoin: TransactionObjectArgument | undefined,
    coins: TransactionObjectArgument[],
  ): TransactionObjectArgument {
    if (alphaCoin) {
      tx.mergeCoins(alphaCoin, coins);
    } else {
      alphaCoin = tx.splitCoins(coins[0], [0]);
      tx.mergeCoins(alphaCoin, coins);
    }
    return alphaCoin;
  }

  /**
   * Liquidates an unhealthy position
   *
   * @param params Liquidate parameters - liquidatePositionId, borrowMarketId, withdrawMarketId, repayAmount,
   *               borrowCoinType, withdrawCoinType, coinObjectId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async liquidate(params: LiquidateParams) {
    const tx = params.tx || new Transaction();

    // First update prices to ensure latest oracle values
    if (this.network === "mainnet") {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    } else {
      await setPrices(tx);
    }

    // Build liquidate transaction

    const [promise, coin1] = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::liquidate`,
      typeArguments: [params.borrowCoinType, params.withdrawCoinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.pure.id(params.liquidatePositionId), // Position ID to liquidate
        tx.pure.u64(params.borrowMarketId), // Borrow market ID
        tx.pure.u64(params.withdrawMarketId), // Withdraw market ID
        params.repayCoin, // Coin to repay with
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    let coin2: TransactionObjectArgument | undefined;
    if (promise) {
      coin2 = await this.handlePromise(tx, promise, params.withdrawCoinType);
    }

    return [coin1, coin2];
  }

  /**
   * Creates a new position in the protocol
   *
   * @returns Transaction object for creating a new position
   */
  createPosition(tx: Transaction): TransactionResult {
    const positionCap = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::create_position`,
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
      ],
    });

    return positionCap;
  }

  // Query methods for interacting with on-chain data

  /**
   * Gets statistics of the protocol
   *
   * @returns Promise resolving to a ProtocolStats object
   */
  async getProtocolStats(): Promise<ProtocolStats | undefined> {
    try {
      const markets = await this.lendingProtocol.getAllMarkets();
      const stats = await this.lendingProtocol.getProtocolStats(markets);
      return stats;
    } catch (error) {
      console.error("Error getting protocol stats:", error);
      return undefined;
    }
  }

  /**
   * Gets all markets data from the protocol
   *
   * @returns Promise resolving to an array of Market objects
   */
  async getAllMarkets(): Promise<MarketData[] | undefined> {
    try {
      const markets = await this.lendingProtocol.getAllMarketsData();
      return markets;
    } catch (error) {
      console.error("Error getting markets:", error);
      return undefined;
    }
  }

  /**
   * Gets all markets data from the protocol with cached markets chain data
   *
   * @returns Promise resolving to an array of MarketData objects
   */
  async getAllMarketsWithCachedMarkets(
    markets: Market[],
  ): Promise<MarketData[] | undefined> {
    try {
      return await Promise.all(markets.map((market) => market.getMarketData()));
    } catch (error) {
      console.error("Error getting markets:", error);
      return undefined;
    }
  }

  /**
   * Gets all markets chain data to cache
   *
   * @returns Promise resolving to an array of Market objects
   */
  async getMarketsChain(): Promise<Market[] | undefined> {
    try {
      const markets = await this.lendingProtocol.getAllMarkets();
      return markets;
    } catch (error) {
      console.error("Error getting markets:", error);
      return undefined;
    }
  }

  /**
   * Gets user portfolio data
   *
   * @param userAddress The user's address for which to fetch portfolio data
   * @returns Promise resolving to an array of UserPortfolio objects or undefined if not found
   */
  async getUserPortfolio(
    userAddress: string,
  ): Promise<UserPortfolio[] | undefined> {
    try {
      const portfolio =
        await this.lendingProtocol.getUserPortfolio(userAddress);
      return portfolio;
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return undefined;
    }
  }

  /**
   * Gets user portfolio data with cached markets data
   *
   * @param userAddress The user's address for which to fetch portfolio data
   * @param markets The cached markets data to use for the portfolio
   * @returns Promise resolving to an array of UserPortfolio objects or undefined if not found
   */
  async getUserPortfolioWithCachedMarkets(
    userAddress: string,
    markets: Market[],
  ): Promise<UserPortfolio[] | undefined> {
    try {
      const portfolio = await this.lendingProtocol.getUserPortfolioWithMarkets(
        userAddress,
        markets,
      );
      return portfolio;
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return undefined;
    }
  }

  /**
   * Gets user portfolio data for a specific position
   *
   * @param positionId The position ID to get portfolio data for
   * @returns Promise resolving to a UserPortfolio object or undefined if not found
   */
  async getUserPortfolioFromPosition(
    positionId: string,
  ): Promise<UserPortfolio | undefined> {
    try {
      const position = await this.lendingProtocol.getPosition(positionId);
      const markets = await this.lendingProtocol.getAllMarkets();
      return position.getUserPortfolio(markets);
    } catch (error) {
      console.error("Error getting position:", error);
      return undefined;
    }
  }

  /**
   * Gets a coin object suitable for a transaction
   *
   * @param tx Transaction to which the coin will be added
   * @param type Fully qualified coin type to get
   * @param address Address of the user that owns the coin
   * @returns Transaction argument representing the coin or undefined if not found
   */
  async getCoinObject(
    tx: Transaction,
    type: string,
    address: string,
  ): Promise<string | TransactionObjectArgument | undefined> {
    let coins: CoinStruct[] = [];
    let currentCursor: string | null | undefined = null;

    do {
      const response = await this.client.getCoins({
        owner: address,
        coinType: type,
        cursor: currentCursor,
      });

      coins = coins.concat(response.data);

      // Check if there's a next page
      if (response.hasNextPage && response.nextCursor) {
        currentCursor = response.nextCursor;
      } else {
        // No more pages available
        // console.log("No more receipts available.");
        break;
      }
    } while (currentCursor !== null);

    if (coins.length >= 1) {
      //coin1
      const [coin] = tx.splitCoins(coins[0].coinObjectId, [0]);
      tx.mergeCoins(
        coin,
        coins.map((c) => c.coinObjectId),
      );
      return coin;
    }
  }

  private async handlePromise(
    tx: Transaction,
    promise: TransactionArgument,
    coinType: string,
  ): Promise<TransactionObjectArgument | undefined> {
    if (promise) {
      if (coinType === this.constants.SUI_COIN_TYPE) {
        const coin = tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::fulfill_promise_SUI`,
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            promise,
            tx.object(this.constants.SUI_SYSTEM_STATE_ID),
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });
        return coin;
      } else {
        const coin = tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::fulfill_promise`,
          typeArguments: [coinType],
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            promise,
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });
        return coin;
      }
    }
    return undefined;
  }

  private async depositAlphaTransaction(
    tx: Transaction,
    supplyCoin: TransactionObjectArgument,
    address: string,
  ) {
    const constants = getAlphafiConstants();
    const receipt: Receipt[] = await getAlphaReceipt(this.client, address);

    if (receipt.length === 0) {
      const noneReceipt = tx.moveCall({
        target: `0x1::option::none`,
        typeArguments: [constants.ALPHA_POOL_RECEIPT],
        arguments: [],
      });
      tx.moveCall({
        target: `${constants.ALPHA_LATEST_PACKAGE_ID}::alphapool::user_deposit`,
        typeArguments: [constants.ALPHA_COIN_TYPE],
        arguments: [
          tx.object(constants.VERSION),
          noneReceipt,
          tx.object(constants.ALPHA_POOL),
          tx.object(constants.ALPHA_DISTRIBUTOR),
          supplyCoin,
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else {
      const someReceipt = tx.moveCall({
        target: `0x1::option::some`,
        typeArguments: [constants.ALPHA_POOL_RECEIPT],
        arguments: [tx.object(receipt[0].objectId)],
      });
      tx.moveCall({
        target: `${constants.ALPHA_LATEST_PACKAGE_ID}::alphapool::user_deposit`,
        typeArguments: [constants.ALPHA_COIN_TYPE],
        arguments: [
          tx.object(constants.VERSION),
          someReceipt,
          tx.object(constants.ALPHA_POOL),
          tx.object(constants.ALPHA_DISTRIBUTOR),
          supplyCoin,
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    }
  }
}
