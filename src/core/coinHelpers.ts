/**
 * Standalone coin-management helpers (not lending related).
 *
 * Used by admin tooling to inspect an address's coin objects and build
 * transactions that consolidate them into a single coin object or into the
 * address balance (accumulator).
 */

import { Transaction } from "@mysten/sui/transactions";
import { graphql } from "@mysten/sui/graphql/schema";
import { normalizeStructTag, SUI_TYPE_ARG } from "@mysten/sui/utils";

import { Network } from "../constants/index.js";
import { Blockchain } from "../models/blockchain.js";

export type MergeCoinsOutput = "address-balance" | "coin-object";

export interface CoinTypeCount {
  coinType: string;
  coinObjectCount: number;
}

/**
 * Max coin objects consolidated per transaction. Keeps a single `mergeCoins`
 * command under the 512-arguments-per-command protocol limit and `send_funds`
 * command counts under the 1024-commands limit. Callers with more coin
 * objects re-run the merge until one remains.
 */
const MAX_COINS_PER_TX = 500;

interface CoinObjectRef {
  objectId: string;
  version: number;
  digest: string;
  balance: bigint;
}

/**
 * List every coin type held as coin objects by `address`, with the number of
 * `Coin<T>` objects per type. Coins held purely in the address balance
 * (accumulator, zero coin objects) do not appear.
 */
export async function getCoinObjectCounts(
  address: string,
  network: Network,
): Promise<CoinTypeCount[]> {
  const blockchain = new Blockchain(network);
  const query = graphql(`
    query getOwnedCoinTypes($owner: SuiAddress!, $cursor: String) {
      address(address: $owner) {
        objects(filter: { type: "0x2::coin::Coin" }, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            contents {
              type {
                repr
              }
            }
          }
        }
      }
    }
  `);

  const counts = new Map<string, number>();
  let cursor: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const variables: { owner: string; cursor: string | null } = {
      owner: address,
      cursor,
    };
    const response = await blockchain.gqlClient.query({ query, variables });
    const conn = response.data?.address?.objects;
    for (const node of conn?.nodes ?? []) {
      const repr = node?.contents?.type?.repr;
      if (!repr) continue;
      // repr is `0x…2::coin::Coin<T>`; extract the inner type T
      const coinType = repr.slice(repr.indexOf("<") + 1, -1);
      counts.set(coinType, (counts.get(coinType) ?? 0) + 1);
    }
    if (conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor) {
      cursor = conn.pageInfo.endCursor;
    } else {
      hasMore = false;
    }
  }

  return [...counts.entries()]
    .map(([coinType, coinObjectCount]) => ({ coinType, coinObjectCount }))
    .sort((a, b) => b.coinObjectCount - a.coinObjectCount);
}

/**
 * Build a transaction that consolidates all `Coin<coinType>` objects owned by
 * `address` into a single coin object or into the address balance
 * (accumulator). Funds already in the address balance are left untouched.
 *
 * The sender (and gas payer) is `address` itself. For SUI the largest coin is
 * set as the gas payment: with `coin-object` output the remaining coins merge
 * into the gas coin, and with `address-balance` output the remaining coins
 * are sent to the address balance while the gas coin stays as a coin object.
 *
 * At most {@link MAX_COINS_PER_TX} coin objects (largest first) are
 * consolidated per transaction — re-run until one coin object remains.
 */
export async function buildMergeCoinsTransaction(
  coinType: string,
  output: MergeCoinsOutput,
  address: string,
  network: Network,
): Promise<Transaction> {
  const blockchain = new Blockchain(network);
  const normalizedCoinType = normalizeStructTag(coinType);
  const isSui = normalizedCoinType === normalizeStructTag(SUI_TYPE_ARG);

  const coins = (
    await getCoinObjects(blockchain, address, normalizedCoinType)
  ).sort((a, b) =>
    a.balance > b.balance ? -1 : a.balance < b.balance ? 1 : 0,
  );
  const selected = coins.slice(0, MAX_COINS_PER_TX);

  const tx = new Transaction();
  tx.setSender(address);

  if (isSui) {
    const [gasCoin, ...rest] = selected;
    if (rest === undefined || rest.length === 0) {
      throw new Error(
        `Nothing to merge: ${address} holds ${selected.length} SUI coin object(s) and one must remain as the gas coin`,
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
      tx.mergeCoins(
        tx.gas,
        rest.map((c) => tx.object(c.objectId)),
      );
    } else {
      for (const coin of rest) {
        blockchain.sendCoinToAddressBalance(
          tx,
          normalizedCoinType,
          address,
          coin.objectId,
        );
      }
    }
    return tx;
  }

  if (output === "coin-object") {
    if (selected.length < 2) {
      throw new Error(
        `Nothing to merge: ${address} holds ${selected.length} coin object(s) of ${normalizedCoinType}`,
      );
    }
    const [target, ...rest] = selected;
    tx.mergeCoins(
      tx.object(target.objectId),
      rest.map((c) => tx.object(c.objectId)),
    );
  } else {
    if (selected.length === 0) {
      throw new Error(
        `Nothing to merge: ${address} holds no coin objects of ${normalizedCoinType}`,
      );
    }
    for (const coin of selected) {
      blockchain.sendCoinToAddressBalance(
        tx,
        normalizedCoinType,
        address,
        coin.objectId,
      );
    }
  }
  return tx;
}

/**
 * Paginated fetch of all `Coin<coinType>` objects owned by `owner`, with the
 * object refs needed for gas payment and the balance for largest-first
 * ordering.
 */
async function getCoinObjects(
  blockchain: Blockchain,
  owner: string,
  coinType: string,
): Promise<CoinObjectRef[]> {
  const query = graphql(`
    query getCoinObjectsOfType(
      $owner: SuiAddress!
      $type: String!
      $cursor: String
    ) {
      address(address: $owner) {
        objects(filter: { type: $type }, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            address
            version
            digest
            contents {
              json
            }
          }
        }
      }
    }
  `);

  const out: CoinObjectRef[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const variables: { owner: string; type: string; cursor: string | null } = {
      owner,
      type: `0x2::coin::Coin<${coinType}>`,
      cursor,
    };
    const response = await blockchain.gqlClient.query({ query, variables });
    const conn = response.data?.address?.objects;
    for (const node of conn?.nodes ?? []) {
      if (!node?.address || node.version == null || !node.digest) continue;
      const json = node.contents?.json as { balance?: string } | undefined;
      out.push({
        objectId: node.address,
        version: node.version,
        digest: node.digest,
        balance: BigInt(json?.balance ?? 0),
      });
    }
    if (conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor) {
      cursor = conn.pageInfo.endCursor;
    } else {
      hasMore = false;
    }
  }
  return out;
}
