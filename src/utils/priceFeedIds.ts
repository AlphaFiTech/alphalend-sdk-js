/**
 * Price Feed IDs and Coin Type Utilities
 *
 * This module provides mappings and utilities for interacting with Pyth price feeds:
 * - Maps token symbols to Pyth price feed IDs
 * - Maps Sui coin types to token symbols
 * - Provides utility functions for resolving price feeds
 */

import { HexString } from "@pythnetwork/pyth-sui-js";

/**
 * Mapping of token symbols to their corresponding Pyth price feed IDs
 * These IDs are used to fetch price data from the Pyth oracle
 */
export const pythPriceFeedIds: { [key: string]: HexString } = {
  // Mainnet price feed IDs
  SUI: "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  ALPHA: "",
  USDC: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  CETUS: "e5b274b2611143df055d6e7cd8d93fe1961716bcd4dca1cad87a83bc1e78c1ef",
  STSUI: "0449948a9a210481464ea7030734fa79f59b751c2f411cfb1ba56b5f69e4a62a",
  NS: "bb5ff26e47a3a6cc7ec2fce1db996c2a145300edc5acaabe43bf9ff7c5dd5d32",
  USDT: "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",

  // Testnet price feed IDs (commented out)
  // SUI: "50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
  // USDC: "41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722",
  // BTC: "f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
  // CETUS: "cb324dafd531712dd31c39969ae0246ee4c6ae167257bcf8ac27e28ca35e6a0c",
};

/**
 * Mapping of Sui coin type strings to their corresponding token symbols
 * Used to convert fully qualified Move coin types to symbols that can be used with Pyth
 */
export const coinTypeToSymbol: { [key: string]: string } = {
  // Native SUI token
  "0x2::sui::SUI": "SUI",

  // USDC variants (devnet and mainnet)
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC":
    "USDC",
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC":
    "USDC",

  // Other tokens
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN":
    "USDT",
  "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI":
    "STSUI",
};

/**
 * Get price feed ID for a given coin type
 * @param coinType Full or short coin type
 * @returns Price feed ID or undefined if not found
 */
export function getPythPriceFeedId(coinType: string): string | undefined {
  // If the coinType is a full type path, convert to symbol first
  let symbol = coinTypeToSymbol[coinType];

  // If we don't have a mapping, try to extract the last part of the path
  if (!symbol) {
    const parts = coinType.split("::");
    if (parts.length === 3) {
      symbol = parts[2];
    } else {
      symbol = coinType; // Use as is
    }
  }

  return pythPriceFeedIds[symbol];
}

/**
 * Register a new price feed ID for a coin type
 * @param coinType The coinType to register
 * @param symbol The symbol to use (e.g., "BTC", "ETH")
 * @param priceFeedId The Pyth price feed ID
 */
export function registerPriceFeed(
  coinType: string,
  symbol: string,
  priceFeedId: string,
): void {
  coinTypeToSymbol[coinType] = symbol;
  pythPriceFeedIds[symbol] = priceFeedId;
}
