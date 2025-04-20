import { SuiClient } from "@mysten/sui/client";
import { getMarkets } from "./market.js";
import { getPricesFromPyth } from "../utils/helper.js";
import { ProtocolStats } from "../core/types.js";

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
