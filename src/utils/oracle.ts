/**
 * Oracle Module
 *
 * This module provides interfaces to interact with price oracles in the AlphaLend protocol:
 * - Updates price information from Pyth oracles
 * - Manages price feed updates for the protocol
 * - Handles the connection between external price feeds and the lending protocol
 */
import { Inputs, Transaction } from "@mysten/sui/transactions";
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
