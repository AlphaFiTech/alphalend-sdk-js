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
 * Mapping of Coin Types to their corresponding Pyth price feed IDs
 * These IDs are used to fetch price data from the Pyth oracle
 */
export const pythPriceFeedIds: { [key: string]: HexString } = {
  // Mainnet price feed IDs
  "0x2::sui::SUI":
    "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI":
    "0b3eae8cb6e221e7388a435290e0f2211172563f94769077b7f4c4c6a11eea76",
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC":
    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // ???
  "0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC":
    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT":
    "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b", // ???
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC":
    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL":
    "eba0732395fae9dec4bae12e52760b35fc1c5671e2da8b449c9af4efe5d54341",
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP":
    "29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff",
  "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE":
    "04cfeb7b143eb9c48e9b074125c1a3447b85f59c31164dc20c1beaa6f21f2b6b",
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH":
    "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};
