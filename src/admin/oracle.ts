import { Transaction } from "@mysten/sui/transactions";
import { getConstants } from "../constants/prodConstants";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { pythPriceFeedIds } from "../utils/priceFeedIds";
import { coinNameToCoinType } from "../constants/maps";

const constants = getConstants();

function createAdditionalAdminCap(
  tx: Transaction,
  adminCapId: string
): Transaction {
  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::create_additional_admin_cap`,
    arguments: [tx.object(adminCapId)],
  });
  return tx;
}

function updateOracleMaxAge(
  tx: Transaction,
  adminCapId: string,
  newAge: number
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

export async function addCoinToOracle(
  tx: Transaction,
  adminCapId: string,
  coinName: string,
  pythClient: SuiPythClient,
  pythConnection: SuiPriceServiceConnection
): Promise<Transaction> {
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinNameToCoinType[coinName]],
  });

  // getting identifier in move
  const priceFeedUpdateData = await pythConnection.getPriceFeedsUpdateData([
    pythPriceFeedIds[coinName],
  ]);
  const priceInfoObjectId = await pythClient.updatePriceFeeds(
    tx,
    priceFeedUpdateData,
    [pythPriceFeedIds[coinName]]
  );
  const priceInfo = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_info_from_price_info_object`,
    arguments: [tx.object(priceInfoObjectId[0])],
  });
  const identifier = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_identifier`,
    arguments: [priceInfo],
  });

  let [dependentObject] = tx.moveCall({
    target: `0x1::option::none`,
    typeArguments: [constants.PYTH_PRICE_INDENTIFIER_TYPE],
    arguments: [],
  });

  // making final moveCall
  tx.moveCall({
    target: `${constants.ORACLE_PACKAGE_ID}::oracle::add_coin_to_oracle`,
    arguments: [
      tx.object(constants.ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
      identifier,
      dependentObject,
    ],
  });
  return tx;
}

// function updateIdentifierForCoin(
//   tx: Transaction,
//   oracleId: string,
//   adminCapId: string,
//   coinType: string,
//   identifier: string,
//   dependent?: string
// ): Transaction {
//   tx.moveCall({
//     target: `${constants.ORACLE_PACKAGE_ID}::oracle::update_identifier_for_coin`,
//     arguments: [
//       tx.object(oracleId),
//       tx.object(adminCapId),
//       tx.pure(coinType),
//       tx.pure("TypeName", identifier),
//       dependent ? tx.pure.option(dependent) : tx.pure.option(),
//     ],
//   });
//   return tx;
// }

// function removeCoinFromOracle(
//   tx: Transaction,
//   oracleId: string,
//   adminCapId: string,
//   coinType: string
// ): Transaction {
//   tx.moveCall({
//     target: `${constants.ORACLE_PACKAGE_ID}::oracle::remove_coin_type`,
//     arguments: [tx.object(oracleId), tx.object(adminCapId), tx.pure(coinType)],
//   });
//   return tx;
// }
