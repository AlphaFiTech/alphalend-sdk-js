/**
 * Migration Diff
 *
 * Compares the JSON snapshots under scripts/snapshots/before and
 * scripts/snapshots/after and reports any semantic differences in the parsed
 * domain types. Because both snapshots are written from the same domain
 * parser, any diff is a red flag — either an upstream change or a parser
 * regression introduced during the GraphQL migration.
 *
 * Usage:
 *   npx tsx scripts/migration-diff.ts
 */

import * as fs from "fs";
import * as path from "path";

const BEFORE_DIR = path.join("scripts", "snapshots", "before");
const AFTER_DIR = path.join("scripts", "snapshots", "after");

interface Diff {
  path: string;
  before: unknown;
  after: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function diffValues(a: unknown, b: unknown, pathPrefix: string, diffs: Diff[]) {
  if (a === b) return;
  if (typeof a !== typeof b) {
    diffs.push({ path: pathPrefix, before: a, after: b });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({
        path: `${pathPrefix}.length`,
        before: a.length,
        after: b.length,
      });
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      diffValues(a[i], b[i], `${pathPrefix}[${i}]`, diffs);
    }
    return;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) {
        diffs.push({
          path: `${pathPrefix}.${k}`,
          before: undefined,
          after: (b as Record<string, unknown>)[k],
        });
        continue;
      }
      if (!(k in b)) {
        diffs.push({
          path: `${pathPrefix}.${k}`,
          before: (a as Record<string, unknown>)[k],
          after: undefined,
        });
        continue;
      }
      diffValues(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${pathPrefix}.${k}`,
        diffs,
      );
    }
    return;
  }
  if (a !== b) diffs.push({ path: pathPrefix, before: a, after: b });
}

function listSnapshots(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function readJson(filePath: string): unknown {
  const text = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(text);
}

function main() {
  const beforeFiles = new Set(listSnapshots(BEFORE_DIR));
  const afterFiles = new Set(listSnapshots(AFTER_DIR));

  if (beforeFiles.size === 0) {
    console.error(`No snapshots in ${BEFORE_DIR}. Run with --out before first.`);
    process.exit(1);
  }
  if (afterFiles.size === 0) {
    console.error(`No snapshots in ${AFTER_DIR}. Run with --out after first.`);
    process.exit(1);
  }

  const onlyBefore = [...beforeFiles].filter((f) => !afterFiles.has(f));
  const onlyAfter = [...afterFiles].filter((f) => !beforeFiles.has(f));

  if (onlyBefore.length > 0) {
    console.log("Files only in before:");
    for (const f of onlyBefore) console.log(`  - ${f}`);
  }
  if (onlyAfter.length > 0) {
    console.log("Files only in after:");
    for (const f of onlyAfter) console.log(`  + ${f}`);
  }

  const shared = [...beforeFiles].filter((f) => afterFiles.has(f));
  const allDiffs: { file: string; diffs: Diff[] }[] = [];

  for (const f of shared) {
    const a = readJson(path.join(BEFORE_DIR, f));
    const b = readJson(path.join(AFTER_DIR, f));
    const diffs: Diff[] = [];
    diffValues(a, b, "$", diffs);
    if (diffs.length > 0) allDiffs.push({ file: f, diffs });
  }

  if (allDiffs.length === 0) {
    console.log(
      `\nAll ${shared.length} shared snapshots are semantically identical.`,
    );
    return;
  }

  console.log(`\nFound diffs in ${allDiffs.length} snapshot(s):\n`);
  for (const { file, diffs } of allDiffs) {
    console.log(`-- ${file} (${diffs.length} diffs)`);
    for (const d of diffs.slice(0, 20)) {
      const before = JSON.stringify(d.before);
      const after = JSON.stringify(d.after);
      console.log(`   ${d.path}: ${before} -> ${after}`);
    }
    if (diffs.length > 20) {
      console.log(`   ... ${diffs.length - 20} more`);
    }
  }
  process.exitCode = 1;
}

main();
