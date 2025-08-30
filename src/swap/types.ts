/**
 * Swap Types
 * 
 * Type definitions for the swap functionality in alphalend-sdk-js
 * These types follow the same patterns established in the original sui-alpha-sdk
 */

import { Transaction } from "@mysten/sui/transactions";

/**
 * Supported DEX gateways/protocols
 */
export type SwapGateway = "hop" | "cetus" | "7k" | "aftermath";

/**
 * Configuration for a single coin in a swap pair
 */
export interface CoinConfig {
  /** Human-readable name (e.g., "SUI", "USDC") */
  name: string;
  /** Fully qualified coin type */
  coinType: string;
  /** Number of decimal places */
  expo: number;

  type: string;
}

/**
 * Coin pair configuration for swap operations
 */
export interface CoinPair {
  /** Source coin configuration */
  coinA: CoinConfig;
  /** Destination coin configuration */
  coinB: CoinConfig;
}

/**
 * Options for configuring a swap operation
 */
export interface SwapOptions {
  /** The coin pair to swap between */
  pair: CoinPair;
  /** Input amount (if swapping exact amount in) */
  inAmount?: bigint;
  /** Output amount (if swapping exact amount out) */
  outAmount?: bigint;
  /** Maximum slippage tolerance as a percentage (e.g., 0.01 for 1%) */
  slippage: number;
  /** Sender's wallet address */
  senderAddress: string;
}

/**
 * Quote result from a swap aggregator
 */
export interface SwapQuote {
  /** Which gateway/DEX provided this quote */
  gateway: SwapGateway;
  /** Estimated amount of output tokens */
  estimatedAmountOut: bigint;
  /** Estimated fee amount */
  estimatedFeeAmount: bigint;
  /** Input amount being swapped */
  inputAmount: bigint;
  /** Input amount in USD */
  inputAmountInUSD: number;
  /** Estimated output amount in USD */
  estimatedAmountOutInUSD: number;
  /** Slippage percentage */
  slippage: number;
  /** Pre-built transaction (if available) */
  transaction?: Transaction;
}

/**
 * Result of a swap operation
 */
export interface SwapResult {
  /** The quote that was executed */
  quote: SwapQuote;
  /** The transaction that was built */
  transaction: Transaction;
  /** Whether the swap was successful */
  success: boolean;
  /** Error message if swap failed */
  error?: string;
}

/**
 * Configuration for swap gateway initialization
 */
export interface SwapGatewayConfig {
  /** Network to operate on */
  network: "mainnet" | "testnet" | "devnet";
  /** Enable debug logging */
  debug?: boolean;
  /** Custom timeout for quote fetching (in ms) */
  quoteTimeout?: number;
  /** Preferred gateways in order of preference */
  preferredGateways?: SwapGateway[];
}

/**
 * Price information for a token
 */
export interface TokenPrice {
  /** Token symbol */
  symbol: string;
  /** Price in USD */
  priceUSD: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Parameters for updating prices in a transaction
 */
export interface PriceUpdateParams {
  /** Transaction to add price updates to */
  transaction: Transaction;
  /** Coin types to update prices for */
  coinTypes: string[];
}
