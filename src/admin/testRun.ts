import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../constants/index.js";
import { addCoinToOracle } from "./oracle.js";
import { AlphalendClient } from "../core/client.js";
import * as dotenv from "dotenv";
import { setPrice } from "../utils/helper.js";

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

async function run() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  // await addCoinToOracleCaller(tx);
  let alc = new AlphalendClient(suiClient);
  tx = await alc.claimRewards({
    address:
      "0xa511088cc13a632a5e8f9937028a77ae271832465e067360dd13f548fe934d1a",
    positionCapId:
      "0x5c455d275a6cd3d9bb5bf91f8a47bffc07574b5df0960093e016a33c6987de9c",
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// updatePricesCaller();
run();
