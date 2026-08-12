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
import { Market } from "../src/models/market";
import { CoinMetadata } from "../src/core/types";
import { MarketType } from "../src/utils/parsedTypes";

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

  it("accepts a positive peg and rejects non-finite pegged values", () => {
    // The >= 0 bound must admit a normal positive mirror value...
    expect(
      resolveCoinPrice(
        {
          pythPrice: 0.5 as unknown as string,
          coingeckoPrice: 0.4 as unknown as string,
        },
        ALKIMI,
      ),
    ).toEqual(new Decimal(0.5));
    // ...and must keep rejecting number-typed NaN/Infinity, with no fallback.
    expect(
      resolveCoinPrice(
        {
          pythPrice: NaN as unknown as string,
          coingeckoPrice: 0.4 as unknown as string,
        },
        ALKIMI,
      ),
    ).toBeNull();
    expect(
      resolveCoinPrice(
        {
          pythPrice: Infinity as unknown as string,
          coingeckoPrice: 0.4 as unknown as string,
        },
        ALKIMI,
      ),
    ).toBeNull();
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

// The helper tests above pin the rule; this pins the wiring. A revert of
// `Market.getPrice` to truthiness gating stays green on the helper tests but
// fails here, because the price flows through the real consumer path.
describe("Market.getMarketData (consumer path)", () => {
  const coinMetadata = (
    coinType: string,
    pythPrice: number | null,
    coingeckoPrice: number | null,
  ): CoinMetadata => ({
    coinType,
    pythPriceFeedId: null,
    pythPriceInfoObjectId: null,
    decimals: 9,
    pythSponsored: false,
    symbol: "TEST",
    // Runtime shape from GraphQL: numbers, despite the string type.
    coingeckoPrice: coingeckoPrice as unknown as string,
    pythPrice: pythPrice as unknown as string,
  });

  const emptyDistributor = (marketId: string) => ({
    id: "0xd",
    lastUpdated: "0",
    marketId,
    rewards: [],
    totalXtokens: "0",
  });

  const emptyLimiter = () => ({
    flowDelta: "0",
    lastUpdate: "0",
    maxRate: "0",
    windowDuration: "0",
  });

  const marketFixture = (coinType: string): MarketType => ({
    marketDynamicFieldId: "0xf",
    balanceHolding: "0",
    borrowRewardDistributor: emptyDistributor("17"),
    borrowedAmount: "0",
    coinType,
    compoundedInterest: "1000000000000000000",
    config: {
      active: true,
      borrowFeeBps: "0",
      borrowWeight: "1000000000000000000",
      borrowLimit: "0",
      borrowLimitPercentage: "0",
      cascadeMarketId: "0",
      closeFactorPercentage: 0,
      collateralTypes: [],
      depositFeeBps: "0",
      depositLimit: "0",
      extensionFields: { id: "0xe", size: "0" },
      interestRateKinks: [],
      interestRates: [0],
      isNative: false,
      isolated: false,
      lastUpdated: "0",
      liquidationBonusBps: "0",
      liquidationFeeBps: "0",
      liquidationThreshold: 69,
      protocolFeeShareBps: "0",
      protocolSpreadFeeShareBps: "0",
      safeCollateralRatio: 0,
      spreadFeeBps: "0",
      timeLock: "0",
      withdrawFeeBps: "0",
    },
    decimalDigit: "1000000000",
    depositFlowLimiter: emptyLimiter(),
    depositRewardDistributor: emptyDistributor("17"),
    id: "0x11",
    lastAutoCompound: "0",
    lastUpdate: "0",
    marketId: "17",
    outflowLimiter: emptyLimiter(),
    priceIdentifier: { coinType },
    unclaimedSpreadFee: "0",
    unclaimedSpreadFeeProtocol: "0",
    writeoffAmount: "0",
    xtokenRatio: "1000000000000000000",
    xtokenSupply: "0",
    xtokenType: `xtoken<${coinType}>`,
  });

  it("prices a pegged market at the mirrored zero, not the CoinGecko quote", async () => {
    const map = new Map<string, CoinMetadata>([
      [ALKIMI, coinMetadata(ALKIMI, 0, 0.0009031)],
    ]);
    const market = new Market(marketFixture(ALKIMI), map);

    const data = await market.getMarketData();
    expect(data.price).toEqual(new Decimal(0));
  });

  it("keeps the CoinGecko fallback for a non-pegged market with a zero pyth value", async () => {
    const other = "0xother::x::X";
    const map = new Map<string, CoinMetadata>([
      [other, coinMetadata(other, 0, 1.5)],
    ]);
    const market = new Market(marketFixture(other), map);

    const data = await market.getMarketData();
    expect(data.price).toEqual(new Decimal(1.5));
  });
});
