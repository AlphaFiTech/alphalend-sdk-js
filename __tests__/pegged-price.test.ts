/**
 * Pegged-coin price resolution.
 *
 * ALKIMI and UP are pegged on-chain at 0 via `oracle::set_fixed_price`, and
 * the ws cron mirrors that peg into `pythPrice`. The GraphQL Float arrives as
 * a JS number, so a truthiness check on `pythPrice` treats a pegged 0 as
 * missing and silently substitutes the CoinGecko market quote. That corrupts
 * collateral, borrow-limit, and liquidation math. `resolveCoinPrice` must keep
 * the pegged zero and must never consult CoinGecko for a pegged coin.
 */

import { Decimal } from "decimal.js";
import { PEGGED_COIN_TYPES, resolveCoinPrice } from "../src/utils/price";

const ALKIMI = PEGGED_COIN_TYPES[0];
const SUI = "0x2::sui::SUI";

describe("resolveCoinPrice", () => {
  it("keeps a pegged zero and ignores the CoinGecko quote", () => {
    // Runtime shape from GraphQL: numbers, despite the string type.
    const metadata = {
      pythPrice: 0 as unknown as string,
      coingeckoPrice: 0.0009031 as unknown as string,
    };
    expect(resolveCoinPrice(metadata, ALKIMI)).toEqual(new Decimal(0));
  });

  it("never uses CoinGecko for a pegged coin, even with no peg mirror", () => {
    const metadata = {
      pythPrice: null,
      coingeckoPrice: 0.0009031 as unknown as string,
    };
    expect(resolveCoinPrice(metadata, ALKIMI)).toBeNull();
  });

  it("keeps the pyth-then-coingecko fallback for non-pegged coins", () => {
    expect(
      resolveCoinPrice(
        {
          pythPrice: 0.686 as unknown as string,
          coingeckoPrice: 0.687 as unknown as string,
        },
        SUI,
      ),
    ).toEqual(new Decimal(0.686));
    expect(
      resolveCoinPrice(
        { pythPrice: null, coingeckoPrice: 0.687 as unknown as string },
        SUI,
      ),
    ).toEqual(new Decimal(0.687));
    // A zero on a non-pegged coin is unusable, not a valuation.
    expect(
      resolveCoinPrice(
        {
          pythPrice: 0 as unknown as string,
          coingeckoPrice: 0.687 as unknown as string,
        },
        SUI,
      ),
    ).toEqual(new Decimal(0.687));
  });

  it("accepts string-typed values as declared on CoinMetadata", () => {
    expect(
      resolveCoinPrice({ pythPrice: "0", coingeckoPrice: "1.5" }, ALKIMI),
    ).toEqual(new Decimal(0));
    expect(
      resolveCoinPrice({ pythPrice: "0.686", coingeckoPrice: null }, SUI),
    ).toEqual(new Decimal(0.686));
  });

  it("returns null for missing, non-finite, or negative data", () => {
    expect(resolveCoinPrice(undefined, SUI)).toBeNull();
    expect(
      resolveCoinPrice({ pythPrice: null, coingeckoPrice: null }, SUI),
    ).toBeNull();
    expect(
      resolveCoinPrice({ pythPrice: "NaN", coingeckoPrice: null }, SUI),
    ).toBeNull();
    expect(
      resolveCoinPrice(
        { pythPrice: -1 as unknown as string, coingeckoPrice: null },
        ALKIMI,
      ),
    ).toBeNull();
  });
});
