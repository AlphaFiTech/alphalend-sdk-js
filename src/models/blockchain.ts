/**
 * Blockchain interface wrapper for Sui network operations using the SuiGraphQLClient.
 *
 * All operations go through GraphQL, including transaction simulation via
 * `gqlClient.core.simulateTransaction`, which builds the transaction, resolves
 * gas, and simulates server-side. No JSON-RPC or gRPC client is used.
 */

import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { toBase64 } from "@mysten/sui/utils";

import { getConstants, Network } from "../constants/index.js";
import { Constants } from "../constants/types.js";
import {
  parseMarket,
  parsePosition,
  parsePositionCap,
} from "../utils/parser.js";
import {
  MarketType,
  PositionType,
  PositionCapType,
} from "../utils/parsedTypes.js";
import {
  MarketGqlFields,
  PositionGqlFields,
  PositionCapGqlFields,
} from "../utils/queryTypes.js";

const GRAPHQL_URL: Record<Network, string> = {
  mainnet: "https://graphql.mainnet.sui.io/graphql",
  testnet: "https://graphql.testnet.sui.io/graphql",
  devnet: "https://graphql.devnet.sui.io/graphql",
};

export interface GqlObject<T> {
  address: string;
  contents?: T;
}

export interface EarliestTxInfo {
  digest: string;
  timestampMs: number;
}

export class Blockchain {
  network: Network;
  gqlClient: SuiGraphQLClient;
  constants: Constants;

  private initialSharedVersionCache: Map<string, string> = new Map();

  constructor(network: Network, graphqlUrl?: string) {
    this.network = network;
    this.constants = getConstants(network);
    this.gqlClient = new SuiGraphQLClient({
      url: graphqlUrl ?? GRAPHQL_URL[network],
      network,
    });
  }

  // --------------------------------------------------------------------------
  // Low-level primitives
  // --------------------------------------------------------------------------

  /**
   * Get an object's flattened `contents.json` (Move struct fields) by ID.
   *
   * Returns the address at the top level alongside `contents` so callers can
   * correlate the response with the queried id (mirrors `getOwnedObjectsOfType`
   * and dynamic-field helpers).
   */
  async getObject<T = Record<string, unknown>>(
    objectId: string,
  ): Promise<GqlObject<T> | undefined> {
    const query = graphql(`
      query getObject($objectId: SuiAddress!) {
        object(address: $objectId) {
          address
          asMoveObject {
            contents {
              json
            }
          }
        }
      }
    `);

    const result = await this.gqlClient.query({
      query,
      variables: { objectId },
    });

    const obj = result.data?.object;
    if (!obj) return undefined;
    return {
      address: obj.address,
      contents: obj.asMoveObject?.contents?.json as T | undefined,
    };
  }

  /**
   * Get an object's raw owner metadata (currently only used for reading
   * `Shared.initialSharedVersion` for shared objects).
   */
  private async getObjectOwner(objectId: string): Promise<{
    __typename?: string;
    initialSharedVersion?: string;
  } | null> {
    const query = graphql(`
      query getObjectOwner($objectId: SuiAddress!) {
        object(address: $objectId) {
          owner {
            __typename
            ... on Shared {
              initialSharedVersion
            }
          }
        }
      }
    `);
    const result = await this.gqlClient.query({
      query,
      variables: { objectId },
    });
    return (result.data?.object?.owner ?? null) as {
      __typename?: string;
      initialSharedVersion?: string;
    } | null;
  }

  /** Batch get object contents by IDs. */
  async multiGetObjects<T = Record<string, unknown>>(
    objectIds: string[],
  ): Promise<Map<string, T>> {
    if (objectIds.length === 0) {
      return new Map();
    }

    const query = graphql(`
      query multiGetObjects($objectIds: [ObjectKey!]!) {
        multiGetObjects(keys: $objectIds) {
          address
          asMoveObject {
            contents {
              json
            }
          }
        }
      }
    `);

    const batches: string[][] = [];
    for (let i = 0; i < objectIds.length; i += 50) {
      batches.push(objectIds.slice(i, i + 50));
    }

    const resMap: Map<string, T> = new Map();
    const results = await Promise.all(
      batches.map((batch) =>
        this.gqlClient.query({
          query,
          variables: { objectIds: batch.map((id) => ({ address: id })) },
        }),
      ),
    );

    for (const result of results) {
      const nodes = result.data?.multiGetObjects ?? [];
      for (const obj of nodes) {
        if (obj?.address) {
          resMap.set(obj.address, obj.asMoveObject?.contents?.json as T);
        }
      }
    }

    return resMap;
  }

  /**
   * Paginated fetch of objects of `type` owned by `owner`. Returns
   * `{ address, contents }` tuples so callers can access both the object id
   * and its fields.
   */
  async getOwnedObjectsOfType<T = Record<string, unknown>>(
    owner: string,
    type: string,
  ): Promise<GqlObject<T>[]> {
    const query = graphql(`
      query getOwnedObjectsOfType(
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
              contents {
                json
              }
            }
          }
        }
      }
    `);

    const out: GqlObject<T>[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      const variables: {
        owner: string;
        type: string;
        cursor: string | null;
      } = { owner, type, cursor };
      const response = await this.gqlClient.query({ query, variables });
      const conn = response.data?.address?.objects;
      const nodes = conn?.nodes ?? [];
      for (const node of nodes) {
        if (node?.address) {
          out.push({
            address: node.address,
            contents: node.contents?.json as T | undefined,
          });
        }
      }
      if (conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor) {
        cursor = conn.pageInfo.endCursor;
      } else {
        hasMore = false;
      }
    }
    return out;
  }

  /**
   * Source an exact-`amount` coin of `coinType` for spending, drawing from BOTH
   * the user's address balance (the accumulator) AND their `Coin<T>` objects.
   */
  getCoinObject(
    tx: Transaction,
    coinType: string,
    address: string,
    amount: bigint,
  ) {
    tx.setSenderIfNotSet(address);
    return tx.coin({ type: coinType, balance: amount });
  }

  /**
   * Credit a `Coin<coinType>` to `address`'s address balance (the accumulator)
   */
  sendCoinToAddressBalance(
    tx: Transaction,
    coinType: string,
    address: string,
    coin: TransactionObjectArgument | string,
  ) {
    tx.moveCall({
      target: "0x2::coin::send_funds",
      typeArguments: [coinType],
      arguments: [
        typeof coin === "string" ? tx.object(coin) : coin,
        tx.pure.address(address),
      ],
    });
  }

  // --------------------------------------------------------------------------
  // Dynamic fields
  // --------------------------------------------------------------------------

  /**
   * Fetch a single dynamic field under `parentId`. The name is BCS-encoded
   * and base64'd by callers of the convenience helpers below
   * (`getMarketQuery`, `getMarket`, `getPosition`).
   *
   * `address` is always the `Field<K, V>` wrapper object's own address
   * (equivalent to the JSON-RPC `objectId` of the dynamic field). For
   * dynamic *object* fields (stored via `dynamic_object_field` /
   * `ObjectTable<K, V>`) the child object's own address is exposed
   * separately as `childObjectAddress`; `valueJson` still carries the
   * unwrapped struct fields in both cases.
   */
  private async getDynamicField<V = unknown, K = unknown>(
    parentId: string,
    name: { type: string; bcs: string },
  ): Promise<{
    address: string;
    name: { type: string; json: K };
    valueJson: V | undefined;
    childObjectAddress?: string;
  } | null> {
    const query = graphql(`
      query getDynamicField($parent: SuiAddress!, $name: DynamicFieldName!) {
        address(address: $parent) {
          dynamicField(name: $name) {
            address
            name {
              type {
                repr
              }
              json
            }
            value {
              __typename
              ... on MoveValue {
                json
              }
              ... on MoveObject {
                address
                contents {
                  json
                }
              }
            }
          }
        }
      }
    `);

    const response = await this.gqlClient.query({
      query,
      variables: { parent: parentId, name },
    });

    const df = response.data?.address?.dynamicField;
    if (!df) return null;

    const entryName = {
      type: (df.name?.type?.repr as string | undefined) ?? "",
      json: df.name?.json as K,
    };

    if (df.value?.__typename === "MoveValue") {
      return {
        address: df.address,
        name: entryName,
        valueJson: df.value.json as V,
      };
    }
    if (df.value?.__typename === "MoveObject") {
      return {
        address: df.address,
        name: entryName,
        valueJson: df.value.contents?.json as V | undefined,
        childObjectAddress: df.value.address,
      };
    }
    return { address: df.address, name: entryName, valueJson: undefined };
  }

  /**
   * Paginated fetch of every dynamic field under `parentId`. Each entry
   * returns the `Field<K, V>` wrapper object's own `address`, the decoded
   * `name` (with its Move type), and the unwrapped `valueJson`. For dynamic
   * *object* fields the child object's own address is exposed separately
   * as `childObjectAddress`; `valueJson` continues to carry the unwrapped
   * struct fields.
   *
   * `first` is intentionally omitted from the query so the service-side
   * default maximum page size is used on every page. Pagination continues
   * via `pageInfo.endCursor` until there are no more pages.
   */
  async getAllDynamicFields<V = Record<string, unknown>, K = unknown>(
    parentId: string,
  ): Promise<
    {
      address: string;
      name: { type: string; json: K };
      valueJson: V | undefined;
      childObjectAddress?: string;
    }[]
  > {
    const query = graphql(`
      query getAllDynamicFields($parent: SuiAddress!, $after: String) {
        address(address: $parent) {
          dynamicFields(after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              address
              name {
                type {
                  repr
                }
                json
              }
              value {
                __typename
                ... on MoveValue {
                  json
                }
                ... on MoveObject {
                  address
                  contents {
                    json
                  }
                }
              }
            }
          }
        }
      }
    `);

    const out: {
      address: string;
      name: { type: string; json: K };
      valueJson: V | undefined;
      childObjectAddress?: string;
    }[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      const variables: { parent: string; after: string | null } = {
        parent: parentId,
        after: cursor,
      };
      const response = await this.gqlClient.query({ query, variables });
      const conn = response.data?.address?.dynamicFields;
      const nodes = conn?.nodes ?? [];
      for (const node of nodes) {
        if (!node?.address) continue;
        const entryName = {
          type: (node.name?.type?.repr as string | undefined) ?? "",
          json: node.name?.json as K,
        };
        if (node.value?.__typename === "MoveValue") {
          out.push({
            address: node.address,
            name: entryName,
            valueJson: node.value.json as V,
          });
        } else if (node.value?.__typename === "MoveObject") {
          out.push({
            address: node.address,
            name: entryName,
            valueJson: node.value.contents?.json as V | undefined,
            childObjectAddress: node.value.address,
          });
        } else {
          out.push({
            address: node.address,
            name: entryName,
            valueJson: undefined,
          });
        }
      }
      if (conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor) {
        cursor = conn.pageInfo.endCursor;
      } else {
        hasMore = false;
      }
    }
    return out;
  }

  /**
   * Find the earliest (creation) transaction that affected `objectId` and
   * return its digest plus timestamp in ms since epoch. Used to order
   * position caps by creation time (replaces JSON-RPC's
   * `queryTransactionBlocks({ ChangedObject, order: "ascending" })`).
   */
  async getEarliestTxForObject(
    objectId: string,
  ): Promise<EarliestTxInfo | null> {
    const query = graphql(`
      query earliestTxForObject($obj: SuiAddress!) {
        transactions(first: 1, filter: { affectedObject: $obj }) {
          nodes {
            digest
            effects {
              timestamp
            }
          }
        }
      }
    `);

    const response = await this.gqlClient.query({
      query,
      variables: { obj: objectId },
    });
    const node = response.data?.transactions?.nodes?.[0];
    if (!node) return null;
    const ts = node.effects?.timestamp;
    const parsed = ts ? Date.parse(ts) : NaN;
    return {
      digest: node.digest,
      timestampMs: Number.isFinite(parsed) ? parsed : 0,
    };
  }

  // --------------------------------------------------------------------------
  // Transaction simulation
  // --------------------------------------------------------------------------

  /**
   * Simulate a transaction via the GraphQL client's core API, which builds the
   * transaction, resolves gas, and simulates server-side. Returns the parsed
   * transaction effects (or undefined if effects are unavailable).
   */
  async simulateTransaction(tx: Transaction, sender: string) {
    tx.setSenderIfNotSet(sender);
    const result = await this.gqlClient.core.simulateTransaction({
      transaction: tx,
      include: { effects: true },
    });
    const txData =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;
    return txData?.effects ?? undefined;
  }

  /** Estimate gas budget by simulating the transaction. */
  async getEstimatedGasBudget(
    tx: Transaction,
    sender: string,
  ): Promise<number | undefined> {
    const fallbackBudget = 500_000_000;
    try {
      const effects = await this.simulateTransaction(tx, sender);
      const gasUsed = effects?.gasUsed;
      if (!gasUsed) {
        console.warn(
          "Simulation returned no gas summary; using fallback gas budget",
        );
        return fallbackBudget;
      }
      const estimatedBudget =
        Number(gasUsed.computationCost) +
        Number(gasUsed.nonRefundableStorageFee) +
        fallbackBudget;
      if (!Number.isFinite(estimatedBudget) || estimatedBudget <= 0) {
        console.warn("Simulation returned invalid gas summary; using fallback");
        return fallbackBudget;
      }
      return estimatedBudget;
    } catch (err) {
      console.error(`Error estimating transaction gasBudget`, err);
      return fallbackBudget;
    }
  }

  // --------------------------------------------------------------------------
  // Domain-specific helpers
  // --------------------------------------------------------------------------

  /**
   * Get the initial shared version of a shared object. Result is cached per
   * `objectId` since `initial_shared_version` never changes for a given
   * shared object.
   */
  async getInitialSharedVersion(objectId: string): Promise<string> {
    const cached = this.initialSharedVersionCache.get(objectId);
    if (cached) return cached;

    const owner = await this.getObjectOwner(objectId);
    if (
      !owner ||
      owner.__typename !== "Shared" ||
      !owner.initialSharedVersion
    ) {
      throw new Error(
        `Object ${objectId} is not a shared object or its initial shared version could not be resolved`,
      );
    }
    this.initialSharedVersionCache.set(objectId, owner.initialSharedVersion);
    return owner.initialSharedVersion;
  }

  /** Returns the raw (GraphQL-flattened) market fields for a given market id. */
  async getMarketQuery(marketId: number): Promise<MarketGqlFields> {
    const name = {
      type: "u64",
      bcs: toBase64(bcs.u64().serialize(BigInt(marketId)).toBytes()),
    };
    const df = await this.getDynamicField(
      this.constants.MARKETS_TABLE_ID,
      name,
    );
    if (!df?.valueJson) {
      throw new Error(`Market ${marketId} not found`);
    }
    return df.valueJson as MarketGqlFields;
  }

  async getMarket(marketId: number): Promise<MarketType> {
    const name = {
      type: "u64",
      bcs: toBase64(bcs.u64().serialize(BigInt(marketId)).toBytes()),
    };
    const df = await this.getDynamicField(
      this.constants.MARKETS_TABLE_ID,
      name,
    );
    if (!df?.valueJson) {
      throw new Error(`Market ${marketId} not found`);
    }
    return parseMarket(df.valueJson as MarketGqlFields, df.address);
  }

  async getAllMarkets(): Promise<MarketType[]> {
    const entries = await this.getAllDynamicFields<MarketGqlFields>(
      this.constants.MARKETS_TABLE_ID,
    );
    const markets = entries
      .filter((e) => !!e.valueJson)
      .map((e) => parseMarket(e.valueJson as MarketGqlFields, e.address));
    return markets.filter((m) => m.config.active);
  }

  /**
   * Get position by position ID (the object ID of the position itself, used
   * as the key inside the positions table).
   */
  async getPosition(positionId: string): Promise<PositionType> {
    const name = {
      type: "0x2::object::ID",
      bcs: toBase64(bcs.Address.serialize(positionId).toBytes()),
    };
    const df = await this.getDynamicField(
      this.constants.POSITION_TABLE_ID,
      name,
    );
    if (!df?.valueJson) {
      throw new Error(`Position ${positionId} not found`);
    }
    return parsePosition(df.valueJson as PositionGqlFields, df.address);
  }

  /** Get all positions for a user by first reading position caps. */
  async getPositionsForUser(userAddress: string): Promise<PositionType[]> {
    const positionCaps = await this.getPositionCapsForUser(userAddress);
    const positions = await Promise.all(
      positionCaps.map((cap) => this.getPosition(cap.positionId)),
    );
    return positions;
  }

  async getPositionFromPositionCapId(
    positionCapId: string,
  ): Promise<PositionType> {
    const cap = await this.getObject<{ position_id: string }>(positionCapId);
    if (!cap?.contents?.position_id) {
      throw new Error(`Position cap ${positionCapId} not found`);
    }
    return this.getPosition(cap.contents.position_id);
  }

  async getPositionCapsForUser(
    userAddress: string,
  ): Promise<PositionCapType[]> {
    const objects = await this.getOwnedObjectsOfType<PositionCapGqlFields>(
      userAddress,
      this.constants.POSITION_CAP_TYPE,
    );
    return objects
      .filter((o) => !!o.contents)
      .map((o) => parsePositionCap(o.contents as PositionCapGqlFields));
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------
}
