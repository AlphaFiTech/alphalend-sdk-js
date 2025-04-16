import { Transaction, TransactionResult } from "@mysten/sui/transactions";
import { getConstants } from "../constants/index.js";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { pythPriceFeedIds } from "../utils/priceFeedIds.js";
import { getPriceInfoObjectIdsWithUpdate } from "../utils/oracle.js";

const constants = getConstants();

export function createAdditionalAdminCap(
  tx: Transaction,
  adminCapId: string,
): Transaction {
  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::create_additional_admin_cap`,
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
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::update_max_age`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      tx.pure.u64(newAge),
    ],
  });
  return tx;
}

export async function addCoinToOracle(
  tx: Transaction,
  adminCapId: string,
  coinType: string,
  coinKind: number,
  circuitBreakerThresholdBPS: number,
) {
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  // making final moveCall
  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::add_coin_to_oracle`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
      tx.pure.u8(coinKind),
      tx.pure.u16(circuitBreakerThresholdBPS),
    ],
  });
}

export function removeCoinFromOracle(
  tx: Transaction,
  adminCapId: string,
  coinType: string,
): Transaction {
  // getting coinType in move
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::remove_coin_type`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      tx.object(adminCapId),
      coinTypeName,
    ],
  });

  return tx;
}
