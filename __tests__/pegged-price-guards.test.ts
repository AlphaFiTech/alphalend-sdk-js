/**
 * Guards that a legitimate zero price makes reachable.
 *
 * The pegged-price fix turns 0 into a real price value. Code that previously
 * could never see a zero price now can. These tests pin the guard that
 * protects a transaction amount.
 */

import { Decimal } from "decimal.js";
import { buildFlashRepayTransaction } from "../src/core/flashRepay";
import { AlphalendClient } from "../src/core/client";
import { FlashRepayParams } from "../src/core/types";
import { PEGGED_COIN_TYPES } from "../src/utils/price";

const ALKIMI = PEGGED_COIN_TYPES[0];
const SUI = "0x2::sui::SUI";

// The guard runs after the portfolio and market lookups, so those must return
// plausible data. The two guard tests reject before any network call; the
// both-priced control reaches the live Navi fee API before failing on the stub.
const stubClient = (peggedPrice: Decimal, suiPrice: Decimal) =>
  ({
    network: "mainnet",
    getUserPortfolioFromPositionCapId: async () => ({
      borrowedAmounts: new Map([[1, new Decimal(100)]]),
      suppliedAmounts: new Map([[17, new Decimal(21927)]]),
    }),
    getAllMarkets: async () => [
      { marketId: "1", coinType: SUI, price: suiPrice, decimalDigit: 9 },
      { marketId: "17", coinType: ALKIMI, price: peggedPrice, decimalDigit: 9 },
    ],
  }) as unknown as AlphalendClient;

const params = (overrides: Partial<FlashRepayParams> = {}): FlashRepayParams =>
  ({
    withdrawCoinType: ALKIMI,
    withdrawMarketId: "17",
    repayCoinType: SUI,
    repayMarketId: "1",
    positionCapId: "0xcap",
    address: "0xuser",
    slippage: 0.01,
    repayAmountBaseUnits: "500000000",
    ...overrides,
  }) as FlashRepayParams;

describe("flashRepay price guard", () => {
  // Without the guard the divisor is zero, the raw withdraw amount becomes
  // Infinity, and the supply cap silently turns that into "withdraw the whole
  // collateral balance" — 21927 ALKIMI instead of the 370 the user asked for.
  it("refuses to build a transaction when the withdraw market is pegged", async () => {
    await expect(
      buildFlashRepayTransaction(
        stubClient(new Decimal(0), new Decimal(0.69)),
        params(),
      ),
    ).rejects.toThrow(/usable price for both markets/);
  });

  it("refuses when the repay market is pegged", async () => {
    await expect(
      buildFlashRepayTransaction(
        stubClient(new Decimal(0.69), new Decimal(0)),
        params({ withdrawCoinType: SUI, withdrawMarketId: "1" }),
      ),
    ).rejects.toThrow(/usable price for both markets/);
  });

  it("does not raise the price error when both markets are priced", async () => {
    // It fails later, on the network-dependent Navi step, not on the guard.
    await expect(
      buildFlashRepayTransaction(
        stubClient(new Decimal(0.0009), new Decimal(0.69)),
        params(),
      ),
    ).rejects.not.toThrow(/usable price for both markets/);
  });
});
