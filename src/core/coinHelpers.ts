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

/**
 * Min SUI address balance (in MIST) for paying gas from the address balance
 * instead of reserving a gas coin. 0.1 SUI — well above observed resolved
 * budgets for full send_funds transactions (~0.0002 SUI for 20 sends).
 */
const MIN_ADDRESS_BALANCE_FOR_GAS = 100_000_000n;

interface CoinObjectRef {
  objectId: string;
  version: number;
  digest: string;
  coinType: string;
  balance?: bigint;
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
  const coins = await getCoinObjects(blockchain, address);

  const counts = new Map<string, number>();
  for (const coin of coins) {
    counts.set(coin.coinType, (counts.get(coin.coinType) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([coinType, coinObjectCount]) => ({ coinType, coinObjectCount }))
    .sort((a, b) => b.coinObjectCount - a.coinObjectCount);
}

/**
 * Build a transaction that consolidates all `Coin<coinType>` objects owned by
 * `address` into a single coin object or into the address balance
 * (accumulator).
 *
 * With `coin-object` output any existing address balance is also withdrawn
 * and merged in, so the full balance ends up in one coin object. With
 * `address-balance` output the coin objects are sent to the address balance
 * via `0x2::coin::send_funds`.
 *
 * The sender (and gas payer) is `address` itself. Gas payment must be set
 * explicitly for SUI because the automatic build-time gas resolution can only
 * pick SUI coins that are not inputs of the transaction, and here every SUI
 * coin is one. The largest SUI coin is reserved as the gas coin (it alone
 * must cover the gas budget): with `coin-object` output everything merges
 * into it, and with `address-balance` output it stays as a coin object.
 * Exception: with `address-balance` output, when the pre-existing SUI address
 * balance already exceeds {@link MIN_ADDRESS_BALANCE_FOR_GAS} no gas coin is
 * reserved — gas resolves against the address balance and every coin is sent,
 * leaving none behind. (Funds deposited by this same transaction cannot pay
 * its gas, so a first run that leaves the gas coin can be re-run once the
 * address balance is funded.)
 *
 * Consolidates at most {@link MAX_COINS_PER_TX} coin objects per transaction
 * — re-run until one coin object remains.
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

  // Balances are only needed to pick a gas coin that can cover the budget
  const withBalance = isSui && !useAddressBalanceGas;
  const coins = await getCoinObjects(
    blockchain,
    address,
    normalizedCoinType,
    withBalance,
  );

  const tx = new Transaction();
  tx.setSender(address);

  if (isSui) {
    if (coins.length === 0) {
      throw new Error(`Nothing to merge: ${address} holds no SUI coin objects`);
    }
    if (useAddressBalanceGas) {
      for (const coin of coins.slice(0, MAX_COINS_PER_TX)) {
        blockchain.sendCoinToAddressBalance(
          tx,
          normalizedCoinType,
          address,
          coin.objectId,
        );
      }
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
 * Paginated fetch of the `Coin<coinType>` objects owned by `owner` (all coin
 * objects when `coinType` is omitted), with the object refs needed for gas
 * payment. Coin balances are only fetched when `withBalance` is set (used to
 * pick a SUI gas coin).
 */
async function getCoinObjects(
  blockchain: Blockchain,
  owner: string,
  coinType?: string,
  withBalance = false,
): Promise<CoinObjectRef[]> {
  const query = graphql(`
    query getCoinObjectsOfType(
      $owner: SuiAddress!
      $type: String!
      $cursor: String
      $withBalance: Boolean = false
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
              type {
                repr
              }
              json @include(if: $withBalance)
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
    const variables: {
      owner: string;
      type: string;
      cursor: string | null;
      withBalance: boolean;
    } = {
      owner,
      type: coinType ? `0x2::coin::Coin<${coinType}>` : "0x2::coin::Coin",
      cursor,
      withBalance,
    };
    const response = await blockchain.gqlClient.query({ query, variables });
    const conn = response.data?.address?.objects;
    for (const node of conn?.nodes ?? []) {
      const repr = node?.contents?.type?.repr;
      if (!node?.address || node.version == null || !node.digest || !repr) {
        continue;
      }
      const json = node.contents?.json as { balance?: string } | undefined;
      out.push({
        objectId: node.address,
        version: node.version,
        digest: node.digest,
        // repr is `0x…2::coin::Coin<T>`; extract the inner type T
        coinType: repr.slice(repr.indexOf("<") + 1, -1),
        ...(withBalance ? { balance: BigInt(json?.balance ?? 0) } : {}),
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
