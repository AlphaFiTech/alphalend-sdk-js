/**
 * Oracle Module
 *
 * This module provides interfaces to interact with price oracles in the AlphaLend protocol:
 * - Updates price information from Pyth oracles
 * - Manages price feed updates for the protocol
 * - Handles the connection between external price feeds and the lending protocol
 */
import { Transaction } from "@mysten/sui/transactions";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
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
 * @param pythConnection - SuiPriceServiceConnection instance
 * @returns Promise resolving to an array of price info object IDs
 */
export async function getPriceInfoObjectIdsWithUpdate(
  tx: Transaction,
  priceIDs: string[],
  pythClient: SuiPythClient,
  pythConnection: SuiPriceServiceConnection,
): Promise<string[]> {
  const priceFeedUpdateData =
    await pythConnection.getPriceFeedsUpdateData(priceIDs);

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
) {
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::update_price_from_pyth`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(args.priceInfoObject),
      tx.object(constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [args.coinType],
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
