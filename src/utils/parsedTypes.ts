export interface MarketType {
  marketDynamicFieldId: string;
  balanceHolding: string;
  borrowRewardDistributor: RewardDistributorType;
  borrowedAmount: string;
  coinType: string;
  compoundedInterest: string;
  config: MarketConfigType;
  decimalDigit: string;
  depositFlowLimiter: FlowLimiterType;
  depositRewardDistributor: RewardDistributorType;
  id: string;
  lastAutoCompound: string;
  lastUpdate: string;
  marketId: string;
  outflowLimiter: FlowLimiterType;
  priceIdentifier: {
    coinType: string;
    type: string;
  };
  unclaimedSpreadFee: string;
  unclaimedSpreadFeeProtocol: string;
  writeoffAmount: string;
  xtokenRatio: string;
  xtokenSupply: string;
  xtokenType: string;
}

export interface RewardDistributorType {
  id: string;
  lastUpdated: string;
  marketId: string;
  rewards: (RewardType | null)[];
  totalXtokens: string;
}

export interface RewardType {
  id: string;
  coinType: string;
  distributorId: string;
  isAutoCompounded: boolean;
  autoCompoundMarketId: string;
  totalRewards: string;
  startTime: string;
  endTime: string;
  distributedRewards: string;
  cummulativeRewardsPerShare: string;
}

export interface FlowLimiterType {
  flowDelta: string;
  lastUpdate: string;
  maxRate: string;
  windowDuration: string;
}

export interface MarketConfigType {
  active: boolean;
  borrowFeeBps: string;
  borrowWeight: string;
  borrowLimit: string;
  borrowLimitPercentage: string;
  cascadeMarketId: string;
  closeFactorPercentage: number;
  collateralTypes: string[];
  depositFeeBps: string;
  depositLimit: string;
  extensionFields: {
    id: string;
    size: string;
  };
  interestRateKinks: number[];
  interestRates: number[];
  isNative: boolean;
  isolated: boolean;
  lastUpdated: string;
  liquidationBonusBps: string;
  liquidationFeeBps: string;
  liquidationThreshold: number;
  protocolFeeShareBps: string;
  protocolSpreadFeeShareBps: string;
  safeCollateralRatio: number;
  spreadFeeBps: string;
  timeLock: string;
  withdrawFeeBps: string;
}

// <--------- --------->

export interface PositionCapType {
  id: string;
  positionId: string;
  clientAddress: string;
}

export interface PositionType {
  positionDynamicFieldId: string;
  additionalPermissibleBorrowUsd: string;
  collaterals: {
    key: string;
    value: string;
  }[];
  id: string;
  isIsolatedBorrowed: boolean;
  isPositionHealthy: boolean;
  isPositionLiquidatable: boolean;
  lastRefreshed: string;
  liquidationValue: string;
  loans: BorrowType[];
  lpCollaterals: LpPositionCollateralType | null;
  partnerId: string | null;
  rewardDistributors: UserRewardDistributorType[];
  safeCollateralUsd: string;
  spotTotalLoanUsd: string;
  totalCollateralUsd: string;
  totalLoanUsd: string;
  weightedSpotTotalLoanUsd: string;
  weightedTotalLoanUsd: string;
}

export interface LpPositionCollateralType {
  config: LpPositionCollateralConfigType;
  lastUpdated: string;
  liquidity: string;
  liquidationValue: string;
  lpPositionId: string;
  lpType: number;
  poolId: string;
  safeUsdValue: string;
  usdValue: string;
}

export interface LpPositionCollateralConfigType {
  closeFactorPercentage: number;
  liquidationBonus: string;
  liquidationFee: string;
  liquidationThreshold: number;
  safeCollateralRatio: number;
}

export interface BorrowType {
  amount: string;
  borrowCompoundedInterest: string;
  borrowTime: string;
  coinType: string;
  marketId: string;
  rewardDistributorIndex: string;
}

export interface UserRewardDistributorType {
  rewardDistributorId: string;
  marketId: string;
  share: string;
  rewards: (UserRewardType | null)[];
  lastUpdated: string;
  isDeposit: boolean;
}

export interface UserRewardType {
  rewardId: string;
  coinType: string;
  earnedRewards: string;
  cummulativeRewardsPerShare: string;
  isAutoCompounded: boolean;
  autoCompoundMarketId: string;
}
