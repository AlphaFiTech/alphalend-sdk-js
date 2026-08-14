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

const meta = (
  coinType: string,
  pythPrice: number | string | null,
  coingeckoPrice: number | string | null,
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

describe("resolveCoinPrice", () => {
  it("keeps a pegged zero and ignores the CoinGecko quote", () => {
    expect(resolveCoinPrice(meta(ALKIMI, 0, 0.0009031))).toEqual(
      new Decimal(0),
    );
  });

  it("never uses CoinGecko for a pegged coin, even with no peg mirror", () => {
    expect(resolveCoinPrice(meta(ALKIMI, null, 0.0009031))).toBeNull();
  });

  it("keeps the pyth-then-coingecko fallback for non-pegged coins", () => {
    expect(resolveCoinPrice(meta(SUI, 0.686, 0.687))).toEqual(
      new Decimal(0.686),
    );
    expect(resolveCoinPrice(meta(SUI, null, 0.687))).toEqual(
      new Decimal(0.687),
    );
    // A zero on a non-pegged coin is unusable, not a valuation.
    expect(resolveCoinPrice(meta(SUI, 0, 0.687))).toEqual(new Decimal(0.687));
  });

  it("accepts string-typed values as declared on CoinMetadata", () => {
    expect(resolveCoinPrice(meta(ALKIMI, "0", "1.5"))).toEqual(new Decimal(0));
    expect(resolveCoinPrice(meta(SUI, "0.686", null))).toEqual(
      new Decimal(0.686),
    );
  });

  it("accepts a positive peg and rejects non-finite pegged values", () => {
    // The >= 0 bound must admit a normal positive mirror value...
    expect(resolveCoinPrice(meta(ALKIMI, 0.5, 0.4))).toEqual(new Decimal(0.5));
    // ...and must keep rejecting number-typed NaN/Infinity, with no fallback.
    expect(resolveCoinPrice(meta(ALKIMI, NaN, 0.4))).toBeNull();
    expect(resolveCoinPrice(meta(ALKIMI, Infinity, 0.4))).toBeNull();
  });

  it("returns null for missing, non-finite, or negative data", () => {
    expect(resolveCoinPrice(undefined)).toBeNull();
    expect(resolveCoinPrice(meta(SUI, null, null))).toBeNull();
    expect(resolveCoinPrice(meta(SUI, "NaN", null))).toBeNull();
    expect(resolveCoinPrice(meta(ALKIMI, -1, null))).toBeNull();
  });
});

// The helper tests above pin the rule; this pins the wiring. A revert of
// `Market.getPrice` to truthiness gating stays green on the helper tests but
// fails here, because the price flows through the real consumer path.
describe("Market.getMarketData (consumer path)", () => {
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
      [ALKIMI, meta(ALKIMI, 0, 0.0009031)],
    ]);
    const market = new Market(marketFixture(ALKIMI), map);

    const data = await market.getMarketData();
    expect(data.price).toEqual(new Decimal(0));
  });

  it("keeps the CoinGecko fallback for a non-pegged market with a zero pyth value", async () => {
    const other = "0xother::x::X";
    const map = new Map<string, CoinMetadata>([[other, meta(other, 0, 1.5)]]);
    const market = new Market(marketFixture(other), map);

    const data = await market.getMarketData();
    expect(data.price).toEqual(new Decimal(1.5));
  });

  // A zero market price is the divisor for every reward APR. Without a guard
  // decimal.js returns Infinity rather than throwing, and position.ts then
  // multiplies it by a zero collateral value, so the NaN poisons every later
  // add() into the portfolio aggregate — not just this market's row.
  describe("with an active reward campaign", () => {
    const rewardFixture = (coinType: string): MarketType => {
      const base = marketFixture(coinType);
      const distributor = {
        id: "0xd",
        lastUpdated: "1000",
        marketId: "17",
        totalXtokens: "0",
        rewards: [
          {
            id: "0xr",
            coinType: SUI,
            distributorId: "0xd",
            isAutoCompounded: false,
            autoCompoundMarketId: "0",
            totalRewards: "1000000000000",
            startTime: "0",
            endTime: "1000000",
            distributedRewards: "0",
            cummulativeRewardsPerShare: "0",
          },
        ],
      };
      return {
        ...base,
        // totalLiquidity() = balanceHolding + borrowedAmount - deductions.
        balanceHolding: "1000000000000",
        borrowedAmount: "500000000000",
        depositRewardDistributor: distributor,
        borrowRewardDistributor: distributor,
      };
    };

    const priced = (coinType: string, pyth: number) =>
      new Map<string, CoinMetadata>([
        [coinType, meta(coinType, pyth, 0.0009031)],
        [SUI, meta(SUI, 1, 1)],
      ]);

    it("skips reward APRs on a pegged market instead of returning Infinity", () => {
      const market = new Market(rewardFixture(ALKIMI), priced(ALKIMI, 0));

      expect(market.calculateSupplyRewardApr()).toEqual([]);
      expect(market.calculateBorrowRewardApr()).toEqual([]);
    });

    it("still computes finite reward APRs on a normally priced market", () => {
      const other = "0xother::x::X";
      const market = new Market(rewardFixture(other), priced(other, 2));

      const supply = market.calculateSupplyRewardApr();
      expect(supply).toHaveLength(1);
      expect(supply[0].rewardApr.isFinite()).toBe(true);
      expect(supply[0].rewardApr.gt(0)).toBe(true);
    });
  });
});
