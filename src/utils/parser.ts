import {
  FlowLimiterQueryType,
  MarketConfigQueryType,
  MarketQueryType,
  RewardDistributorQueryType,
  RewardQueryType,
  PositionQueryType,
  PositionCapQueryType,
  BorrowQueryType,
  LpPositionCollateralQueryType,
  LpPositionCollateralConfigQueryType,
  UserRewardDistributorQueryType,
  UserRewardQueryType,
} from "./queryTypes.js";
import {
  FlowLimiterType,
  MarketType,
  MarketConfigType,
  RewardType,
  RewardDistributorType,
  PositionType,
  PositionCapType,
  BorrowType,
  LpPositionCollateralType,
  LpPositionCollateralConfigType,
  UserRewardDistributorType,
  UserRewardType,
} from "./parsedTypes.js";

/**
 * Normalizes a Sui coin type string by ensuring all hex addresses have the `0x` prefix.
 * Handles generic types like `DEEPBOOK_STAKED<USDC>` where inner type addresses also need the prefix.
 */
export function normalizeCoinType(coinType: string): string {
  if (coinType.includes("sui::SUI")) {
    return "0x2::sui::SUI";
  }
  return coinType
    .split("<")
    .map((segment) => {
      const trimmed = segment.replaceAll(">", "");
      if (trimmed.length > 0 && !trimmed.startsWith("0x")) {
        return "0x" + segment;
      }
      return segment;
    })
    .join("<");
}

/**
 * Parse a FlowLimiterQueryType from the raw query type
 */
export function parseFlowLimiter(flowLimiter: {
  fields: FlowLimiterQueryType;
  type: string;
}): FlowLimiterType {
  const fields = flowLimiter.fields;
  return {
    flowDelta: fields.flow_delta.fields.value,
    lastUpdate: fields.last_update,
    maxRate: fields.max_rate,
    windowDuration: fields.window_duration,
  };
}

/**
 * Parse a RewardQueryType from the raw query type
 */
export function parseReward(reward: RewardQueryType | null): RewardType | null {
  if (!reward) return null;
  reward.fields.coin_type.fields.name = normalizeCoinType(
    reward.fields.coin_type.fields.name,
  );

  return {
    id: reward.fields.id.id,
    coinType: reward.fields.coin_type.fields.name,
    distributorId: reward.fields.distributor_id,
    isAutoCompounded: reward.fields.is_auto_compounded,
    autoCompoundMarketId: reward.fields.auto_compound_market_id,
    totalRewards: reward.fields.total_rewards,
    startTime: reward.fields.start_time,
    endTime: reward.fields.end_time,
    distributedRewards: (
      BigInt(reward.fields.distributed_rewards.fields.value) / BigInt(1e18)
    ).toString(),
    cummulativeRewardsPerShare:
      reward.fields.cummulative_rewards_per_share.fields.value,
  };
}

/**
 * Parse a RewardDistributorQueryType from the raw query type
 */
export function parseRewardDistributor(distributor: {
  fields: RewardDistributorQueryType;
  type: string;
}): RewardDistributorType {
  const fields = distributor.fields;
  return {
    id: fields.id.id,
    lastUpdated: fields.last_updated,
    marketId: fields.market_id,
    rewards: fields.rewards.map(parseReward),
    totalXtokens: fields.total_xtokens,
  };
}

/**
 * Parse a MarketConfigQueryType from the raw query type
 */
export function parseMarketConfig(config: {
  fields: MarketConfigQueryType;
  type: string;
}): MarketConfigType {
  const fields = config.fields;
  return {
    active: fields.active,
    borrowFeeBps: fields.borrow_fee_bps,
    borrowWeight: fields.borrow_weight.fields.value,
    borrowLimit: fields.borrow_limit,
    borrowLimitPercentage: fields.borrow_limit_percentage,
    cascadeMarketId: fields.cascade_market_id,
    closeFactorPercentage: fields.close_factor_percentage,
    collateralTypes: fields.collateral_types.map(
      (typeQuery) => typeQuery.fields.name,
    ),
    depositFeeBps: fields.deposit_fee_bps,
    depositLimit: fields.deposit_limit,
    extensionFields: {
      id: fields.extension_fields.fields.id.id,
      size: fields.extension_fields.fields.size,
    },
    interestRateKinks: fields.interest_rate_kinks,
    interestRates: fields.interest_rates,
    isNative: fields.is_native,
    isolated: fields.isolated,
    lastUpdated: fields.last_updated,
    liquidationBonusBps: fields.liquidation_bonus_bps,
    liquidationFeeBps: fields.liquidation_fee_bps,
    liquidationThreshold: fields.liquidation_threshold,
    protocolFeeShareBps: fields.protocol_fee_share_bps,
    protocolSpreadFeeShareBps: fields.protocol_spread_fee_share_bps,
    safeCollateralRatio: fields.safe_collateral_ratio,
    spreadFeeBps: fields.spread_fee_bps,
    timeLock: fields.time_lock,
    withdrawFeeBps: fields.withdraw_fee_bps,
  };
}

/**
 * Parse a MarketQueryType from the raw query type
 */
export function parseMarket(marketRaw: MarketQueryType): MarketType {
  if (!marketRaw.content || marketRaw.content.dataType !== "moveObject") {
    throw new Error(`Market ${marketRaw.objectId} data not found or invalid`);
  }

  const marketFields = marketRaw.content.fields.value.fields;
  marketFields.coin_type.fields.name = normalizeCoinType(
    marketFields.coin_type.fields.name,
  );
  marketFields.price_identifier.fields.coin_type.fields.name =
    normalizeCoinType(
      marketFields.price_identifier.fields.coin_type.fields.name,
    );

  return {
    marketDynamicFieldId: marketRaw.content.fields.id.id,
    balanceHolding: marketFields.balance_holding,
    borrowRewardDistributor: parseRewardDistributor(
      marketFields.borrow_reward_distributor,
    ),
    borrowedAmount: marketFields.borrowed_amount,
    coinType: marketFields.coin_type.fields.name,
    compoundedInterest: marketFields.compounded_interest.fields.value,
    config: parseMarketConfig(marketFields.config),
    decimalDigit: (
      BigInt(marketFields.decimal_digit.fields.value) / BigInt(1e18)
    ).toString(),
    depositFlowLimiter: parseFlowLimiter(marketFields.deposit_flow_limiter),
    depositRewardDistributor: parseRewardDistributor(
      marketFields.deposit_reward_distributor,
    ),
    id: marketFields.id.id,
    lastAutoCompound: marketFields.last_auto_compound,
    lastUpdate: marketFields.last_update,
    marketId: marketFields.market_id,
    outflowLimiter: parseFlowLimiter(marketFields.outflow_limiter),
    priceIdentifier: {
      coinType: marketFields.price_identifier.fields.coin_type.fields.name,
      type: marketFields.price_identifier.type,
    },
    unclaimedSpreadFee: marketFields.unclaimed_spread_fee,
    unclaimedSpreadFeeProtocol: marketFields.unclaimed_spread_fee_protocol,
    writeoffAmount: marketFields.writeoff_amount,
    xtokenRatio: marketFields.xtoken_ratio.fields.value,
    xtokenSupply: marketFields.xtoken_supply,
    xtokenType: marketFields.xtoken_type.fields.name,
  };
}

// ------------------------------------------------------------------------

/**
 * Parse a PositionCapQueryType from the raw query type
 */
export function parsePositionCap(
  positionCapRaw: PositionCapQueryType,
): PositionCapType {
  if (
    !positionCapRaw.content ||
    positionCapRaw.content.dataType !== "moveObject"
  ) {
    throw new Error(
      `PositionCap ${positionCapRaw.objectId} data not found or invalid`,
    );
  }

  const fields = positionCapRaw.content.fields;

  return {
    id: fields.id.id,
    positionId: fields.position_id,
    clientAddress: fields.client_address,
  };
}

/**
 * Parse a BorrowQueryType from the raw query type
 */
export function parseBorrow(borrow: {
  fields: BorrowQueryType;
  type: string;
}): BorrowType {
  const fields = borrow.fields;
  fields.coin_type.fields.name = normalizeCoinType(
    fields.coin_type.fields.name,
  );

  return {
    amount: fields.amount,
    borrowCompoundedInterest: fields.borrow_compounded_interest.fields.value,
    borrowTime: fields.borrow_time,
    coinType: fields.coin_type.fields.name,
    marketId: fields.market_id,
    rewardDistributorIndex: fields.reward_distributor_index,
  };
}

/**
 * Parse a LpPositionCollateralConfigQueryType from the raw query type
 */
export function parseLpPositionCollateralConfig(config: {
  fields: LpPositionCollateralConfigQueryType;
  type: string;
}): LpPositionCollateralConfigType {
  const fields = config.fields;

  return {
    closeFactorPercentage: fields.close_factor_percentage,
    liquidationBonus: fields.liquidation_bonus,
    liquidationFee: fields.liquidation_fee,
    liquidationThreshold: fields.liquidation_threshold,
    safeCollateralRatio: fields.safe_collateral_ratio,
  };
}

/**
 * Parse a LpPositionCollateralQueryType from the raw query type
 */
export function parseLpPositionCollateral(
  lpCollateral: {
    fields: LpPositionCollateralQueryType;
    type: string;
  } | null,
): LpPositionCollateralType | null {
  if (!lpCollateral) return null;

  const fields = lpCollateral.fields;

  return {
    config: parseLpPositionCollateralConfig(fields.config),
    lastUpdated: fields.last_updated,
    liquidity: fields.liquidity,
    liquidationValue: fields.liquidation_value.fields.value,
    lpPositionId: fields.lp_position_id,
    lpType: fields.lp_type,
    poolId: fields.pool_id,
    safeUsdValue: fields.safe_usd_value.fields.value,
    usdValue: fields.usd_value.fields.value,
  };
}

/**
 * Parse a UserRewardQueryType from the raw query type
 */
export function parseUserReward(userReward: {
  fields: UserRewardQueryType | null;
  type: string;
}): UserRewardType | null {
  if (!userReward.fields) return null;

  const fields = userReward.fields;
  fields.coin_type.fields.name = normalizeCoinType(
    fields.coin_type.fields.name,
  );

  return {
    rewardId: fields.reward_id,
    coinType: fields.coin_type.fields.name,
    earnedRewards: (
      BigInt(fields.earned_rewards.fields.value) / BigInt(1e18)
    ).toString(),
    cummulativeRewardsPerShare:
      fields.cummulative_rewards_per_share.fields.value,
    isAutoCompounded: fields.is_auto_compounded,
    autoCompoundMarketId: fields.auto_compound_market_id,
  };
}

/**
 * Parse a UserRewardDistributorQueryType from the raw query type
 */
export function parseUserRewardDistributor(userRewardDistributor: {
  fields: UserRewardDistributorQueryType;
  type: string;
}): UserRewardDistributorType {
  const fields = userRewardDistributor.fields;

  return {
    rewardDistributorId: fields.reward_distributor_id,
    marketId: fields.market_id,
    share: fields.share,
    rewards: fields.rewards.map(parseUserReward),
    lastUpdated: fields.last_updated,
    isDeposit: fields.is_deposit,
  };
}

/**
 * Parse a PositionQueryType from the raw query type
 */
export function parsePosition(positionRaw: PositionQueryType): PositionType {
  if (!positionRaw.content || positionRaw.content.dataType !== "moveObject") {
    throw new Error(
      `Position ${positionRaw.objectId} data not found or invalid`,
    );
  }

  const fields = positionRaw.content.fields.value.fields;

  // Parse collaterals
  const collaterals = fields.collaterals.fields.contents.map(
    (content: { fields: { key: string; value: string } }) => ({
      key: content.fields.key,
      value: content.fields.value,
    }),
  );

  return {
    positionDynamicFieldId: positionRaw.objectId,
    additionalPermissibleBorrowUsd:
      fields.additional_permissible_borrow_usd.fields.value,
    collaterals,
    id: fields.id.id,
    isIsolatedBorrowed: fields.is_isolated_borrowed,
    isPositionHealthy: fields.is_position_healthy,
    isPositionLiquidatable: fields.is_position_liquidatable,
    lastRefreshed: fields.last_refreshed,
    liquidationValue: fields.liquidation_value.fields.value,
    loans: fields.loans.map(parseBorrow),
    lpCollaterals: parseLpPositionCollateral(fields.lp_collaterals),
    partnerId: fields.partner_id,
    rewardDistributors: fields.reward_distributors.map(
      parseUserRewardDistributor,
    ),
    safeCollateralUsd: fields.safe_collateral_usd.fields.value,
    spotTotalLoanUsd: fields.spot_total_loan_usd.fields.value,
    totalCollateralUsd: fields.total_collateral_usd.fields.value,
    totalLoanUsd: fields.total_loan_usd.fields.value,
    weightedSpotTotalLoanUsd: fields.weighted_spot_total_loan_usd.fields.value,
    weightedTotalLoanUsd: fields.weighted_total_loan_usd.fields.value,
  };
}
