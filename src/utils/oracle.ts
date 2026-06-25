/**
 * Oracle Module
 *
 * This module provides interfaces to interact with price oracles in the AlphaLend protocol:
 * - Updates price information from Pyth oracles
 * - Manages price feed updates for the protocol
 * - Handles the connection between external price feeds and the lending protocol
 */
import { Inputs, Transaction } from "@mysten/sui/transactions";
import { SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Constants } from "../constants/types.js";

/**
 * Arguments required for updating prices in a transaction
 */
export interface UpdatePriceTransactionArgs {
  /** The Pyth price info object ID */
  priceInfoObject: string;
  /** The fully qualified coin type */
  coinType: string;
}

/**
 * Fetches price feed data from Pyth and adds update instructions to the transaction
 *
 * @param tx - The transaction to add price updates to
 * @param priceIDs - Array of Pyth price feed IDs
 * @param pythClient - SuiPythClient instance
 * @param pythConnection - Pyth Hermes client
 * @param pythCoreUpgraded - When true (post Pyth Core upgrade), fetch signed update
 *   data from `pythProxyUrl`. Defaults to false (existing behavior).
 * @param pythProxyUrl - Hermes-compatible endpoint base. Only used when `pythCoreUpgraded` is true.
 * @returns Promise resolving to an array of price info object IDs
 */
export async function getPriceInfoObjectIdsWithUpdate(
  tx: Transaction,
  priceIDs: string[],
  pythClient: SuiPythClient,
  pythConnection: HermesClient,
  pythCoreUpgraded = false,
  pythProxyUrl = "https://hermes.pyth.network",
): Promise<string[]> {
  let priceFeedUpdateData: Buffer[];
  if (pythCoreUpgraded) {
    const idsQuery = priceIDs
      .map((id) => `ids[]=${id.startsWith("0x") ? id : "0x" + id}`)
      .join("&");
    const res = await fetch(
      `${pythProxyUrl}/v2/updates/price/latest?${idsQuery}&encoding=hex`,
    );
    if (!res.ok) {
      throw new Error(
        `Pyth proxy request failed: ${res.status} ${res.statusText}`,
      );
    }
    const json = await res.json();
    priceFeedUpdateData = (json.binary.data as string[]).map((h: string) =>
      Buffer.from(h.startsWith("0x") ? h.slice(2) : h, "hex"),
    );
  } else {
    const priceUpdates = await pythConnection.getLatestPriceUpdates(priceIDs, {
      encoding: "base64",
      parsed: false,
    });
    priceFeedUpdateData = priceUpdates.binary.data.map((update) =>
      Buffer.from(update, "base64"),
    );
  }

  const priceInfoObjectIds = await pythClient.updatePriceFeeds(
    tx,
    priceFeedUpdateData,
    priceIDs,
  );

  return priceInfoObjectIds;
}

/**
 * Retrieves price info object IDs from Pyth without updating them
 *
 * @param priceIDs - Array of Pyth price feed IDs
 * @param pythClient - SuiPythClient instance
 * @returns Promise resolving to an array of price info object IDs or undefined
 */
export async function getPriceInfoObjectIdsWithoutUpdate(
  priceIDs: string[],
  pythClient: SuiPythClient,
): Promise<(string | undefined)[]> {
  const priceInfoObjectIds = await Promise.all(
    priceIDs.map((priceId) => {
      return pythClient.getPriceFeedObjectId(priceId);
    }),
  );
  return priceInfoObjectIds;
}

export function appendOracleToLendingBridge(
  tx: Transaction,
  coinType: string,
  constants: Constants,
) {
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  const oraclePriceInfo = tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::get_price_info`,
    arguments: [tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID), coinTypeName],
  });

  tx.moveCall({
    target: `${constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::update_price`,
    arguments: [tx.object(constants.LENDING_PROTOCOL_ID), oraclePriceInfo],
  });
}

/**
 * Adds oracle price update instructions to a transaction
 *
 * @param tx - The transaction to add price updates to
 * @param args - Update price transaction arguments
 * @param constants - Protocol constants
 */
export function updatePriceTransaction(
  tx: Transaction,
  args: UpdatePriceTransactionArgs,
  constants: Constants,
  oracleInitialSharedVersion: string,
) {
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::update_price_from_pyth`,
    arguments: [
      tx.object(
        Inputs.SharedObjectRef({
          objectId: constants.ALPHAFI_ORACLE_OBJECT_ID,
          initialSharedVersion: oracleInitialSharedVersion,
          mutable: true,
        }),
      ),
      // tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(args.priceInfoObject),
      tx.object(constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  appendOracleToLendingBridge(tx, args.coinType, constants);
}
