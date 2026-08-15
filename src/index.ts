// Main exports
export * from "./constants/index.js";
export * from "./core/types.js";

// Re-export key types for easier access
export { AlphalendClient } from "./core/client.js";
export { Market } from "./models/market.js";
export { Position } from "./models/position.js";
export {
  getUserPositionCapId,
  getUserPositionIds,
  getUserPositionCapIds,
} from "./models/position/functions.js";

// Export caching utilities for advanced users
// Price resolution. Consumers must use this rather than reading `pythPrice`
// or `coingeckoPrice` directly: a pegged coin is priced at exactly 0, and a
// truthiness test on that value silently substitutes the CoinGecko quote.
export { resolveCoinPrice, PEGGED_COIN_TYPES } from "./utils/price.js";
export { httpCache } from "./utils/httpCache.js";
export { blockchainCache } from "./utils/blockchainCache.js";
export {
  getNaviFlashLoanSupportedCoinTypes,
  getNaviFlashLoanFeeForCoinType,
} from "./core/flashRepay.js";
export {
  getCoinObjectCounts,
  buildMergeCoinsTransaction,
  MAX_COINS_PER_TX,
} from "./core/coinHelpers.js";
export type { MergeCoinsOutput, CoinTypeCount } from "./core/coinHelpers.js";
