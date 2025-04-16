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

/**
 * Special constant for maximum u64 value (2^64 - 1)
 * Used to indicate withdrawing all collateral when passed as the amount parameter
 * in withdraw operations.
 */
export const MAX_U64 = BigInt("18446744073709551615");

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
  /** Amount to supply as collateral in base units */
  amount: bigint;
  /** Supply coin type (e.g., "0x2::sui::SUI") */
  supplyCoinType: string;
  /** Object ID of the position capability object */
  positionCapId?: string;
  /** Address of the user supplying collateral */
  address: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for withdrawing collateral from a lending market
 * Used with the `withdraw` method
 */
export interface WithdrawParams {
  /** Market ID from which to withdraw */
  marketId: string;
  /** Amount to withdraw (use MAX_U64 constant to withdraw all) */
  amount: bigint;
  /** Withdraw coin type (e.g., "0x2::sui::SUI") */
  withdrawCoinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for borrowing assets from a lending market
 * Used with the `borrow` method
 */
export interface BorrowParams {
  /** Market ID to borrow from */
  marketId: string;
  /** Amount to borrow in base units */
  amount: bigint;
  /** Borrow coin type (e.g., "0x2::sui::SUI") */
  borrowCoinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for repaying borrowed assets to a lending market
 * Used with the `repay` method
 */
export interface RepayParams {
  /** Market ID where the debt exists */
  marketId: string;
  /** Amount to repay in base units */
  amount: bigint;
  /** Repay coin type (e.g., "0x2::sui::SUI") */
  repayCoinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Address of the user repaying the debt */
  address: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for claiming rewards accrued from lending or borrowing
 * Used with the `claimRewards` method
 */
export interface ClaimRewardsParams {
  /** Market ID to claim rewards from */
  marketId: string;
  /** Fully qualified coin type of the reward */
  coinType: string;
  /** Object ID of the position capability object */
  positionCapId: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
}

/**
 * Parameters for liquidating an unhealthy position
 * Used with the `liquidate` method
 */
export interface LiquidateParams {
  /** Object ID of the position to liquidate */
  liquidatePositionId: string;
  /** Market ID where debt is repaid */
  borrowMarketId: string;
  /** Market ID where collateral is seized */
  withdrawMarketId: string;
  /** Amount of debt to repay in base units */
  repayAmount: bigint;
  /** Fully qualified coin type for debt repayment */
  borrowCoinType: string;
  /** Fully qualified coin type for collateral to seize */
  withdrawCoinType: string;
  /** Object ID of the coin to use for repayment */
  coinObjectId: string;
  /** Coin types of the coins whose price needs to be updated */
  priceUpdateCoinTypes: string[];
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
  gasFee?: bigint;
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
 */
export interface Market {
  /** Unique identifier for the market */
  marketId: string;
  /** Fully qualified coin type handled by this market */
  coinType: string;
  /** Total token supply in the market */
  totalSupply: bigint;
  /** Total tokens borrowed from the market */
  totalBorrow: bigint;
  /** Current utilization rate (0.0 to 1.0) */
  utilizationRate: number;
  /** Annual percentage rate for suppliers */
  supplyApr: {
    interestApr: number;
    rewards: {
      coinType: string;
      rewardApr: number;
    }[];
  };
  /** Annual percentage rate for borrowers */
  borrowApr: {
    interestApr: number;
    rewards: {
      coinType: string;
      rewardApr: number;
    }[];
  };
  /** Loan-to-value ratio (0.0 to 1.0) */
  ltv: number;
  /** Liquidation threshold (0.0 to 1.0) */
  liquidationThreshold: number;
  /** Maximum amount that can be deposited into the market */
  depositLimit: bigint;
}

/**
 * Represents a user's complete portfolio in the protocol
 */
export interface Portfolio {
  /** Address of the portfolio owner */
  userAddress: string;
  /** Total value of assets minus liabilities (USD) */
  netWorth: string;
  /** Total value of supplied assets (USD) */
  totalSuppliedUsd: string;
  /** Total value of borrowed assets (USD) */
  totalBorrowedUsd: string;
  /** Maximum amount that can be borrowed (USD) */
  safeBorrowLimit: string;
  /** Amount of borrowed assets multiplied by the borrow weight (USD) */
  borrowLimitUsed: string;
  /** Limit for liquidation (USD) */
  liquidationLimit: string;
  /** Amount of rewards to claim (USD) */
  rewardsToClaimUsd: string;
  /** Rewards by token */
  rewardsByToken: {
    token: string;
    amount: string;
  }[];
  /** Daily earnings (USD) */
  dailyEarnings: string;
  /** Net annual percentage rate (APR) */
  netApr: string;
  /** Aggregated supply APR */
  aggregatedSupplyApr: string;
  /** Aggregated borrow APR */
  aggregatedBorrowApr: string;
  /** User balances */
  userBalances: {
    marketId: string;
    suppliedAmount: bigint;
    borrowedAmount: bigint;
  }[];
}

/**
 * Represents an outstanding loan
 */
export interface Loan {
  /** Fully qualified coin type of the borrowed asset */
  coinType: string;
  /** Market ID where the loan exists */
  marketId: string;
  /** Amount borrowed in base units */
  amount: bigint;
  /** USD value of the borrowed amount */
  amountUsd: number;
}

/**
 * Represents a user position in the protocol
 */
export interface Position {
  /** Position identifier */
  id: string;
  /** Map of market IDs to collateral amounts */
  collaterals: { [marketId: string]: bigint };
  /** List of outstanding loans */
  loans: Loan[];
  /** Total USD value of all collateral */
  totalCollateralUsd: number;
  /** Total USD value of all loans */
  totalLoanUsd: number;
  /** Health factor (safe when > 1.0) */
  healthFactor: number;
  /** Whether this position is eligible for liquidation */
  isLiquidatable: boolean;
}
