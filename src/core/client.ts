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
  Position,
  Portfolio,
  Loan,
} from "./types.js";
import { PythPriceInfo } from "../coin/types.js";

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
      "https://hermes.pyth.network",
      // "https://hermes-beta.pyth.network",
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
  ): Promise<Transaction> {
    // Get price feed IDs for the coin types, filtering out undefined ones
    const priceFeedIds = coinTypes
      .map((coinType) => pythPriceFeedIds[coinType])
      .filter((id): id is string => id !== undefined);

    if (priceFeedIds.length === 0) {
      return tx; // Return empty transaction if no valid price feeds found
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

    for (const [, priceInfoObjectId] of priceFeedToInfoIdMap.entries()) {
      tx = updatePriceTransaction(tx, {
        oracle: constants.ORACLE_OBJECT_ID,
        priceInfoObject: priceInfoObjectId,
        clock: constants.SUI_CLOCK_OBJECT_ID,
      });
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
    // Create transaction
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Get coin object
    const res = await this.getCoinObject(
      tx,
      params.supplyCoinType,
      params.address,
    );
    if (!res) {
      console.error("Coin object not found");
      return undefined;
    }

    tx = res.tx;
    const [supplyCoinA] = tx.splitCoins(res.coin, [params.amount]);

    if (params.positionCapId) {
      // Build add_collateral transaction
      tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.supplyCoinType],
        arguments: [
          tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
          tx.object(params.positionCapId), // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoinA, // Coin to supply as collateral
          tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
        ],
      });
    } else {
      const { tx: tx2, positionCap } = await this.createPosition(tx);
      tx = tx2;
      // Build add_collateral transaction
      tx.moveCall({
        target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.supplyCoinType],
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
    tx.transferObjects([res.coin], params.address);
    return tx;
  }

  /**
   * Withdraws token collateral from the AlphaLend protocol
   *
   * @param params Withdraw parameters - marketId, amount, withdrawCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async withdraw(params: WithdrawParams): Promise<Transaction> {
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build remove_collateral transaction
    tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::remove_collateral`,
      typeArguments: [params.withdrawCoinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount), // Amount to withdraw
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

    return tx;
  }

  /**
   * Borrows tokens from the AlphaLend protocol
   *
   * @param params Borrow parameters - marketId, amount, borrowCoinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async borrow(params: BorrowParams): Promise<Transaction> {
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Build borrow transaction
    tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::borrow`,
      typeArguments: [params.borrowCoinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount), // Amount to borrow
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

    return tx;
  }

  /**
   * Repays borrowed tokens to the AlphaLend protocol
   *
   * @param params Repay parameters - marketId, amount, repayCoinType, positionCapId, address, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async repay(params: RepayParams): Promise<Transaction | undefined> {
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

    // Get coin object
    const res = await this.getCoinObject(
      tx,
      params.repayCoinType,
      params.address,
    );
    if (!res) {
      console.error("Coin object not found");
      return undefined;
    }

    tx = res.tx;
    const [repayCoinA] = tx.splitCoins(res.coin, [params.amount]);

    // Build repay transaction
    tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::repay`,
      typeArguments: [params.repayCoinType],
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        repayCoinA, // Coin to repay with
        tx.object(constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

    return tx;
  }

  /**
   * Claims rewards from the AlphaLend protocol
   *
   * @param params ClaimRewards parameters - marketId, coinType, positionCapId, priceUpdateCoinTypes
   * @returns Transaction object ready for signing and execution
   */
  async claimRewards(params: ClaimRewardsParams): Promise<Transaction> {
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

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
    let tx = new Transaction();

    // First update prices to ensure latest oracle values
    tx = await this.updatePrices(tx, params.priceUpdateCoinTypes);

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

    return tx;
  }

  /**
   * Creates a new position in the protocol
   *
   * @returns Transaction object for creating a new position
   */
  async createPosition(
    tx: Transaction,
  ): Promise<{ tx: Transaction; positionCap: TransactionResult }> {
    const positionCap = tx.moveCall({
      target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::create_position`,
      arguments: [
        tx.object(constants.LENDING_PROTOCOL_ID), // Protocol object
      ],
    });

    return { tx, positionCap };
  }

  // Query methods for interacting with on-chain data

  /**
   * Gets all markets data from the protocol
   *
   * @returns Promise resolving to an array of Market objects
   */
  async getAllMarkets(): Promise<Market[]> {
    try {
      // Retrieve the lending protocol object
      const objects = await this.client.getObject({
        id: constants.LENDING_PROTOCOL_ID,
        options: {
          showContent: true,
          showType: true,
        },
      });

      // Extract markets object ID from the protocol object
      const content = objects.data?.content;
      if (!content || content.dataType !== "moveObject") {
        throw new Error("Invalid protocol object data");
      }

      const fields = content.fields as Record<string, unknown>;
      const marketsTableId = fields.markets as string;

      // Get all market entries from the markets table
      const marketsData = await this.client.getDynamicFields({
        parentId: marketsTableId,
      });

      // Process each market's data by fetching its details
      const markets: Market[] = [];

      for (const marketData of marketsData.data) {
        // Get the full market object data
        const marketObject = await this.client.getDynamicFieldObject({
          parentId: marketsTableId,
          name: { type: "u64", value: marketData.name },
        });

        if (
          !marketObject.data?.content ||
          marketObject.data.content.dataType !== "moveObject"
        ) {
          continue;
        }

        const marketFields = marketObject.data.content.fields as Record<
          string,
          unknown
        >;

        // Extract the market details and push to results
        const config = (marketFields.config as Record<string, unknown>) || {};
        markets.push({
          marketId: marketFields.market_id as string,
          coinType: marketFields.coin_type as string,
          totalSupply: BigInt(String(marketFields.xtoken_supply || 0)),
          totalBorrow: BigInt(String(marketFields.borrowed_amount || 0)),
          utilizationRate: this.calculateUtilizationRate(
            BigInt(String(marketFields.borrowed_amount || 0)),
            BigInt(String(marketFields.xtoken_supply || 0)),
          ),
          supplyApr: 0, // Would require calculation based on interest rate model
          borrowApr: 0, // Would require calculation based on interest rate model
          ltv: Number(config.safe_collateral_ratio || 0) / 100,
          liquidationThreshold: Number(config.liquidation_threshold || 0) / 100,
          depositLimit: BigInt(String(config.deposit_limit || 0)),
        });
      }

      return markets;
    } catch (error) {
      console.error("Error getting markets:", error);
      return [];
    }
  }

  /**
   * Gets user position details
   *
   * @param positionId The ID of the position to query
   * @returns Promise resolving to Position object
   */
  async getUserPosition(positionId: string): Promise<Position | null> {
    try {
      // Get protocol object first to find positions table
      const protocolObject = await this.client.getObject({
        id: constants.LENDING_PROTOCOL_ID,
        options: {
          showContent: true,
        },
      });

      // Extract positions object ID
      const content = protocolObject.data?.content;
      if (!content || content.dataType !== "moveObject") {
        throw new Error("Invalid protocol object data");
      }

      const fields = content.fields as Record<string, unknown>;
      const positionsTableId = fields.positions as string;

      // Get the specific position from positions table
      const positionObject = await this.client.getDynamicFieldObject({
        parentId: positionsTableId,
        name: { type: "address", value: positionId },
      });

      if (
        !positionObject.data?.content ||
        positionObject.data.content.dataType !== "moveObject"
      ) {
        return null;
      }

      const positionFields = positionObject.data.content.fields as Record<
        string,
        unknown
      >;

      // Process collaterals
      const collaterals: Record<string, bigint> = {};
      const collateralObj =
        (positionFields.collaterals as Record<string, unknown>) || {};
      for (const [marketId, amount] of Object.entries(collateralObj)) {
        collaterals[marketId] = BigInt(String(amount || 0));
      }

      // Process loans
      const loansArray = Array.isArray(positionFields.loans)
        ? positionFields.loans
        : [];
      const loans: Loan[] = loansArray.map(
        (loan: Record<string, unknown>) =>
          ({
            coinType: loan.coin_type as string,
            marketId: loan.market_id as string | number,
            amount: BigInt(String(loan.amount || 0)),
            amountUsd: 0, // Would need oracle price to calculate
          }) as Loan,
      );

      return {
        id: positionId,
        collaterals,
        loans,
        totalCollateralUsd: Number(positionFields.total_collateral_usd || 0),
        totalLoanUsd: Number(positionFields.total_loan_usd || 0),
        healthFactor: this.calculateHealthFactor(
          Number(positionFields.safe_collateral_usd || 0),
          Number(positionFields.weighted_total_loan_usd || 0),
        ),
        isLiquidatable: Boolean(
          positionFields.is_position_liquidatable || false,
        ),
      };
    } catch (error) {
      console.error("Error getting position:", error);
      return null;
    }
  }

  /**
   * Gets user portfolio including all positions
   *
   * @param userAddress The user's address
   * @returns Promise resolving to Portfolio object
   */
  async getUserPortfolio(userAddress: string): Promise<Portfolio | null> {
    try {
      // Fetch all position capabilities owned by the user
      const userObjects = await this.client.getOwnedObjects({
        owner: userAddress,
        filter: {
          StructType: `${constants.ALPHALEND_PACKAGE_ID}::position::PositionCap`,
        },
        options: {
          showContent: true,
        },
      });

      // If no positions are found, return null
      if (!userObjects.data || userObjects.data.length === 0) {
        return null;
      }

      // Process each position capability to get the actual positions
      const positions: Position[] = [];
      let totalSupplied = 0;
      let totalBorrowed = 0;

      for (const obj of userObjects.data) {
        if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
          continue;
        }

        const fields = obj.data.content.fields as Record<string, unknown>;
        const positionId = fields.position_id as string;

        // Get the full position details
        const position = await this.getUserPosition(positionId);
        if (position) {
          positions.push(position);
          totalSupplied += position.totalCollateralUsd;
          totalBorrowed += position.totalLoanUsd;
        }
      }

      // Calculate metrics
      const netWorth = totalSupplied - totalBorrowed;
      const borrowLimit = totalSupplied * 0.8; // Example factor, this would be based on collateral types
      const borrowLimitUsed =
        borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0;

      return {
        userAddress,
        netWorth,
        totalSuppliedUsd: totalSupplied,
        totalBorrowedUsd: totalBorrowed,
        borrowLimitUsd: borrowLimit,
        borrowLimitUsed,
        positions,
      };
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return null;
    }
  }

  /**
   * Calculate utilization rate based on borrowed amount and total supply
   */
  private calculateUtilizationRate(
    borrowedAmount: bigint,
    totalSupply: bigint,
  ): number {
    if (totalSupply === 0n) return 0;
    return Number((borrowedAmount * 10000n) / totalSupply) / 10000;
  }

  /**
   * Calculate health factor based on collateral and borrowed amounts
   */
  private calculateHealthFactor(
    safeCollateralUsd: number,
    weightedTotalLoanUsd: number,
  ): number {
    if (weightedTotalLoanUsd === 0) return Number.POSITIVE_INFINITY;
    return safeCollateralUsd / weightedTotalLoanUsd;
  }

  private async getCoinObject(
    tx: Transaction,
    type: string,
    address: string,
  ): Promise<
    { tx: Transaction; coin: string | TransactionObjectArgument } | undefined
  > {
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
      return { tx, coin };
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
