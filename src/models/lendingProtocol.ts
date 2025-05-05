import { SuiClient } from "@mysten/sui/client";
import { Blockchain } from "./blockchain.js";
import { Position } from "./position.js";
import { Market } from "./market.js";
import { MarketData, ProtocolStats, UserPortfolio } from "../core/types.js";
import { getPricesFromPyth } from "../utils/helper.js";

export class LendingProtocol {
  private blockchain: Blockchain;

  constructor(network: string, client: SuiClient) {
    this.blockchain = new Blockchain(network, client);
  }

  // Protocol-level methods
  async getProtocolStats(markets: Market[]): Promise<ProtocolStats> {
    try {
      const marketData = await Promise.all(
        markets.map((market) => {
          return market.getMarketData();
        }),
      );

      let totalSuppliedUsd = 0;
      let totalBorrowedUsd = 0;

      const prices = await getPricesFromPyth(
        marketData.map((market: MarketData) => market.coinType),
      );

      for (const market of marketData) {
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
  }

  // Market methods
  async getAllMarkets(): Promise<Market[]> {
    const markets = await this.blockchain.getAllMarkets();
    return markets.map((market) => new Market(market));
  }

  async getMarket(marketId: number): Promise<Market> {
    const market = await this.blockchain.getMarket(marketId);
    return new Market(market);
  }

  async getAllMarketsData(): Promise<MarketData[]> {
    const markets = await this.getAllMarkets();
    return await Promise.all(markets.map((market) => market.getMarketData()));
  }

  // Position methods
  async getPositions(userAddress: string): Promise<Position[]> {
    const positions = await this.blockchain.getPositionsForUser(userAddress);
    return positions.map((position) => new Position(position));
  }

  async getUserPortfolio(positionCapId: string): Promise<UserPortfolio> {
    const [positionQuery, markets] = await Promise.all([
      this.blockchain.getPosition(positionCapId),
      this.getAllMarkets(),
    ]);
    const position = new Position(positionQuery);
    return await position.getUserPortfolio(markets);
  }
}
