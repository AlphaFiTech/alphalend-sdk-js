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
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
  ClaimRewardsParams,
  ClaimAndSupplyOrRepayParams,
  LiquidateParams,
  MarketData,
  UserPortfolio,
  ProtocolStats,
  CoinMetadata,
  ZapInSupplyParams,
  ZapOutWithdrawParams,
  MAX_U64,
  quoteObject,
  AlphalendClientOptions,
  SwapAndRepayParams,
  ClaimSwapAndSupplyOrRepayOrTransferParams,
  MarketInfo,
  FlashRepayParams,
} from "./types.js";
import {
  getAlphaReceipt,
  getClaimRewardInput,
  setPrices,
} from "../utils/helper.js";
import { Receipt } from "../utils/queryTypes.js";
import { Constants } from "../constants/types.js";
import { getUserPositionCapId } from "../models/position/functions.js";
import { LendingProtocol } from "../models/lendingProtocol.js";
import { Market } from "../models/market.js";
import { SevenKGateway } from "./sevenKSwap.js";
import { Decimal } from "decimal.js";
import { QuoteResponse } from "@7kprotocol/sdk-ts";
import { blockchainCache } from "../utils/blockchainCache.js";
import { CetusSwap, RouterDataV3 } from "./cetusSwap.js";
import { buildFlashRepayTransaction } from "./flashRepay.js";

/**
 * AlphaLend Client
 *
 * The main entry point for interacting with the AlphaLend protocol:
 * - Provides methods for all protocol actions (supply, borrow, withdraw, repay, claimRewards, liquidate)
 * - Handles connection to the Sui blockchain and Pyth oracle
 * - Manages transaction building for protocol interactions
 * - Exposes query methods for protocol state, markets, and user positions
 * - Initializes and coordinates price feed updates
 * - Automatically fetches market data on first use (lazy loading)
 */

export class AlphalendClient {
  client: SuiClient;
  pythClient: SuiPythClient;
  pythConnection: SuiPriceServiceConnection;
  network: string;
  constants: Constants;
  lendingProtocol: LendingProtocol;
  sevenKGateway: SevenKGateway;
  cetusSwap: CetusSwap;

  // Dynamic coin metadata properties
  private coinMetadataMap: Map<string, CoinMetadata> = new Map();
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Creates a new AlphaLend client instance
   *
   * @param network Network to connect to ("mainnet", "testnet", or "devnet")
   * @param client SuiClient instance for blockchain interaction
   */
  constructor(
    network: string,
    client: SuiClient,
    options?: AlphalendClientOptions,
  ) {
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
    this.sevenKGateway = new SevenKGateway();
    this.cetusSwap = new CetusSwap("mainnet");

    // If a coin metadata map is provided, use it and mark as initialized
    if (options?.coinMetadataMap) {
      this.coinMetadataMap = options.coinMetadataMap;
      this.isInitialized = true;
      this.lendingProtocol.updateCoinMetadataMap(this.coinMetadataMap);
    }
  }

  /**
   * Fetches the coin metadata map
   *
   * @returns Promise resolving to a Map<string, CoinMetadata> object
   */
  async fetchCoinMetadataMap(): Promise<Map<string, CoinMetadata>> {
    await this.ensureInitialized();
    return this.coinMetadataMap;
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
    // Auto-initialize market data if needed
    await this.ensureInitialized();

    const updatePriceFeedIds: string[] = [];

    for (const coinType of coinTypes) {
      if (!this.getPythSponsored(coinType)) {
        updatePriceFeedIds.push(this.getPythPriceFeedId(coinType));
      }
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
      // Use dynamic data from GraphQL API
      const priceInfoObjectId = this.getPythPriceInfoObjectId(coinType);
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

  async updateAllPrices(tx: Transaction, coinTypes: string[]) {
    // Auto-initialize market data if needed
    await this.ensureInitialized();

    // Use dynamic data with fallback to hardcoded
    const updatePriceFeedIds: string[] = Array.from(
      new Set(coinTypes.map((coinType) => this.getPythPriceFeedId(coinType))),
    );

    await getPriceInfoObjectIdsWithUpdate(
      tx,
      updatePriceFeedIds,
      this.pythClient,
      this.pythConnection,
    );

    for (const coinType of coinTypes) {
      const priceInfoObjectId = this.getPythPriceInfoObjectId(coinType);
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

    return tx;
  }

  /**
   * Supplies collateral to the AlphaLend protocol with automatic token swapping
   *
   * This method performs a "zap in" operation by first swapping the input token
   * to the market's required collateral token via 7k Protocol, then supplying
   * the swapped tokens as collateral to the specified market.
   *
   * @param params Zap in supply parameters
   * @param params.marketId Market ID where collateral is being added
   * @param params.inputAmount Amount of input tokens to swap and supply (in base units)
   * @param params.inputCoinType Fully qualified type of the input token to swap from (e.g., "0x2::sui::SUI")
   * @param params.marketCoinType Fully qualified type of the market's collateral token to swap to
   * @param params.slippage Maximum allowed slippage percentage for the swap
   * @param params.positionCapId Optional: Object ID of the position capability object
   * @param params.address Address of the user performing the zap in supply
   * @returns Transaction object ready for signing and execution, or undefined if swap fails
   */
  async zapInSupply(
    params: ZapInSupplyParams,
  ): Promise<Transaction | undefined> {
    const tx = new Transaction();

    const quoteResponse = await this.cetusSwap.getCetusSwapQuote(
      params.inputCoinType,
      params.marketCoinType,
      params.inputAmount.toString(),
    );

    if (!quoteResponse) {
      console.error("Failed to get swap quote");
      return undefined;
    }

    const coinObject = await this.getCoinObject(
      tx,
      params.inputCoinType,
      params.address,
      BigInt(quoteResponse.amountIn.toString()),
    );

    if (!coinObject) {
      console.error("Failed to get input coin object");
      return undefined;
    }

    // Split the exact amount needed for the swap from the coin object
    const inputCoin = tx.splitCoins(coinObject, [
      quoteResponse.amountIn.toString(),
    ]);

    // Transfer the remaining coin back to the user
    if (coinObject !== tx.gas) {
      tx.transferObjects([coinObject], params.address);
    }

    const supplyCoin = await this.cetusSwap.cetusSwapTokensTxb(
      quoteResponse as RouterDataV3,
      params.slippage,
      inputCoin,
      params.address,
      tx,
    );
    if (!supplyCoin) {
      console.error("Failed to get coin out from swap");
      return undefined;
    }

    if (params.positionCapId) {
      // Build add_collateral transaction
      tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.marketCoinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
          tx.object(params.positionCapId), // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoin as TransactionObjectArgument, // Coin to supply as collateral
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
        typeArguments: [params.marketCoinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
          positionCap, // Position capability
          tx.pure.u64(params.marketId), // Market ID
          supplyCoin as TransactionObjectArgument, // Coin to supply as collateral
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
        ],
      });
      tx.transferObjects([positionCap], params.address);
    }
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

    return tx;
  }
  async getUserPortfolioFromPositionCapId(
    positionCapId: string,
  ): Promise<UserPortfolio | undefined> {
    try {
      await this.ensureInitialized();
      const position =
        await this.lendingProtocol.getPositionFromPositionCapId(positionCapId);
      const markets = await this.lendingProtocol.getAllMarkets();
      return position.getUserPortfolio(markets);
    } catch (error) {
      console.error("Error getting position:", error);
      return undefined;
    }
  }
  /**
   * Withdraws collateral from the AlphaLend protocol with automatic token swapping
   *
   * This method performs a "zap out" operation by first withdrawing collateral
   * from the specified market, then swapping the withdrawn tokens to the desired
   * output token via 7k Protocol.
   *
   * @param params Zap out withdraw parameters
   * @param params.marketId Market ID from which collateral is being withdrawn
   * @param params.amount Amount to withdraw (in base units)
   * @param params.marketCoinType Fully qualified type of the market's collateral token to withdraw from
   * @param params.outputCoinType Fully qualified type of the desired output token to swap to (e.g., "0x2::sui::SUI")
   * @param params.slippage Maximum allowed slippage percentage for the swap
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user performing the zap out withdraw
   * @param params.priceUpdateCoinTypes Coin types of the coins whose price needs to be updated
   * @returns Transaction object ready for signing and execution, or undefined if swap fails
   */
  async zapOutWithdraw(
    params: ZapOutWithdrawParams,
  ): Promise<Transaction | undefined> {
    const tx = new Transaction();

    let swapInAmount = (params.amount - 1n).toString();
    if (params.amount === MAX_U64) {
      // Refresh position to get latest collateral amount
      const position = await this.lendingProtocol.getPositionFromPositionCapId(
        params.positionCapId,
      );
      const market = await this.lendingProtocol.getMarket(
        parseInt(params.marketId),
      );
      position.refreshSingleMarket(market);
      const collateral = position.position.collaterals.find(
        (collateral) => collateral.key === params.marketId,
      );
      if (!collateral) {
        throw new Error(
          "Collateral not found. User has not supplied to this market.",
        );
      }
      swapInAmount = new Decimal(collateral.value)
        .mul(market.market.xtokenRatio)
        .div(1e18)
        .floor()
        .toString();
    }

    // First update prices to ensure latest oracle values
    if (this.network === "mainnet") {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    } else {
      await setPrices(tx);
    }

    const promise = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::remove_collateral`,
      typeArguments: [params.marketCoinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        tx.pure.u64(params.amount), // Amount to withdraw
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });
    const isSui = params.marketCoinType === this.constants.SUI_COIN_TYPE;
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
      coin = await this.handlePromise(tx, promise, params.marketCoinType);
    }

    const quoteResponse = await this.sevenKGateway.getQuote(
      params.marketCoinType,
      params.outputCoinType,
      swapInAmount,
    );
    const withdrawCoin = await this.sevenKGateway.getTransactionBlock(
      tx,
      params.address,
      params.slippage,
      quoteResponse,
      coin,
    );
    if (withdrawCoin) {
      tx.transferObjects([withdrawCoin], params.address);
    }

    return tx;
  }

  async swapAndRepay(
    params: SwapAndRepayParams,
  ): Promise<Transaction | undefined> {
    const tx = new Transaction();

    const swapInAmount = (params.amount - 1n).toString();

    // Get swap quote (no price update needed for swap itself)
    let quoteResponse;
    try {
      quoteResponse = await this.cetusSwap.getCetusSwapQuote(
        params.swapFromCoinType,
        params.swapToCoinType,
        swapInAmount,
      );
    } catch (error) {
      console.error("[AlphaLend SDK] Error fetching Cetus quote:", error);
      throw new Error(
        `Failed to get swap quote: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    if (!quoteResponse) {
      console.error("[AlphaLend SDK] Cetus returned empty quote");
      throw new Error("Failed to get swap quote: Empty response from Cetus");
    }
    // Check if the input coin is SUI
    const isInputSui = params.swapFromCoinType === this.constants.SUI_COIN_TYPE;
    let coinObject: string | TransactionObjectArgument | undefined;
    let inputCoin;

    if (isInputSui) {
      // For SUI, split directly from gas
      inputCoin = tx.splitCoins(tx.gas, [quoteResponse.amountIn.toString()]);
    } else {
      // For other coins, get the coin object
      coinObject = await this.getCoinObject(
        tx,
        params.swapFromCoinType,
        params.address,
      );

      if (!coinObject) {
        console.error("Failed to get input coin object");
        return undefined;
      }

      // Split the exact amount needed for the swap from the coin object
      inputCoin = tx.splitCoins(coinObject, [
        quoteResponse.amountIn.toString(),
      ]);

      tx.transferObjects([coinObject], params.address);
    }

    // Perform the swap to get the coin for repayment
    let repayCoin;
    try {
      repayCoin = await this.cetusSwap.cetusSwapTokensTxb(
        quoteResponse as RouterDataV3,
        params.slippage,
        inputCoin,
        params.address,
        tx,
      );
    } catch (error) {
      console.error("[AlphaLend SDK] Error building Cetus swap:", error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    if (!repayCoin) {
      console.error("[AlphaLend SDK] Cetus swap returned no coin");
      throw new Error("Failed to perform swap: No coin returned");
    }

    // Repay the debt with the swapped coin
    const remainingCoin = tx.moveCall({
      target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
      typeArguments: [params.swapToCoinType],
      arguments: [
        tx.object(this.constants.LENDING_PROTOCOL_ID), // Protocol object
        tx.object(params.positionCapId), // Position capability
        tx.pure.u64(params.marketId), // Market ID
        repayCoin as TransactionObjectArgument, // Coin to repay with
        tx.object(this.constants.SUI_CLOCK_OBJECT_ID), // Clock object
      ],
    });

    // Transfer remaining coin from repayment back to user
    tx.transferObjects([remainingCoin], params.address);

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

    return tx;
  }

  /**
   * Claims rewards from the AlphaLend protocol
   *
   * @param params ClaimRewards parameters
   * @param params.positionCapId Object ID of the position capability object
   * @param params.address Address of the user claiming rewards
   * @deprecated Use claimAndDepositAlpha instead
   * @param params.claimAlpha Whether to claim and deposit Alpha token rewards
   * @deprecated Use claimAndDepositAll instead
   * @param params.claimAll Whether to claim and deposit all other reward tokens
   * @param params.claimAndDepositAlpha Whether to claim and deposit Alpha token rewards
   * @param params.claimAndDepositAll Whether to claim and deposit all other reward tokens
   * @returns Transaction object ready for signing and execution
   */
  async claimRewards(params: ClaimRewardsParams): Promise<Transaction> {
    const tx = new Transaction();
    params.claimAndDepositAlpha =
      params.claimAndDepositAlpha || params.claimAlpha;
    params.claimAndDepositAll = params.claimAndDepositAll || params.claimAll;

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
        if (
          params.claimAndDepositAll &&
          coinType !== this.constants.ALPHA_COIN_TYPE
        ) {
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
            params.claimAndDepositAlpha &&
            coinType === this.constants.ALPHA_COIN_TYPE
          ) {
            if (coin2) {
              alphaCoin = this.mergeCoins(tx, alphaCoin, [coin2]);
            }
            if (coin1) {
              alphaCoin = this.mergeCoins(tx, alphaCoin, [coin1]);
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
            params.claimAndDepositAlpha &&
            coinType === this.constants.ALPHA_COIN_TYPE
          ) {
            alphaCoin = this.mergeCoins(tx, alphaCoin, [coin1]);
          } else {
            tx.transferObjects([coin1], params.address);
          }
        }
      }
    }
    if (alphaCoin) {
      await this.depositAlphaTransaction(tx, alphaCoin, params.address);
    }

    return tx;
  }

  /**
   * Merges multiple coins of the same type into a single coin
   *
   * @param tx Transaction to add merge operation to
   * @param targetCoin Existing coin to merge into (or undefined)
   * @param coins Array of coins to merge
   * @returns Transaction argument representing the merged coin
   */
  private mergeCoins(
    tx: Transaction,
    targetCoin: TransactionObjectArgument | undefined,
    coins: TransactionObjectArgument[],
  ): TransactionObjectArgument {
    if (targetCoin) {
      tx.mergeCoins(targetCoin, coins);
    } else {
      targetCoin = tx.splitCoins(coins[0], [0]);
      tx.mergeCoins(targetCoin, coins);
    }
    return targetCoin;
  }

  /**
   * Claims all available rewards, swaps them into a single `targetCoinType`, then:
   * - transfers the swapped coin to the wallet if `transferTargetCoin` is true, otherwise
   * - repays `targetMarketId` if `isTargetBorrowed` is true (and transfers any remainder), otherwise
   * - supplies the swapped coin as collateral to `targetMarketId`.
   *
   * On mainnet, optionally updates prices before repay/supply if `priceUpdateCoinTypes` is provided.
   *
   * @param params ClaimSwapAndSupplyOrRepayOrTransferParams - swap/repay/supply configuration
   * @returns Transaction ready for signing and execution, or undefined if nothing is claimable
   */
  async claimSwapAndSupplyOrRepayOrTransfer(
    params: ClaimSwapAndSupplyOrRepayOrTransferParams,
  ): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // Ensure SDK is initialized to have access to coin metadata (including prices)
    await this.ensureInitialized();

    // Get all claimable rewards
    const rewardInput = await getClaimRewardInput(
      this.client,
      this.network,
      params.address,
    );

    if (!rewardInput || rewardInput.length === 0) {
      return undefined;
    }

    if (
      this.network === "mainnet" &&
      params.priceUpdateCoinTypes &&
      params.priceUpdateCoinTypes.length > 0
    ) {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    }

    // Helper function to calculate USD value for a coin type
    const calculateUsdValue = (coinType: string): number | null => {
      const rewardAmount = params.rewardAmounts?.get(coinType);
      if (!rewardAmount) return 0;

      const coinMetadata = this.coinMetadataMap.get(coinType);

      // If metadata is missing, log warning and return null to indicate invalid calculation
      if (!coinMetadata || coinMetadata.decimals === undefined) {
        console.warn(`Missing coin metadata or decimals for ${coinType}.`);
        return null;
      }

      const decimals = coinMetadata.decimals;
      const tokenAmount = Number(rewardAmount) / Math.pow(10, decimals);

      const priceStr = coinMetadata.pythPrice || coinMetadata.coingeckoPrice;
      const price = priceStr ? parseFloat(priceStr) : 0;

      return tokenAmount * price;
    };

    // Pre-calculate USD values for all coin types
    const usdValuesByCoinType = new Map<string, number | null>();
    for (const data of rewardInput) {
      for (let coinType of data.coinTypes) {
        coinType = "0x" + coinType;
        if (!usdValuesByCoinType.has(coinType)) {
          const usdValue = calculateUsdValue(coinType);
          usdValuesByCoinType.set(coinType, usdValue);
        }
      }
    }

    // Collect all reward coins by coin type
    const rewardCoinsByType: Map<string, TransactionObjectArgument[]> =
      new Map();

    // Claim rewards (skip small rewards if claimSmallRewardsToWallet is false)
    for (const data of rewardInput) {
      for (let coinType of data.coinTypes) {
        coinType = "0x" + coinType;

        const usdValue = usdValuesByCoinType.get(coinType);

        // Skip coins with missing metadata (null usdValue)
        if (usdValue === null || usdValue === undefined) {
          continue;
        }

        // Skip claiming small rewards if both checkboxes are checked (claimSmallRewardsToWallet = false)
        const shouldSkipSmallReward =
          !params.claimSmallRewardsToWallet && usdValue > 0 && usdValue < 0.01;
        if (shouldSkipSmallReward) {
          continue; // Skip this reward entirely
        }

        const [coin1, promise] = tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::collect_reward`,
          typeArguments: [coinType],
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            tx.pure.u64(data.marketId),
            tx.object(params.positionCapId),
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });

        if (promise) {
          const coin2 = await this.handlePromise(tx, promise, coinType);
          if (coin2) {
            if (!rewardCoinsByType.has(coinType)) {
              rewardCoinsByType.set(coinType, []);
            }
            rewardCoinsByType.get(coinType)!.push(coin2);
          }
        }

        if (coin1) {
          if (!rewardCoinsByType.has(coinType)) {
            rewardCoinsByType.set(coinType, []);
          }
          rewardCoinsByType.get(coinType)!.push(coin1);
        }
      }
    }

    // Separate coins into those that should be swapped vs those that should be claimed directly
    const coinsToSwap: Map<string, TransactionObjectArgument> = new Map();
    const coinsToClaimDirectly: Map<string, TransactionObjectArgument> =
      new Map();

    for (const [coinType, coins] of rewardCoinsByType.entries()) {
      if (coins.length === 0) continue;

      const mergedCoin = this.mergeCoins(tx, undefined, coins);
      const usdValue = usdValuesByCoinType.get(coinType);

      // Skip coins with missing metadata (should not happen as they're filtered earlier, but safety check)
      if (usdValue === null || usdValue === undefined) {
        console.warn(
          `[claimSwapAndSupplyOrRepayOrTransfer] Skipping coin ${coinType} - missing USD value calculation`,
        );
        continue;
      }

      // Check if this coin is above the $0.01 threshold
      const shouldSwap = usdValue >= 0.01;

      if (shouldSwap) {
        coinsToSwap.set(coinType, mergedCoin);
      } else {
        // Small rewards to be claimed directly to wallet
        coinsToClaimDirectly.set(coinType, mergedCoin);
      }
    }

    // Swap eligible coins to target coin
    let targetCoin: TransactionObjectArgument | undefined = undefined;

    for (const [coinType, mergedCoin] of coinsToSwap.entries()) {
      if (coinType === params.targetCoinType) {
        if (targetCoin) {
          tx.mergeCoins(targetCoin, [mergedCoin]);
        } else {
          targetCoin = mergedCoin;
        }
      } else {
        // Use provided reward amount for quote, or fallback to 1 token
        const quoteAmount = params.rewardAmounts?.get(coinType) || "1000000000";
        const router = await this.cetusSwap.getCetusSwapQuote(
          coinType,
          params.targetCoinType,
          quoteAmount,
        );
        const swappedCoin = await this.cetusSwap.routerSwapWithInputCoin(
          router as RouterDataV3,
          tx,
          mergedCoin,
          params.slippage,
        );

        if (targetCoin) {
          tx.mergeCoins(targetCoin, [swappedCoin]);
        } else {
          targetCoin = swappedCoin;
        }
      }
    }

    // Handle coins that should be claimed directly to wallet
    if (coinsToClaimDirectly.size > 0) {
      const coinsToTransfer = Array.from(coinsToClaimDirectly.values());
      tx.transferObjects(coinsToTransfer, params.address);
    }

    // If no target coin, all rewards were either too small or claimed directly
    if (!targetCoin) {
      // If we have coins claimed directly, return the transaction
      if (coinsToClaimDirectly.size > 0) {
        return tx;
      }
      // Otherwise, nothing to do
      console.error("No target coin available and no small rewards to claim");
      return undefined;
    }

    if (params.transferTargetCoin) {
      tx.transferObjects([targetCoin], params.address);
      return tx;
    }

    if (params.isTargetBorrowed) {
      // Repay the debt using the entire targetCoin
      const remainingCoin = tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
        typeArguments: [params.targetCoinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID),
          tx.object(params.positionCapId),
          tx.pure.u64(params.targetMarketId || 0),
          targetCoin,
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });

      // todo - check if remainingCoin is zero and destroy it if it is
      tx.transferObjects([remainingCoin], params.address);
    } else {
      // Supply the remaining reward coin to the target market
      tx.moveCall({
        target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::add_collateral`,
        typeArguments: [params.targetCoinType],
        arguments: [
          tx.object(this.constants.LENDING_PROTOCOL_ID),
          tx.object(params.positionCapId),
          tx.pure.u64(params.targetMarketId || 0),
          targetCoin,
          tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
        ],
      });
    }
    return tx;
  }

  /**
   * Claims all available rewards, then repays debts for reward coin types present in `borrowedCoins`.
   * Any remainder returned by `repay` is transferred to the wallet.
   *
   * Note: reward coin types that are not present in `borrowedCoins` are currently not processed.
   *
   * On mainnet, optionally updates prices first if `priceUpdateCoinTypes` is provided.
   *
   * @param params ClaimAndSupplyOrRepayParams - claim + repay configuration
   * @returns Transaction object ready for signing and execution
   */
  async claimAndSupplyOrRepay(
    params: ClaimAndSupplyOrRepayParams,
  ): Promise<Transaction | undefined> {
    const tx = new Transaction();

    // Update prices if specified
    if (
      this.network === "mainnet" &&
      params.priceUpdateCoinTypes &&
      params.priceUpdateCoinTypes.length > 0
    ) {
      await this.updatePrices(tx, params.priceUpdateCoinTypes);
    }

    // Get reward input data (markets and coin types)
    const rewardInput = await getClaimRewardInput(
      this.client,
      this.network,
      params.address,
    );

    // Collect rewards for each market and coin type
    const rewardCoinsByType = new Map<string, TransactionObjectArgument[]>();

    const addCoinToMap = (
      coinType: string,
      coin: TransactionObjectArgument,
    ) => {
      const coins = rewardCoinsByType.get(coinType);
      if (coins) {
        coins.push(coin);
      } else {
        rewardCoinsByType.set(coinType, [coin]);
      }
    };

    for (const data of rewardInput) {
      for (let coinType of data.coinTypes) {
        coinType = "0x" + coinType;

        // Collect reward for this coin type
        const [coin1, promise] = tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::collect_reward_and_deposit`,
          typeArguments: [coinType],
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            tx.pure.u64(data.marketId),
            tx.object(params.positionCapId),
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });

        // Handle promise and add coins to map
        if (promise) {
          const coin2 = await this.handlePromise(tx, promise, coinType);
          if (coin2) addCoinToMap(coinType, coin2);
        }
        if (coin1) addCoinToMap(coinType, coin1);
      }
    }

    // Function to supply coin to market or transfer to wallet
    const handleCoin = (
      coin: TransactionObjectArgument,
      coinType: string,
      supplyInfo?: MarketInfo,
    ) => {
      if (supplyInfo) {
        tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::add_collateral`,
          typeArguments: [coinType],
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            tx.object(params.positionCapId),
            tx.pure.u64(supplyInfo.marketId),
            coin,
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });
      } else {
        // todo - check if remainingCoin is zero and destroy it if it is
        tx.transferObjects([coin], params.address);
      }
    };

    // Process each reward coin type
    for (const [coinType, coins] of rewardCoinsByType.entries()) {
      if (coins.length === 0) continue;

      // Merge all coins of this type
      const mergedCoin = tx.splitCoins(coins[0], [0])[0];
      tx.mergeCoins(mergedCoin, coins);

      const borrowInfo = params.borrowedCoins.get(coinType);

      if (borrowInfo) {
        // Repay the debt and handle leftover
        const remainingCoin = tx.moveCall({
          target: `${this.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
          typeArguments: [coinType],
          arguments: [
            tx.object(this.constants.LENDING_PROTOCOL_ID),
            tx.object(params.positionCapId),
            tx.pure.u64(borrowInfo.marketId),
            mergedCoin,
            tx.object(this.constants.SUI_CLOCK_OBJECT_ID),
          ],
        });

        // todo - check if remainingCoin is zero and destroy it if it is
        tx.transferObjects([remainingCoin], params.address);
      } else {
        // Not borrowed - supply or transfer
        handleCoin(mergedCoin, coinType, params.supplyMarkets?.get(coinType));
      }
    }
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
    if (this.network === "mainnet") {
      if (params.updateAllPrices) {
        await this.updateAllPrices(tx, params.priceUpdateCoinTypes);
      } else {
        await this.updatePrices(tx, params.priceUpdateCoinTypes);
      }
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
   * Breaks out of a leveraged looping position using a Navi flash loan.
   * Use like withdraw/repay: same client method + params pattern; returns Transaction for signing.
   *
   * @param params FlashRepayParams - flash repay parameters
   * @returns Transaction ready for signing and execution
   */
  async flashRepay(params: FlashRepayParams): Promise<Transaction> {
    return await buildFlashRepayTransaction(this, params);
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
      await this.ensureInitialized();
      const markets = await this.lendingProtocol.getAllMarkets();
      const stats = await this.lendingProtocol.getProtocolStats(markets);
      return stats;
    } catch (error) {
      console.error("Error getting protocol stats:", error);
      return undefined;
    }
  }

  /**
   * Gets statistics of the protocol with cached markets data
   *
   * @returns Promise resolving to a ProtocolStats object
   */
  async getProtocolStatsWithCachedMarkets(
    markets: Market[],
  ): Promise<ProtocolStats | undefined> {
    try {
      await this.ensureInitialized();
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
   * @param options - Optional configuration for caching
   * @param options.useCache - Whether to use blockchain cache (default: false)
   * @param options.cacheTTL - Custom cache TTL in milliseconds (default: 60000)
   * @returns Promise resolving to an array of Market objects
   */
  async getAllMarkets(options?: {
    useCache?: boolean;
    cacheTTL?: number;
  }): Promise<MarketData[] | undefined> {
    try {
      await this.ensureInitialized();

      const useCache = options?.useCache ?? false;
      const cacheTTL = options?.cacheTTL;

      return await blockchainCache.getOrFetch(
        "markets:all",
        async () => {
          const markets = await this.lendingProtocol.getAllMarketsData();
          return markets;
        },
        {
          skipCache: !useCache,
          ttl: cacheTTL,
        },
      );
    } catch (error) {
      console.error("Error getting markets:", error);
      return undefined;
    }
  }
  /**
   * Gets market data of a particular market id from the protocol
   *
   * @returns Promise resolving to a MarketData object
   */
  async getMarketDataFromId(marketId: number): Promise<MarketData | undefined> {
    try {
      await this.ensureInitialized();
      const market = await this.lendingProtocol.getMarketData(marketId);
      return market;
    } catch (error) {
      console.error("Error getting market:", error);
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
      await this.ensureInitialized();
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
      await this.ensureInitialized();
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
      await this.ensureInitialized();
      const portfolio =
        await this.lendingProtocol.getUserPortfolio(userAddress);
      return portfolio;
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return undefined;
    }
  }

  /**
   * Gets portfolio data from position id with cached markets data
   *
   * @param positionId The position id for which to fetch portfolio data
   * @param markets The cached markets data to use for the portfolio
   * @returns Promise resolving to a UserPortfolio object or undefined if not found
   */
  async getUserPortfolioFromPositionWithCachedMarkets(
    positionId: string,
    markets: Market[],
  ): Promise<UserPortfolio | undefined> {
    try {
      await this.ensureInitialized();
      const position = await this.lendingProtocol.getPosition(positionId);
      return position.getUserPortfolio(markets);
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
      await this.ensureInitialized();
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
      await this.ensureInitialized();
      const position = await this.lendingProtocol.getPosition(positionId);
      const markets = await this.lendingProtocol.getAllMarkets();
      return position.getUserPortfolio(markets);
    } catch (error) {
      console.error("Error getting position:", error);
      return undefined;
    }
  }

  /**
   * Gets a coin object suitable for a transaction. Upto 200 coins are merged together and returned.
   *
   * @param tx Transaction to which the coin will be added
   * @param type Fully qualified coin type to get
   * @param address Address of the user that owns the coin
   * @param amount Optional coin amount in mists. Providing this improves efficiency.
   * Returns a coin with at least the requested amount (if possible by merging up to 200 coins).
   * If the requested amount isn't available, returns the highest value coin that can be created.
   * @returns Transaction argument representing the coin or undefined if coin not found
   */
  async getCoinObject(
    tx: Transaction,
    type: string,
    address: string,
    amount?: bigint,
  ): Promise<string | TransactionObjectArgument | undefined> {
    if (
      type === "0x2::sui::SUI" ||
      type ===
        "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
    ) {
      return tx.gas;
    }
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

    if (coins.length === 1) {
      return tx.object(coins[0].coinObjectId);
    }

    if (coins.length === 0) {
      return undefined;
    }

    // find one coin if it fits
    if (amount) {
      for (let i = 0; i < coins.length; i++) {
        if (BigInt(coins[i].balance) >= amount) {
          return tx.object(coins[i].coinObjectId);
        }
      }
    }

    //sort the coins by value in descending order
    coins
      .sort((a, b) => {
        return Number(b.balance) - Number(a.balance);
      })
      .splice(200);

    if (amount) {
      const coinsToMerge: string[] = [];
      let currentAmount = 0n;
      for (let i = 0; i < coins.length; i++) {
        coinsToMerge.push(coins[i].coinObjectId);
        currentAmount += BigInt(coins[i].balance);
        if (currentAmount >= amount) {
          break;
        }
      }

      // Convert first coin to TransactionObjectArgument to avoid duplicate reference
      const firstCoin = tx.object(coinsToMerge[0]);
      const [coin] = tx.splitCoins(firstCoin, [0]);
      // Merge the remainder (firstCoin) and other coins into the split coin
      const otherCoins = coinsToMerge.slice(1).map((id) => tx.object(id));
      tx.mergeCoins(coin, [firstCoin, ...otherCoins]);
      return coin;
    }

    // Convert first coin to TransactionObjectArgument to avoid duplicate reference
    const firstCoin = tx.object(coins[0].coinObjectId);
    const [coin] = tx.splitCoins(firstCoin, [0]);
    // Merge the remainder (firstCoin) and other coins into the split coin
    const otherCoins = coins.slice(1).map((c) => tx.object(c.coinObjectId));
    tx.mergeCoins(coin, [firstCoin, ...otherCoins]);
    return coin;
  }

  private async handlePromise(
    tx: Transaction,
    promise: TransactionArgument,
    coinType: string,
  ): Promise<TransactionObjectArgument | undefined> {
    if (promise) {
      if (
        coinType === this.constants.SUI_COIN_TYPE ||
        coinType === this.constants.SUI_COIN_TYPE_LONG
      ) {
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

  async getEstimatedGasBudget(
    suiClient: SuiClient,
    tx: Transaction,
    address: string,
  ): Promise<number | undefined> {
    try {
      const simResult = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: address,
      });
      return (
        Number(simResult.effects.gasUsed.computationCost) +
        Number(simResult.effects.gasUsed.nonRefundableStorageFee) +
        1e8
      );
    } catch (err) {
      console.error(`Error estimating transaction gasBudget`, err);
    }
  }

  async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    await this.ensureInitialized();

    // const quoteResponse = await this.sevenKGateway.getQuote(
    //   tokenIn,
    //   tokenOut,
    //   amountIn,
    // );
    const quoteResponse = await this.cetusSwap.getCetusSwapQuote(
      tokenIn,
      tokenOut,
      amountIn,
    );

    const coinIn = this.coinMetadataMap.get(tokenIn);
    const coinOut = this.coinMetadataMap.get(tokenOut);
    // const sevenKEstimatedAmountOut = BigInt(
    //   quoteResponse ? quoteResponse.returnAmountWithDecimal.toString() : 0,
    // );

    // const sevenKEstimatedAmountOutWithoutFee = BigInt(
    //   quoteResponse
    //     ? quoteResponse.returnAmountWithoutSwapFees
    //       ? quoteResponse.returnAmountWithoutSwapFees.toString()
    //       : sevenKEstimatedAmountOut.toString()
    //     : sevenKEstimatedAmountOut.toString(),
    // );

    // const sevenKEstimatedFeeAmount =
    //   sevenKEstimatedAmountOut - sevenKEstimatedAmountOutWithoutFee;

    // const amount = BigInt(
    //   quoteResponse ? quoteResponse.swapAmountWithDecimal : 0,
    // );

    // let quote: quoteObject;
    // const priceA = coinIn?.pythPrice || coinIn?.coingeckoPrice;
    // const priceB = coinOut?.pythPrice || coinOut?.coingeckoPrice;
    // const coinAExpo = coinIn?.decimals;
    // const coinBExpo = coinOut?.decimals;
    // if (priceA && priceB && coinAExpo && coinBExpo) {
    //   const inputAmountInUSD =
    //     (Number(amount) / Math.pow(10, coinAExpo)) * parseFloat(priceA);
    //   const outputAmountInUSD =
    //     (Number(sevenKEstimatedAmountOut) / Math.pow(10, coinBExpo)) *
    //     parseFloat(priceB);

    //   const slippage =
    //     (inputAmountInUSD - outputAmountInUSD) / inputAmountInUSD;

    //   quote = {
    //     gateway: "7k",
    //     estimatedAmountOut: sevenKEstimatedAmountOut,
    //     estimatedFeeAmount: sevenKEstimatedFeeAmount,
    //     inputAmount: amount,
    //     inputAmountInUSD: inputAmountInUSD,
    //     estimatedAmountOutInUSD: outputAmountInUSD,
    //     slippage: slippage,
    //     rawQuote: quoteResponse,
    //   };
    // } else {
    //   console.warn(
    //     "Could not get prices from Pyth Network, using fallback pricing.",
    //   );
    //   quote = {
    //     gateway: "7k",
    //     estimatedAmountOut: sevenKEstimatedAmountOut,
    //     estimatedFeeAmount: sevenKEstimatedFeeAmount,
    //     inputAmount: amount,
    //     inputAmountInUSD: 0,
    //     estimatedAmountOutInUSD: 0,
    //     slippage: 0,
    //     rawQuote: quoteResponse,
    //   };
    // }
    const cetusEstimatedAmountOut = BigInt(
      quoteResponse ? quoteResponse.amountOut.toString() : 0,
    );

    // const sevenKEstimatedAmountOutWithoutFee = BigInt(
    //   quoteResponse
    //     ? quoteResponse.amountOut.toString()
    //       ? quoteResponse.amountOut.toString()
    //       : cetusEstimatedAmountOut.toString()
    //     : cetusEstimatedAmountOut.toString(),
    // );

    // const cetusEstimatedFeeAmount =
    //   sevenKEstimatedAmountOut - sevenKEstimatedAmountOutWithoutFee;

    const amount = BigInt(
      quoteResponse ? quoteResponse.amountIn.toString() : 0,
    );

    let quote: quoteObject;
    const priceA = coinIn?.pythPrice || coinIn?.coingeckoPrice;
    const priceB = coinOut?.pythPrice || coinOut?.coingeckoPrice;
    const coinAExpo = coinIn?.decimals;
    const coinBExpo = coinOut?.decimals;
    if (priceA && priceB && coinAExpo && coinBExpo) {
      const inputAmountInUSD =
        (Number(amount) / Math.pow(10, coinAExpo)) * parseFloat(priceA);
      const outputAmountInUSD =
        (Number(cetusEstimatedAmountOut) / Math.pow(10, coinBExpo)) *
        parseFloat(priceB);

      const slippage =
        (inputAmountInUSD - outputAmountInUSD) / inputAmountInUSD;

      quote = {
        gateway: "cetus",
        estimatedAmountOut: cetusEstimatedAmountOut,
        estimatedFeeAmount: 0n,
        inputAmount: amount,
        inputAmountInUSD: inputAmountInUSD,
        estimatedAmountOutInUSD: outputAmountInUSD,
        slippage: slippage,
        rawQuote: quoteResponse as RouterDataV3,
      };
    } else {
      console.warn(
        "Could not get prices from Pyth Network, using fallback pricing.",
      );
      quote = {
        gateway: "cetus",
        estimatedAmountOut: cetusEstimatedAmountOut,
        estimatedFeeAmount: 0n,
        inputAmount: amount,
        inputAmountInUSD: 0,
        estimatedAmountOutInUSD: 0,
        slippage: 0,
        rawQuote: quoteResponse as RouterDataV3,
      };
    }

    return quote;
  }

  async getSwapTransactionBlock(
    tx: Transaction,
    address: string,
    slippage: number,
    quoteResponse: QuoteResponse,
    coinIn?: TransactionObjectArgument,
  ) {
    await this.ensureInitialized();
    return await this.sevenKGateway.getTransactionBlock(
      tx,
      address,
      slippage,
      quoteResponse,
      coinIn,
    );
  }

  /**
   * Ensures market data is initialized by fetching from GraphQL API
   * This method is called automatically before any operation that needs market data
   * Only fetches data once - subsequent calls use cached data
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return; // Already initialized, return immediately
    }

    if (this.initializationPromise) {
      // Already initializing, wait for it to complete
      return this.initializationPromise;
    }

    // Start initialization (only happens once)
    this.initializationPromise = this.fetchAndCacheCoinMetadata();
    return this.initializationPromise;
  }

  /**
   * Fetches coin metadata from GraphQL API and caches it
   */
  private async fetchAndCacheCoinMetadata(): Promise<void> {
    try {
      const apiUrl = "https://api.alphalend.xyz/public/graphql";

      // Extended query to get all the data we need
      const query = `
        query {
          coinInfo {
            coinType
            pythPriceFeedId
            pythPriceInfoObjectId
            decimals
            pythSponsored
            symbol
            coingeckoPrice
            pythPrice
          }
        }
      `;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status}`);
      }

      const result = await response.json();
      const coinInfoArray = result.data.coinInfo;

      // Cache the market data
      for (const coin of coinInfoArray) {
        if (
          coin.coinType &&
          coin.pythSponsored !== null &&
          coin.decimals &&
          coin.symbol
        ) {
          this.coinMetadataMap.set(coin.coinType, {
            coinType: coin.coinType,
            pythPriceFeedId: coin.pythPriceFeedId,
            pythPriceInfoObjectId: coin.pythPriceInfoObjectId,
            decimals: coin.decimals,
            pythSponsored: coin.pythSponsored,
            symbol: coin.symbol,
            coingeckoPrice: coin.coingeckoPrice,
            pythPrice: coin.pythPrice,
          });
        }
      }

      const alphaCoinType =
        "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA";
      const alphaCoin = this.coinMetadataMap.get(alphaCoinType);
      if (alphaCoin) {
        this.coinMetadataMap.set(alphaCoinType, {
          ...alphaCoin,
          pythPriceFeedId:
            "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
          pythPriceInfoObjectId:
            "0x29e37978cb1c9501bda5d7c105f24f0058bc1668637e307fbc290dba48cb918d",
          pythSponsored: false,
          pythPrice: alphaCoin.coingeckoPrice,
        });
      }

      const longSuiCoinType =
        "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
      const suiCoinMetadata = this.coinMetadataMap.get("0x2::sui::SUI");
      if (suiCoinMetadata) {
        this.coinMetadataMap.set(longSuiCoinType, suiCoinMetadata);
      }

      this.isInitialized = true;

      // Update LendingProtocol with the fetched coin metadata
      this.lendingProtocol.updateCoinMetadataMap(this.coinMetadataMap);
    } catch (error) {
      throw new Error(
        `Failed to initialize market data: ${error instanceof Error ? error.message : "Unknown error"}. The SDK requires market data to function properly.`,
      );
    }
  }

  /**
   * Gets Pyth price feed ID for a coin type
   * Uses dynamic data fetched from GraphQL API
   */
  private getPythPriceFeedId(coinType: string): string {
    const dynamicData = this.coinMetadataMap.get(coinType);
    if (dynamicData?.pythPriceFeedId) {
      return dynamicData.pythPriceFeedId;
    }

    throw new Error(
      `No Pyth price feed ID found for coin type: ${coinType}. Ensure the coin metadata is properly initialized.`,
    );
  }

  /**
   * Gets price info object ID for a coin type
   * Uses dynamic data fetched from GraphQL API
   */
  private getPythPriceInfoObjectId(coinType: string): string {
    const dynamicData = this.coinMetadataMap.get(coinType);
    if (dynamicData?.pythPriceInfoObjectId) {
      return dynamicData.pythPriceInfoObjectId;
    }

    throw new Error(
      `No price info object ID found for coin type: ${coinType}. Ensure the coin metadata is properly initialized.`,
    );
  }

  /**
   * Gets decimal places for a coin type
   * Uses dynamic data fetched from GraphQL API
   */
  private getDecimals(coinType: string): number {
    const dynamicData = this.coinMetadataMap.get(coinType);
    if (dynamicData?.decimals !== undefined) {
      return dynamicData.decimals;
    }

    throw new Error(
      `No decimal places found for coin type: ${coinType}. Ensure the coin metadata is properly initialized.`,
    );
  }

  /**
   * Gets whether a coin type is pyth sponsored
   * Uses dynamic data fetched from GraphQL API
   */
  private getPythSponsored(coinType: string): boolean {
    const dynamicData = this.coinMetadataMap.get(coinType);
    if (dynamicData?.pythSponsored !== undefined) {
      return dynamicData.pythSponsored;
    }
    return false;
  }
}
