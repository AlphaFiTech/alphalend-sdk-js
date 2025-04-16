import { SuiClient } from "@mysten/sui/client";
import { isPositionCapObject } from "./utils/helper.js";
import { getConstants } from "./constants/index.js";
import { Market, Portfolio, ProtocolStats } from "./core/types.js";
import {
  BorrowQueryType,
  MarketConfigQueryType,
  MarketQueryType,
  PositionCapQueryType,
  PositionQueryType,
  PriceData,
} from "./utils/queryTypes.js";
import { pythPriceFeedIds } from "./utils/priceFeedIds.js";
import { Decimal } from "decimal.js";

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

export const getUserPosition = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<PositionQueryType | undefined> => {
  const positionId = await getUserPositionId(suiClient, userAddress);
  if (!positionId) {
    console.error("No position ID found");
    return undefined;
  }

  const response = await suiClient.getObject({
    id: positionId,
    options: {
      showContent: true,
    },
  });

  return response.data as unknown as PositionQueryType;
};

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

      const decimalDigit = new Decimal(
        marketFields.decimal_digit.fields.value,
      );

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

export const getUserPortfolio = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<Portfolio> => {
  // try {
  //   // Get user position
  //   const position = await getUserPosition(suiClient, userAddress);
  //   if (!position) {
  //     // Return empty portfolio if no position found
  //     return {
  //       userAddress,
  //       netWorth: "0",
  //       totalSuppliedUsd: "0",
  //       totalBorrowedUsd: "0",
  //       safeBorrowLimit: "0",
  //       borrowLimitUsed: "0",
  //       liquidationLimit: "0",
  //       rewardsToClaimUsd: "0",
  //       rewardsByToken: [],
  //       dailyEarnings: "0",
  //       netApr: "0",
  //       aggregatedSupplyApr: "0",
  //       aggregatedBorrowApr: "0",
  //       userBalances: [],
  //       healthFactor: "100", // Perfect health when no borrows
  //       isLiquidatable: false,
  //       marketPositions: {},
  //     };
  //   }
  //   const positionFields = position.content.fields.value.fields;

  //   // Get all markets and prices
  //   const markets = await getMarkets(suiClient);
  //   const marketMap = new Map<string, Market>();
  //   const coinTypes: string[] = [];
  //   for (const market of markets) {
  //     coinTypes.push(market.coinType);
  //     // to-do --> refresh map and postion
  //     marketMap.set(market.marketId, market);
  //   }

  //   const prices = await getPricesFromPyth(coinTypes);
  //   const priceMap = new Map(prices.map((price) => [price.coinType, price]));

  //   // Process collaterals and loans
  //   const collaterals = positionFields.collaterals.fields.contents;
  //   const loans = positionFields.loans;
  //   const collateralMap = createCollateralMap(collaterals, marketMap, priceMap);
  //   const loanMap = createLoanMap(loans, marketMap, priceMap);

  //   // Initialize portfolio metrics
  //   let totalSuppliedUsd = new Decimal(0);
  //   let totalBorrowedUsd = new Decimal(0);
  //   let weightedSupplyApr = new Decimal(0);
  //   let weightedBorrowApr = new Decimal(0);
  //   let totalWeightedAmount = new Decimal(0);
  //   let safeBorrowLimit = new Decimal(0);
  //   let liquidationLimit = new Decimal(0);
  //   const marketPositions: Record<
  //     string,
  //     {
  //       marketId: string;
  //       coinType: string;
  //       suppliedAmount: Decimal;
  //       suppliedAmountUsd: Decimal;
  //       borrowedAmount: Decimal;
  //       borrowedAmountUsd: Decimal;
  //     }
  //   > = {};

  //   // Calculate supplied values from collaterals
  //   for (const [marketId, collateralInfo] of collateralMap.entries()) {
  //     const market = marketMap.get(marketId);
  //     if (!market) {
  //       console.error(`Market not found: ${marketId}`);
  //       continue;
  //     }

  //     const tokenPrice = priceMap.get(market.coinType)?.price.price;
  //     if (!tokenPrice) {
  //       console.error(`Price not found for ${market.coinType}`);
  //       continue;
  //     }

  //     const amountUsd = collateralInfo.amountUsd;
  //     totalSuppliedUsd = totalSuppliedUsd.add(amountUsd);

  //     // Calculate contribution to borrow limit
  //     safeBorrowLimit = safeBorrowLimit.add(amountUsd.mul(market.ltv));

  //     // Calculate weighted liquidation threshold
  //     liquidationLimit = liquidationLimit.add(
  //       amountUsd.mul(market.liquidationThreshold),
  //     );

  //     // Calculate weighted APR
  //     weightedSupplyApr = weightedSupplyApr.add(
  //       market.supplyApr.interestApr.mul(amountUsd),
  //     );
  //     totalWeightedAmount = totalWeightedAmount.add(amountUsd);

  //     // Add to market positions
  //     marketPositions[marketId] = {
  //       marketId,
  //       coinType: market.coinType,
  //       suppliedAmount: collateralInfo.amount,
  //       suppliedAmountUsd: collateralInfo.amountUsd,
  //       borrowedAmount: new Decimal(0),
  //       borrowedAmountUsd: new Decimal(0),
  //     };
  //   }

  //   // Calculate borrowed values from loans
  //   for (const [marketId, loanInfo] of loanMap.entries()) {
  //     const market = marketMap.get(marketId);
  //     if (!market) {
  //       console.error(`Market not found: ${marketId}`);
  //       continue;
  //     }

  //     const tokenPrice = priceMap.get(market.coinType)?.price.price;
  //     if (!tokenPrice) {
  //       console.error(`Price not found for ${market.coinType}`);
  //       continue;
  //     }

  //     const amountUsd = Number(loanInfo.amountUsd);
  //     totalBorrowedUsd += amountUsd;

  //     // Calculate weighted borrow APR
  //     weightedBorrowApr += market.borrowApr.interestApr * amountUsd;
  //     totalWeightedAmount -= amountUsd; // Subtract borrowed amount

  //     // Update or create market position
  //     if (marketPositions[marketId]) {
  //       marketPositions[marketId].borrowedAmount = loanInfo.amount;
  //       marketPositions[marketId].borrowedAmountUsd = loanInfo.amountUsd;
  //     } else {
  //       marketPositions[marketId] = {
  //         marketId,
  //         coinType: market.coinType,
  //         suppliedAmount: "0",
  //         suppliedAmountUsd: "0",
  //         borrowedAmount: loanInfo.amount,
  //         borrowedAmountUsd: loanInfo.amountUsd,
  //       };
  //     }
  //   }

  //   // Calculate final metrics
  //   const netWorth = totalSuppliedUsd - totalBorrowedUsd;
  //   const borrowLimitUsed =
  //     safeBorrowLimit > 0 ? (totalBorrowedUsd / safeBorrowLimit) * 100 : 0;

  //   // Calculate health factor with zero division protection
  //   const healthFactor =
  //     totalBorrowedUsd > 0 ? liquidationLimit / totalBorrowedUsd : 100; // Perfect health when no borrows

  //   const isLiquidatable = healthFactor < 1;

  //   // Calculate APRs with zero division protection
  //   const aggregatedSupplyApr =
  //     totalSuppliedUsd > 0 ? weightedSupplyApr / totalSuppliedUsd : 0;

  //   const aggregatedBorrowApr =
  //     totalBorrowedUsd > 0 ? weightedBorrowApr / totalBorrowedUsd : 0;

  //   // Calculate net APR
  //   const netApr =
  //     totalWeightedAmount > 0
  //       ? (weightedSupplyApr - weightedBorrowApr) / totalWeightedAmount
  //       : 0;

  //   // Calculate daily earnings based on net APR
  //   const dailyEarnings = (netApr / 365) * netWorth;

  //   // Create user balances for backwards compatibility
  //   const userBalances = Object.values(marketPositions).map((position) => ({
  //     marketId: position.marketId,
  //     suppliedAmount: BigInt(position.suppliedAmount),
  //     borrowedAmount: BigInt(position.borrowedAmount),
  //   }));

  //   // Create rewards by token (empty for now as in Rust SDK it's a placeholder)
  //   const rewardsByToken = [];
  //   const rewardsToClaimUsd = "0";

  //   return {
  //     userAddress,
  //     netWorth: netWorth.toString(),
  //     totalSuppliedUsd: totalSuppliedUsd.toString(),
  //     totalBorrowedUsd: totalBorrowedUsd.toString(),
  //     safeBorrowLimit: safeBorrowLimit.toString(),
  //     borrowLimitUsed: borrowLimitUsed.toString(),
  //     liquidationLimit: liquidationLimit.toString(),
  //     rewardsToClaimUsd,
  //     rewardsByToken,
  //     dailyEarnings: dailyEarnings.toString(),
  //     netApr: netApr.toString(),
  //     aggregatedSupplyApr: aggregatedSupplyApr.toString(),
  //     aggregatedBorrowApr: aggregatedBorrowApr.toString(),
  //     userBalances,
  //     healthFactor: healthFactor.toString(),
  //     isLiquidatable,
  //     marketPositions,
  //   };
  // } catch (error) {
  //   console.error("Error getting user portfolio:", error);
  //   // Return empty portfolio on error
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
      healthFactor: "100", // Perfect health when no positions
      isLiquidatable: false,
      marketPositions: {},
    };
  // }
};

const createCollateralMap = (
  collaterals: {
    fields: {
      key: string;
      value: string;
    };
    type: string;
  }[],
  marketMap: Map<string, Market>,
  priceMap: Map<string, PriceData>,
): Map<string, { amount: Decimal; amountUsd: Decimal }> => {
  const collateralMap = new Map<
    string,
    {
      amount: Decimal;
      amountUsd: Decimal;
    }
  >();
  for (const collateral of collaterals) {
    const marketId = collateral.fields.key;
    const collateralXTokenAmount = collateral.fields.value;

    const market = marketMap.get(marketId);
    if (!market) {
      console.error(`Market not found: ${marketId}`);
      continue;
    }

    const tokenPrice = priceMap.get(market.coinType)?.price.price;
    if (!tokenPrice) {
      console.error(`Price not found for ${market.coinType}`);
      continue;
    }

    const collateralAmount = new Decimal(collateralXTokenAmount).mul(
      market.xtokenRatio,
    );
    const suppliedValueUsd = new Decimal(collateralAmount).mul(tokenPrice);
    collateralMap.set(marketId, {
      amount: new Decimal(collateralAmount),
      amountUsd: suppliedValueUsd,
    });
  }
  return collateralMap;
};

const createLoanMap = (
  loans: {
    fields: BorrowQueryType;
    type: string;
  }[],
  marketMap: Map<string, Market>,
  priceMap: Map<string, PriceData>,
): Map<string, { amount: Decimal; amountUsd: Decimal }> => {
  const loanMap = new Map<string, { amount: Decimal; amountUsd: Decimal }>();
  for (const loan of loans) {
    const marketId = loan.fields.market_id;
    const loanAmount = loan.fields.amount;

    const market = marketMap.get(marketId);
    if (!market) {
      console.error(`Market not found: ${marketId}`);
      continue;
    }

    const tokenPrice = priceMap.get(market.coinType)?.price.price;
    if (!tokenPrice) {
      console.error(`Price not found for ${market.coinType}`);
      continue;
    }

    const loanValueUsd = new Decimal(loanAmount).mul(tokenPrice);
    loanMap.set(marketId, {
      amount: new Decimal(loanAmount),
      amountUsd: loanValueUsd,
    });
  }
  return loanMap;
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
