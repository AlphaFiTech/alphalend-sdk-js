/**
 * GraphQL migration integration tests.
 *
 * These hit mainnet (via the default Sui GraphQL endpoint) to verify that
 * the GraphQL-backed code path returns semantically correct data for the
 * main user-facing APIs on a known live address. They intentionally do NOT
 * assert exact numeric values (which drift over time) but instead check the
 * shape and presence of key domain fields.
 */

import { jest } from "@jest/globals";

import { AlphalendClient } from "../src";
import { Blockchain } from "../src/models/blockchain.js";
import { getUserPositionCapIds } from "../src/models/position/functions.js";

const TEST_ADDRESS =
  "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";

// Integration tests talk to mainnet - give them room.
jest.setTimeout(120_000);

describe("AlphalendClient (GraphQL) - construction", () => {
  it("constructs with just network", () => {
    const c = new AlphalendClient("mainnet");
    expect(c.network).toBe("mainnet");
  });

  it("constructs with optional graphqlUrl override", () => {
    const c = new AlphalendClient(
      "mainnet",
      "https://graphql.mainnet.sui.io/graphql",
    );
    expect(c.network).toBe("mainnet");
  });
});

describe("AlphalendClient (GraphQL) - data fetches", () => {
  const client = new AlphalendClient("mainnet");
  const blockchain = new Blockchain("mainnet");

  it("getAllMarkets returns active markets with the expected shape", async () => {
    const markets = await blockchain.getAllMarkets();
    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBeGreaterThan(0);

    const m = markets[0];
    expect(typeof m.id).toBe("string");
    expect(m.id.startsWith("0x")).toBe(true);
    expect(typeof m.marketId).toBe("string");
    expect(typeof m.coinType).toBe("string");
    expect(m.coinType.includes("::")).toBe(true);
    expect(m.config).toBeDefined();
    expect(Array.isArray(m.config.interestRateKinks)).toBe(true);
    expect(m.config.interestRateKinks.length).toBeGreaterThan(0);
    expect(Array.isArray(m.config.interestRates)).toBe(true);
    expect(m.borrowRewardDistributor).toBeDefined();
    expect(m.depositRewardDistributor).toBeDefined();
  });

  it("getPositionCapsForUser returns cap entries for the test address", async () => {
    const caps = await blockchain.getPositionCapsForUser(TEST_ADDRESS);
    expect(Array.isArray(caps)).toBe(true);
    expect(caps.length).toBeGreaterThan(0);
    const cap = caps[0];
    expect(typeof cap.id).toBe("string");
    expect(cap.id.startsWith("0x")).toBe(true);
    expect(typeof cap.positionId).toBe("string");
    expect(cap.positionId.startsWith("0x")).toBe(true);
    expect(cap.clientAddress.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it("getUserPositionCapIds returns string ids matching getPositionCapsForUser", async () => {
    const [ids, caps] = await Promise.all([
      getUserPositionCapIds(blockchain, TEST_ADDRESS),
      blockchain.getPositionCapsForUser(TEST_ADDRESS),
    ]);
    expect(new Set(ids)).toEqual(new Set(caps.map((c) => c.id)));
  });

  it("getPosition returns a populated position for the first cap", async () => {
    const caps = await blockchain.getPositionCapsForUser(TEST_ADDRESS);
    const cap = caps[0];
    const position = await blockchain.getPosition(cap.positionId);
    expect(position.id.toLowerCase()).toBe(cap.positionId.toLowerCase());
    expect(typeof position.totalCollateralUsd).toBe("string");
    expect(typeof position.totalLoanUsd).toBe("string");
    expect(Array.isArray(position.collaterals)).toBe(true);
    expect(Array.isArray(position.loans)).toBe(true);
    expect(Array.isArray(position.rewardDistributors)).toBe(true);
  });

  it("getUserPortfolio returns portfolio entries for the test address", async () => {
    const portfolio = await client.getUserPortfolio(TEST_ADDRESS);
    expect(portfolio).toBeDefined();
    expect(Array.isArray(portfolio)).toBe(true);
    expect(portfolio!.length).toBeGreaterThan(0);
    const p = portfolio![0];
    // Portfolio numeric fields are Decimal instances.
    expect(p.netWorth).toBeDefined();
    expect(typeof p.netWorth.toString()).toBe("string");
    expect(p.totalSuppliedUsd).toBeDefined();
    expect(p.totalBorrowedUsd).toBeDefined();
    expect(Array.isArray(p.rewardsToClaim)).toBe(true);
  });

  it("getEstimatedGasBudget returns a positive number for a trivial tx", async () => {
    const { Transaction } = await import("@mysten/sui/transactions");
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
    tx.mergeCoins(tx.gas, [coin]);

    const budget = await blockchain.getEstimatedGasBudget(tx, TEST_ADDRESS);
    expect(typeof budget).toBe("number");
    expect(budget).toBeGreaterThan(0);
  });
});
