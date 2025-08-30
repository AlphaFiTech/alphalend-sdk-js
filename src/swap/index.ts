/**
 * Swap Module
 * 
 * Provides functionality for executing token swaps across different DEX protocols
 * on the Sui network. Supports multiple aggregators including Hop, Cetus, 7K, and Aftermath.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { SwapOptions, SwapQuote, SwapGatewayConfig } from "./types.js";
import { getPricesMap } from "../utils/helper.js";
import { Decimal } from "decimal.js";
import { SevenKGateway } from "../core/sevenKSwap.js";

export * from "./types.js";

/**
 * Type for price pair identifiers (e.g., "SUI/USD", "USDC/USD")
 */
export type PythPriceIdPair = string;

/**
 * Simple cache implementation for price data
 */
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

/**
 * Fetches the latest prices for given token pairs with caching support
 * 
 * @param pairs - Array of price pair identifiers (e.g., ["SUI/USD", "USDC/USD"])
 * @param ignoreCache - Whether to bypass the cache and fetch fresh prices
 * @returns Promise resolving to an array of price strings in the same order as input pairs
 * 
 * @example
 * ```typescript
 * const prices = await getLatestPrices(["SUI/USD", "USDC/USD"], false);
 * console.log(prices); // ["1.23", "1.00"]
 * ```
 */
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
 * Fetches the latest token price pairs as a key-value map
 * 
 * @param pairs - Array of price pair identifiers
 * @param ignoreCache - Whether to bypass the cache
 * @returns Promise resolving to a map of pair names to prices
 * 
 * @example
 * ```typescript
 * const priceMap = await getLatestTokenPricePairs(["SUI/USD", "USDC/USD"]);
 * console.log(priceMap); // { "SUI/USD": "1.23", "USDC/USD": "1.00" }
 * ```
 */
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

/**
 * Fetches required token prices from the AlphaLend API
 * Internal function used by getLatestPrices
 * 
 * @returns Promise resolving to a map of token symbols to prices
 */
async function fetchRequiredPrices(): Promise<{
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

/**
 * Main class for handling token swaps across multiple DEX protocols
 * 
 * The SwapGateway class provides:
 * - Quote comparison across multiple DEX aggregators
 * - Automatic best route selection
 * - Transaction building for swap execution
 * - Support for Hop, Cetus, 7K, and Aftermath protocols
 */
export class SwapGateway {
  private client: SuiClient;
  private network: string;
  private config: SwapGatewayConfig;
  private bestQuote: SwapQuote | undefined;
  private swapOptions?: SwapOptions;
  private sevenKQuote?: any;
  private sevenKGateway: SevenKGateway;

  /**
   * Creates a new SwapGateway instance
   * 
   * @param client - SuiClient instance for blockchain interaction
   * @param network - Network to operate on ("mainnet", "testnet", or "devnet")
   * @param config - Optional configuration for the gateway
   */
  constructor(client: SuiClient, network: string, config?: Partial<SwapGatewayConfig>) {
    this.client = client;
    this.network = network;
    this.config = {
      network: network as "mainnet" | "testnet" | "devnet",
      debug: false,
      quoteTimeout: 10000,
      preferredGateways: ["7k", "hop", "cetus", "aftermath"],
      ...config,
    };
    this.sevenKGateway = new SevenKGateway();
  }

  /**
   * Builds a transaction for executing the swap using the best quote
   * 
   * @param debug - Enable debug logging
   * @param transaction - Optional existing transaction to append to
   * @returns Promise resolving to a Transaction ready for signing and execution
   * 
   * @example
   * ```typescript
   * const quote = await swapGateway.getBestQuote(swapOptions);
   * if (quote) {
   *   const tx = await swapGateway.getTransactionBlock();
   *   // Sign and execute transaction
   * }
   * ```
   */
  async getTransactionBlock(
    debug?: boolean,
    transaction?: Transaction,
  ): Promise<Transaction | undefined> {
    const useDebug = debug !== undefined ? debug : this.config.debug;
    
    if (useDebug) {
      console.log("=== getTransactionBlock DEBUG START ===");
      console.log("this.bestQuote:", this.bestQuote);
      console.log("bestQuote type:", typeof this.bestQuote);
    }
    
    if (!this.bestQuote) {
      console.error("No quote available. Call getBestQuote first.");
      return undefined;
    }

    if (!this.swapOptions) {
      console.error("No swap options available. Call getBestQuote first.");
      return undefined;
    }

    try {
      if (useDebug) {
        console.log(`Building transaction for ${this.bestQuote.gateway} gateway`);
      }

      // Handle different gateways based on the best quote
      if (
        this.bestQuote.gateway === "7k" &&
        this.sevenKQuote &&
        this.swapOptions
      ) {
        // Use 7K gateway transaction building
        const { tx, coinOut } = await this.sevenKGateway.getTransactionBlock(
          transaction || new Transaction(),
          this.swapOptions.senderAddress,
          this.swapOptions.slippage / 100, // Convert percentage to decimal
          this.sevenKQuote,
        );
        
        // Transfer any remaining coins to the sender address
        if (coinOut) {
          tx.transferObjects([coinOut], this.swapOptions.senderAddress);
        }
        
        return tx;
      }
      // TODO: Add other gateway implementations (Hop, Cetus, Aftermath)
      else if (this.bestQuote.gateway === "hop") {
        console.warn("Hop gateway transaction building not yet implemented");
        return transaction || new Transaction();
      }
      else if (this.bestQuote.gateway === "cetus") {
        console.warn("Cetus gateway transaction building not yet implemented");
        return transaction || new Transaction();
      }
      else if (this.bestQuote.gateway === "aftermath") {
        console.warn("Aftermath gateway transaction building not yet implemented");
        return transaction || new Transaction();
      }
      else {
        console.error(`Unknown gateway: ${this.bestQuote.gateway}`);
        return undefined;
      }
    } catch (error) {
      console.error("Error building swap transaction:", error);
      return undefined;
    }
  }

  
  public async getBestQuoteFromAll(
    swapOptions: SwapOptions,
    debug?: boolean,
  ): Promise<SwapQuote | undefined> {
    const useDebug = debug !== undefined ? debug : this.config.debug;
    
    try {
      if (useDebug) {
        console.log("=== getBestQuoteFromAll DEBUG START ===");
        console.log("Input swapOptions:", swapOptions);
        console.log("Fetching quotes from all DEX protocols in parallel...");
        console.time("getBestQuoteFromAll");
      }

      // TODO: Implement actual parallel gateway calls
      // This should include calls to:
      // - getHopQuote(swapOptions, debug)
      // - getCetusQuote(swapOptions, debug) 
      // - getSevenKQuote(swapOptions, debug)
      // - getAftermathQuote(swapOptions, debug)

      const [sevenKQuote] = await Promise.all([
        this.getSevenKQuote(swapOptions, useDebug),
        // this.getHopQuote(swapOptions, useDebug),
        // this.getCetusQuote(swapOptions, useDebug),
        // this.getAftermathQuote(swapOptions, useDebug),
      ]);

      if (useDebug) {
        console.log("Individual quotes received:");
        console.log("sevenKQuote:", sevenKQuote);
      }

      // Find the best quote based on estimated amount out in USD
      let bestQuote = sevenKQuote;

      if (!bestQuote) {
        console.error("No valid quotes received from any gateway");
        return undefined;
      }

      this.bestQuote = bestQuote;

      if (useDebug) {
        console.log("Final bestQuote selected:", bestQuote);
        console.log("this.bestQuote set to:", this.bestQuote);
        console.log("=== getBestQuoteFromAll DEBUG END ===");
        console.timeEnd("getBestQuoteFromAll");
      }

      return bestQuote;
    } catch (error) {
      console.error("=== getBestQuoteFromAll ERROR ===");
      console.error("Error fetching quotes from all gateways:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
      console.log("=== getBestQuoteFromAll DEBUG END (ERROR) ===");
      return undefined;
    }
  }

  /**
   * Gets a quote from the Hop gateway
   * 
   * @param swapOptions - Configuration for the swap operation
   * @param debug - Enable debug logging
   * @returns Promise resolving to a SwapQuote or undefined
   */
  private async getHopQuote(
    swapOptions: SwapOptions,
    debug: boolean = false,
  ): Promise<SwapQuote | undefined> {
    try {
      if (debug) {
        console.time("hopQuote");
      }

      // TODO: Replace with actual Hop SDK integration
      // For now, simulate the Hop quote response structure
      const mockHopQuote = {
        trade: {
          amount_out: {
            amount: swapOptions.inAmount?.toString() || "0"
          }
        },
        amount_out_with_fee: swapOptions.inAmount?.toString() || "0"
      };

      const hopEstimatedAmountOut = BigInt(mockHopQuote.trade.amount_out.amount);
      const hopEstimatedAmountOutWithFee = BigInt(mockHopQuote.amount_out_with_fee);
      const hopEstimatedFeeAmount = hopEstimatedAmountOutWithFee - hopEstimatedAmountOut;

      if (debug) {
        console.debug("From HOP:");
        console.debug(mockHopQuote);
      }

      const inputAmount = swapOptions.inAmount || 0n;

      // Get USD prices for both tokens using getLatestPrices
      const pairNameA: PythPriceIdPair = `${swapOptions.pair.coinA.name}/USD`;
      const pairNameB: PythPriceIdPair = `${swapOptions.pair.coinB.name}/USD`;

      const [priceA, priceB] = await getLatestPrices([pairNameA, pairNameB], true);

      if (!priceA || !priceB || priceA === "0" || priceB === "0") {
        console.error("Could not get prices from Pyth Network.");
        return undefined;
      }

      if (debug) {
        console.debug("token a price", priceA, "token b price", priceB);
      }

      // Calculate USD values
      const inputAmountInTokens = Number(inputAmount) / Math.pow(10, swapOptions.pair.coinA.expo);
      const outputAmountInTokens = Number(hopEstimatedAmountOut) / Math.pow(10, swapOptions.pair.coinB.expo);
      
      const inputAmountInUSD = inputAmountInTokens * parseFloat(priceA);
      const outputAmountInUSD = outputAmountInTokens * parseFloat(priceB);

      // Calculate slippage
      const slippage = (inputAmountInUSD - outputAmountInUSD) / inputAmountInUSD;

      const quote: SwapQuote = {
        gateway: "hop",
        estimatedAmountOut: hopEstimatedAmountOut,
        estimatedFeeAmount: hopEstimatedFeeAmount,
        inputAmount: inputAmount,
        inputAmountInUSD: inputAmountInUSD,
        estimatedAmountOutInUSD: outputAmountInUSD,
        slippage: slippage,
      };

      if (debug) {
        console.timeEnd("hopQuote");
        console.log("Hop quote:", quote);
      }

      return quote;
    } catch (error) {
      console.error("Error fetching Hop quote:", error);
      return undefined;
    }
  }

  /**
   * Gets a quote from the Cetus gateway
   * 
   * @param swapOptions - Configuration for the swap operation
   * @param debug - Enable debug logging
   * @returns Promise resolving to a SwapQuote or undefined
   */
  private async getCetusQuote(
    swapOptions: SwapOptions,
    debug: boolean = false,
  ): Promise<SwapQuote | undefined> {
    try {
      if (debug) {
        console.time("cetusQuote");
      }

      // TODO: Implement actual Cetus gateway integration
      // This should include calls to the Cetus SDK/API
      
      const mockQuote: SwapQuote = {
        gateway: "cetus",
        estimatedAmountOut: swapOptions.inAmount || 0n,
        estimatedFeeAmount: 1500n,
        inputAmount: swapOptions.inAmount || 0n,
        inputAmountInUSD: 0,
        estimatedAmountOutInUSD: 0,
        slippage: swapOptions.slippage,
      };

      if (debug) {
        console.timeEnd("cetusQuote");
        console.log("Cetus quote:", mockQuote);
      }

      return mockQuote;
    } catch (error) {
      console.error("Error fetching Cetus quote:", error);
      return undefined;
    }
  }

  /**
   * Gets a quote from the 7K gateway
   * 
   * @param swapOptions - Configuration for the swap operation
   * @param debug - Enable debug logging
   * @returns Promise resolving to a SwapQuote or undefined
   */
  async getSevenKQuote(
    swapOptions: SwapOptions,
    debug: boolean = false,
  ): Promise<SwapQuote | undefined> {
    this.swapOptions = swapOptions;

    if (debug) console.time("sevenKQuote");
    
    try {
      if (debug) {
        console.log("=== getSevenKQuote DEBUG START ===");
        console.log("swapOptions:", swapOptions);
        console.log("coinA.type:", this.swapOptions.pair.coinA.type);
        console.log("coinB.type:", this.swapOptions.pair.coinB.type);
        console.log("inAmount:", this.swapOptions.inAmount?.toString());
      }
      
      const sevenKQuotePromise = this.sevenKGateway
        .getQuote(
          this.swapOptions.pair.coinA.type, 
          this.swapOptions.pair.coinB.type, 
          this.swapOptions.inAmount?.toString() || "0"
        )
        .catch(error => {
          if (debug) console.timeEnd("sevenKQuote");
          throw error;
        });

      if (debug) console.log("Calling sevenKGateway.getQuote...");
      this.sevenKQuote = await sevenKQuotePromise;
      if (debug) console.log("sevenKGateway.getQuote result:", this.sevenKQuote);
      
      const sevenKEstimatedAmountOut = BigInt(
        this.sevenKQuote
          ? this.sevenKQuote.returnAmountWithDecimal.toString()
          : 0,
      );
      
      const sevenKEstimatedAmountOutWithoutFee = BigInt(
        this.sevenKQuote
          ? this.sevenKQuote.returnAmountWithoutSwapFees
            ? this.sevenKQuote.returnAmountWithoutSwapFees.toString()
            : sevenKEstimatedAmountOut.toString()
          : sevenKEstimatedAmountOut.toString(),
      );
      
      const sevenKEstimatedFeeAmount = sevenKEstimatedAmountOut - sevenKEstimatedAmountOutWithoutFee;

      if (debug) {
        console.debug("From 7k:");
        console.debug(this.sevenKQuote);
      }

      const amount = BigInt(
        this.sevenKQuote ? this.sevenKQuote.swapAmountWithDecimal : 0,
      );

      if (debug) {
        console.log("Calculated amounts:");
        console.log("sevenKEstimatedAmountOut:", sevenKEstimatedAmountOut.toString());
        console.log("sevenKEstimatedFeeAmount:", sevenKEstimatedFeeAmount.toString());
        console.log("amount:", amount.toString());
      }

      const pairNameA: PythPriceIdPair = (this.swapOptions.pair.coinA.name +
        "/" +
        "USD") as PythPriceIdPair;
      const pairNameB: PythPriceIdPair = (this.swapOptions.pair.coinB.name +
        "/" +
        "USD") as PythPriceIdPair;

      if (debug) console.log("Fetching prices for:", pairNameA, pairNameB);
      const [priceA, priceB] = await getLatestPrices(
        [pairNameA, pairNameB],
        true,
      );
      if (debug) console.log("Prices received:", { priceA, priceB });

      let quote: SwapQuote;

      if (priceA && priceB) {
        if (debug) {
          console.debug("token a price", priceA, "token b price", priceB);
        }

        const inputAmountInUSD =
          (Number(amount) / Math.pow(10, this.swapOptions.pair.coinA.expo)) *
          parseFloat(priceA);
        const outputAmountInUSD =
          (Number(sevenKEstimatedAmountOut) /
            Math.pow(10, this.swapOptions.pair.coinB.expo)) *
          parseFloat(priceB);

        const slippage =
          (inputAmountInUSD - outputAmountInUSD) / inputAmountInUSD;

        quote = {
          gateway: "7k",
          estimatedAmountOut: sevenKEstimatedAmountOut,
          estimatedFeeAmount: sevenKEstimatedFeeAmount,
          inputAmount: amount,
          inputAmountInUSD: inputAmountInUSD,
          estimatedAmountOutInUSD: outputAmountInUSD,
          slippage: slippage,
        };
      } else {
        console.warn("Could not get prices from Pyth Network, using fallback pricing.");
        
        // Create quote with basic pricing (assuming 1:1 for simplicity)
        quote = {
          gateway: "7k",
          estimatedAmountOut: sevenKEstimatedAmountOut,
          estimatedFeeAmount: sevenKEstimatedFeeAmount,
          inputAmount: amount,
          inputAmountInUSD: 0, // Will be updated when prices are available
          estimatedAmountOutInUSD: 0, // Will be updated when prices are available
          slippage: this.swapOptions.slippage,
        };
      }
      
      if (debug) {
        console.log("=== FINAL 7K QUOTE ===");
        console.log("Generated 7K quote:", quote);
        console.log("=== getSevenKQuote DEBUG END ===");
        console.timeEnd("sevenKQuote");
      }
      
      return quote;
    } catch (error) {
      console.error("Error fetching 7K quote:", error);
      if (debug) console.timeEnd("sevenKQuote");
      return undefined;
    }
  }

  /**
   * Gets a quote from the Aftermath gateway
   * 
   * @param swapOptions - Configuration for the swap operation
   * @param debug - Enable debug logging
   * @returns Promise resolving to a SwapQuote or undefined
   */
  private async getAftermathQuote(
    swapOptions: SwapOptions,
    debug: boolean = false,
  ): Promise<SwapQuote | undefined> {
    try {
      if (debug) {
        console.time("aftermathQuote");
      }

      // TODO: Implement actual Aftermath gateway integration
      // This should include calls to the Aftermath SDK/API
      
      const mockQuote: SwapQuote = {
        gateway: "aftermath",
        estimatedAmountOut: swapOptions.inAmount || 0n,
        estimatedFeeAmount: 1800n,
        inputAmount: swapOptions.inAmount || 0n,
        inputAmountInUSD: 0,
        estimatedAmountOutInUSD: 0,
        slippage: swapOptions.slippage,
      };

      if (debug) {
        console.timeEnd("aftermathQuote");
        console.log("Aftermath quote:", mockQuote);
      }

      return mockQuote;
    } catch (error) {
      console.error("Error fetching Aftermath quote:", error);
      return undefined;
    }
  }

  /**
   * Converts a SwapQuote to a human-readable string for debugging
   * 
   * @param quote - The SwapQuote to convert
   * @returns Formatted string representation of the quote
   */
  quoteToString(quote: SwapQuote): string {
    return `
SwapQuote:
  Gateway: ${quote.gateway}
  Estimated Amount Out: ${quote.estimatedAmountOut.toString()}
  Estimated Fee Amount: ${quote.estimatedFeeAmount.toString()}
  Input Amount: ${quote.inputAmount.toString()}
  Input Amount in USD: ${quote.inputAmountInUSD.toFixed(2)}
  Estimated Amount Out in USD: ${quote.estimatedAmountOutInUSD.toFixed(2)}
  Slippage: ${(quote.slippage * 100).toFixed(2)}%
    `.trim();
  }
}