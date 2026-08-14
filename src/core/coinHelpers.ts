/**
 * Standalone coin-management helpers (not lending related).
 *
 * Used by admin tooling to inspect an address's coin objects and build
 * transactions that consolidate them into a single coin object or into the
 * address balance (accumulator).
 */

import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { graphql } from "@mysten/sui/graphql/schema";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import type { SuiClientTypes } from "@mysten/sui/client";
import { normalizeStructTag, SUI_TYPE_ARG } from "@mysten/sui/utils";

import { Network } from "../constants/index.js";
import { Blockchain } from "../models/blockchain.js";

/** Default gRPC endpoints, overridable per call via `grpcUrl`. */
const GRPC_URL: Record<Network, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

export type MergeCoinsOutput = "address-balance" | "coin-object";

export interface CoinTypeCount {
  coinType: string;
  /** Capped at {@link MAX_COINS_PER_TX}; see `hasMoreCoinObjects`. */
  coinObjectCount: number;
  /** True when the address holds more objects of this type than were counted. */
  hasMoreCoinObjects: boolean;
}

/**
 * Max coin objects consolidated per transaction, and the cap on every per-type
 * coin-object read; callers re-run until one remains. Bound by transaction
 * size, not the 512-argument command limit: each coin is an owned-object input
 * costing ~79 serialized bytes, against a 16384 limit on the gasless
 * transaction. 180 measures ~14.3KB, leaving headroom for the gas coin and
 * address-balance withdrawal the SUI paths add on top.
 */
export const MAX_COINS_PER_TX = 180;

/** Kept low: the public fullnode rate-limits bursts. See {@link withRetry}. */
const COUNT_CONCURRENCY = 5;

/**
 * Min SUI address balance (in MIST) for paying gas from the address balance
 * instead of reserving a gas coin. 0.1 SUI — well above observed resolved
 * budgets for full send_funds transactions (~0.0002 SUI for 20 sends).
 */
const MIN_ADDRESS_BALANCE_FOR_GAS = 100_000_000n;

interface CoinObjectRef {
  objectId: string;
  version: string;
  digest: string;
  coinType: string;
  balance?: bigint;
}

/**
 * Number of `Coin<T>` objects per coin type held by `address`. Coins held
 * purely in the address balance (accumulator) do not appear.
 *
 * Each type is counted separately, capped at {@link MAX_COINS_PER_TX}. Listing
 * the address's objects and grouping by type instead cannot work: objects are
 * not listed grouped by type, so an address holding 100K objects of one coin
 * fills the whole listing and every other type is missed.
 */
export async function getCoinObjectCounts(
  address: string,
  network: Network,
  grpcUrl?: string,
  grpcToken?: string,
): Promise<CoinTypeCount[]> {
  const client = grpcClient(network, grpcUrl, grpcToken);
  const coinTypes = await listCoinTypes(client, address);

  const counts = await mapWithConcurrency(
    coinTypes,
    COUNT_CONCURRENCY,
    async (coinType): Promise<CoinTypeCount> => ({
      coinType,
      ...(await countCoinObjectsOfType(client, address, coinType)),
    }),
  );

  return counts
    .filter((c) => c.coinObjectCount > 0)
    .sort((a, b) => b.coinObjectCount - a.coinObjectCount);
}

/**
 * Build a transaction consolidating `address`'s `Coin<coinType>` objects into a
 * single coin object or into the address balance (accumulator). With
 * `coin-object` output any existing address balance is withdrawn and merged in
 * too. Handles at most {@link MAX_COINS_PER_TX} objects — re-run until one
 * remains.
 *
 * Gas payment is set explicitly for SUI: build-time gas resolution can only
 * pick SUI coins that are not transaction inputs, and here every SUI coin is
 * one. The largest SUI coin is reserved as gas (it alone must cover the
 * budget), except with `address-balance` output when the address balance
 * already exceeds {@link MIN_ADDRESS_BALANCE_FOR_GAS} — then gas resolves
 * against it and every coin object is sent, leaving none behind.
 *
 * The address balance is withdrawn as an exact amount read at build time (the
 * protocol has no entire-balance withdrawal), so concurrent accumulator
 * activity fails the transaction with "Invalid withdraw reservation".
 */
export async function buildMergeCoinsTransaction(
  coinType: string,
  output: MergeCoinsOutput,
  address: string,
  network: Network,
  grpcUrl?: string,
  grpcToken?: string,
): Promise<Transaction> {
  const blockchain = new Blockchain(network);
  const normalizedCoinType = normalizeStructTag(coinType);
  const isSui = normalizedCoinType === normalizeStructTag(SUI_TYPE_ARG);

  const addressBalance =
    output === "coin-object" || isSui
      ? await getAddressBalance(blockchain, address, normalizedCoinType)
      : 0n;
  // With enough pre-existing SUI address balance, gas resolves against it
  // instead of a reserved gas coin, so every coin object can be sent
  const useAddressBalanceGas =
    isSui &&
    output === "address-balance" &&
    addressBalance >= MIN_ADDRESS_BALANCE_FOR_GAS;

  const coins = await getCoinObjectsOfType(
    grpcClient(network, grpcUrl, grpcToken),
    address,
    normalizedCoinType,
  );

  const tx = new Transaction();
  tx.setSender(address);

  if (isSui) {
    if (coins.length === 0) {
      throw new Error(`Nothing to merge: ${address} holds no SUI coin objects`);
    }
    if (useAddressBalanceGas) {
      sendCoinsToAddressBalance(
        tx,
        normalizedCoinType,
        address,
        coins.slice(0, MAX_COINS_PER_TX),
      );
      return tx;
    }
    // The reserved gas coin alone must cover the budget, so use the largest
    const gasCoin = coins.reduce((a, b) =>
      (b.balance ?? 0n) > (a.balance ?? 0n) ? b : a,
    );
    const rest = coins.filter((c) => c !== gasCoin).slice(0, MAX_COINS_PER_TX);
    // For coin-object output a nonzero address balance is still work (it gets
    // withdrawn into the gas coin); for address-balance output it is not
    const hasWork =
      rest.length > 0 || (output === "coin-object" && addressBalance > 0n);
    if (!hasWork) {
      throw new Error(
        output === "coin-object"
          ? `Nothing to merge: ${address} holds a single SUI coin object and no address balance`
          : `Nothing to merge: ${address} holds a single SUI coin object; it must remain as the gas coin`,
      );
    }
    tx.setGasPayment([
      {
        objectId: gasCoin.objectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      },
    ]);
    if (output === "coin-object") {
      if (rest.length > 0) {
        tx.mergeCoins(
          tx.gas,
          rest.map((c) => tx.object(c.objectId)),
        );
      }
      if (addressBalance > 0n) {
        tx.mergeCoins(tx.gas, [
          withdrawAddressBalance(tx, normalizedCoinType, addressBalance),
        ]);
      }
    } else {
      sendCoinsToAddressBalance(tx, normalizedCoinType, address, rest);
    }
    return tx;
  }

  const selected = coins.slice(0, MAX_COINS_PER_TX);
  if (output === "coin-object") {
    if (selected.length <= 1 && addressBalance === 0n) {
      throw new Error(
        `Nothing to merge: ${address} holds ${selected.length} coin object(s) of ${normalizedCoinType} and no address balance`,
      );
    }
    const withdrawnCoin =
      addressBalance > 0n
        ? withdrawAddressBalance(tx, normalizedCoinType, addressBalance)
        : null;
    if (selected.length === 0) {
      // No existing coin object to merge into; the withdrawn coin becomes it
      tx.transferObjects([withdrawnCoin!], address);
    } else {
      const [target, ...rest] = selected;
      tx.mergeCoins(tx.object(target.objectId), [
        ...rest.map((c) => tx.object(c.objectId)),
        ...(withdrawnCoin ? [withdrawnCoin] : []),
      ]);
    }
  } else {
    if (selected.length === 0) {
      throw new Error(
        `Nothing to merge: ${address} holds no coin objects of ${normalizedCoinType}`,
      );
    }
    sendCoinsToAddressBalance(tx, normalizedCoinType, address, selected);
  }
  return tx;
}

/**
 * Merge `coins` into the first, then deposit it with one `send_funds` call.
 * Two commands regardless of coin count — per-coin `send_funds` calls exceed
 * the transaction size limit well before {@link MAX_COINS_PER_TX} coins.
 */
function sendCoinsToAddressBalance(
  tx: Transaction,
  coinType: string,
  address: string,
  coins: CoinObjectRef[],
) {
  const [target, ...rest] = coins;
  const targetArg = tx.object(target.objectId);
  if (rest.length > 0) {
    tx.mergeCoins(
      targetArg,
      rest.map((c) => tx.object(c.objectId)),
    );
  }
  tx.moveCall({
    target: "0x2::coin::send_funds",
    typeArguments: [coinType],
    arguments: [targetArg, tx.pure.address(address)],
  });
}

/**
 * Withdraw `amount` of `coinType` from the sender's address balance and
 * return it as a `Coin<coinType>` argument.
 */
function withdrawAddressBalance(
  tx: Transaction,
  coinType: string,
  amount: bigint,
): TransactionObjectArgument {
  const balance = tx.moveCall({
    target: "0x2::balance::redeem_funds",
    typeArguments: [coinType],
    arguments: [tx.withdrawal({ amount, type: coinType })],
  });
  return tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [coinType],
    arguments: [balance],
  });
}

/** Fetch the address balance (accumulator) of `coinType` held by `owner`. */
async function getAddressBalance(
  blockchain: Blockchain,
  owner: string,
  coinType: string,
): Promise<bigint> {
  const query = graphql(`
    query getAddressBalance($owner: SuiAddress!, $coinType: String!) {
      address(address: $owner) {
        balance(coinType: $coinType) {
          addressBalance
        }
      }
    }
  `);
  const response = await blockchain.gqlClient.query({
    query,
    variables: { owner, coinType },
  });
  return BigInt(response.data?.address?.balance?.addressBalance ?? 0);
}

/**
 * gRPC-web over fetch; works in browsers and Node. `grpcToken` is sent as
 * `x-token` metadata. The transport is built explicitly because
 * SuiGrpcClient's convenience constructor forwards only `baseUrl`/`fetchInit`
 * to the transport it builds and silently drops `meta` — the token would
 * never be sent.
 */
function grpcClient(
  network: Network,
  grpcUrl?: string,
  grpcToken?: string,
): SuiGrpcClient {
  return new SuiGrpcClient({
    network,
    transport: new GrpcWebFetchTransport({
      baseUrl: grpcUrl ?? GRPC_URL[network],
      ...(grpcToken ? { meta: { "x-token": grpcToken } } : {}),
    }),
  });
}

/** Retry a rate-limited fullnode call; counting every coin type is a burst. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [500, 1500, 4000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string }).code;
      const retryable = code === "RESOURCE_EXHAUSTED" || code === "UNAVAILABLE";
      if (!retryable || attempt >= delaysMs.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/**
 * Page through one coin type, up to {@link MAX_COINS_PER_TX} objects. Returns
 * whether more objects of the type exist beyond those visited.
 */
async function eachCoinPage(
  client: SuiGrpcClient,
  owner: string,
  coinType: string,
  onPage: (coins: SuiClientTypes.Coin[]) => void,
): Promise<boolean> {
  let visited = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await withRetry(() =>
      client.core.listCoins({
        owner,
        coinType,
        cursor,
        limit: MAX_COINS_PER_TX - visited,
      }),
    );
    onPage(page.objects);
    visited += page.objects.length;
    if (visited >= MAX_COINS_PER_TX) return page.hasNextPage;
    if (!page.hasNextPage || !page.cursor) return false;
    cursor = page.cursor;
  }
}

/**
 * The `Coin<coinType>` objects owned by `owner` — refs for gas payment, and
 * balances for picking a SUI gas coin. Capped at {@link MAX_COINS_PER_TX},
 * exactly what the next merge consolidates, so 100K-object addresses still
 * load in bounded time.
 */
async function getCoinObjectsOfType(
  client: SuiGrpcClient,
  owner: string,
  coinType: string,
): Promise<CoinObjectRef[]> {
  const out: CoinObjectRef[] = [];
  await eachCoinPage(client, owner, coinType, (coins) => {
    for (const coin of coins) {
      out.push({
        objectId: coin.objectId,
        version: coin.version,
        digest: coin.digest,
        coinType,
        balance: BigInt(coin.balance),
      });
    }
  });
  return out;
}

/** Number of `Coin<coinType>` objects owned by `owner`, capped as above. */
async function countCoinObjectsOfType(
  client: SuiGrpcClient,
  owner: string,
  coinType: string,
): Promise<{ coinObjectCount: number; hasMoreCoinObjects: boolean }> {
  let coinObjectCount = 0;
  const hasMoreCoinObjects = await eachCoinPage(
    client,
    owner,
    coinType,
    (coins) => {
      coinObjectCount += coins.length;
    },
  );
  return { coinObjectCount, hasMoreCoinObjects };
}

/**
 * Coin types `owner` holds as coin objects, from the node's coin index. Types
 * held purely in the address balance have nothing to merge and are skipped.
 */
async function listCoinTypes(
  client: SuiGrpcClient,
  owner: string,
): Promise<string[]> {
  const coinTypes: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await withRetry(() =>
      client.core.listBalances({ owner, cursor }),
    );
    for (const balance of page.balances) {
      if (BigInt(balance.coinBalance) > 0n) coinTypes.push(balance.coinType);
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return coinTypes;
}

/** Run `fn` over `items`, at most `limit` at a time, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}
