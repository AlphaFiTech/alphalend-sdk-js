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
import {
  getMarkets,
  getProtocolStats,
  getUserPortfolio,
} from "../functions.js";
import { getEstimatedGasBudget } from "../utils/helper.js";

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
    console.log("supply", params);

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Get coin object
    const coin = await this.getCoinObject(tx, params.coinType, params.address);
    if (!coin) {
      console.error("Coin object not found");
      return undefined;
    }

    const [supplyCoinA] = tx.splitCoins(coin, [params.amount.toNumber()]);

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
   * Withdraws token collateral from the AlphaLend protocol
   *
   * @param params Withdraw parameters - marketId, amount, withdrawCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async withdraw(params: WithdrawParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build remove_collateral transaction
    const coin = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::remove_collateral`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount.toNumber()), // Amount to withdraw
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
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
   * Borrows tokens from the AlphaLend protocol
   *
   * @param params Borrow parameters - marketId, amount, borrowCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async borrow(params: BorrowParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    // await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build borrow transaction
    const coin = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::borrow`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount.toNumber()), // Amount to borrow
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
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
    const coin = await this.getCoinObject(tx, params.coinType, params.address);
    if (!coin) {
      console.error("Coin object not found");
      return undefined;
    }

    const [repayCoinA] = tx.splitCoins(coin, [params.amount.toNumber()]);

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
    tx.transferObjects([repayCoin, coin], params.address);

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

    // Build collect_reward transaction
    tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::collect_reward`,
      typeArguments: [params.coinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.pure.u64(params.marketId), // Market ID
        tx.object(params.positionCapId), // Position capability
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

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
  async liquidate(params: LiquidateParams): Promise<Transaction> {
    const tx = new Transaction();

    // First update prices to ensure latest oracle values
    await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build liquidate transaction
    tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::liquidate`,
      typeArguments: [params.borrowCoinType, params.withdrawCoinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.pure.address(params.liquidatePositionId), // Position ID to liquidate
        tx.pure.u64(params.borrowMarketId), // Borrow market ID
        tx.pure.u64(params.withdrawMarketId), // Withdraw market ID
        tx.object(params.coinObjectId), // Coin to repay with
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

    const estimatedGasBudget = await getEstimatedGasBudget(
      this.client,
      tx,
      params.address,
    );
    if (estimatedGasBudget) tx.setGasBudget(estimatedGasBudget);
    return tx;
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
  async getProtocolStats(): Promise<ProtocolStats> {
    const stats = await getProtocolStats(this.client);
    return stats;
  }

  /**
   * Gets all markets data from the protocol
   *
   * @returns Promise resolving to an array of Market objects
   */
  async getAllMarkets(): Promise<Market[]> {
    const markets = await getMarkets(this.client);
    return markets;
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
}
