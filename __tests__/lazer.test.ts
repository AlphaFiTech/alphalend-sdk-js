import { jest } from "@jest/globals";
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

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function installFetch() {
  const m = jest.fn<(input: string) => Promise<unknown>>();
  global.fetch = m as unknown as typeof fetch;
  return m;
}
const okBody = (hex: string) => ({
  ok: true,
  json: async () => ({ hex }),
});
const errStatus = (status = 503) => ({
  ok: false,
  status,
  statusText: "Service Unavailable",
});

function buildLazerClient(proxyUrl: string) {
  const client = new AlphalendClient("mainnet", undefined, {
    coinMetadataMap: new Map(),
  });
  client.constants.LAZER_PROXY_URL = proxyUrl;
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
    }
  });
});

describe("fetchLazerUpdateBytes", () => {
  it("fetches and decodes the hex payload", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("000102"));
    const bytes = await fetchLazerUpdateBytes("https://api.example/");
    expect([...bytes]).toEqual([0, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/lazer/update",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("decodes a 0x-prefixed payload", async () => {
    installFetch().mockResolvedValue(okBody("0x00ff"));
    expect([...(await fetchLazerUpdateBytes("https://api.example"))]).toEqual([
      0, 255,
    ]);
  });

  it("normalizes trailing slashes in the proxy url", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("00"));
    await fetchLazerUpdateBytes("https://api.example///");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/lazer/update",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("fails closed when the proxy omits hex", async () => {
    installFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(
      fetchLazerUpdateBytes("https://api.example"),
    ).rejects.toThrow(/hex/i);
  });

  it("retries a transient failure, then succeeds", async () => {
    const fetchMock = installFetch();
    fetchMock
      .mockResolvedValueOnce(errStatus(503))
      .mockResolvedValueOnce(okBody("aabb"));
    expect([...(await fetchLazerUpdateBytes("https://api.example"))]).toEqual([
      0xaa, 0xbb,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed after exhausting retries (never falls back to Pyth)", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(errStatus(503));
    await expect(fetchLazerUpdateBytes("https://api.example")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails closed on a network-level error", async () => {
    const fetchMock = installFetch();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(fetchLazerUpdateBytes("https://api.example")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("appendLazerUpdate", () => {
  it("appends a PTB verify then oracle::ingest_lazer_update (verify-in-PTB)", () => {
    const tx = new Transaction();
    appendLazerUpdate(
      tx,
      "0x100",
      "0x101",
      "0x102",
      "1",
      "0x103",
      new Uint8Array([1, 2, 3]),
    );
    expect(tx.getData().commands).toHaveLength(2);
    const json = JSON.stringify(tx.getData());
    expect(json).toContain("parse_and_verify_le_ecdsa_update_v2");
    expect(json).toContain("ingest_lazer_update");
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

describe("price-refresh routing", () => {
  it("updatePrices routes to the Lazer path", async () => {
    const client = new AlphalendClient("mainnet");
    const spy = jest
      .spyOn(client, "updatePricesLazer")
      .mockImplementation(async () => {});
    const tx = new Transaction();
    await client.updatePrices(tx, ["0x2::sui::SUI"]);
    expect(spy).toHaveBeenCalledWith(tx, ["0x2::sui::SUI"]);
  });

  it("updateAllPrices routes to the Lazer path", async () => {
    const client = new AlphalendClient("mainnet");
    const spy = jest
      .spyOn(client, "updatePricesLazer")
      .mockImplementation(async () => {});
    const tx = new Transaction();
    await client.updateAllPrices(tx, ["0x2::sui::SUI"]);
    expect(spy).toHaveBeenCalledWith(tx, ["0x2::sui::SUI"]);
  });

  it("keeps the Pyth path on testnet while its Lazer verifier is v1", async () => {
    const client = new AlphalendClient("testnet", undefined, {
      coinMetadataMap: new Map(),
    });
    const lazerSpy = jest
      .spyOn(client, "updatePricesLazer")
      .mockImplementation(async () => {});
    jest
      .spyOn(client.blockchain, "getInitialSharedVersion")
      .mockResolvedValue("123");

    await client.updatePrices(new Transaction(), []);

    expect(lazerSpy).not.toHaveBeenCalled();
  });
});

describe("Lazer price refresh", () => {
  it("updatePrices fetches from the proxy and builds verify, ingest, and lending bridge calls", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("0x010203"));
    const client = buildLazerClient("https://api.example/");
    const tx = new Transaction();

    await client.updatePrices(tx, [
      client.constants.SUI_COIN_TYPE,
      client.constants.SUI_COIN_TYPE,
      client.constants.USDC_COIN_TYPE,
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/lazer/update",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(client.blockchain.getInitialSharedVersion).toHaveBeenCalledWith(
      client.constants.ALPHAFI_ORACLE_OBJECT_ID,
    );
    expectCompleteLazerRefresh(tx, client.constants, 2);
  });

  it("updateAllPrices uses the same complete Lazer refresh path", async () => {
    const fetchMock = installFetch();
    fetchMock.mockResolvedValue(okBody("0x0a0b0c"));
    const client = buildLazerClient("https://api.example");
    const tx = new Transaction();

    await client.updateAllPrices(tx, [client.constants.SUI_COIN_TYPE]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/lazer/update",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expectCompleteLazerRefresh(tx, client.constants, 1);
  });

  it("does not initialize GraphQL coin metadata for the Lazer path", async () => {
    const fetchMock = installFetch();
    fetchMock.mockImplementation(async (input: string) => {
      if (input.includes("/public/graphql")) {
        throw new Error("unexpected GraphQL initialization");
      }
      return okBody("0x010203");
    });
    const client = new AlphalendClient("mainnet");
    client.constants.LAZER_PROXY_URL = "https://api.example";
    jest
      .spyOn(client.blockchain, "getInitialSharedVersion")
      .mockResolvedValue("123");
    const tx = new Transaction();

    await client.updatePrices(tx, [client.constants.SUI_COIN_TYPE]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/lazer/update",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://api.alphalend.xyz/public/graphql",
      expect.anything(),
    );
    expectCompleteLazerRefresh(tx, client.constants, 1);
  });
});

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
      "7",
    );
    expect(tx.getData().commands).toHaveLength(4);
    const json = JSON.stringify(tx.getData());
    expect(json).toContain("update_price_from_pyth");
    expect(json).toContain("get_price_info");
    expect(json).toContain("update_price");
    expect(json).not.toContain("parse_and_verify_le_ecdsa_update_v2");
    expect(json).not.toContain("ingest_lazer_update");
  });
});

describe("Lazer fail-closed at the client boundary", () => {
  it("propagates a proxy failure and never falls back to the Pyth path", async () => {
    const client = new AlphalendClient("mainnet", undefined, {
      coinMetadataMap: new Map(),
    });
    installFetch().mockRejectedValue(new Error("ECONNREFUSED"));

    const tx = new Transaction();
    await expect(
      client.updatePrices(tx, [client.constants.SUI_COIN_TYPE]),
    ).rejects.toThrow();

    const json = JSON.stringify(tx.getData());
    expect(json).not.toContain("update_price_from_pyth");
    expect(json).not.toContain("ingest_lazer_update");
  }, 15000);
});
