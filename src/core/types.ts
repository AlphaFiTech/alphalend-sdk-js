/**
 * Core Types
 *
 * Contains all type definitions used throughout the AlphaLend SDK:
 * - Protocol-specific types and interfaces
 * - Transaction parameter types
 * - Response types for various operations
 * - Type guards and type utilities
 * - Enums for protocol states and options
 * - Blockchain-specific type mappings
 */

// import { QuoteResponse } from "@7kprotocol/sdk-ts";
import { RouterDataV3 } from "@cetusprotocol/aggregator-sdk";
import { Transaction, TransactionArgument } from "@mysten/sui/transactions";
import { Decimal } from "decimal.js";

/**
 * Options for the AlphalendClient constructor
 */
export interface AlphalendClientOptions {
  coinMetadataMap?: Map<string, CoinMetadata>;
}

/**
 * Interface for coin metadata fetched from GraphQL API
 * Contains essential coin data used throughout the SDK
 */
export interface CoinMetadata {
  coinType: string;
  pythPriceFeedId: string | null;
  pythPriceInfoObjectId: string | null;
  decimals: number;
  pythSponsored: boolean;
  symbol: string;
  coingeckoPrice: string | null;
  pythPrice: string | null;
}

/**
 * Special constant for maximum u64 value (2^64 - 1)
 * Used to indicate withdrawing all collateral when passed as the amount parameter
 * in withdraw operations.
 */
export const MAX_U64: bigint = 18446744073709551615n;

/**
 * Parameter interfaces for protocol operations
 */

/**
 * Parameters for supplying assets as collateral to a lending market
 * Used with the `supply` method
 */
export interface SupplyParams {
  /** Market ID where collateral is being added */
  marketId: string;
  /** Amount to supply as collateral in base units (in mists) */
  amount: bigint;
  /** Supply coin type (e.g., "0x2::sui::SUI") */
  coinType: string;
  /** Object ID of the position capability object */
  positionCapId?: string;
  /** Address of the user supplying collateral */
  address: string;
}

/**
 * Parameters for zap-in supply operation to a lending market
 * Used with the `zapInSupply` method to swap input tokens and supply them as collateral in a single transaction
 */
export interface ZapInSupplyParams {
  /** Market ID where collateral is being added */
  marketId: string;
  /** Slippage for the swap (e.g., 0.01 for 1%) */
  slippage: number;
  /** Coin type of the market that is being swapped in (e.g., "0x2::sui::SUI") */
  marketCoinType: string;
  /** Amount to supply as collateral in base units (in mists) */
  inputAmount: bigint;
  /** Supply coin type (e.g., "0x2::sui::SUI") */
  inputCoinType: string;
  /** Object ID of the position capability object */
  positionCapId?: string;
  /** Address of the user supplying collateral */
  address: string;
}

/**
 * Parameters for withdrawing collateral from a lending market
 * Used with the `withdraw` method
 */
export interface WithdrawParams {
  /** Market ID from which to withdraw */
  marketId: string;
  /** Amount to withdraw (in mists, use MAX_U64 constant to withdraw all) */
  amount: bigint;
  /** Withdraw coin type (e.g., "0x2::sui::SUI") */
  coinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user withdrawing collateral */
  address: string;
  /** Coin types of the coins whose price needs to be updated
   * (Will have to pass all market coin types that user has supplied or borrowed in and current market coin type in which user is withdrawing) */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for zap-out withdraw operation to a lending market
 * Used with the `zapOutWithdraw` method to swap input tokens and withdraw them from a single market in a single transaction
 */
export interface ZapOutWithdrawParams {
  /** Market ID from which to withdraw */
  marketId: string;
  /** Amount to withdraw (in mists, use MAX_U64 constant to withdraw all) */
  amount: bigint;
  /** Withdraw coin type (e.g., "0x2::sui::SUI") */
  marketCoinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user withdrawing collateral */
  address: string;
  /** Coin types of the coins whose price needs to be updated
   * (Will have to pass all market coin types that user has supplied or borrowed in and current market coin type in which user is withdrawing) */
  priceUpdateCoinTypes: string[];
  /** Slippage for the swap (e.g., 0.01 for 1%) */
  slippage: number;
  /** Withdraw coin type (e.g., "0x2::sui::SUI") */
  outputCoinType: string;
}

/**
 * Parameters for borrowing assets from a lending market
 * Used with the `borrow` method
 */
export interface BorrowParams {
  /** Market ID to borrow from */
  marketId: string;
  /** Amount to borrow in base units (in mists) */
  amount: bigint;
  /** Borrow coin type (e.g., "0x2::sui::SUI") */
  coinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user borrowing tokens */
  address: string;
  /** Coin types of the coins whose price needs to be updated
   * (Will have to pass all market coin types that user has supplied or borrowed in and current market coin type in which user is borrowing) */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for repaying borrowed assets to a lending market
 * Used with the `repay` method
 */
export interface RepayParams {
  /** Market ID where the debt exists */
  marketId: string;
  /** Amount to repay in base units (in mists) */
  amount: bigint;
  /** Repay coin type (e.g., "0x2::sui::SUI") */
  coinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user repaying the debt */
  address: string;
}

/**
 * Parameters for claiming rewards accrued from lending or borrowing
 * Used with the `claimRewards` method
 */
export interface ClaimRewardsParams {
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user supplying collateral */
  address: string;
  /**
   * Whether to claim and deposit alpha rewards
   * @deprecated Use `claimAndDepositAlpha` instead.
   */
  claimAlpha?: boolean;
  /**
   * Whether to claim and deposit all rewards (except alpha)
   * @deprecated Use `claimAndDepositAll` instead.
   */
  claimAll?: boolean;
  /** Whether to deposit alpha rewards */
  claimAndDepositAlpha?: boolean;
  /** Whether to deposit all rewards (except alpha) */
  claimAndDepositAll?: boolean;
}

/**
 * Parameters for claiming rewards, swapping, and repaying borrowed assets (or supplying if no debt)
 * Used with the `claimSwapAndSupplyOrRepay` method
 *
 * Note: This method handles both repay and supply scenarios. If there's no debt, the entire amount
 * will be supplied to the market.
 */
export interface ClaimSwapAndSupplyOrRepayOrTransferParams {
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user claiming rewards */
  address: string;
  /** Target coin type to swap all rewards into and repay */
  targetCoinType: string;
  /** Market ID to repay the debt (or supply if no debt) */
  targetMarketId?: string;
  /** Whether the target coin is borrowed */
  isTargetBorrowed?: boolean;
  /** Whether to transfer the target coin to the wallet */
  transferTargetCoin?: boolean;
  /** Slippage tolerance */
  slippage: number;
  /** Coin types of user's supplied assets (for price updates) */
  priceUpdateCoinTypes: string[];
  /** Optional map of reward coin types to their amounts in base units (for accurate quotes and USD calculations) */
  rewardAmounts?: Map<string, string>;
  /** If true, claims rewards < $0.01 directly to wallet (only swap checkbox case) */
  claimSmallRewardsToWallet?: boolean;
}

/**
 * Market info for repay and supply operations
 */
export interface MarketInfo {
  /** Market ID */
  marketId: string;
}

/**
 * Parameters for claiming rewards, repaying borrowed coins, and supplying the rest
 * Used with the `claimAndSupplyOrRepay` method
 */
export interface ClaimAndSupplyOrRepayParams {
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user claiming rewards */
  address: string;
  /** Map of borrowed coin types to their market info */
  borrowedCoins: Map<string, MarketInfo>;
  /** Map of coin types to supply markets for leftover coins after repay */
  supplyMarkets?: Map<string, MarketInfo>;
  /** Coin types for price updates */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for liquidating an unhealthy position
 * Used with the `liquidate` method
 */
export interface LiquidateParams {
  tx?: Transaction;
  /** Object ID of the position to liquidate */
  liquidatePositionId: string;
  /** Market ID where debt is repaid */
  borrowMarketId: string;
  /** Market ID where collateral is seized */
  withdrawMarketId: string;
  /** Amount of debt to repay in base units */
  repayCoin: TransactionArgument;
  /** Fully qualified coin type for debt repayment */
  borrowCoinType: string;
  /** Fully qualified coin type for collateral to seize */
  withdrawCoinType: string;
  /** Coin types of the coins whose price needs to be updated
   * (Will have to pass all market coin types that user has supplied or borrowed in and current market coin type in which is being liquidated) */
  priceUpdateCoinTypes: string[];
  /** Whether to update all prices */
  updateAllPrices?: boolean;
}

/**
 * Response structure for transaction operations
 */
export interface TransactionResponse {
  /** Transaction hash/digest */
  txDigest: string;
  /** Status of the transaction */
  status: "success" | "failure";
  /** Gas fee paid for the transaction */
  gasFee?: Decimal;
  /** Timestamp when the transaction completed */
  timestamp?: number;
}

/**
 * Data models for market information
 */

/**
 * Represents a statistics of a protocol
 */
export interface ProtocolStats {
  /** Total token supply in the protocol */
  totalSuppliedUsd: string;
  /** Total tokens borrowed from the protocol */
  totalBorrowedUsd: string;
}

/**
 * Represents a lending market in the protocol
 * Contains all market-specific data including rates, limits, and configuration
 */
export interface MarketData {
  /** Unique identifier for the market */
  marketId: string;
  /** Price of the market coin in USD */
  price: Decimal;
  /** Fully qualified coin type handled by this market (e.g., "0x2::sui::SUI") */
  coinType: string;
  /** Number of decimal places used by the coin (e.g., 9 for SUI) */
  decimalDigit: number;
  /** Total token supply in the market (in base units) */
  totalSupply: Decimal;
  /** Total tokens borrowed from the market (in base units) */
  totalBorrow: Decimal;
  /** Current utilization rate as a decimal (0.0 to 1.0) */
  utilizationRate: Decimal;
  /** Annual percentage rate for suppliers including base interest and additional rewards */
  supplyApr: {
    /** Base interest rate for suppliers (as a decimal) */
    interestApr: Decimal;
    /** Staking APR for market coin type (e.g. stSUI) */
    stakingApr: Decimal;
    /** Additional incentive rewards for suppliers */
    rewards: {
      /** The coin type of the reward token */
      coinType: string;
      /** Annual percentage rate of the reward (as a decimal) */
      rewardApr: Decimal;
    }[];
  };
  /** Annual percentage rate for borrowers including base interest and additional rewards */
  borrowApr: {
    /** Base interest rate for borrowers (as a decimal) */
    interestApr: Decimal;
    /** Additional incentive rewards for borrowers */
    rewards: {
      /** The coin type of the reward token */
      coinType: string;
      /** Annual percentage rate of the reward (as a decimal) */
      rewardApr: Decimal;
    }[];
  };
  /** Loan-to-value ratio as a decimal (0.0 to 1.0) */
  ltv: Decimal;
  /** Available liquidity in the market (in base units) */
  availableLiquidity: Decimal;
  /** Fee charged for borrowing (as a decimal percentage) */
  borrowFee: Decimal;
  /** Liquidation threshold as a decimal (0.0 to 1.0) */
  liquidationThreshold: Decimal;
  /** Maximum amount that can be borrowed from the market (in base units) */
  allowedBorrowAmount: Decimal;
  /** Maximum amount that can be deposited into the market (in base units) */
  allowedDepositAmount: Decimal;
  /** Weighting factor applied to borrowed amounts for risk calculations */
  borrowWeight: Decimal;
  /** Exchange rate between base token and xToken (protocol's interest-bearing token) */
  xtokenRatio: Decimal;
}

/**
 * Represents a user's complete portfolio in the protocol
 * Includes all positions, balances, rewards, and related metrics
 */
export interface UserPortfolio {
  /** Unique identifier for the user's position */
  positionId: string;
  /** Total value of assets minus liabilities (in USD) */
  netWorth: Decimal;
  /** Daily earnings from lending and rewards (in USD) */
  dailyEarnings: Decimal;
  /** Net annual percentage rate across all positions (weighted average) */
  netApr: Decimal;
  /** Maximum amount that can be borrowed without risk of liquidation (in USD) */
  safeBorrowLimit: Decimal;
  /** Percentage of the borrow limit that is currently used (0.0 to 1.0) */
  borrowLimitUsed: Decimal;
  /** Threshold at which the position becomes eligible for liquidation (in USD) */
  liquidationThreshold: Decimal;
  /** Total value of all supplied assets (in USD) */
  totalSuppliedUsd: Decimal;
  /** Weighted average supply APR across all markets */
  aggregatedSupplyApr: Decimal;
  /** Total value of all borrowed assets (in USD) */
  totalBorrowedUsd: Decimal;
  /** Weighted average borrow APR across all markets */
  aggregatedBorrowApr: Decimal;
  /** Map of market IDs to supplied amounts (in token's base units) */
  suppliedAmounts: Map<number, Decimal>;
  /** Map of market IDs to borrowed amounts (in token's base units) */
  borrowedAmounts: Map<number, Decimal>;
  /** Total USD value of all unclaimed rewards */
  rewardsToClaimUsd: Decimal;
  /** Detailed breakdown of rewards by token type */
  rewardsToClaim: {
    coinType: string;
    rewardAmount: Decimal;
  }[];
}

export interface quoteObject {
  gateway: string;
  estimatedAmountOut: bigint;
  estimatedFeeAmount: bigint;
  inputAmount: bigint;
  inputAmountInUSD: number;
  estimatedAmountOutInUSD: number;
  slippage: number;
  rawQuote: RouterDataV3;
}
