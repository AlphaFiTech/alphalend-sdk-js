import { SuiClient } from "@mysten/sui/client";
import { isPositionCapObject } from "./utils/helper.js";
import { getConstants } from "./constants/index.js";
import { Market, Portfolio, ProtocolStats } from "./core/types.js";
import { MarketQueryType, PositionCapQueryType } from "./utils/queryTypes.js";

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

    return undefined;
  } catch (error) {
    console.error("Error fetching user positionCap ID:", error);
  }
};

/**
 * Fetch all markets with their market IDs
 * This function uses the ACTIVE_MARKETS array from constants
 * and retrieves market details for each market ID
 *
 * @param suiClient - The SUI client instance
 * @returns Promise resolving to an array of Market objects
 */
export const getMarkets = async (suiClient: SuiClient): Promise<Market[]> => {
  try {
    const constants = getConstants();
    const activeMarketIds = constants.ACTIVE_MARKETS;

    // Fetch and process each market from the active market IDs
    const markets: Market[] = [];

    for (const marketId of activeMarketIds) {
      try {
        // Get the specific market object from the dynamic field
        const response = await suiClient.getObject({
          id: marketId,
          options: {
            showContent: true,
          },
        });
        const marketObject = response.data as unknown as MarketQueryType;

        if (
          !marketObject.content ||
          marketObject.content.dataType !== "moveObject"
        ) {
          console.warn(`Market ${marketId} data not found or invalid`);
          continue;
        }

        const marketFields = marketObject.content.fields;

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
        const borrowApr = calculateBorrowApr(
          utilizationRate,
          interestRateModel,
        );

        // Calculate supply APR using borrow APR
        const reserveFactor =
          Number(marketConfig.protocol_fee_share_bps) / 10000;
        const supplyApr = calculateSupplyApr(
          borrowApr.interestApr,
          utilizationRate,
          reserveFactor,
        );

        markets.push({
          marketId: marketFields.market_id,
          coinType: marketFields.coin_type,
          totalSupply,
          totalBorrow,
          utilizationRate,
          supplyApr,
          borrowApr,
          ltv: Number(marketConfig.safe_collateral_ratio) / 100,
          liquidationThreshold:
            Number(marketConfig.liquidation_threshold) / 100,
          depositLimit: BigInt(marketConfig.deposit_limit),
        });
      } catch (error) {
        console.error(`Error fetching market ${marketId}:`, error);
      }
    }

    return markets;
  } catch (error) {
    console.error("Error fetching markets:", error);
    return [];
  }
};

/**
 * Get protocol statistics including total supplied and borrowed values
 * This function aggregates data across all markets
 *
 * @param suiClient - The SUI client instance
 * @returns Promise resolving to a ProtocolStats object
 */
export const getProtocolStats = async (
  suiClient: SuiClient,
): Promise<ProtocolStats> => {
  try {
    const markets = await getMarkets(suiClient);

    let totalSuppliedUsd = 0;
    let totalBorrowedUsd = 0;

    // Sum up the total supplied and borrowed across all markets
    // Note: In a real implementation, we would convert the token amounts to USD
    // using price feeds. For simplicity, assuming 1:1 conversion for now.
    for (const market of markets) {
      // To convert to USD, we would multiply by token price
      // For example: const tokenPrice = await getPriceForToken(market.coinType);
      const tokenPrice = 1; // Placeholder for actual price implementation

      // Add to total supplied and borrowed
      totalSuppliedUsd += Number(market.totalSupply) * tokenPrice;
      totalBorrowedUsd += Number(market.totalBorrow) * tokenPrice;
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
  console.log(suiClient, userAddress);
  return {} as Portfolio;
};
