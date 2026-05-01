/**
 * Migration Snapshot Script
 *
 * Captures the parsed/observable output of every public function in the
 * AlphaLend SDK, plus a normalized "skeleton" of every transaction
 * builder, into JSON files under `scripts/new-snapshots/<--out>/`.
 *
 * Goal: run this on both branches (pre-migration `main` and the migrated
 * `feature/json-rpc-migration` branch) and diff the two output trees with
 * `scripts/migration-diff.ts` to verify semantic equivalence.
 *
 * What is captured
 * ----------------
 *
 * Reads (full JSON-serialized output of each call):
 *   - getAllMarkets (chain layer + client MarketData layer)
 *   - per-market via getMarketDataFromId
 *   - getProtocolStats
 *   - getCoinObject (SUI test)
 *   - fetchCoinMetadataMap
 *   - getUserPositionCapId / getUserPositionCapIds / getUserPositionIds
 *   - per-cap getPositionFromPositionCapId
 *   - per-position getPosition
 *   - getUserPortfolio + per-position/per-cap variants
 *   - getAlphaReceipt (normalized to id+poolId)
 *   - initialSharedVersion(LENDING_PROTOCOL_ID) (where exposed)
 *   - deepbookPackageId (UpgradeCap follow)
 *
 * Transactions (Tier-1 normalized skeletons):
 *   - createPosition, supply, withdraw, borrow, repay
 *   - claimRewards, liquidate (self-position; build only, do not execute)
 *   - flashRepay, updatePrices, updateAllPrices
 *
 * Excluded: zapInSupply, zapOutWithdraw, swapAndRepay,
 * claimSwapAndSupplyOrRepayOrTransfer — they include external (Cetus / 7K)
 * swap quotes that vary between runs and would generate noise diffs.
 *
 * Tx normalization
 * ----------------
 * For every transaction we read `tx.getData()` and walk the JSON to:
 *   - drop `gasData`, `expiration`
 *   - drop volatile fields: `version`, `digest`, `initialSharedVersion`
 * Everything else (sender, inputs, commands, type args, pure values,
 * object IDs) is kept. This yields a stable shape that diffs cleanly
 * across pre/post migration runs of the same code.
 *
 * Usage
 * -----
 *
 *   # On pre-migration code (e.g. origin/main):
 *   npx tsx scripts/migration-snapshot.ts --out before
 *
 *   # On the migrated branch (after copying the script over):
 *   npx tsx scripts/migration-snapshot.ts --out after
 *
 * Then diff with `scripts/migration-diff.ts`.
 *
 * NOTE: this version of the script targets the POST-MIGRATION (GraphQL)
 * API. The pre-migration variant is identical except the constructor and
 * a few helper functions take a `SuiClient` rather than a `Blockchain`.
 * See `makeClient()` and the position helper calls below.
 */

import * as fs from "fs";
import * as path from "path";

import { Transaction } from "@mysten/sui/transactions";

import { AlphalendClient } from "../src/core/client.js";
import {
  getUserPositionCapId,
  getUserPositionCapIds,
  getUserPositionIds,
} from "../src/models/position/functions.js";
import { getAlphaReceipt } from "../src/utils/helper.js";
import { getConstants } from "../src/constants/index.js";
import { MAX_U64 } from "../src/core/types.js";
import {
  getNaviFlashLoanSupportedCoinTypes,
  getNaviFlashLoanFeeForCoinType,
} from "../src/core/flashRepay.js";
import type { MarketType, PositionCapType } from "../src/utils/parsedTypes.js";
import type { Receipt } from "../src/utils/queryTypes.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TEST_ADDRESS =
  "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";
const NETWORK: "mainnet" | "testnet" | "devnet" = "mainnet";
const SUI_COIN_TYPE = "0x2::sui::SUI";
// SUI is always available and most reliable for tx-skeleton snapshots.
const SUPPLY_MARKET_ID = "1";
const SUPPLY_COIN_TYPE = SUI_COIN_TYPE;
// Build-time amounts; values themselves don't matter, only structure.
const SUPPLY_AMOUNT = 1_000n;
const BORROW_AMOUNT = 1_000n;

function parseArgs() {
  const args = process.argv.slice(2);
  let out = "before";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && i + 1 < args.length) {
      out = args[i + 1];
      i++;
    }
  }
  return { out };
}

// ---------------------------------------------------------------------------
// Cross-version client factory.
// PRE-MIGRATION: AlphalendClient(network, suiClient, options?)
// POST-MIGRATION: AlphalendClient(network, graphqlUrl?, options?)
// ---------------------------------------------------------------------------
function makeClient(): AlphalendClient {
  // POST-MIGRATION call form:
  return new AlphalendClient(NETWORK);
}

// ---------------------------------------------------------------------------
// JSON serialization that preserves Decimal, BigInt, and Map.
// ---------------------------------------------------------------------------
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) obj[String(k)] = v;
    return obj;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toString?: unknown }).toString === "function" &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      "Decimal"
  ) {
    return (value as { toString(): string }).toString();
  }
  return value;
}

function writeSnapshot(dir: string, name: string, data: unknown) {
  const filePath = path.join(dir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, jsonReplacer, 2) + "\n");
  console.log(`  wrote ${filePath}`);
}

// ---------------------------------------------------------------------------
// Tier-1 transaction normalization.
// Strips volatile fields so the JSON is stable across runs of the same code.
// ---------------------------------------------------------------------------
const VOLATILE_KEYS = new Set(["version", "digest", "initialSharedVersion"]);

function deepStripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepStripVolatile);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEYS.has(k)) continue;
      out[k] = deepStripVolatile(v);
    }
    return out;
  }
  return value;
}

function normalizeTx(tx: Transaction): unknown {
  const data = tx.getData() as Record<string, unknown>;
  // Drop top-level volatile sections wholesale.
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "gasData" || k === "expiration") continue;
    trimmed[k] = v;
  }
  return deepStripVolatile(trimmed);
}

// Convenience wrapper: time + log + capture errors so a single failure
// doesn't abort the entire snapshot run.
async function step<T>(
  label: string,
  fn: () => Promise<T>,
  onResult: (value: T) => void,
): Promise<void> {
  console.log(label);
  try {
    const t0 = Date.now();
    const value = await fn();
    onResult(value);
    console.log(`  ok (${Date.now() - t0}ms)`);
  } catch (err) {
    console.warn(`  WARN: ${label} failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { out } = parseArgs();
  const outDir = path.join("scripts", "new-snapshots", out);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Snapshot directory: ${outDir}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Test address: ${TEST_ADDRESS}\n`);

  const alc = makeClient();
  const constants = getConstants(NETWORK);

  // -----------------------------------------------------------------------
  // READS: chain-layer market data
  // -----------------------------------------------------------------------

  let allMarketsChain: MarketType[] = [];
  await step(
    "[reads] blockchain.getAllMarkets",
    () => alc.blockchain.getAllMarkets(),
    (markets) => {
      allMarketsChain = markets;
      writeSnapshot(outDir, "getAllMarkets", markets);
    },
  );

  for (const m of allMarketsChain) {
    await step(
      `[reads] blockchain.getMarket(${m.marketId})`,
      () => alc.blockchain.getMarket(Number(m.marketId)),
      (market) => writeSnapshot(outDir, `market-${m.marketId}`, market),
    );
  }

  // -----------------------------------------------------------------------
  // READS: client-layer aggregations
  // -----------------------------------------------------------------------

  await step(
    "[reads] alc.getProtocolStats",
    () => alc.getProtocolStats(),
    (stats) => writeSnapshot(outDir, "getProtocolStats", stats),
  );

  await step(
    "[reads] alc.getAllMarkets({ useCache: false })",
    () => alc.getAllMarkets({ useCache: false }),
    (data) => writeSnapshot(outDir, "getAllMarketsData", data),
  );

  for (const m of allMarketsChain) {
    await step(
      `[reads] alc.getMarketDataFromId(${m.marketId})`,
      () => alc.getMarketDataFromId(Number(m.marketId)),
      (data) => writeSnapshot(outDir, `marketData-${m.marketId}`, data),
    );
  }

  await step(
    "[reads] alc.fetchCoinMetadataMap",
    () => alc.fetchCoinMetadataMap(),
    (map) => writeSnapshot(outDir, "fetchCoinMetadataMap", map),
  );

  // -----------------------------------------------------------------------
  // READS: position helpers
  // -----------------------------------------------------------------------

  await step(
    "[reads] getUserPositionCapId",
    () => getUserPositionCapId(alc.blockchain, TEST_ADDRESS),
    (id) => writeSnapshot(outDir, "userPositionCapId", { id: id ?? null }),
  );

  let positionCapIds: (string | undefined)[] = [];
  await step(
    "[reads] getUserPositionCapIds",
    () => getUserPositionCapIds(alc.blockchain, TEST_ADDRESS),
    (ids) => {
      positionCapIds = ids ?? [];
      writeSnapshot(outDir, "userPositionCapIds", positionCapIds);
    },
  );

  let positionIds: string[] = [];
  await step(
    "[reads] getUserPositionIds",
    () => getUserPositionIds(alc.blockchain, TEST_ADDRESS),
    (ids) => {
      positionIds = ids ?? [];
      writeSnapshot(outDir, "userPositionIds", positionIds);
    },
  );

  // -----------------------------------------------------------------------
  // READS: position-cap structure (uses LendingProtocol since it's the
  // only public surface that exposes a typed PositionCap fetch)
  // -----------------------------------------------------------------------

  let positionCaps: PositionCapType[] = [];
  await step(
    "[reads] blockchain.getPositionCapsForUser",
    () => alc.blockchain.getPositionCapsForUser(TEST_ADDRESS),
    (caps) => {
      positionCaps = caps;
      writeSnapshot(outDir, "positionCaps", caps);
    },
  );

  for (let i = 0; i < positionCaps.length; i++) {
    const cap = positionCaps[i];
    await step(
      `[reads] blockchain.getPosition(${cap.positionId})`,
      () => alc.blockchain.getPosition(cap.positionId),
      (pos) => writeSnapshot(outDir, `position-${i}`, pos),
    );
    await step(
      `[reads] blockchain.getPositionFromPositionCapId(${cap.id})`,
      () => alc.blockchain.getPositionFromPositionCapId(cap.id),
      (pos) => writeSnapshot(outDir, `positionFromCap-${i}`, pos),
    );
  }

  // -----------------------------------------------------------------------
  // READS: user portfolio variants
  // -----------------------------------------------------------------------

  await step(
    "[reads] alc.getUserPortfolio",
    () => alc.getUserPortfolio(TEST_ADDRESS),
    (portfolio) => writeSnapshot(outDir, "userPortfolio", portfolio),
  );

  for (let i = 0; i < positionCaps.length; i++) {
    const cap = positionCaps[i];
    await step(
      `[reads] alc.getUserPortfolioFromPositionCapId(${cap.id})`,
      () => alc.getUserPortfolioFromPositionCapId(cap.id),
      (p) => writeSnapshot(outDir, `userPortfolioFromCap-${i}`, p),
    );
    await step(
      `[reads] alc.getUserPortfolioFromPosition(${cap.positionId})`,
      () => alc.getUserPortfolioFromPosition(cap.positionId),
      (p) => writeSnapshot(outDir, `userPortfolioFromPosition-${i}`, p),
    );
  }

  // -----------------------------------------------------------------------
  // READS: helpers
  // -----------------------------------------------------------------------

  await step(
    "[reads] getAlphaReceipt",
    () => getAlphaReceipt(alc.blockchain, TEST_ADDRESS),
    (receipts) => {
      const normalized = receipts.map((r: Receipt) => ({
        id: r.objectId,
        poolId: r.fields?.pool_id ?? null,
      }));
      writeSnapshot(outDir, "alphaReceipt", normalized);
    },
  );

  await step(
    "[reads] deepbookPackageId (via UpgradeCap)",
    async () => {
      const capId = constants.DEEPBOOK_UPGRADE_CAP_ID;
      if (!capId) return { deepbookPackageId: null };
      // POST-MIGRATION: Blockchain.getObject returns { address, contents }.
      // PRE-MIGRATION: SuiClient.getObject(...) was used (already captured).
      // Both yield the same `package` field; the snapshot file is the
      // single { deepbookPackageId } object below either way.
      const obj = await alc.blockchain.getObject<{ package?: string }>(capId);
      const pkg = obj?.contents?.package ?? null;
      return { deepbookPackageId: pkg };
    },
    (data) => writeSnapshot(outDir, "deepbookPackageId", data),
  );

  await step(
    "[reads] blockchain.getInitialSharedVersion(LENDING_PROTOCOL_ID)",
    () => alc.blockchain.getInitialSharedVersion(constants.LENDING_PROTOCOL_ID),
    (isv) =>
      writeSnapshot(outDir, "initialSharedVersion", {
        lendingProtocol: isv,
      }),
  );

  await step(
    "[reads] getNaviFlashLoanSupportedCoinTypes",
    () => getNaviFlashLoanSupportedCoinTypes(),
    (set) =>
      writeSnapshot(
        outDir,
        "naviFlashLoanSupportedCoinTypes",
        Array.from(set).sort(),
      ),
  );

  await step(
    "[reads] getNaviFlashLoanFeeForCoinType(SUI)",
    () => getNaviFlashLoanFeeForCoinType(SUI_COIN_TYPE),
    (fee) =>
      writeSnapshot(outDir, "naviFlashLoanFee-SUI", { fee: fee ?? null }),
  );

  // -----------------------------------------------------------------------
  // READS: getCoinObject (SUI returns tx.gas, exercise normalization too)
  // -----------------------------------------------------------------------

  await step(
    "[reads] alc.getCoinObject(SUI)",
    async () => {
      const tx = new Transaction();
      const result = await alc.getCoinObject(
        tx,
        SUI_COIN_TYPE,
        TEST_ADDRESS,
        SUPPLY_AMOUNT,
      );
      // For SUI the result is `tx.gas` (a TransactionArgument); we just
      // record its kind, not the txData itself.
      const kind =
        typeof result === "string"
          ? "string"
          : result === undefined
            ? "undefined"
            : "TransactionArgument";
      return { kind };
    },
    (data) => writeSnapshot(outDir, "getCoinObject-SUI", data),
  );

  // -----------------------------------------------------------------------
  // TRANSACTIONS: Tier-1 skeletons.
  // We use SUI for everything to avoid coin-fetch dependencies.
  // -----------------------------------------------------------------------

  const firstCapId = positionCaps[0]?.id as string | undefined;
  const firstPositionId = positionCaps[0]?.positionId as string | undefined;

  // updatePrices / updateAllPrices need a fresh tx each.
  await step(
    "[tx] updatePrices(SUI)",
    async () => {
      const tx = new Transaction();
      await alc.updatePrices(tx, [SUI_COIN_TYPE]);
      return normalizeTx(tx);
    },
    (data) => writeSnapshot(outDir, "tx-updatePrices", data),
  );

  await step(
    "[tx] updateAllPrices(SUI)",
    async () => {
      const tx = new Transaction();
      await alc.updateAllPrices(tx, [SUI_COIN_TYPE]);
      return normalizeTx(tx);
    },
    (data) => writeSnapshot(outDir, "tx-updateAllPrices", data),
  );

  await step(
    "[tx] createPosition()",
    async () => {
      const tx = new Transaction();
      alc.createPosition(tx);
      return normalizeTx(tx);
    },
    (data) => writeSnapshot(outDir, "tx-createPosition", data),
  );

  await step(
    "[tx] supply(SUI)",
    async () => {
      const tx = await alc.supply({
        marketId: SUPPLY_MARKET_ID,
        amount: SUPPLY_AMOUNT,
        coinType: SUPPLY_COIN_TYPE,
        positionCapId: firstCapId,
        address: TEST_ADDRESS,
      });
      if (!tx) throw new Error("supply returned undefined");
      return normalizeTx(tx);
    },
    (data) => writeSnapshot(outDir, "tx-supply-sui", data),
  );

  if (firstCapId) {
    await step(
      "[tx] withdraw(SUI)",
      async () => {
        const tx = await alc.withdraw({
          marketId: SUPPLY_MARKET_ID,
          amount: SUPPLY_AMOUNT,
          coinType: SUPPLY_COIN_TYPE,
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
          priceUpdateCoinTypes: [SUI_COIN_TYPE],
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-withdraw-sui", data),
    );

    await step(
      "[tx] withdraw(SUI, MAX_U64)",
      async () => {
        const tx = await alc.withdraw({
          marketId: SUPPLY_MARKET_ID,
          amount: MAX_U64,
          coinType: SUPPLY_COIN_TYPE,
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
          priceUpdateCoinTypes: [SUI_COIN_TYPE],
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-withdraw-sui-max", data),
    );

    await step(
      "[tx] borrow(SUI)",
      async () => {
        const tx = await alc.borrow({
          marketId: SUPPLY_MARKET_ID,
          amount: BORROW_AMOUNT,
          coinType: SUPPLY_COIN_TYPE,
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
          priceUpdateCoinTypes: [SUI_COIN_TYPE],
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-borrow-sui", data),
    );

    await step(
      "[tx] repay(SUI)",
      async () => {
        const tx = await alc.repay({
          marketId: SUPPLY_MARKET_ID,
          amount: BORROW_AMOUNT,
          coinType: SUPPLY_COIN_TYPE,
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
        });
        if (!tx) throw new Error("repay returned undefined");
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-repay-sui", data),
    );

    await step(
      "[tx] claimRewards",
      async () => {
        const tx = await alc.claimRewards({
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
          claimAndDepositAlpha: true,
          claimAndDepositAll: true,
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-claimRewards", data),
    );

    await step(
      "[tx] flashRepay(SUI)",
      async () => {
        const tx = await alc.flashRepay({
          withdrawCoinType: SUPPLY_COIN_TYPE,
          withdrawMarketId: SUPPLY_MARKET_ID,
          repayCoinType: SUPPLY_COIN_TYPE,
          repayMarketId: SUPPLY_MARKET_ID,
          positionCapId: firstCapId,
          address: TEST_ADDRESS,
          slippage: 0.01,
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-flashRepay-sui", data),
    );
  } else {
    console.warn(
      "  WARN: no position cap for test address; skipping withdraw/borrow/repay/claimRewards/flashRepay tx snapshots",
    );
  }

  if (firstPositionId) {
    await step(
      "[tx] liquidate(self-position)",
      async () => {
        // For a Tier-1 skeleton we only need a built tx, not an
        // executable one. We create a placeholder repayCoin via gas split.
        const tx = new Transaction();
        const [repayCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BORROW_AMOUNT)]);
        await alc.liquidate({
          tx,
          liquidatePositionId: firstPositionId,
          borrowMarketId: SUPPLY_MARKET_ID,
          withdrawMarketId: SUPPLY_MARKET_ID,
          repayCoin,
          borrowCoinType: SUPPLY_COIN_TYPE,
          withdrawCoinType: SUPPLY_COIN_TYPE,
          priceUpdateCoinTypes: [SUI_COIN_TYPE],
        });
        return normalizeTx(tx);
      },
      (data) => writeSnapshot(outDir, "tx-liquidate-self", data),
    );
  }

  console.log("\nSnapshot complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
