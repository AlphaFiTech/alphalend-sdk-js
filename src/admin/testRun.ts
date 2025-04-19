import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../constants/index.js";
import { addCoinToOracle } from "./oracle.js";
import { AlphalendClient } from "../core/client.js";
import * as dotenv from "dotenv";

dotenv.config();

const constants = getConstants();

export function getExecStuff() {
  if (!process.env.PK_B64) {
    throw new Error("env var PK_B64 not configured");
  }

  const b64PrivateKey = process.env.PK_B64 as string;
  const keypair = Ed25519Keypair.fromSecretKey(fromB64(b64PrivateKey).slice(1));
  const address = `${keypair.getPublicKey().toSuiAddress()}`;

  if (!process.env.NETWORK) {
    throw new Error("env var NETWORK not configured");
  }

  const suiClient = new SuiClient({
    url: getFullnodeUrl(
      process.env.NETWORK as "mainnet" | "testnet" | "devnet" | "localnet",
    ),
  });

  return { address, keypair, suiClient };
}

async function addCoinToOracleCaller() {
  let tx = new Transaction();
  const adminCapId = constants.ADMIN_CAP_ID;
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    1,
    1000,
  );

  return tx;
}

async function updatePricesCaller() {
  const { suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(suiClient);
  let tx = new Transaction();
  return await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    // "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  ]);
}

async function setPrice(
  coinType: string,
  price: number,
  ema: number,
  conf: number,
) {
  let tx = new Transaction();
  const priceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(price)],
  });
  const emaPriceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(ema)],
  });
  const confNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(conf)],
  });
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });
  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::set_price_remove_for_mainnet`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      coinTypeName,
      emaPriceNumnber,
      priceNumnber,
      confNumnber,
      tx.object(constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  const coinTypeName1 = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  const oraclePriceInfo = tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::get_price_info`,
    arguments: [tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID), coinTypeName1],
  });

  const oracleMutObject = tx.moveCall({
    target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::get_oracle_mut`,
    arguments: [tx.object(constants.LENDING_PROTOCOL_ID)],
  });

  tx.moveCall({
    target: `${constants.ALPHALEND_PACKAGE_ID}::oracle::update_price`,
    arguments: [oracleMutObject, oraclePriceInfo],
  });

  return tx;
}

async function run() {
  const { suiClient, keypair } = getExecStuff();
  const tx = await setPrice(
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    1,
    1,
    0,
  );
  // const tx = await addCoinToOracleCaller();
  if (tx) {
    tx.setGasBudget(100_000_000);

    suiClient
      .signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        requestType: "WaitForLocalExecution",
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      })
      .then((res) => {
        console.log(JSON.stringify(res, null, 2));
      })
      .catch((error) => {
        console.error(error);
      });
  }
}
// updatePricesCaller();
run();
