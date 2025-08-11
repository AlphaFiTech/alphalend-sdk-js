import { SuiClient } from "@mysten/sui/client";
import { Blockchain } from "./blockchain.js";
import { Position } from "./position.js";
import { Market } from "./market.js";
import { MarketData, ProtocolStats, UserPortfolio } from "../core/types.js";
import { getPricesMap } from "../utils/helper.js";

export class LendingProtocol {
  private blockchain: Blockchain;

  constructor(network: string, client: SuiClient) {
    this.blockchain = new Blockchain(network, client);
  }

  // Protocol-level methods
  async getProtocolStats(markets: Market[]): Promise<ProtocolStats> {
    try {
      const prices = await getPricesMap();
      const marketData = await Promise.all(
        markets.map((market) => {
          return market.getMarketData(prices);
        }),
      );

      let totalSuppliedUsd = 0;
      let totalBorrowedUsd = 0;

      for (const market of marketData) {
        const tokenPrice = prices.get(market.coinType);

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
    const prices = await getPricesMap();
    const markets = await this.getAllMarkets();
    return await Promise.all(
      markets.map((market) => market.getMarketData(prices)),
    );
  }

  async getMarketData(marketId: number): Promise<MarketData> {
    const market = await this.getMarket(marketId);
    const prices = await getPricesMap();
    return await market.getMarketData(prices);
  }

  // Position methods

  async getPosition(positionId: string): Promise<Position> {
    const position = await this.blockchain.getPosition(positionId);
    return new Position(position);
  }

  async getPositions(userAddress: string): Promise<Position[]> {
    const positions = await this.blockchain.getPositionsForUser(userAddress);
    return positions.map((position) => new Position(position));
  }

  async getUserPortfolio(userAddress: string): Promise<UserPortfolio[]> {
    const [positions, markets] = await Promise.all([
      this.getPositions(userAddress),
      this.getAllMarkets(),
    ]);
    const res = await Promise.all(
      positions.map((position) => position.getUserPortfolio(markets)),
    );

    return res;
  }

  async getUserPortfolioWithMarkets(
    userAddress: string,
    markets: Market[],
  ): Promise<UserPortfolio[]> {
    const positions = await this.getPositions(userAddress);
    const res = await Promise.all(
      positions.map((position) => position.getUserPortfolio(markets)),
    );

    return res;
  }
}
