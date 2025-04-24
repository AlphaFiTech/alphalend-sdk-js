import { SuiClient } from "@mysten/sui/client";
import { Decimal } from "decimal.js";
import { getConstants } from "../constants/index.js";
import {
  BorrowQueryType,
  PositionCapQueryType,
  PositionQueryType,
  PriceData,
} from "../utils/queryTypes.js";
import { Market, Portfolio } from "../core/types.js";
import { getAllMarkets } from "./market.js";

const constants = getConstants();

export const getUserPortfolio = async (
  suiClient: SuiClient,
  userAddress: string,
): Promise<Portfolio> => {
  try {
    const markets = await getAllMarkets(suiClient);
    const position = await getUserPosition(suiClient, userAddress);
    if (!position) {
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
    }
    const marketMap = new Map<string, Market>();
    for (const market of markets) {
      marketMap.set(market.marketId.toString(), market);
    }
    // const collateralMap = createCollateralMap(position.collaterals, marketMap, priceMap);
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
  } catch (error) {
    console.error("Error fetching user portfolio:", error);
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
  }
};

// Function to check if an object is a PositionCap
export const isPositionCapObject = (object: PositionCapQueryType): boolean => {
  try {
    if (object.content && object.content.type) {
      return object.content.type === constants.POSITION_CAP_TYPE;
    }
    return false;
  } catch (error) {
    console.error("Error checking if object is PositionCap:", error);
    return false;
  }
};

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
      filter: {
        StructType: constants.POSITION_CAP_TYPE,
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
      filter: {
        StructType: constants.POSITION_CAP_TYPE,
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

  const response = await suiClient.getDynamicFieldObject({
    parentId: constants.POSITION_TABLE_ID,
    name: {
      type: "0x2::object::ID",
      value: positionId,
    },
  });

  return response.data as unknown as PositionQueryType;
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
