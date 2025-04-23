import { SuiClient } from "@mysten/sui/client";
import { Decimal } from "decimal.js";
import { MarketConfigQueryType, MarketQueryType } from "../utils/queryTypes.js";
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
