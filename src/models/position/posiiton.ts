import { SuiClient } from "@mysten/sui/client";
import { Decimal } from "decimal.js";
import {
  BorrowQueryType,
  PositionQueryType,
  PriceData,
} from "../../utils/queryTypes.js";
import { Market, Portfolio } from "../../core/types.js";
import { getAllMarkets } from "../market.js";
import { getUserPosition } from "./functions.js";

export const getUserPortfolio = async (
  suiClient: SuiClient,
  network: string,
  userAddress: string,
): Promise<Portfolio | undefined> => {
  try {
    const markets = await getAllMarkets(suiClient, network);
    const position = await getUserPosition(suiClient, network, userAddress);
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

export const positionRefresh = async (
  position: PositionQueryType,
  marketMap: Map<string, Market>,
  priceMap: Map<string, PriceData>,
) => {
  const currentTime = Date.now();

  const collateralMarketIds = Object.keys(
    position.content.fields.value.fields.collaterals,
  );
  const loanMarketIds = Object.keys(position.content.fields.value.fields.loans);

  for (const marketId of collateralMarketIds) {
    const market = marketMap.get(marketId);
    if (!market) {
      console.error(`Market not found: ${marketId}`);
      continue;
    }

    // const depositRewardDistributor = market.rewardDistributor;
    // const userDistributorIdx = position.content.fields.value.fields.reward_distributors.findIndex((distributor) => distributor.fields.distributor === depositRewardDistributor);
    // if (userDistributorIdx === -1) {
    //   console.error(`User distributor not found: ${depositRewardDistributor}`);
    //   continue;
    // }
  }

  const marketIds = new Set([...collateralMarketIds, ...loanMarketIds]);

  // for (const marketId of marketIds) {
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
