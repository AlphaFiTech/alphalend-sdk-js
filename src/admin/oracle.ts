import { Transaction } from "@mysten/sui/transactions";
import { getConstants } from "../constants/index.js";
import { SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { pythPriceFeedIds } from "../utils/priceFeedIds.js";
import { SuiClient } from "@mysten/sui/client";

export function createAdditionalAdminCap(
  tx: Transaction,
  adminCapId: string,
  network: string,
): Transaction {
  const constants = getConstants(network);
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::create_additional_admin_cap`,
    arguments: [tx.object(adminCapId)],
  });
  return tx;
}

export function updateOracleMaxAge(
  tx: Transaction,
  adminCapId: string,
  newAge: number,
  network: string,
): Transaction {
  const constants = getConstants(network);
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::update_max_age`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      tx.pure.u64(newAge),
    ],
  });
  return tx;
}

export async function updatePythIdentifierForCoin(
  tx: Transaction,
  coinType: string,
  client: SuiClient,
  network: string,
) {
  const constants = getConstants(network);
  const pythClient = new SuiPythClient(
    client,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const priceInfoObjectId = await pythClient.getPriceFeedObjectId(
    pythPriceFeedIds[coinType],
  );

  if (!priceInfoObjectId) {
    throw new Error("Price info object id not found");
  }

  const priceInfo = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_info_from_price_info_object`,
    arguments: [tx.object(priceInfoObjectId)],
  });

  const priceIdentifier = tx.moveCall({
    target: `${constants.PYTH_PACKAGE_ID}::price_info::get_price_identifier`,
    arguments: [priceInfo],
  });

  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  const none = tx.moveCall({
    target: `0x1::option::none`,
    typeArguments: [constants.PYTH_PRICE_INDENTIFIER_TYPE],
    arguments: [],
  });

  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::update_pyth_identifier_for_coin`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(constants.ALPHAFI_ORACLE_ADMIN_CAP_ID),
      coinTypeName,
      priceIdentifier,
      none,
    ],
  });
}

export async function addCoinToOracle(
  tx: Transaction,
  adminCapId: string,
  coinType: string,
  coinKind: number,
  circuitBreakerThresholdBPS: number,
  network: string,
  client: SuiClient,
) {
  const constants = getConstants(network);
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  // making final moveCall
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::add_coin_to_oracle`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
      tx.pure.u8(coinKind),
      tx.pure.u16(circuitBreakerThresholdBPS),
    ],
  });

  updatePythIdentifierForCoin(tx, coinType, client, network);
}

export function removeCoinFromOracle(
  tx: Transaction,
  adminCapId: string,
  coinType: string,
  network: string,
): Transaction {
  const constants = getConstants(network);
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::remove_coin_type`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
    ],
  });

  return tx;
}
