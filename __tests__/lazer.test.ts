/**
 * Pyth Lazer SDK tests. Unit cases mock `global.fetch`; e2e cases use a local proxy server so the
 * client fetches over HTTP and builds the real PTB command sequence deterministically.
 */
import { jest } from "@jest/globals";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Transaction } from "@mysten/sui/transactions";
import {
  appendLazerUpdate,
  fetchLazerUpdateBytes,
} from "../src/utils/lazer.js";
import {
  appendOracleToLendingBridge,
  updatePriceTransaction,
} from "../src/utils/oracle.js";
import { getConstants, type Network } from "../src/constants/index.js";
import type { Constants } from "../src/constants/types.js";
import { AlphalendClient } from "../src/index.js";

// Client-side freshness ceiling passed in tests (mirrors the per-network LAZER_MAX_PROXY_AGE_MS constant).
const MAX = 3000;

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

// Install a typed `global.fetch` mock and return it for per-test configuration.
function installFetch() {
  const m = jest.fn<(input: string) => Promise<unknown>>();
  global.fetch = m as unknown as typeof fetch;
  return m;
}
const okBody = (hex: string, ageMs = 10) => ({
  ok: true,
  json: async () => ({ hex, ageMs }),
});
const errStatus = (status = 503) => ({
  ok: false,
  status,
  statusText: "Service Unavailable",
});

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function withLazerProxy<T>(
  body: { hex: string; ageMs: number },
  run: (proxyUrl: string, requests: string[]) => Promise<T>,
): Promise<T> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    if (req.url === "/lazer/update") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await closeServer(server);
  }
}

function buildLazerClient(proxyUrl: string) {
  const client = new AlphalendClient("testnet", undefined, {
    coinMetadataMap: new Map(),
  });
  client.useLazer = true;
  client.constants.LAZER_PROXY_URL = proxyUrl;
  client.constants.LAZER_MAX_PROXY_AGE_MS = MAX;
  jest
    .spyOn(client.blockchain, "getInitialSharedVersion")
    .mockResolvedValue("123");
  return client;
}

function expectCompleteLazerRefresh(
  tx: Transaction,
  constants: Constants,
  expectedBridgeCount: number,
) {
  const commands = tx.getData().commands;
  const json = JSON.stringify(tx.getData());

  expect(commands).toHaveLength(2 + expectedBridgeCount * 3);
  expect(json).toContain(`"package":"${constants.LAZER_PACKAGE_ID}"`);
  expect(json).toContain(
    `"package":"${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}"`,
  );
  expect(json).toContain(
    '"module":"pyth_lazer","function":"parse_and_verify_le_ecdsa_update_v2"',
  );
  expect(json).toContain('"module":"oracle","function":"ingest_lazer_update"');
  expect(json.match(/"module":"type_name","function":"get"/g)).toHaveLength(
    expectedBridgeCount,
  );
  expect(
    json.match(/"module":"oracle","function":"get_price_info"/g),
  ).toHaveLength(expectedBridgeCount);
  expect(
    json.match(/"module":"alpha_lending","function":"update_price"/g),
  ).toHaveLength(expectedBridgeCount);
  expect(json).not.toContain("update_price_from_pyth");
}

describe("Lazer constants", () => {
  it("exposes complete Lazer config for every SDK network", () => {
    for (const network of ["mainnet", "testnet", "devnet"] as Network[]) {
      const constants = getConstants(network);
      expect(constants.LAZER_PACKAGE_ID).toMatch(/^0x[0-9a-f]+$/i);
      expect(constants.LAZER_STATE_ID).toMatch(/^0x[0-9a-f]+$/i);
      expect(constants.LAZER_PROXY_URL).toMatch(/^https:\/\//);
      expect(constants.LAZER_MAX_PROXY_AGE_MS).toBeGreaterThan(0);
      expect(constants.LAZER_ENABLED).toBe(false);
    }
  });
});

describe("fetchLazerUpdateBytes", () => {
  it("fetches, checks freshness, and decodes the hex payload", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("000102", 42));
    const bytes = await fetchLazerUpdateBytes("https://api.example/", MAX);
    expect([...bytes]).toEqual([0, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/lazer/update");
  });

  it("decodes a 0x-prefixed payload", async () => {
    installFetch().mockResolvedValue(okBody("0x00ff", 10));
    expect([
      ...(await fetchLazerUpdateBytes("https://api.example", MAX)),
    ]).toEqual([0, 255]);
  });

  it("normalizes trailing slashes in the proxy url", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("00"));
    await fetchLazerUpdateBytes("https://api.example///", MAX);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/lazer/update");
  });

  it("rejects a stale proxy payload", async () => {
    installFetch().mockResolvedValue(okBody("000102", 3001));
    await expect(
      fetchLazerUpdateBytes("https://api.example", MAX),
    ).rejects.toThrow(/stale/i);
  });

  it("fails closed when the proxy omits ageMs", async () => {
    installFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ hex: "00" }),
    });
    await expect(
      fetchLazerUpdateBytes("https://api.example", MAX),
    ).rejects.toThrow(/ageMs/i);
  });

  it("retries a transient failure, then succeeds", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockResolvedValueOnce(errStatus(503))
      .mockResolvedValueOnce(okBody("aabb"));
    expect([
      ...(await fetchLazerUpdateBytes("https://api.example", MAX)),
    ]).toEqual([0xaa, 0xbb]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed after exhausting retries (never falls back to Pyth)", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(errStatus(503));
    await expect(
      fetchLazerUpdateBytes("https://api.example", MAX),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails closed on a network-level error", async () => {
    const fetchMock = installFetch();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      fetchLazerUpdateBytes("https://api.example", MAX),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("appendLazerUpdate", () => {
  it("appends a PTB verify then oracle::ingest_lazer_update (verify-in-PTB)", () => {
    const tx = new Transaction();
    appendLazerUpdate(
      tx,
      "0x100", // lazer package id (exposes the verifier)
      "0x101", // oracle package id
      "0x102", // oracle object id
      "1", // oracle initial shared version
      "0x103", // lazer state id
      new Uint8Array([1, 2, 3]),
    );
    expect(tx.getData().commands).toHaveLength(2);
    const json = JSON.stringify(tx.getData());
    expect(json).toContain("parse_and_verify_le_ecdsa_update_v2");
    expect(json).toContain("ingest_lazer_update");
    // The verifier call must NOT live inside our oracle anymore.
    expect(json).not.toContain("update_price_from_lazer");
  });
});

describe("appendOracleToLendingBridge", () => {
  it("appends type_name::get + oracle::get_price_info + alpha_lending::update_price", () => {
    const tx = new Transaction();
    appendOracleToLendingBridge(tx, "0x2::sui::SUI", {
      ALPHAFI_LATEST_ORACLE_PACKAGE_ID: "0x10",
      ALPHAFI_ORACLE_OBJECT_ID: "0x11",
      ALPHALEND_LATEST_PACKAGE_ID: "0x12",
      LENDING_PROTOCOL_ID: "0x13",
    } as unknown as Constants);
    expect(tx.getData().commands).toHaveLength(3);
    const json = JSON.stringify(tx.getData());
    expect(json).toContain("get_price_info");
    expect(json).toContain("update_price");
  });
});

describe("price-refresh routing (useLazer)", () => {
  it("updatePrices routes to the Lazer path when useLazer is set", async () => {
    const client = new AlphalendClient("mainnet");
    client.useLazer = true;
    const spy = jest
      .spyOn(client, "updatePricesLazer")
      .mockImplementation(async () => {});
    const tx = new Transaction();
    await client.updatePrices(tx, ["0x2::sui::SUI"]);
    expect(spy).toHaveBeenCalledWith(tx, ["0x2::sui::SUI"]);
  });

  it("updateAllPrices routes to the Lazer path when useLazer is set", async () => {
    const client = new AlphalendClient("mainnet");
    client.useLazer = true;
    const spy = jest
      .spyOn(client, "updatePricesLazer")
      .mockImplementation(async () => {});
    const tx = new Transaction();
    await client.updateAllPrices(tx, ["0x2::sui::SUI"]);
    expect(spy).toHaveBeenCalledWith(tx, ["0x2::sui::SUI"]);
  });
});

describe("Lazer price refresh e2e", () => {
  it("updatePrices fetches from the proxy and builds verify, ingest, and lending bridge calls", async () => {
    await withLazerProxy(
      { hex: "0x010203", ageMs: 1 },
      async (proxyUrl, requests) => {
        const client = buildLazerClient(proxyUrl);
        const tx = new Transaction();

        await client.updatePrices(tx, [
          client.constants.SUI_COIN_TYPE,
          client.constants.SUI_COIN_TYPE,
          client.constants.USDC_COIN_TYPE,
        ]);

        expect(requests).toEqual(["/lazer/update"]);
        expect(client.blockchain.getInitialSharedVersion).toHaveBeenCalledWith(
          client.constants.ALPHAFI_ORACLE_OBJECT_ID,
        );
        expectCompleteLazerRefresh(tx, client.constants, 2);
      },
    );
  });

  it("updateAllPrices uses the same complete Lazer refresh path", async () => {
    await withLazerProxy(
      { hex: "0x0a0b0c", ageMs: 1 },
      async (proxyUrl, requests) => {
        const client = buildLazerClient(proxyUrl);
        const tx = new Transaction();

        await client.updateAllPrices(tx, [client.constants.SUI_COIN_TYPE]);

        expect(requests).toEqual(["/lazer/update"]);
        expectCompleteLazerRefresh(tx, client.constants, 1);
      },
    );
  });
});

// The Pyth refresh path must keep building correctly while Lazer is added alongside it (the migration
// adds Lazer, it does not delete Pyth) — and must never smuggle in a Lazer verify/ingest call.
describe("Pyth path intact (updatePriceTransaction)", () => {
  it("builds update_price_from_pyth + the lending bridge, with no Lazer calls", () => {
    const tx = new Transaction();
    updatePriceTransaction(
      tx,
      { priceInfoObject: "0x999", coinType: "0x2::sui::SUI" },
      {
        ALPHAFI_LATEST_ORACLE_PACKAGE_ID: "0x10",
        ALPHAFI_ORACLE_OBJECT_ID: "0x11",
        ALPHALEND_LATEST_PACKAGE_ID: "0x12",
        LENDING_PROTOCOL_ID: "0x13",
        SUI_CLOCK_OBJECT_ID: "0x6",
      } as unknown as Constants,
      "7", // oracle initial shared version
    );
    // update_price_from_pyth + type_name::get + get_price_info + alpha_lending::update_price
    expect(tx.getData().commands).toHaveLength(4);
    const json = JSON.stringify(tx.getData());
    expect(json).toContain("update_price_from_pyth");
    expect(json).toContain("get_price_info");
    expect(json).toContain("update_price");
    expect(json).not.toContain("parse_and_verify_le_ecdsa_update_v2");
    expect(json).not.toContain("ingest_lazer_update");
  });
});

describe("default price source (no premature cutover)", () => {
  it("a fresh client defaults to Pyth (useLazer=false) on every network", () => {
    for (const network of ["mainnet", "testnet", "devnet"] as Network[]) {
      expect(new AlphalendClient(network).useLazer).toBe(false);
    }
  });
});

// Fail-closed at the CLIENT boundary (not just the fetch util): a proxy failure must reject the whole
// refresh and never fall back to Pyth — a silent fallback would defeat the migration's price source.
describe("Lazer fail-closed at the client boundary", () => {
  it("propagates a proxy failure and never falls back to the Pyth path", async () => {
    const client = new AlphalendClient("testnet", undefined, {
      coinMetadataMap: new Map(),
    });
    client.useLazer = true;
    installFetch().mockRejectedValue(new Error("ECONNREFUSED"));

    const tx = new Transaction();
    await expect(
      client.updatePrices(tx, [client.constants.SUI_COIN_TYPE]),
    ).rejects.toThrow();

    // Nothing partial was built, and crucially no Pyth refresh was substituted in.
    const json = JSON.stringify(tx.getData());
    expect(json).not.toContain("update_price_from_pyth");
    expect(json).not.toContain("ingest_lazer_update");
  }, 15000);
});
