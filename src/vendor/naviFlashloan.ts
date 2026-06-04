/**
 * Vendored Navi flash-loan helpers.
 *
 * WHY THIS EXISTS
 * ---------------
 * `@naviprotocol/lending@1.4.6` (the latest release as of this writing) is not
 * compatible with `@mysten/sui` v2. Two problems:
 *   1. Its dist imports `SuiClient` / `getFullnodeUrl` from `@mysten/sui/client`,
 *      which v2 removed (they moved to `@mysten/sui/jsonRpc` as
 *      `SuiJsonRpcClient` / `getJsonRpcFullnodeUrl`).
 *   2. It eagerly runs `new SuiClient({ url: getFullnodeUrl("mainnet") })` at
 *      module top-level, so merely importing it throws under v2.
 * Because `@alphafi/alphalend-sdk`'s entry point re-exports the flash-repay path,
 * importing the SDK *at all* would crash for any consumer on `@mysten/sui` v2.
 *
 * We previously worked around this with a `patch-package` patch, but that only
 * applies in this repo's own dev/CI install — it is not shipped to npm consumers
 * (patches aren't published, and patch-package can't reliably patch a hoisted
 * transitive dep). So instead we vendor the three flash-loan helpers we use,
 * faithfully ported from Navi's public source:
 *   https://github.com/naviprotocol/naviprotocol-monorepo/tree/main/packages/lending/src
 * (flashloan.ts, config.ts, pool.ts, utils.ts, market.ts — vendored from v1.4.6).
 *
 * This module imports ONLY v2-native `@mysten/sui` symbols and does no eager
 * client construction, so it is safe for external consumers with no patch.
 *
 * SCOPE: only the flash-loan path is vendored. `getPools` is intentionally
 * simplified to return the raw API payload — the flash-loan helpers only read
 * `suiCoinType` / `contract.pool` / `id` / `isDeprecated`, so Navi's BigNumber
 * display-field decoration and e-mode handling are omitted on purpose.
 *
 * If/when Navi ships a `@mysten/sui` v2-clean release, delete this file and go
 * back to importing from `@naviprotocol/lending`.
 */

import type { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag } from "@mysten/sui/utils";

// Telemetry value Navi's API expects in its `sdk=` query param. Kept at the
// version we vendored these helpers from so the API behaves identically.
const NAVI_SDK_VERSION = "1.4.6";

/** Configuration is cached for 5 minutes (matches Navi's DEFAULT_CACHE_TIME). */
export const DEFAULT_CACHE_TIME = 1000 * 60 * 5;

const DEFAULT_MARKET_IDENTITY = "main";

const MARKETS = {
  main: { id: 0, key: "main", name: "Main Market" },
  ember: { id: 1, key: "ember", name: "Ember Market" },
  rwa: { id: 2, key: "rwa", name: "Matrixdock Market" },
  "sui-eco": { id: 3, key: "sui-eco", name: "Sui Eco Market" },
} as const;

type MarketConfig = { id: number; key: string; name: string };
type MarketIdentity = number | string | MarketConfig;

function getMarketConfig(marketIdentity: MarketIdentity): MarketConfig {
  const configs = Object.values(MARKETS);
  const config = configs.find((marketConfig) => {
    if (typeof marketIdentity === "number") {
      return marketConfig.id === marketIdentity;
    }
    if (typeof marketIdentity === "string") {
      return marketConfig.key === marketIdentity;
    }
    return marketConfig.id === marketIdentity.id;
  });
  if (!config) {
    throw new Error(`Market not found`);
  }
  return config;
}

// Navi's public read API requires no auth/headers. Navi additionally sends a
// `User-Agent` telemetry string in Node; we omit it (it's a forbidden header in
// browsers and not required by the API).
const requestHeaders: HeadersInit = {};

export interface EnvOption {
  env: "prod" | "dev";
}
export interface CacheOption {
  cacheTime: number;
  disableCache: boolean;
}
export interface MarketOption {
  market: string;
}

/** Flash loan asset configuration returned by Navi's flashloan API. */
export interface FlashloanAsset {
  max: string;
  min: string;
  assetId: number;
  poolId: string;
  supplierFee: number;
  flashloanFee: number;
  coinType: string;
}

/** Subset of Navi's pool shape that the flash-loan path reads. */
interface Pool {
  suiCoinType: string;
  id: number;
  isDeprecated: boolean;
  contract: { pool: string };
}

/** Subset of Navi's lending config that the flash-loan path reads. */
interface LendingConfig {
  package: string;
  storage: string;
  flashloanConfig: string;
  version: number;
}

/** A coin type, a pool id, or an already-resolved pool object. */
type AssetIdentifier = string | number | Pool;

// A transaction object argument (Result/NestedResult/Input/GasCoin). Navi types
// this loosely; the only thing that matters is "object => pass through, else
// wrap via the formatter".
type TxValue = unknown;

// ---------------------------------------------------------------------------
// caching helpers (ported from Navi utils.ts)
// ---------------------------------------------------------------------------

function argsKey(args: unknown[]): string {
  const serialized: unknown[] = [];
  args.forEach((option, index) => {
    const isLast = index === args.length - 1;
    if (typeof option === "object" && option !== null && isLast) {
      const rest = { ...(option as Record<string, unknown>) };
      delete rest.client;
      delete rest.disableCache;
      delete rest.cacheTime;
      serialized.push(rest);
    } else {
      serialized.push(option);
    }
  });
  return JSON.stringify(serialized);
}

/** Dedupe concurrent identical calls — returns the in-flight promise. */
function withSingleton<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
): T {
  const promiseMap: Record<string, Promise<unknown> | null> = {};
  return ((...args: never[]) => {
    const key = argsKey(args);
    const existing = promiseMap[key];
    if (existing) {
      return existing;
    }
    const created = fn(...args).finally(() => {
      delete promiseMap[key];
    });
    promiseMap[key] = created;
    return created;
  }) as T;
}

/** Time-based memoization keyed on args, honoring `cacheTime`/`disableCache`. */
function withCache<T extends (...args: never[]) => Promise<unknown>>(fn: T): T {
  const cache: Record<string, { data: unknown; cacheAt: number }> = {};
  return ((...args: never[]) => {
    const options = args[args.length - 1] as Partial<CacheOption> | undefined;
    const key = argsKey(args);
    const cacheData = cache[key];
    if (!options?.disableCache && typeof cacheData?.data !== "undefined") {
      if (
        typeof options?.cacheTime === "undefined" ||
        options.cacheTime > Date.now() - cacheData.cacheAt
      ) {
        return Promise.resolve(cacheData.data);
      }
    }
    return fn(...args).then((result) => {
      cache[key] = { data: result, cacheAt: Date.now() };
      return result;
    });
  }) as T;
}

function normalizeCoinType(coinType: string): string {
  return normalizeStructTag(coinType);
}

function parsePoolUID(
  uid: string,
): { marketKey: string; poolId: number } | null {
  const [marketKey, poolId] = uid.split("-");
  if (!marketKey || !poolId) {
    return null;
  }
  return { marketKey, poolId: parseInt(poolId) };
}

/** `object => pass through, else wrap with the given tx formatter`. */
function parseTxValue(value: TxValue, format: (v: never) => unknown): unknown {
  if (typeof value === "object") {
    return value;
  }
  return format(value as never);
}

// ---------------------------------------------------------------------------
// API readers (ported from config.ts / pool.ts / flashloan.ts)
// ---------------------------------------------------------------------------

const getConfig = withCache(
  withSingleton(
    async (
      options?: Partial<EnvOption & CacheOption & MarketOption>,
    ): Promise<LendingConfig> => {
      const market = getMarketConfig(
        options?.market || DEFAULT_MARKET_IDENTITY,
      );
      const url = `https://open-api.naviprotocol.io/api/navi/config?env=${
        options?.env || "prod"
      }&sdk=${NAVI_SDK_VERSION}&market=${market.key}`;
      const res = await fetch(url, { headers: requestHeaders }).then((r) =>
        r.json(),
      );
      return res.data;
    },
  ),
);

const getPools = withCache(
  withSingleton(
    async (
      options?: Partial<EnvOption & CacheOption & { markets: string[] }>,
    ): Promise<Pool[]> => {
      const markets = (options?.markets || [MARKETS.main.key]).map((identity) =>
        getMarketConfig(identity),
      );
      const url = `https://open-api.naviprotocol.io/api/navi/pools?env=${
        options?.env || "prod"
      }&sdk=${NAVI_SDK_VERSION}&market=${markets
        .map((market) => market.key)
        .join(",")}`;
      const res: { data: Pool[] } = await fetch(url, {
        headers: requestHeaders,
      }).then((r) => r.json());
      // NOTE: Navi decorates each pool with BigNumber display fields here; the
      // flash-loan path doesn't read them, so we return the raw payload.
      return res.data;
    },
  ),
);

async function getPool(
  identifier: AssetIdentifier,
  options?: Partial<EnvOption & MarketOption>,
): Promise<Pool> {
  let market = options?.market;
  if (typeof identifier === "string") {
    const parsedUID = parsePoolUID(identifier);
    if (parsedUID) {
      market = parsedUID.marketKey;
      identifier = parsedUID.poolId;
    }
  }
  const pools = await getPools({
    ...options,
    markets: [market || DEFAULT_MARKET_IDENTITY],
    cacheTime: DEFAULT_CACHE_TIME,
  });

  if (typeof identifier === "object") {
    return identifier;
  }

  const pool = pools.find((p) => {
    if (typeof identifier === "string") {
      return normalizeCoinType(p.suiCoinType) === normalizeCoinType(identifier);
    }
    if (typeof identifier === "number") {
      return p.id === identifier;
    }
    return false;
  });

  if (!pool) {
    throw new Error(`Pool not found`);
  }
  if (pool.isDeprecated) {
    console.log(
      `The lending pool for coinType ${pool.suiCoinType} is going to be deprecated.`,
    );
  }
  return pool;
}

// ---------------------------------------------------------------------------
// public flash-loan helpers (ported from flashloan.ts)
// ---------------------------------------------------------------------------

/** Get all available flash loan assets from the Navi API (cached). */
export const getAllFlashLoanAssets = withCache(
  withSingleton(
    async (
      options?: Partial<EnvOption & CacheOption & MarketOption>,
    ): Promise<FlashloanAsset[]> => {
      const url = `https://open-api.naviprotocol.io/api/navi/flashloan?env=${
        options?.env || "prod"
      }&sdk=${NAVI_SDK_VERSION}&market=${
        options?.market || DEFAULT_MARKET_IDENTITY
      }`;
      const res = await fetch(url, { headers: requestHeaders }).then((r) =>
        r.json(),
      );
      return Object.keys(res.data).map((coinType) => ({
        ...res.data[coinType],
        coinType,
      }));
    },
  ),
);

/**
 * Add a Navi flash-loan borrow to the PTB.
 * @returns `[balance, receipt]` — receipt is needed for {@link repayFlashLoanPTB}.
 * @throws if the pool does not support flash loans.
 */
export async function flashloanPTB(
  tx: Transaction,
  identifier: AssetIdentifier,
  amount: number | TxValue,
  options?: Partial<EnvOption & MarketOption>,
) {
  const config = await getConfig({
    ...options,
    cacheTime: DEFAULT_CACHE_TIME,
  });
  const pool = await getPool(identifier, options);

  const flashLoanAssets = await getAllFlashLoanAssets({
    ...options,
    cacheTime: DEFAULT_CACHE_TIME,
  });

  const isSupport = flashLoanAssets.some(
    (asset) =>
      normalizeCoinType(asset.coinType) === normalizeCoinType(pool.suiCoinType),
  );
  if (!isSupport) {
    throw new Error("Pool does not support flashloan");
  }

  if (config.version === 1) {
    const [balance, receipt] = tx.moveCall({
      target: `${config.package}::lending::flash_loan_with_ctx`,
      arguments: [
        tx.object(config.flashloanConfig),
        tx.object(pool.contract.pool),
        parseTxValue(amount, tx.pure.u64) as never,
      ],
      typeArguments: [pool.suiCoinType],
    });
    return [balance, receipt];
  } else {
    const [balance, receipt] = tx.moveCall({
      target: `${config.package}::lending::flash_loan_with_ctx_v2`,
      arguments: [
        tx.object(config.flashloanConfig),
        tx.object(pool.contract.pool),
        parseTxValue(amount, tx.pure.u64) as never,
        tx.object("0x05"),
      ],
      typeArguments: [pool.suiCoinType],
    });
    return [balance, receipt];
  }
}

/**
 * Add a Navi flash-loan repayment to the PTB.
 * @returns `[balance]` left over after repayment.
 * @throws if the pool does not support flash loans.
 */
export async function repayFlashLoanPTB(
  tx: Transaction,
  identifier: AssetIdentifier,
  receipt: TxValue | string,
  coinObject: TxValue,
  options?: Partial<EnvOption & MarketOption>,
) {
  const config = await getConfig({
    ...options,
    cacheTime: DEFAULT_CACHE_TIME,
  });
  const pool = await getPool(identifier, options);

  const flashLoanAssets = await getAllFlashLoanAssets({
    ...options,
    cacheTime: DEFAULT_CACHE_TIME,
  });

  const isSupport = flashLoanAssets.some(
    (asset) =>
      normalizeCoinType(asset.coinType) === normalizeCoinType(pool.suiCoinType),
  );
  if (!isSupport) {
    throw new Error("Pool does not support flashloan");
  }

  const [balance] = tx.moveCall({
    target: `${config.package}::lending::flash_repay_with_ctx`,
    arguments: [
      tx.object("0x06"),
      tx.object(config.storage),
      tx.object(pool.contract.pool),
      parseTxValue(receipt, tx.object) as never,
      parseTxValue(coinObject, tx.object) as never,
    ],
    typeArguments: [pool.suiCoinType],
  });
  return [balance];
}
