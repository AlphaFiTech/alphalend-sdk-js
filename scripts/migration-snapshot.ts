/**
 * Migration Snapshot Script
 *
 * Captures parsed domain types so we can verify the GraphQL migration
 * preserves semantic equivalence. Parsed types (MarketType, PositionType,
 * PositionCapType, UserPortfolio) are the stable contract across the
 * migration; the underlying raw JSON-RPC / GraphQL shapes are not.
 *
 * Usage (Phase 0 baseline, with 1.x code):
 *   npx tsx scripts/migration-snapshot.ts --out before
 *
 * Usage (Phase 5 post-migration, with 2.x code):
 *   npx tsx scripts/migration-snapshot.ts --out after
 */

import * as fs from "fs";
import * as path from "path";

import { AlphalendClient } from "../src/core/client.js";
import { Blockchain } from "../src/models/blockchain.js";
import {
  getUserPositionCapIds,
  getUserPositionIds,
} from "../src/models/position/functions.js";
import { getAlphaReceipt } from "../src/utils/helper.js";
import { getConstants } from "../src/constants/index.js";

const TEST_ADDRESS =
  "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";
const NETWORK: "mainnet" | "testnet" | "devnet" = "mainnet";

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

async function main() {
  const { out } = parseArgs();
  const outDir = path.join("scripts", "snapshots", out);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Snapshot directory: ${outDir}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Test address: ${TEST_ADDRESS}\n`);

  const alc = new AlphalendClient(NETWORK);
  const blockchain = new Blockchain(NETWORK);
  const constants = getConstants(NETWORK);

  console.log("1/10 getAllMarkets");
  const allMarkets = await blockchain.getAllMarkets();
  writeSnapshot(outDir, "getAllMarkets", allMarkets);

  console.log("2/10 per-market getMarket");
  for (const m of allMarkets) {
    try {
      const market = await blockchain.getMarket(Number(m.marketId));
      writeSnapshot(outDir, `market-${m.marketId}`, market);
    } catch (err) {
      console.warn(`  WARN: failed getMarket(${m.marketId}):`, err);
    }
  }

  console.log("3/10 getPositionCapsForUser");
  const positionCaps = await blockchain.getPositionCapsForUser(TEST_ADDRESS);
  writeSnapshot(outDir, "positionCaps", positionCaps);

  console.log("4/10 getUserPositionCapIds");
  const positionCapIds = await getUserPositionCapIds(blockchain, TEST_ADDRESS);
  writeSnapshot(outDir, "positionCapIds", positionCapIds);

  console.log("5/10 getUserPositionIds");
  const positionIds = await getUserPositionIds(blockchain, TEST_ADDRESS);
  writeSnapshot(outDir, "positionIds", positionIds);

  console.log("6/10 getPosition + getPositionFromPositionCapId (per cap)");
  for (let i = 0; i < positionCaps.length; i++) {
    const cap = positionCaps[i];
    try {
      const pos = await blockchain.getPosition(cap.positionId);
      writeSnapshot(outDir, `position-${i}`, pos);
    } catch (err) {
      console.warn(`  WARN: failed getPosition(${cap.positionId}):`, err);
    }
    try {
      const posFromCap = await blockchain.getPositionFromPositionCapId(cap.id);
      writeSnapshot(outDir, `positionFromCap-${i}`, posFromCap);
    } catch (err) {
      console.warn(
        `  WARN: failed getPositionFromPositionCapId(${cap.id}):`,
        err,
      );
    }
  }

  console.log("7/10 getUserPortfolio");
  try {
    const portfolio = await alc.getUserPortfolio(TEST_ADDRESS);
    writeSnapshot(outDir, "userPortfolio", portfolio);
  } catch (err) {
    console.warn("  WARN: getUserPortfolio failed:", err);
  }

  console.log("8/10 getInitialSharedVersion(LENDING_PROTOCOL_ID)");
  try {
    const isv = await blockchain.getInitialSharedVersion(
      constants.LENDING_PROTOCOL_ID,
    );
    writeSnapshot(outDir, "initialSharedVersion", { lendingProtocol: isv });
  } catch (err) {
    console.warn("  WARN: getInitialSharedVersion failed:", err);
  }

  console.log("9/10 getAlphaReceipt");
  try {
    const receipts = await getAlphaReceipt(blockchain, TEST_ADDRESS);
    const normalized = receipts.map((r) => ({
      id: r.objectId,
      poolId: r.fields?.pool_id ?? null,
    }));
    writeSnapshot(outDir, "alphaReceipt", normalized);
  } catch (err) {
    console.warn("  WARN: getAlphaReceipt failed:", err);
  }

  console.log("10/10 deepbookPackageId");
  try {
    const capId = constants.DEEPBOOK_UPGRADE_CAP_ID;
    if (capId) {
      const fields = await blockchain.getObject<{ package?: string }>(capId);
      writeSnapshot(outDir, "deepbookPackageId", {
        deepbookPackageId: fields?.package ?? null,
      });
    } else {
      writeSnapshot(outDir, "deepbookPackageId", { deepbookPackageId: null });
    }
  } catch (err) {
    console.warn("  WARN: deepbookPackageId lookup failed:", err);
  }

  console.log("\nSnapshot complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
