/**
 * Oracle Module
 *
 * This module provides TypeScript interfaces to interact with the AlphaFi oracle module:
 * - Updates price information from Pyth oracles
 * - Retrieves price data for assets
 * - Manages oracle configuration (admin functions)
 */
import { Transaction } from "@mysten/sui/transactions";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";

export interface UpdatePriceTransactionArgs {
  priceInfoObject: string;
  coinType: string;
}

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

export function updatePriceTransaction(
  tx: Transaction,
  args: UpdatePriceTransactionArgs,
  constants: any,
) {
  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::update_price_from_pyth`,
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
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::get_price_info`,
    arguments: [tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID), coinTypeName],
  });

  tx.moveCall({
    target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::update_price`,
    arguments: [tx.object(constants.LENDING_PROTOCOL_ID), oraclePriceInfo],
  });
}
