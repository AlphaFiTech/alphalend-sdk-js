import { SuiClient } from "@mysten/sui/client";
import { isPositionCapObject } from "./utils/helper.js";
import { getConstants } from "./constants/index.js";
import { Market, Portfolio, ProtocolStats } from "./core/types.js";
import {
  MarketQueryType,
  PositionCapQueryType,
  PriceData,
} from "./utils/queryTypes.js";
import { pythPriceFeedIds } from "./utils/priceFeedIds.js";

const constants = getConstants();

// Function to fetch all owned objects and find the PositionCap
export const getUserPositionCapId = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    // Fetch owned objects for the user
    const response = await suiClient.getOwnedObjects({
      owner: userAddress,
      options: {
        showContent: true, // Include object content to access fields
      },
    });

    if (!response || !response.data || response.data.length === 0) {
      return undefined;
    }

    // Find the first PositionCap object and extract the positionCap ID
    const positionCapObject = response.data.find((data) =>
      isPositionCapObject(data.data as unknown as PositionCapQueryType),
    );
    if (positionCapObject) {
      return (positionCapObject.data as unknown as PositionCapQueryType)
        .objectId;
    }
  } catch (error) {
    console.error("Error fetching user positionCap ID:", error);
  }
};

// Function to fetch all owned objects and find the PositionCap and return the positionId
export const getUserPositionId = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    // Fetch owned objects for the user
    const response = await suiClient.getOwnedObjects({
      owner: userAddress,
      options: {
        showContent: true, // Include object content to access fields
      },
    });

    if (!response || !response.data || response.data.length === 0) {
      return undefined;
    }

    // Find the first PositionCap object and extract the positionCap ID
    const positionCapObject = response.data.find((data) =>
      isPositionCapObject(data.data as unknown as PositionCapQueryType),
    );
    if (positionCapObject) {
      return (positionCapObject.data as unknown as PositionCapQueryType).content
        .fields.position_id;
    }
  } catch (error) {
    console.error("Error fetching user position ID:", error);
  }
};

// export const getUserPosition = async (
//   suiClient: SuiClient,
//   userAddress: string,
// ): Promise<PositionQueryType> => {
//   const positionId = await getUserPositionId(suiClient, userAddress);
//   const response = await suiClient.getObject({
//     id: positionId,
//     options: {
//       showContent: true,
//     },
//   });
//   return response.data as unknown as PositionQueryType;
// };

export const getProtocolStats = async (
  suiClient: SuiClient,
): Promise<ProtocolStats> => {
  try {
    const markets = await getMarkets(suiClient);

    let totalSuppliedUsd = 0;
    let totalBorrowedUsd = 0;

    const prices = await getPricesFromPyth(
      markets.map((market) => market.coinType),
    );

    for (const market of markets) {
      const tokenPrice = prices.find(
        (price) => price.coinType === market.coinType,
      )?.price.price;

      if (!tokenPrice) {
        console.error(`No price found for ${market.coinType}`);
        continue;
      }

      // Add to total supplied and borrowed
      totalSuppliedUsd += Number(market.totalSupply) * Number(tokenPrice);
      totalBorrowedUsd += Number(market.totalBorrow) * Number(tokenPrice);
    }

    return {
      totalSuppliedUsd: totalSuppliedUsd.toString(),
      totalBorrowedUsd: totalBorrowedUsd.toString(),
    };
  } catch (error) {
    console.error("Error calculating protocol stats:", error);
    return {
      totalSuppliedUsd: "0",
      totalBorrowedUsd: "0",
    };
  }
};

export const getMarkets = async (suiClient: SuiClient): Promise<Market[]> => {
  try {
    const constants = getConstants();
    const activeMarketIds = constants.ACTIVE_MARKETS;

    // Fetch and process each market from the active market IDs
    const markets: Market[] = [];
    const responses = await suiClient.multiGetObjects({
      ids: activeMarketIds,
      options: {
        showContent: true,
      },
    });

    for (const response of responses) {
      const marketObject = response.data as unknown as MarketQueryType;

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

      // Calculate utilization rate
      const totalSupply = BigInt(marketFields.xtoken_supply);
      const totalBorrow = BigInt(marketFields.borrowed_amount);
      const utilizationRate =
        totalSupply > 0
          ? Number((totalBorrow * BigInt(100)) / totalSupply) / 100
          : 0;

      // Get the interest rate model from market config
      const interestRateModel = {
        baseRate: Number(marketConfig.interest_rates[0]) / 10000, // Base rate, convert from basis points
        slope1:
          (Number(marketConfig.interest_rates[1]) -
            Number(marketConfig.interest_rates[0])) /
          10000,
        slope2:
          (Number(marketConfig.interest_rates[2]) -
            Number(marketConfig.interest_rates[1])) /
          10000,
        optimalUtilization: Number(marketConfig.interest_rate_kinks[0]) / 100,
      };

      // Calculate borrow APR
      const borrowApr = calculateBorrowApr(utilizationRate, interestRateModel);

      // Calculate supply APR using borrow APR
      const reserveFactor = Number(marketConfig.protocol_fee_share_bps) / 10000;
      const supplyApr = calculateSupplyApr(
        borrowApr.interestApr,
        utilizationRate,
        reserveFactor,
      );

      markets.push({
        marketId: marketFields.market_id,
        coinType: marketFields.coin_type.fields.name,
        totalSupply,
        totalBorrow,
        utilizationRate,
        supplyApr,
        borrowApr,
        ltv: Number(marketConfig.safe_collateral_ratio) / 100,
        liquidationThreshold: Number(marketConfig.liquidation_threshold) / 100,
        depositLimit: BigInt(marketConfig.deposit_limit),
      });
    }

    return markets;
  } catch (error) {
    console.error("Error fetching markets:", error);
    return [];
  }
};

const calculateSupplyApr = (
  borrowApr = 0,
  utilizationRate = 0,
  reserveFactor = 0.2,
) => {
  // Supply APR = Borrow APR * Utilization * (1 - Reserve Factor)
  const interestApr = borrowApr * utilizationRate * (1 - reserveFactor);

  return {
    interestApr,
    rewards: [], // Rewards would be added here if available
  };
};

const calculateBorrowApr = (
  utilizationRate = 0,
  model = {
    baseRate: 0.01, // 1%
    slope1: 0.1, // 10%
    slope2: 0.4, // 40%
    optimalUtilization: 0.8, // 80%
  },
) => {
  const { baseRate, slope1, slope2, optimalUtilization } = model;

  let interestApr = 0;

  // If utilization is below optimal, use the first slope
  if (utilizationRate <= optimalUtilization) {
    const utilizationFactor =
      optimalUtilization === 0 ? 0 : utilizationRate / optimalUtilization;
    interestApr = baseRate + slope1 * utilizationFactor;
  } else {
    // If utilization is above optimal, use the second slope
    const excessUtilization = utilizationRate - optimalUtilization;
    const maxExcess = 1.0 - optimalUtilization; // 1.00 - optimal

    const utilizationFactor =
      maxExcess === 0 ? 0 : excessUtilization / maxExcess;
    interestApr = baseRate + slope1 + slope2 * utilizationFactor;
  }

  return {
    interestApr,
    rewards: [], // Rewards would be added here if available
  };
};

export const getUserPortfolio = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<Portfolio> => {
  try {
    // Get user position ID
    const positionId = await getUserPositionId(suiClient, userAddress);
    if (!positionId) {
      // Return empty portfolio if no position found
      return {
        userAddress,
        netWorth: "0",
        totalSuppliedUsd: "0",
        totalBorrowedUsd: "0",
        safeBorrowLimit: "0",
        borrowLimitUsed: "0",
        liquidationLimit: "0",
        rewardsToClaimUsd: "0",
        rewardsByToken: [],
        dailyEarnings: "0",
        netApr: "0",
        aggregatedSupplyApr: "0",
        aggregatedBorrowApr: "0",
        userBalances: [],
      };
    }

    // Get all markets to calculate APRs and limits
    const markets = await getMarkets(suiClient);
    const prices = await getPricesFromPyth(
      markets.map((market) => market.coinType),
    );

    // Initialize portfolio metrics
    let totalSuppliedUsd = 0;
    let totalBorrowedUsd = 0;
    let weightedSupplyApr = 0;
    let weightedBorrowApr = 0;
    let totalWeight = 0;
    let liquidationLimit = 0;
    let safeBorrowLimit = 0;
    const userBalances: {
      marketId: string;
      suppliedAmount: bigint;
      borrowedAmount: bigint;
    }[] = [];

    // Calculate portfolio metrics
    for (const market of markets) {
      const tokenPrice = prices.find(
        (price) => price.coinType === market.coinType,
      )?.price.price;
      if (!tokenPrice) continue;

      // Calculate supplied and borrowed values
      const suppliedValue = Number(market.totalSupply) * Number(tokenPrice);
      const borrowedValue = Number(market.totalBorrow) * Number(tokenPrice);

      totalSuppliedUsd += suppliedValue;
      totalBorrowedUsd += borrowedValue;

      // Calculate weighted APRs
      const weight = suppliedValue + borrowedValue;
      totalWeight += weight;
      weightedSupplyApr +=
        (market.supplyApr.interestApr +
          market.supplyApr.rewards.reduce(
            (acc, reward) => acc + reward.rewardApr,
            0,
          )) *
        suppliedValue;
      weightedBorrowApr +=
        (market.borrowApr.interestApr +
          market.borrowApr.rewards.reduce(
            (acc, reward) => acc + reward.rewardApr,
            0,
          )) *
        borrowedValue;

      // Calculate limits
      liquidationLimit += suppliedValue * market.liquidationThreshold;
      safeBorrowLimit += suppliedValue * market.ltv;

      // Add to user balances
      userBalances.push({
        marketId: market.marketId,
        suppliedAmount: market.totalSupply,
        borrowedAmount: market.totalBorrow,
      });
    }

    // Calculate final metrics
    const netWorth = totalSuppliedUsd - totalBorrowedUsd;
    const borrowLimitUsed =
      safeBorrowLimit > 0 ? (totalBorrowedUsd / safeBorrowLimit) * 100 : 0;
    const aggregatedSupplyApr =
      totalSuppliedUsd > 0 ? weightedSupplyApr / totalSuppliedUsd : 0;
    const aggregatedBorrowApr =
      totalBorrowedUsd > 0 ? weightedBorrowApr / totalBorrowedUsd : 0;
    const netApr =
      totalWeight > 0
        ? (weightedSupplyApr - weightedBorrowApr) / totalWeight
        : 0;
    const dailyEarnings = (netApr / 365) * netWorth;

    return {
      userAddress,
      netWorth: netWorth.toString(),
      totalSuppliedUsd: totalSuppliedUsd.toString(),
      totalBorrowedUsd: totalBorrowedUsd.toString(),
      safeBorrowLimit: safeBorrowLimit.toString(),
      borrowLimitUsed: borrowLimitUsed.toString(),
      liquidationLimit: liquidationLimit.toString(),
      rewardsToClaimUsd: "0", // TODO: Implement rewards calculation
      rewardsByToken: [], // TODO: Implement rewards by token
      dailyEarnings: dailyEarnings.toString(),
      netApr: netApr.toString(),
      aggregatedSupplyApr: aggregatedSupplyApr.toString(),
      aggregatedBorrowApr: aggregatedBorrowApr.toString(),
      userBalances,
    };
  } catch (error) {
    console.error("Error getting user portfolio:", error);
    // Return empty portfolio on error
    return {
      userAddress,
      netWorth: "0",
      totalSuppliedUsd: "0",
      totalBorrowedUsd: "0",
      safeBorrowLimit: "0",
      borrowLimitUsed: "0",
      liquidationLimit: "0",
      rewardsToClaimUsd: "0",
      rewardsByToken: [],
      dailyEarnings: "0",
      netApr: "0",
      aggregatedSupplyApr: "0",
      aggregatedBorrowApr: "0",
      userBalances: [],
    };
  }
};

export const getPricesFromPyth = async (
  coinTypes: string[],
): Promise<PriceData[]> => {
  try {
    if (coinTypes.length === 0) {
      return [];
    }

    const feedIds: string[] = [];
    const feedIdToCoinType: Record<string, string> = {};
    // Collect feed IDs for given coin IDs
    coinTypes.forEach((coinType) => {
      const id = pythPriceFeedIds[coinType];
      if (!id) {
        console.error(`Coin ID not supported: ${coinType}`);
      }
      feedIdToCoinType[id] = coinType;
      feedIds.push(id);
    });

    if (feedIds.length === 0) {
      console.error("No feed IDs found for the requested coin IDs");
      return [];
    }

    // Construct URL with query parameters
    const queryParams = feedIds.map((id) => `ids[]=${id}`).join("&");
    const url = `${constants.PYTH_MAINNET_API_ENDPOINT}${constants.PYTH_PRICE_PATH}?${queryParams}`;

    // Fetch data from Pyth Network
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Failed to fetch from Pyth Network: HTTP ${response.status}`,
      );
      return [];
    }
    const prices = await response.json();
    if (!Array.isArray(prices)) {
      console.error("Invalid response format from Pyth Network");
      return [];
    }

    const result: PriceData[] = [];
    for (const price of prices) {
      result.push({
        coinType: feedIdToCoinType[price.id],
        price: price.price,
        ema_price: price.ema_price,
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching prices from Pyth Network:", error);
    throw error;
  }
};
