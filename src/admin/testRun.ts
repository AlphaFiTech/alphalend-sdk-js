import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../constants/index.js";
import { addCoinToOracle } from "./oracle.js";
import { AlphalendClient } from "../core/client.js";
import * as dotenv from "dotenv";
import { setPrice } from "../utils/helper.js";
import { Decimal } from "decimal.js";

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
export async function dryRunTransactionBlock(txb: Transaction) {
  const { suiClient, address } = getExecStuff();
  txb.setSender(address);
  // txb.setGasBudget(4e9);
  console.log("address", address);
  try {
    let serializedTxb = await txb.build({ client: suiClient });
    suiClient
      .dryRunTransactionBlock({
        transactionBlock: serializedTxb,
      })
      .then((res) => {
        console.log(res.effects.status, res.balanceChanges);
      })
      .catch((error) => {
        console.error(error);
      });
  } catch (e) {
    console.log(e);
  }
}
async function addCoinToOracleCaller(tx: Transaction) {
  const adminCapId = constants.ALPHAFI_ORACLE_ADMIN_CAP_ID;
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin4::TESTCOIN4",
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

async function claimRewards() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  // await addCoinToOracleCaller(tx);
  let alc = new AlphalendClient(suiClient);
  tx = await alc.claimRewards({
    address:
      "0x8948f801fa2325eedb4b0ad4eb0a55bfb318acc531f3a2f0cddd8daa9b4a8c94",
    positionCapId:
      "0x04aef463126fea9cc518a37abc8ae8367f68c8eceeef31790b2da6be852d9d4b",
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// updatePricesCaller();

async function borrow() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  let alc = new AlphalendClient(suiClient);
  tx = await alc.borrow({
    address:
      "0x8948f801fa2325eedb4b0ad4eb0a55bfb318acc531f3a2f0cddd8daa9b4a8c94",
    positionCapId:
      "0x04aef463126fea9cc518a37abc8ae8367f68c8eceeef31790b2da6be852d9d4b",
    coinType:
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    marketId: "2",
    amount: new Decimal(100000000000),
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
export async function executeTransactionBlock(txb: Transaction) {
  const { keypair, suiClient } = getExecStuff();

  await suiClient
    .signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showBalanceChanges: true,
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
async function setPriceCaller() {
  const tx = new Transaction();
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin3::TESTCOIN3",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin4::TESTCOIN4",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin5::TESTCOIN5",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin6::TESTCOIN6",
    1,
    1,
    1,
  );
  await setPrice(tx, "0x2::sui::SUI", 1, 1, 1);

  if (tx) {
    // dryRunTransactionBlock(tx);
    executeTransactionBlock(tx);
  }
}
// setPriceCaller();

// withdraw();

// borrow();
// claimRewards();

async function withdraw() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  let alc = new AlphalendClient(suiClient);
  tx = await alc.withdraw({
    address:
      "0x8948f801fa2325eedb4b0ad4eb0a55bfb318acc531f3a2f0cddd8daa9b4a8c94",
    positionCapId:
      "0x04aef463126fea9cc518a37abc8ae8367f68c8eceeef31790b2da6be852d9d4b",
    coinType:
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    marketId: "1",
    amount: new Decimal(100000000000),
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// withdraw();
