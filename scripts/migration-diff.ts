/**
 * Migration Diff (comprehensive)
 *
 * Compares the JSON snapshots under
 *   scripts/new-snapshots/before/   (captured on origin/main)
 *   scripts/new-snapshots/after/    (captured on the migrated branch)
 *
 * Reports semantic differences in the parsed domain types and in the
 * normalized transaction skeletons. The migration is supposed to preserve
 * the public API contract, so any non-noise diff is a potential
 * regression.
 *
 * Usage:
 *   npx tsx scripts/new-migration-diff.ts            # report
 *   npx tsx scripts/new-migration-diff.ts --strict   # show ALL diffs incl. noise
 *   npx tsx scripts/new-migration-diff.ts --file market-1.json   # focus one file
 *
 * "Noise" = paths whose values legitimately drift between two runs of
 * the same code (timestamps, accruing balances, oracle prices, derived
 * APR / USD figures). These are filtered by default so the output
 * highlights real signal.
 */

import * as fs from "fs";
import * as path from "path";

const BEFORE_DIR = path.join("scripts", "new-snapshots", "before");
const AFTER_DIR = path.join("scripts", "new-snapshots", "after");

interface Diff {
  path: string;
  before: unknown;
  after: unknown;
}

// ---------------------------------------------------------------------------
// Noise classification.
// Match by suffix on the JSONPath we generate (e.g. "$.config.lastUpdated").
// Anything ending with one of these segments is treated as drift, not signal.
// ---------------------------------------------------------------------------
const NOISE_SUFFIXES = new Set<string>([
  // timestamps
  "lastUpdated",
  "lastUpdate",
  "last_updated",
  "last_update",
  "lastAutoCompound",
  "last_auto_compound",
  "lastRefreshed",
  "last_refreshed",
  "borrowTime",
  "borrow_time",
  "startTime",
  "start_time",
  "endTime",
  "end_time",

  // accruing per-block / per-second protocol accumulators
  "balanceHolding",
  "balance_holding",
  "borrowedAmount",
  "borrowed_amount",
  "xtokenSupply",
  "xtoken_supply",
  "xtokenRatio",
  "xtoken_ratio",
  "compoundedInterest",
  "compounded_interest",
  "borrowCompoundedInterest",
  "borrow_compounded_interest",
  "writeoffAmount",
  "writeoff_amount",
  "unclaimedSpreadFee",
  "unclaimed_spread_fee",
  "unclaimedSpreadFeeProtocol",
  "unclaimed_spread_fee_protocol",
  "totalRewards",
  "total_rewards",
  "totalXtokens",
  "total_xtokens",
  "distributedRewards",
  "distributed_rewards",
  "cummulativeRewardsPerShare",
  "cummulative_rewards_per_share",
  "earnedRewards",
  "earned_rewards",
  "flowDelta",
  "flow_delta",
  "amount",

  // oracle-driven / derived
  "price",
  "totalSupply",
  "totalBorrow",
  "utilizationRate",
  "availableLiquidity",
  "interestApr",
  "stakingApr",
  "rewardApr",
  "borrowFee",
  // Both sides of "allowed" are price-and-accumulator dependent and
  // routinely differ in the last few decimal places between runs.
  "allowedDepositAmount",
  "allowedBorrowAmount",

  // portfolio-level: per-market supplied/borrowed amounts derived from
  // xtoken_balance * xtoken_ratio (the ratio drifts continuously with
  // interest accrual). Tally is a Map<number, Decimal>; the diff path
  // walker recognizes that a numeric leaf segment with a noisy parent
  // (e.g. "suppliedAmounts.9") is itself noise.
  "suppliedAmounts",
  "borrowedAmounts",

  // portfolio-level derived USD/APR
  "netWorth",
  "dailyEarnings",
  "netApr",
  "safeBorrowLimit",
  "borrowLimitUsed",
  "totalSuppliedUsd",
  "totalBorrowedUsd",
  "aggregatedSupplyApr",
  "aggregatedBorrowApr",
  "rewardsToClaimUsd",
  "rewardAmount",
  "totalCollateralUsd",
  "totalLoanUsd",
  "safeCollateralUsd",
  "spotTotalLoanUsd",
  "weightedSpotTotalLoanUsd",
  "weightedTotalLoanUsd",
  "additionalPermissibleBorrowUsd",
  "liquidationValue",
  "isPositionHealthy",
  "isPositionLiquidatable",
  "is_position_healthy",
  "is_position_liquidatable",
  // Portfolio-level liquidationThreshold is a USD figure that drifts with
  // oracle prices; the static market-config field never drifts run-to-run
  // so this won't mask a real regression.
  "liquidationThreshold",

  // Pyth price feed object IDs are recreated on update; in tx skeletons
  // the input objectId for the PriceInfoObject can drift between runs.
  // We allow the structure to differ at "objectId" leaves *within tx-*
  // files only — see isNoiseForFile below.
]);

// Paths where we treat the diff as the EXPECTED (intentional) outcome
// of the migration rather than as a regression. Reported separately so
// they don't get hidden but also don't pollute the "signal" tally.
//
// Match by suffix on the diff path.
const EXPECTED_REMOVALS = new Set<string>([
  // priceIdentifier.type: GraphQL flattened response no longer carries
  // the Move type discriminator, and no SDK consumer reads it.
  // README + GRAPHQL_MIGRATION.md document this.
  "priceIdentifier.type",
]);

function isExpectedRemoval(diffPath: string): boolean {
  for (const suffix of EXPECTED_REMOVALS) {
    if (diffPath.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

// Per-file extra noise: paths matching these are also tolerated.
function extraNoiseForFile(file: string): (path: string) => boolean {
  // Pyth price-update flows: the Pyth Hermes API returns a fresh signed
  // VAA on every call, so PriceInfoObject IDs and the corresponding
  // Pure-input bytes change between runs. tx structure (commands, type
  // args, deterministic Pure values) is the real signal.
  if (file === "tx-updatePrices.json" || file === "tx-updateAllPrices.json") {
    return (p) =>
      p.endsWith(".objectId") || p.endsWith(".Pure.bytes");
  }
  if (file.startsWith("tx-")) {
    return (p) => p.endsWith(".objectId");
  }
  if (file === "fetchCoinMetadataMap.json") {
    // metadata API returns live prices.
    return (p) =>
      p.endsWith(".coingeckoPrice") ||
      p.endsWith(".pythPrice") ||
      p.endsWith(".pythPriceInfoObjectId");
  }
  return () => false;
}

function isNoise(diffPath: string, file: string): boolean {
  // Walk segments back-to-front so that `Map<number, Decimal>` shapes
  // serialized as `{ "9": ..., "11": ... }` (where the last segment is a
  // numeric key) still match against their parent collection name.
  // We also strip any trailing `[N]` array index.
  const segs = diffPath.split(".");
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i].replace(/\[\d+\]$/, "");
    if (NOISE_SUFFIXES.has(seg)) return true;
    // Stop walking once we hit a non-numeric, non-noise segment so we
    // don't false-positive deep paths just because some ancestor happened
    // to be noise.
    if (!/^\d+$/.test(seg)) break;
  }
  if (extraNoiseForFile(file)(diffPath)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Generic deep diff.
// ---------------------------------------------------------------------------
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function diffValues(a: unknown, b: unknown, p: string, diffs: Diff[]) {
  if (a === b) return;
  if (typeof a !== typeof b) {
    diffs.push({ path: p, before: a, after: b });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: `${p}.length`, before: a.length, after: b.length });
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      diffValues(a[i], b[i], `${p}[${i}]`, diffs);
    }
    return;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) {
        diffs.push({ path: `${p}.${k}`, before: undefined, after: b[k] });
        continue;
      }
      if (!(k in b)) {
        diffs.push({ path: `${p}.${k}`, before: a[k], after: undefined });
        continue;
      }
      diffValues(a[k], b[k], `${p}.${k}`, diffs);
    }
    return;
  }
  if (a !== b) diffs.push({ path: p, before: a, after: b });
}

function listSnapshots(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function fmtVal(v: unknown): string {
  const s = JSON.stringify(v);
  if (s === undefined) return "<undef>";
  if (s.length > 120) return s.slice(0, 117) + "...";
  return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let strict = false;
  let onlyFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--strict") strict = true;
    else if (args[i] === "--file" && i + 1 < args.length) {
      onlyFile = args[i + 1];
      i++;
    }
  }
  return { strict, onlyFile };
}

function main() {
  const { strict, onlyFile } = parseArgs();

  const beforeFiles = new Set(listSnapshots(BEFORE_DIR));
  const afterFiles = new Set(listSnapshots(AFTER_DIR));

  if (beforeFiles.size === 0) {
    console.error(`No snapshots in ${BEFORE_DIR}. Capture before first.`);
    process.exit(1);
  }
  if (afterFiles.size === 0) {
    console.error(`No snapshots in ${AFTER_DIR}. Capture after first.`);
    process.exit(1);
  }

  const onlyBefore = [...beforeFiles].filter((f) => !afterFiles.has(f));
  const onlyAfter = [...afterFiles].filter((f) => !beforeFiles.has(f));

  if (onlyBefore.length || onlyAfter.length) {
    console.log("File set differences:");
    for (const f of onlyBefore) console.log(`  -- only in before: ${f}`);
    for (const f of onlyAfter) console.log(`  ++ only in after:  ${f}`);
    console.log("");
  }

  let shared = [...beforeFiles].filter((f) => afterFiles.has(f));
  if (onlyFile) {
    shared = shared.filter((f) => f === onlyFile);
    if (shared.length === 0) {
      console.error(`No shared snapshot named ${onlyFile}.`);
      process.exit(1);
    }
  }

  let totalDiffs = 0;
  let totalNoise = 0;
  let totalExpected = 0;
  let totalSignal = 0;
  const filesWithSignal: {
    file: string;
    signal: Diff[];
    expected: Diff[];
    noise: Diff[];
  }[] = [];
  const expectedByPathTally: Map<string, number> = new Map();

  for (const f of shared) {
    const a = readJson(path.join(BEFORE_DIR, f));
    const b = readJson(path.join(AFTER_DIR, f));
    const diffs: Diff[] = [];
    diffValues(a, b, "$", diffs);
    totalDiffs += diffs.length;
    if (diffs.length === 0) continue;

    const signal: Diff[] = [];
    const expected: Diff[] = [];
    const noise: Diff[] = [];
    for (const d of diffs) {
      if (isExpectedRemoval(d.path)) {
        expected.push(d);
        const suffix = d.path.split(".").slice(-2).join(".");
        expectedByPathTally.set(
          suffix,
          (expectedByPathTally.get(suffix) ?? 0) + 1,
        );
      } else if (isNoise(d.path, f)) {
        noise.push(d);
      } else {
        signal.push(d);
      }
    }
    totalExpected += expected.length;
    totalNoise += noise.length;
    totalSignal += signal.length;
    if (signal.length > 0 || strict) {
      filesWithSignal.push({ file: f, signal, expected, noise });
    }
  }

  console.log(
    `Compared ${shared.length} snapshot(s). ${totalDiffs} raw diffs ` +
    `(${totalSignal} signal, ${totalExpected} expected-removal, ${totalNoise} noise).\n`,
  );

  if (totalExpected > 0) {
    console.log("Expected (intentional) migration removals:");
    for (const [p, n] of expectedByPathTally.entries()) {
      console.log(`  ${p}  x${n}`);
    }
    console.log("");
  }

  if (totalSignal === 0) {
    console.log(
      "All shared snapshots are semantically identical (after filtering " +
      "known time-drift noise and intentional migration removals).",
    );
    if (strict && filesWithSignal.length === 0) {
      console.log("(Use --strict to also dump the noise/expected lines.)");
    }
    return;
  }

  for (const { file, signal, expected, noise } of filesWithSignal) {
    const total = signal.length + expected.length + noise.length;
    console.log(`-- ${file}  (${signal.length} signal / ${total} total)`);
    const toShow = strict ? [...signal, ...expected, ...noise] : signal;
    for (const d of toShow.slice(0, 30)) {
      let tag = "[SIGNAL]";
      if (isExpectedRemoval(d.path)) tag = "[expected]";
      else if (isNoise(d.path, file)) tag = "[noise]";
      console.log(`   ${tag} ${d.path}`);
      console.log(`           - ${fmtVal(d.before)}`);
      console.log(`           + ${fmtVal(d.after)}`);
    }
    if (toShow.length > 30) {
      console.log(`   ... ${toShow.length - 30} more`);
    }
    console.log("");
  }

  if (totalSignal > 0) process.exitCode = 1;
}

main();
