/**
 * Oracle Module
 *
 * This module provides TypeScript interfaces to interact with the AlphaFi oracle module:
 * - Updates price information from Pyth oracles
 * - Retrieves price data for assets
 * - Manages oracle configuration (admin functions)
 */
import { Transaction } from "@mysten/sui/transactions";
import { getConstants } from "../constants/index.js";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";

const constants = getConstants();

export interface UpdatePriceTransactionArgs {
  oracle: string;
  priceInfoObject: string;
  clock: string;
}

export async function getPriceInfoObjectIds(
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

export function updatePriceTransaction(
  tx: Transaction,
  args: UpdatePriceTransactionArgs,
): Transaction {
  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::update_price`,
    arguments: [
      tx.object(args.oracle),
      tx.object(args.priceInfoObject),
      tx.object(args.clock),
    ],
  });
  return tx;
}
