import { CoinStruct, SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { getConstants } from "../constants/index.js";
import {
  Transaction,
  TransactionObjectArgument,
  TransactionResult,
} from "@mysten/sui/transactions";
import {
  getPriceInfoObjectIdsWithoutUpdate,
  getPriceInfoObjectIdsWithUpdate,
  updatePriceTransaction,
} from "../utils/oracle.js";
import { pythPriceFeedIds } from "../utils/priceFeedIds.js";
import {
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
  ClaimRewardsParams,
  LiquidateParams,
  Market,
  Portfolio,
  ProtocolStats,
} from "./types.js";
import { PythPriceInfo } from "../coin/types.js";
import { getProtocolStats } from "../models/protocol.js";
import { getAllMarkets } from "../models/market.js";
import { getUserPortfolio } from "../models/position.js";
import { getClaimRewardInput, getEstimatedGasBudget } from "../utils/helper.js";
import { setPrice } from "../utils/helper.js";

/**
 * AlphaLend Client
 *
 * The main entry point for interacting with the AlphaLend protocol:
 * - Provides methods for all protocol actions (supply, borrow, withdraw, repay)
 * - Handles connection to the Sui blockchain
 * - Manages transaction building, signing and submission
 * - Exposes query methods for protocol state and user positions
 * - Initializes and coordinates other protocol components
 */

const constants = getConstants();

export class AlphalendClient {
  client: SuiClient;
  pythClient: SuiPythClient;
  pythConnection: SuiPriceServiceConnection;

  constructor(client: SuiClient) {
    this.client = client;
    this.pythClient = new SuiPythClient(
      client,
      constants.PYTH_STATE_ID,
      constants.WORMHOLE_STATE_ID,
    );
    this.pythConnection = new SuiPriceServiceConnection(
      // "https://hermes.pyth.network",
      "https://hermes-beta.pyth.network",
    );
  }

  /**
   * Updates price information for assets from Pyth oracle
   *
   * @param coinTypes Array of coin types or symbols
   * @returns Transaction object with price update calls
   */
  async updatePrices(
    tx: Transaction,
    coinTypes: string[],
  ): Promise<Transaction | undefined> {
    // Get price feed IDs for the coin types, filtering out undefined ones
    const priceFeedToCoinTypeMap = new Map<string, string>();
    const priceFeedIds: string[] = [];
    coinTypes.forEach((coinType) => {
      const priceFeedId = pythPriceFeedIds[coinType];
      if (priceFeedId) {
        priceFeedToCoinTypeMap.set(priceFeedId, coinType);
        priceFeedIds.push(priceFeedId);
      }
    });

    if (priceFeedIds.length === 0) {
      return undefined; // Return undefined if no valid price feeds found
    }

    const priceFeedToInfoIdMap = new Map<string, string>();
    (
      await getPriceInfoObjectIdsWithoutUpdate(priceFeedIds, this.pythClient)
    ).forEach((infoId, index) => {
      if (infoId) {
        priceFeedToInfoIdMap.set(priceFeedIds[index], infoId);
      }
    });

    const current_timestamp = (new Date().getTime() / 1000).toFixed(0);
    const priceFeedIdsToUpdate = await this.getPriceIdsToUpdate(
      priceFeedToInfoIdMap,
      current_timestamp,
    );

    if (priceFeedIdsToUpdate.length > 0) {
      const updatedPriceInfoObjectIds = await getPriceInfoObjectIdsWithUpdate(
        tx,
        priceFeedIdsToUpdate,
        this.pythClient,
        this.pythConnection,
      );
      priceFeedIdsToUpdate.forEach((priceFeedId, index) => {
        priceFeedToInfoIdMap.set(priceFeedId, updatedPriceInfoObjectIds[index]);
      });
    }

    for (const [
      priceFeedId,
      priceInfoObjectId,
    ] of priceFeedToInfoIdMap.entries()) {
      const coinType = priceFeedToCoinTypeMap.get(priceFeedId);
      if (coinType) {
        updatePriceTransaction(tx, {
          priceInfoObject: priceInfoObjectId,
          coinType: coinType,
        });
      }
    }

    return tx;
  }

  /**
   * Supplies token collateral to the AlphaLend protocol
   *
   * @param params Supply parameters - marketId, amount, supplyCoinType, positionCapId, address, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async supply(params: SupplyParams): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Get coin object
    const isSui = params.coinType === constants.SUI_COIN_TYPE;
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

      supplyCoinA = tx.splitCoins(coin, [params.amount.floor().toString()]);
      tx.transferObjects([coin], params.address);
    } else {
      supplyCoinA = tx.splitCoins(tx.gas, [params.amount.floor().toString()]);
    }

    if (params.positionCapId) {
      // Build add_collateral transaction
      tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
          tx.object(params.positionCapId), // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoinA, // Coin to supply as collateral
          tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
        ],
      });
    } else {
      const positionCap = await this.createPosition(tx);
      // Build add_collateral transaction
      tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
          positionCap, // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoinA, // Coin to supply as collateral
          tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
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
   * @param params Withdraw parameters - marketId, amount, withdrawCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async withdraw(params: WithdrawParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    await this.setPrices(tx);

    const promise = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::remove_collateral`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount.floor().toString()), // Amount to withdraw
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    const isSui = params.coinType === constants.SUI_COIN_TYPE;
    let coin: string | TransactionObjectArgument | undefined;
    if (isSui) {
      coin = tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::fullfill_promise_SUI`,
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(constants.SUI_SYSTEM_STATE_ID),
          tx.object(constants.SUI_CLOCK_OBJECT_ID),
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
   * @param params Borrow parameters - marketId, amount, borrowCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async borrow(params: BorrowParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    await this.setPrices(tx);
    const promise = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::borrow`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount.floor().toString()), // Amount to borrow
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    const isSui = params.coinType === constants.SUI_COIN_TYPE;
    let coin;
    if (isSui) {
      coin = tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::fullfill_promise_SUI`,
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(constants.SUI_SYSTEM_STATE_ID),
          tx.object(constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else {
      coin = tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::fullfill_promise`,
        typeArguments: [params.coinType],
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(constants.SUI_CLOCK_OBJECT_ID),
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
   * @param params Repay parameters - marketId, amount, repayCoinType, positionCapId, address, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async repay(params: RepayParams): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Get coin object
    // Add 1 to the amount to repay to avoid rounding errors since contract returns the remaining amount.
    const isSui = params.coinType === constants.SUI_COIN_TYPE;
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

      repayCoinA = tx.splitCoins(coin, [
        params.amount.add(1).floor().toString(),
      ]);
      tx.transferObjects([coin], params.address);
    } else {
      repayCoinA = tx.splitCoins(tx.gas, [
        params.amount.add(1).floor().toString(),
      ]);
    }

    // Build repay transaction
    const repayCoin = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::repay`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        repayCoinA, // Coin to repay with
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
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
   * @param params ClaimRewards parameters - marketId, coinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async claimRewards(params: ClaimRewardsParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    await this.updatePrices(tx, params.priceUpdateCoinTypes);
    await this.setPrices(tx);

    const rewardInput = await getClaimRewardInput(this.client, params.address);
    for (const data of rewardInput) {
      for (const coinType of data.coinTypes) {
        let [coin1, promise] = tx.moveCall({
          target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::collect_reward`,
          typeArguments: [coinType],
          arguments: [
            tx.object(constants.LENDING_PROTOCOL_ID),
            tx.pure.u64(data.marketId),
            tx.object(params.positionCapId),
            tx.object(constants.SUI_CLOCK_OBJECT_ID),
          ],
        });

        if (promise) {
          const coin2 = await this.handlePromise(tx, promise, coinType);
          if (coin2) {
            tx.transferObjects([coin1, coin2], params.address);
          }
        } else {
          // If no promise returned, just transfer coin1
          tx.transferObjects([coin1], params.address);
        }
      }
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
   * Liquidates an unhealthy position
   *
   * @param params Liquidate parameters - liquidatePositionId, borrowMarketId, withdrawMarketId, repayAmount,
   *               borrowCoinType, withdrawCoinType, coinObjectId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async liquidate(params: LiquidateParams) {
    const tx = params.tx || new Transaction();

    // First update prices to ensure latest oracle values
    await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build liquidate transaction

    const [promise, coin1] = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::liquidate`,
      typeArguments: [params.borrowCoinType, params.withdrawCoinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.pure.id(params.liquidatePositionId), // Position ID to liquidate
        tx.pure.u64(params.borrowMarketId), // Borrow market ID
        tx.pure.u64(params.withdrawMarketId), // Withdraw market ID
        params.repayCoin, // Coin to repay with
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    let coin2: TransactionObjectArgument | undefined;
    if (promise) {
      coin2 = await this.handlePromise(tx, promise, params.borrowCoinType);
    }

    return [coin1, coin2];
  }

  /**
   * Creates a new position in the protocol
   *
   * @returns Transaction object for creating a new position
   */
  async createPosition(tx: Transaction): Promise<TransactionResult> {
    const positionCap = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::create_position`,
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
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
      const stats = await getProtocolStats(this.client);
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
  async getAllMarkets(): Promise<Market[] | undefined> {
    try {
      const markets = await getAllMarkets(this.client);
      return markets;
    } catch (error) {
      console.error("Error getting markets:", error);
      return undefined;
    }
  }

  /**
   * Gets user portfolio data
   *
   * @param userAddress The user's address
   * @returns Promise resolving to Portfolio object
   */
  async getUserPortfolio(userAddress: string): Promise<Portfolio | undefined> {
    try {
      const portfolio = await getUserPortfolio(this.client, userAddress);
      return portfolio;
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return undefined;
    }
  }

  private async getCoinObject(
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

  private async getPriceIdsToUpdate(
    priceFeedToInfoIdMap: Map<string, string>,
    current_timestamp: string,
  ): Promise<string[]> {
    const priceIdsToUpdate: string[] = [];
    for (const [priceFeedId, infoObjectId] of priceFeedToInfoIdMap.entries()) {
      const res = await this.client.getObject({
        id: infoObjectId,
        options: {
          showContent: true,
        },
      });

      if (res.data) {
        const content = res.data.content as unknown as PythPriceInfo;
        const attestation_time =
          content.fields.price_info.fields.attestation_time;
        if (parseFloat(current_timestamp) - parseFloat(attestation_time) > 20) {
          priceIdsToUpdate.push(priceFeedId);
        }
      }
    }

    return priceIdsToUpdate;
  }

  private async setPrices(tx: Transaction) {
    await setPrice(
      tx,
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
      1,
      1,
      1,
    );
    await setPrice(
      tx,
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
      1,
      1,
      1,
    );
    await setPrice(
      tx,
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin3::TESTCOIN3",
      1,
      1,
      1,
    );
    await setPrice(
      tx,
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin4::TESTCOIN4",
      1,
      1,
      1,
    );
    await setPrice(
      tx,
      "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin5::TESTCOIN5",
      1,
      1,
      1,
    );
    await setPrice(
      tx,
      "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin6::TESTCOIN6",
      1,
      1,
      1,
    );
    await setPrice(tx, "0x2::sui::SUI", 1, 1, 1);
  }

  private async handlePromise(
    tx: Transaction,
    promise: any,
    coinType: string,
  ): Promise<TransactionObjectArgument | undefined> {
    if (promise) {
      const coin = tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::fullfill_promise`,
        typeArguments: [coinType],
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID),
          promise,
          tx.object(constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
      return coin;
    }
    return undefined;
  }
}
