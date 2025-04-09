import { Transaction, TransactionResult } from "@mysten/sui/transactions";
import { getConstants } from "../constants/index.js";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { pythPriceFeedIds } from "../utils/priceFeedIds.js";
import { coinNameToCoinType } from "../constants/maps.js";
import { getPriceInfoObjectIdsWithUpdate } from "../utils/oracle.js";

const constants = getConstants();

export function createAdditionalAdminCap(
  tx: Transaction,
  adminCapId: string,
): Transaction {
  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::create_additional_admin_cap`,
    arguments: [tx.object(adminCapId)],
  });
  return tx;
}

export function updateOracleMaxAge(
  tx: Transaction,
  adminCapId: string,
  newAge: number,
): Transaction {
  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::update_max_age`,
    arguments: [
      tx.object(constants.ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      tx.pure.u64(newAge),
    ],
  });
  return tx;
}

async function getPriceIdentifier(
  tx: Transaction,
  coinType: string,
  pythClient: SuiPythClient,
  pythConnection: SuiPriceServiceConnection,
): Promise<{ transaction: Transaction; priceIdentifier: TransactionResult }> {
  const priceInfoObjectId = await getPriceInfoObjectIdsWithUpdate(
    tx,
    [pythPriceFeedIds[coinType]],
    pythClient,
    pythConnection,
  );

  const priceInfo = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_info_from_price_info_object`,
    arguments: [tx.object(priceInfoObjectId[0])],
  });
  const priceIdentifier = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_identifier`,
    arguments: [priceInfo],
  });

  return { transaction: tx, priceIdentifier };
}

export async function addCoinToOracle(
  tx: Transaction,
  adminCapId: string,
  coinType: string,
  pythClient: SuiPythClient,
  pythConnection: SuiPriceServiceConnection,
): Promise<Transaction> {
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  // getting identifier in move
  const { transaction, priceIdentifier } = await getPriceIdentifier(
    tx,
    coinType,
    pythClient,
    pythConnection,
  );

  // to-do --> add dependentIdentifier for stSui case
  const [dependentPriceIdentifier] = transaction.moveCall({
    target: `0x1::option::none`,
    typeArguments: [constants.PYTH_PRICE_INDENTIFIER_TYPE],
    arguments: [],
  });

  // making final moveCall
  transaction.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::add_coin_to_oracle`,
    arguments: [
      transaction.object(constants.ORACLE_OBJECT_ID),
      transaction.object(adminCapId),
      coinTypeName,
      priceIdentifier,
      dependentPriceIdentifier,
    ],
  });
  return transaction;
}

// function updateIdentifierForCoin(
//   tx: Transaction,
//   adminCapId: string,
//   coinName: string,
//   pythClient: SuiPythClient,
//   pythConnection: SuiPriceServiceConnection
// ): Transaction {
//   // getting coinType in move
//   const coinTypeName = tx.moveCall({
//     target: `0x1::type_name::get`,
//     typeArguments: [coinNameToCoinType[coinName]],
//   });

//   tx.moveCall({
//     target: `${constants.ORACLE_PACKAGE_ID}::oracle::update_identifier_for_coin`,
//     arguments: [
//       tx.object(constants.ORACLE_OBJECT_ID),
//       tx.object(adminCapId),
//       coinTypeName,
//       tx.pure("TypeName", identifier),
//       dependent ? tx.pure.option(dependent) : tx.pure.option(),
//     ],
//   });

//   return tx;
// }

export function removeCoinFromOracle(
  tx: Transaction,
  adminCapId: string,
  coinName: string,
): Transaction {
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinNameToCoinType[coinName]],
  });

  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::remove_coin_type`,
    arguments: [
      tx.object(constants.ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
    ],
  });

  return tx;
}
