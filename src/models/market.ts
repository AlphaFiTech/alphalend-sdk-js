import { SuiClient } from "@mysten/sui/client";
import { Decimal } from "decimal.js";
import { MarketConfigQueryType, MarketQueryType, RewardDistributorQueryType } from "../utils/queryTypes.js";
import { getConstants } from "../constants/index.js";
import { Market } from "../core/types.js";

const constants = getConstants();

export const getMarketFromChain = async (
  suiClient: SuiClient,
  marketId: number,
): Promise<MarketQueryType | undefined> => {
  const response = await suiClient.getDynamicFieldObject({
    parentId: constants.MARKETS_TABLE_ID,
    name: {
      type: "u64",
      value: marketId.toString(),
    },
  });

  return response.data as MarketQueryType;
};

export const getAllMarkets = async (
  suiClient: SuiClient,
): Promise<Market[]> => {
  try {
    const constants = getConstants();
    const activeMarketIds = constants.ACTIVE_MARKETS;

    // Fetch and process each market from the active market IDs
    const markets: Market[] = [];
    const responses = await Promise.all(
      activeMarketIds.map((id) => getMarketFromChain(suiClient, id)),
    );

    for (const marketObject of responses) {
      if (!marketObject) {
        console.warn(`Market data not found`);
        continue;
      }

      if (
        !marketObject.content ||
        marketObject.content.dataType !== "moveObject"
      ) {
        console.warn(
          `Market ${marketObject.objectId} data not found or invalid`,
        );
        continue;
      }

      const marketFields = marketObject.content.fields.value.fields;

      // Extract the market details and add to results
      const marketConfig = marketFields.config.fields;

      const decimalDigit = new Decimal(marketFields.decimal_digit.fields.value);

      // Calculate utilization rate
      const totalSupply = new Decimal(marketFields.xtoken_supply).div(
        decimalDigit,
      );
      const totalBorrow = new Decimal(marketFields.borrowed_amount).div(
        decimalDigit,
      );
      const utilizationRate = totalSupply.gt(0)
        ? totalBorrow.div(totalSupply)
        : new Decimal(0);

      // Calculate borrow APR
      const borrowApr = calculateBorrowApr(utilizationRate, marketConfig);
      const reserveFactor = new Decimal(
        marketConfig.protocol_fee_share_bps,
      ).div(10000);
      const supplyApr = calculateSupplyApr(
        borrowApr.interestApr,
        utilizationRate,
        reserveFactor,
      );

      const coinType = marketFields.coin_type.fields.name.includes("sui::SUI")
        ? "0x2::sui::SUI"
        : marketFields.coin_type.fields.name;

      markets.push({
        marketId: marketFields.market_id,
        coinType,
        decimalDigit: decimalDigit.log(10).toNumber(),
        totalSupply,
        totalBorrow,
        utilizationRate,
        supplyApr,
        borrowApr,
        ltv: new Decimal(marketConfig.safe_collateral_ratio).div(100),
        liquidationThreshold: new Decimal(
          marketConfig.liquidation_threshold,
        ).div(100),
        depositLimit: new Decimal(marketConfig.deposit_limit),
        borrowFee: new Decimal(marketConfig.borrow_fee_bps).div(100),
        borrowWeight: new Decimal(marketConfig.borrow_weight.fields.value),
        xtokenRatio: new Decimal(marketFields.xtoken_ratio.fields.value),
      });
    }

    return markets;
  } catch (error) {
    console.error("Error fetching markets:", error);
    return [];
  }
};

const calculateSupplyApr = (
  borrowApr: Decimal,
  utilizationRate: Decimal,
  reserveFactor: Decimal,
): {
  interestApr: Decimal;
  rewards: {
    coinType: string;
    rewardApr: Decimal;
  }[];
} => {
  // Supply APR = Borrow APR * Utilization * (1 - Reserve Factor)
  const interestApr = borrowApr
    .mul(utilizationRate)
    .mul(new Decimal(1).sub(reserveFactor));
  return {
    interestApr,
    rewards: [], // Rewards would be added here if available
  };
};

const calculateBorrowApr = (
  utilizationRate: Decimal,
  marketConfig: MarketConfigQueryType,
): {
  interestApr: Decimal;
  rewards: {
    coinType: string;
    rewardApr: Decimal;
  }[];
} => {
  const utilizationRatePercentage = utilizationRate.mul(100);
  const kinks = marketConfig.interest_rate_kinks;
  const rates = marketConfig.interest_rates;
  if (kinks.length === 0) {
    return {
      interestApr: new Decimal(rates[0]).div(10000),
      rewards: [], // Rewards would be added here if available
    };
  }

  for (let i = 0; i < kinks.length; i++) {
    if (utilizationRatePercentage.gte(kinks[i])) {
      continue;
    }

    // Calculate linear interpolation
    let leftApr = i == 0 ? new Decimal(0) : new Decimal(rates[i - 1]);
    let rightApr = new Decimal(rates[i]);
    let leftKink = i == 0 ? new Decimal(0) : new Decimal(kinks[i - 1]);
    let rightKink = new Decimal(kinks[i]);

    // Calculate interpolated rate
    let interestApr = leftApr.add(
      rightApr
        .sub(leftApr)
        .mul(utilizationRatePercentage.sub(leftKink))
        .div(rightKink.sub(leftKink)),
    );

    // Convert from bps to decimal
    return {
      interestApr: interestApr.div(10000),
      rewards: [], // Rewards would be added here if available
    };
  }

  return {
    interestApr: new Decimal(rates[0]).div(10000),
    rewards: [], // Rewards would be added here if available
  };
};

const getTotalLiquidity = (market: MarketQueryType): bigint => {
  const marketFields = market.content.fields.value.fields;
  const total =
    BigInt(marketFields.balance_holding) + BigInt(marketFields.borrowed_amount);
  const deductions =
    BigInt(marketFields.unclaimed_spread_fee) +
    BigInt(marketFields.writeoff_amount) +
    BigInt(marketFields.unclaimed_spread_fee_protocol);

  if (total >= deductions) {
    return total - deductions;
  }
  return 0n;
};

const getUtilizationRate = (market: MarketQueryType): Decimal => {
  const marketFields = market.content.fields.value.fields;
  const totalSupply = new Decimal(getTotalLiquidity(market).toString());
  if (totalSupply.gt(0)) {
    return new Decimal(marketFields.borrowed_amount).div(totalSupply);
  }
  return new Decimal(0);
};

const updateCompoundInterest = (market: MarketQueryType): void => {
  const marketFields = market.content.fields.value.fields;
  const currentTime = Date.now(); // Current time in milliseconds

  if (marketFields.borrowed_amount !== "0") {
    const timeDelta = Math.floor(
      (currentTime - parseInt(marketFields.last_auto_compound)) / 1000,
    );

    if (timeDelta > 0) {
      // Calculate utilization rate
      const utilizationRate = getUtilizationRate(market);

      // Calculate current interest rate
      const marketConfig = marketFields.config.fields;
      const borrowApr = calculateBorrowApr(utilizationRate, marketConfig);

      // Calculate multiplier (1 + interest_rate_per_second)
      const multiplier = new Decimal(1).add(
        borrowApr.interestApr.div(31536000),
      ); // 31536000 seconds in a year

      // Calculate compounded multiplier using exponentiation
      let result = BigInt(1e18);
      let base = BigInt(multiplier.mul(1e18).toFixed(0));
      let exponent = timeDelta;

      while (exponent > 0) {
        if (exponent % 2 === 1) {
          result = (result * base) / BigInt(1e18);
        }
        base = (base * base) / BigInt(1e18);
        exponent = Math.floor(exponent / 2);
      }
      const compoundedMultiplier = result;

      // Calculate new borrowed amount using bigint to avoid overflow
      let borrowed_u256 = BigInt(marketFields.borrowed_amount);
      let new_borrowed = (borrowed_u256 * compoundedMultiplier) / BigInt(1e18);

      // Update borrowed amount
      marketFields.borrowed_amount =
        new_borrowed.toString();
      // Update compounded interest
      marketFields.compounded_interest.fields.value = (
        (BigInt(marketFields.compounded_interest.fields.value) *
          compoundedMultiplier) /
        BigInt(1e18)
      ).toString();
    }
  }
};

const updateXTokenRatio = (market: MarketQueryType): void => {
  const marketFields = market.content.fields.value.fields;
  let newXTokenRatio = BigInt(1e18);
  const totalLiquidity = getTotalLiquidity(market);
  if (marketFields.xtoken_supply !== "0") {
    const xTokenSupply = BigInt(marketFields.xtoken_supply);
    newXTokenRatio = (totalLiquidity * BigInt(1e18)) / xTokenSupply;
  }

  const changedRatio =
    newXTokenRatio - BigInt(marketFields.xtoken_ratio.fields.value);
  const spreadFeeRatio =
    (changedRatio * BigInt(marketFields.config.fields.spread_fee_bps)) /
    BigInt(10000);
  const addUnclaimedSpreadFee = totalLiquidity * spreadFeeRatio;
  const protocolShare =
    (addUnclaimedSpreadFee *
      BigInt(marketFields.config.fields.protocol_spread_fee_share_bps)) /
    BigInt(10000);

  // Updates
  marketFields.unclaimed_spread_fee_protocol = (
    BigInt(marketFields.unclaimed_spread_fee_protocol) +
    protocolShare / BigInt(1e18)
  ).toString();

  marketFields.unclaimed_spread_fee = (
    BigInt(marketFields.unclaimed_spread_fee) +
    (addUnclaimedSpreadFee - protocolShare) / BigInt(1e18)
  ).toString();

  marketFields.xtoken_ratio.fields.value = (
    newXTokenRatio - spreadFeeRatio
  ).toString();
};

const refreshDepositRewardDistributors = (rewardDistributor: RewardDistributorQueryType): void => {

};

const refreshBorrowRewardDistributors = (rewardDistributor: RewardDistributorQueryType): void => {

};

const refreshMarket = async (
  market: MarketQueryType,
): Promise<MarketQueryType> => {
  const marketFields = market.content.fields.value.fields;

  // 1. Compound interest
  updateCompoundInterest(market);

  // 2. Update xToken ratio
  updateXTokenRatio(market);

  // 4. Refresh reward distributors if they exist
  if (marketFields.deposit_reward_distributor) {
    refreshDepositRewardDistributors(marketFields.deposit_reward_distributor.fields);
  }

  if (marketFields.borrow_reward_distributor) {
    refreshBorrowRewardDistributors(marketFields.borrow_reward_distributor.fields);
  }

  return market;
};
