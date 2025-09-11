import { CoinBalance, SuiClient } from "@mysten/sui/client";
import { PythPriceIdPair } from "./types.js";

export * from "./types.js";
export * from "./constants.js";

/**
 * Fetches all coins owned by a wallet address with pagination support
 *
 * @param userAddress - The Sui address of the wallet owner
 * @param suiClient - Instance of SuiClient to interact with the Sui blockchain
 * @returns Promise resolving to an array of Coin objects containing coin information
 *
 * @example
 * const walletCoins = await getWalletCoins(
 *   '0x123...',
 *   suiClient
 * );
 * // Returns: Array of Coin objects with coin type and balance information
 *
 * @remarks This function uses pagination to handle large numbers of coins
 * and logs coin information to the console for debugging purposes
 */
export async function getWalletCoins(
  userAddress: string,
  suiClient: SuiClient,
): Promise<Map<string, string> | undefined> {
  try {
    const res = await suiClient.getAllBalances({
      owner: userAddress,
    });

    const resMap: Map<string, string> = new Map();
    res.forEach((enrty: CoinBalance) => {
      resMap.set(enrty.coinType, enrty.totalBalance);
    });
    return resMap;
  } catch (error) {
    console.error("Error fetching tokenBalances!", error);
  }
}

class SimpleCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 60000) { // Default 1 minute TTL
    this.ttl = ttlMs;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.data;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

const latestPriceCache = new SimpleCache<string>(10000); // 10 second cache
export async function getLatestTokenPricePairs(
  pairs: PythPriceIdPair[],
  ignoreCache: boolean = false,
): Promise<{ [key: string]: string | undefined }> {
  const priceMap: { [key: string]: string | undefined } = {};

  // Use getLatestPrices to fetch all prices at once
  const prices = await getLatestPrices(pairs, ignoreCache);

  pairs.forEach((pair, index) => {
    priceMap[pair] = prices[index] || undefined;
  });

  return priceMap;
}

export async function getLatestPrices(
  pairs: PythPriceIdPair[],
  ignoreCache: boolean = false,
): Promise<string[]> {
  const pairsToFetch: PythPriceIdPair[] = [];
  const pairsToFetchIndexes: number[] = [];

  // Check cache first and prepare list of pairs that need fetching
  const prices: string[] = pairs.map((pair, index) => {
    const cacheKey = `getLatestPrice-${pair}`;
    
    if (ignoreCache) {
      latestPriceCache.delete(cacheKey);
    }
    
    const cachedResponse = latestPriceCache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    pairsToFetch.push(pair);
    pairsToFetchIndexes.push(index);
    return "";
  });

  // Fetch prices for pairs not in cache
  if (pairsToFetch.length > 0) {
    try {
      const allTokenPrices = await fetchRequiredPrices();

      for (let i = 0; i < pairsToFetch.length; i++) {
        const token = pairsToFetch[i].split("/")[0];
        const price = allTokenPrices[token];
        prices[pairsToFetchIndexes[i]] = price || "0";
      }
    } catch (error) {
      console.error(
        `Error in getLatestPrices for pairs ${pairsToFetch}:`,
        error,
      );
      // Fill with zeros on error
      pairsToFetchIndexes.forEach(index => {
        prices[index] = "0";
      });
    }
  }

  // Cache the fetched prices
  prices.forEach((price, i) => {
    if (price && price !== "0") {
      const cacheKey = `getLatestPrice-${pairs[i]}`;
      latestPriceCache.set(cacheKey, price);
    }
  });

  return prices;
}

/**
 * Fetches required token prices from the AlphaLend API
 * Internal function used by getLatestPrices
 * 
 * @returns Promise resolving to a map of token symbols to prices
 */
export async function fetchRequiredPrices(): Promise<{
  [k: string]: string | undefined;
}> {
  const apiUrl = "https://api.alphalend.xyz/public/graphql";
  const query = `
    query {
      coinInfo {
        coinType
        coingeckoPrice
        pythPrice
      }
    }
  `;
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const dataArr = data.data.coinInfo;

    const priceMap: { [k: string]: string | undefined } = {};
    
    for (const coinData of dataArr) {
      let coinType = coinData.coinType;
      
      // Normalize coin type format
      if (coinType.startsWith("0x0")) {
        coinType = "0x" + coinType.substring(3);
      }

      // Map coin types to symbols for easier lookup
      let symbol: string | undefined;
      
      // Handle special cases
      if (coinType === "0x2::sui::SUI") {
        symbol = "SUI";
      } else {
        // Extract symbol from coin type (simplified mapping)
        const parts = coinType.split("::");
        if (parts.length >= 3) {
          symbol = parts[2].toUpperCase();
        }
      }

      if (symbol) {
        // Prefer Pyth price, fallback to CoinGecko price
        const price = coinData.pythPrice || coinData.coingeckoPrice;
        priceMap[symbol] = price ? price.toString() : undefined;
      }
    }

    return priceMap;
  } catch (error) {
    console.error("Error fetching prices from AlphaLend API:", error);
    throw error;
  }
}