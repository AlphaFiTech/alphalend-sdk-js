import {
  MarketGqlFields,
  MarketConfigGql,
  FlowLimiterGql,
  RewardDistributorGql,
  RewardGql,
  PositionGqlFields,
  PositionCapGqlFields,
  BorrowGql,
  LpPositionCollateralGql,
  LpPositionCollateralConfigGql,
  UserRewardDistributorGql,
  UserRewardGql,
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
 * Decode a base64-encoded `vector<u8>` into a `number[]`. The Sui GraphQL
 * `json` output encodes Move `vector<u8>` as a base64 string, whereas the
 * legacy JSON-RPC output returned a plain number array. This helper
 * transparently handles both.
 */
function decodeU8Vec(input: string | number[]): number[] {
  if (Array.isArray(input)) return input.map(Number);
  const buf = Buffer.from(input, "base64");
  return Array.from(buf);
}

/**
 * Normalizes a Sui coin type string by ensuring all hex addresses have the `0x` prefix.
 * Handles generic types like `DEEPBOOK_STAKED<USDC>` where inner type addresses also need the prefix.
 */
export function normalizeCoinType(coinType: string): string {
  if (coinType.endsWith("2::sui::SUI")) {
    return "0x2::sui::SUI";
  }
  return coinType
    .split("<")
    .map((segment) => {
      if (segment.length > 0 && !segment.startsWith("0x")) {
        return "0x" + segment;
      }
      return segment;
    })
    .join("<");
}

// ---------------------------------------------------------------------------
// Market parsers
// ---------------------------------------------------------------------------

export function parseFlowLimiter(flowLimiter: FlowLimiterGql): FlowLimiterType {
  return {
    flowDelta: flowLimiter.flow_delta.value,
    lastUpdate: flowLimiter.last_update,
    maxRate: flowLimiter.max_rate,
    windowDuration: flowLimiter.window_duration,
  };
}

export function parseReward(reward: RewardGql | null): RewardType | null {
  if (!reward) return null;
  const coinType = normalizeCoinType(reward.coin_type);

  return {
    id: reward.id,
    coinType,
    distributorId: reward.distributor_id,
    isAutoCompounded: reward.is_auto_compounded,
    autoCompoundMarketId: reward.auto_compound_market_id,
    totalRewards: reward.total_rewards,
    startTime: reward.start_time,
    endTime: reward.end_time,
    distributedRewards: (
      BigInt(reward.distributed_rewards.value) / BigInt(1e18)
    ).toString(),
    cummulativeRewardsPerShare: reward.cummulative_rewards_per_share.value,
  };
}

export function parseRewardDistributor(
  distributor: RewardDistributorGql,
): RewardDistributorType {
  return {
    id: distributor.id,
    lastUpdated: distributor.last_updated,
    marketId: distributor.market_id,
    rewards: distributor.rewards.map(parseReward),
    totalXtokens: distributor.total_xtokens,
  };
}

export function parseMarketConfig(config: MarketConfigGql): MarketConfigType {
  return {
    active: config.active,
    borrowFeeBps: config.borrow_fee_bps,
    borrowWeight: config.borrow_weight.value,
    borrowLimit: config.borrow_limit,
    borrowLimitPercentage: config.borrow_limit_percentage,
    cascadeMarketId: config.cascade_market_id,
    closeFactorPercentage: config.close_factor_percentage,
    collateralTypes: config.collateral_types.map(normalizeCoinType),
    depositFeeBps: config.deposit_fee_bps,
    depositLimit: config.deposit_limit,
    extensionFields: {
      id: config.extension_fields.id,
      size: config.extension_fields.size,
    },
    interestRateKinks: decodeU8Vec(config.interest_rate_kinks),
    interestRates: config.interest_rates as unknown as number[],
    isNative: config.is_native,
    isolated: config.isolated,
    lastUpdated: config.last_updated,
    liquidationBonusBps: config.liquidation_bonus_bps,
    liquidationFeeBps: config.liquidation_fee_bps,
    liquidationThreshold: config.liquidation_threshold,
    protocolFeeShareBps: config.protocol_fee_share_bps,
    protocolSpreadFeeShareBps: config.protocol_spread_fee_share_bps,
    safeCollateralRatio: config.safe_collateral_ratio,
    spreadFeeBps: config.spread_fee_bps,
    timeLock: config.time_lock,
    withdrawFeeBps: config.withdraw_fee_bps,
  };
}

/**
 * Parse a market's flattened GraphQL fields into the domain `MarketType`.
 *
 * @param fields Flat Move struct fields (from `value.json` / `contents.json`).
 * @param dynamicFieldAddress The address of the `Field<u64, Market>` wrapper
 *        object that holds this market under `MARKETS_TABLE_ID`. Distinct
 *        from `fields.id` (which is the inner `Market` struct's UID).
 */
export function parseMarket(
  fields: MarketGqlFields,
  dynamicFieldAddress: string | undefined,
): MarketType {
  if (!fields) {
    throw new Error(`Market data not found or invalid`);
  }

  const coinType = normalizeCoinType(fields.coin_type);
  const priceCoinType = normalizeCoinType(fields.price_identifier.coin_type);

  return {
    marketDynamicFieldId: dynamicFieldAddress ?? fields.id,
    balanceHolding: fields.balance_holding,
    borrowRewardDistributor: parseRewardDistributor(
      fields.borrow_reward_distributor,
    ),
    borrowedAmount: fields.borrowed_amount,
    coinType,
    compoundedInterest: fields.compounded_interest.value,
    config: parseMarketConfig(fields.config),
    decimalDigit: (
      BigInt(fields.decimal_digit.value) / BigInt(1e18)
    ).toString(),
    depositFlowLimiter: parseFlowLimiter(fields.deposit_flow_limiter),
    depositRewardDistributor: parseRewardDistributor(
      fields.deposit_reward_distributor,
    ),
    id: fields.id,
    lastAutoCompound: fields.last_auto_compound,
    lastUpdate: fields.last_update,
    marketId: fields.market_id,
    outflowLimiter: parseFlowLimiter(fields.outflow_limiter),
    priceIdentifier: {
      coinType: priceCoinType,
    },
    unclaimedSpreadFee: fields.unclaimed_spread_fee,
    unclaimedSpreadFeeProtocol: fields.unclaimed_spread_fee_protocol,
    writeoffAmount: fields.writeoff_amount,
    xtokenRatio: fields.xtoken_ratio.value,
    xtokenSupply: fields.xtoken_supply,
    xtokenType: fields.xtoken_type,
  };
}

// ---------------------------------------------------------------------------
// Position cap parser
// ---------------------------------------------------------------------------

/**
 * Parse a position cap's flattened GraphQL fields into the domain
 * `PositionCapType`. PositionCap is a top-level owned object, so its
 * Sui object address is identical to the inner `id: UID` field — the
 * caller does not need to (and should not) pass it separately.
 */
export function parsePositionCap(
  fields: PositionCapGqlFields,
): PositionCapType {
  if (!fields) {
    throw new Error(`PositionCap data not found or invalid`);
  }
  return {
    id: fields.id,
    positionId: fields.position_id,
    clientAddress: fields.client_address,
  };
}

// ---------------------------------------------------------------------------
// Position parsers
// ---------------------------------------------------------------------------

export function parseBorrow(borrow: BorrowGql): BorrowType {
  return {
    amount: borrow.amount,
    borrowCompoundedInterest: borrow.borrow_compounded_interest.value,
    borrowTime: borrow.borrow_time,
    coinType: normalizeCoinType(borrow.coin_type),
    marketId: borrow.market_id,
    rewardDistributorIndex: borrow.reward_distributor_index,
  };
}

export function parseLpPositionCollateralConfig(
  config: LpPositionCollateralConfigGql,
): LpPositionCollateralConfigType {
  return {
    closeFactorPercentage: config.close_factor_percentage,
    liquidationBonus: config.liquidation_bonus,
    liquidationFee: config.liquidation_fee,
    liquidationThreshold: config.liquidation_threshold,
    safeCollateralRatio: config.safe_collateral_ratio,
  };
}

export function parseLpPositionCollateral(
  lpCollateral: LpPositionCollateralGql | null,
): LpPositionCollateralType | null {
  if (!lpCollateral) return null;
  return {
    config: parseLpPositionCollateralConfig(lpCollateral.config),
    lastUpdated: lpCollateral.last_updated,
    liquidity: lpCollateral.liquidity,
    liquidationValue: lpCollateral.liquidation_value.value,
    lpPositionId: lpCollateral.lp_position_id,
    lpType: lpCollateral.lp_type,
    poolId: lpCollateral.pool_id,
    safeUsdValue: lpCollateral.safe_usd_value.value,
    usdValue: lpCollateral.usd_value.value,
  };
}

export function parseUserReward(
  userReward: UserRewardGql | null,
): UserRewardType | null {
  if (!userReward) return null;
  return {
    rewardId: userReward.reward_id,
    coinType: normalizeCoinType(userReward.coin_type),
    earnedRewards: (
      BigInt(userReward.earned_rewards.value) / BigInt(1e18)
    ).toString(),
    cummulativeRewardsPerShare: userReward.cummulative_rewards_per_share.value,
    isAutoCompounded: userReward.is_auto_compounded,
    autoCompoundMarketId: userReward.auto_compound_market_id,
  };
}

export function parseUserRewardDistributor(
  userRewardDistributor: UserRewardDistributorGql,
): UserRewardDistributorType {
  return {
    rewardDistributorId: userRewardDistributor.reward_distributor_id,
    marketId: userRewardDistributor.market_id,
    share: userRewardDistributor.share,
    rewards: userRewardDistributor.rewards.map(parseUserReward),
    lastUpdated: userRewardDistributor.last_updated,
    isDeposit: userRewardDistributor.is_deposit,
  };
}

export function parsePosition(
  fields: PositionGqlFields,
  dynamicFieldAddress: string | undefined,
): PositionType {
  if (!fields) {
    throw new Error(`Position data not found or invalid`);
  }

  const collaterals = (fields.collaterals?.contents ?? []).map((c) => ({
    key: c.key,
    value: c.value,
  }));

  return {
    positionDynamicFieldId: dynamicFieldAddress ?? fields.id,
    additionalPermissibleBorrowUsd:
      fields.additional_permissible_borrow_usd.value,
    collaterals,
    id: fields.id,
    isIsolatedBorrowed: fields.is_isolated_borrowed,
    isPositionHealthy: fields.is_position_healthy,
    isPositionLiquidatable: fields.is_position_liquidatable,
    lastRefreshed: fields.last_refreshed,
    liquidationValue: fields.liquidation_value.value,
    loans: fields.loans.map(parseBorrow),
    lpCollaterals: parseLpPositionCollateral(fields.lp_collaterals),
    partnerId: fields.partner_id,
    rewardDistributors: fields.reward_distributors.map(
      parseUserRewardDistributor,
    ),
    safeCollateralUsd: fields.safe_collateral_usd.value,
    spotTotalLoanUsd: fields.spot_total_loan_usd.value,
    totalCollateralUsd: fields.total_collateral_usd.value,
    totalLoanUsd: fields.total_loan_usd.value,
    weightedSpotTotalLoanUsd: fields.weighted_spot_total_loan_usd.value,
    weightedTotalLoanUsd: fields.weighted_total_loan_usd.value,
  };
}
