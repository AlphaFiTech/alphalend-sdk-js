import { Decimal } from "decimal.js";
import { CoinMetadata } from "../core/types.js";

/**
 * Coins pegged on-chain via `oracle::set_fixed_price` (wound-down markets).
 * The ws `update_prices` cron mirrors the peg into `pythPrice` every ~10s.
 * The pegged value — zero included, it is the chain's valuation — must reach
 * USD math unchanged, so these coins accept zero and never fall back to
 * CoinGecko: the market quote is not what the chain enforces, and substituting
 * it would inflate collateral and liquidation-limit math.
 * Keep in sync with `PEGGED_COIN_TYPES` in alphalend-sdk-rust
 * `src/blockchain/coin_registry.rs`.
 *
 * Caveat: a pegged price carries no independent staleness signal. The client
 * fetches coin metadata once and does not refresh it, so a long-lived client
 * serves the first mirrored value it saw. The liquidator adds its own
 * freshness check (`PEGGED_ROW_MAX_AGE_MS`); this SDK does not.
 */
export const PEGGED_COIN_TYPES: readonly string[] = [
  "0x1a8f4bc33f8ef7fbc851f156857aa65d397a6a6fd27a7ac2ca717b51f2fd9489::alkimi::ALKIMI",
  "0x87dfe1248a1dc4ce473bd9cb2937d66cdc6c30fee63f3fe0dbb55c7a09d35dec::up::UP",
];

/**
 * The GraphQL Float fields arrive as JS numbers at runtime despite the
 * `string | null` type on [`CoinMetadata`]; accept both shapes.
 */
const toFinite = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve a coin's USD price: `pythPrice` when usable, else `coingeckoPrice`,
 * else `null`. Non-positive and non-finite values are unusable. Pegged coins
 * ([`PEGGED_COIN_TYPES`]) take `pythPrice` only, zero included, and never use
 * CoinGecko. A truthiness check on `pythPrice` must never gate this: the
 * runtime value is a number, so a pegged `0` is falsy and would silently
 * fall through to the market quote.
 */
export function resolveCoinPrice(
  metadata: Pick<CoinMetadata, "pythPrice" | "coingeckoPrice"> | undefined,
  coinType: string,
): Decimal | null {
  if (!metadata) return null;
  const pyth = toFinite(metadata.pythPrice);
  if (PEGGED_COIN_TYPES.includes(coinType)) {
    return pyth !== null && pyth >= 0 ? new Decimal(pyth) : null;
  }
  if (pyth !== null && pyth > 0) return new Decimal(pyth);
  const coingecko = toFinite(metadata.coingeckoPrice);
  return coingecko !== null && coingecko > 0 ? new Decimal(coingecko) : null;
}
