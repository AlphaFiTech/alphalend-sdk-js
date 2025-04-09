import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import * as dotenv from "dotenv";
import { getConstants } from "../constants/index.js";
import { addCoinToOracle } from "./oracle.js";
import { AlphalendClient } from "../core/client.js";

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
  const { suiClient } = getExecStuff();
  const pythClient = new SuiPythClient(
    suiClient,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const pythConnection = new SuiPriceServiceConnection(
    "https://hermes.pyth.network",
    // "https://hermes-beta.pyth.network"
  );
  const adminCapId = constants.ADMIN_CAP_ID;
  tx = await addCoinToOracle(tx, adminCapId, "SUI", pythClient, pythConnection);

  return tx;
}

async function updatePricesCaller() {
  const { suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(suiClient);
  let tx = new Transaction();
  tx = await alphalendClient.updatePrices(tx, ["STSUI"]);
  return tx;
}

async function run() {
  const { suiClient } = getExecStuff();
  const tx = await updatePricesCaller();
  tx.setGasBudget(100_000_000);

  // suiClient
  //   .signAndExecuteTransaction({
  //     signer: keypair,
  //     transaction: tx,
  //     requestType: "WaitForLocalExecution",
  //     options: {
  //       showEffects: true,
  //       showObjectChanges: true,
  //     },
  //   })
  //   .then((res) => {
  //     console.log(JSON.stringify(res, null, 2));
  //   })
  //   .catch((error) => {
  //     console.error(error);
  //   });
  const wormholeStateId =
    "0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a";
  const pythStateId =
    "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";

  const client = new SuiPythClient(suiClient, pythStateId, wormholeStateId);
  const object = await client.getPriceFeedObjectId(
    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  );
  console.log(object);
}
addCoinToOracleCaller();
run();

//0x2e4a789fc4620614e6b6b3d9962bdb4dec12506e4c30f97972a29f47b6dc87bc
