/**
 * Shared Sui JSON-RPC helpers for scripts (@mysten/sui 2.x).
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import * as dotenv from "dotenv";

dotenv.config();

export type ScriptNetwork = "mainnet" | "testnet" | "devnet";

function parseNetwork(network: string): ScriptNetwork {
  if (network === "mainnet" || network === "testnet" || network === "devnet") {
    return network;
  }
  throw new Error(`Invalid NETWORK: ${network}`);
}

export function getSuiJsonRpcClient(
  network: string = "devnet",
): SuiJsonRpcClient {
  const n = parseNetwork(network);
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(n),
    network: n,
  });
}

/** Alias kept for older scripts that used `getSuiClient`. */
export const getSuiClient = getSuiJsonRpcClient;

export function getExecStuff() {
  if (!process.env.PK_B64) {
    throw new Error("env var PK_B64 not configured");
  }

  if (!process.env.NETWORK) {
    throw new Error("env var NETWORK not configured");
  }

  const b64PrivateKey = process.env.PK_B64;
  const keypair = Ed25519Keypair.fromSecretKey(fromB64(b64PrivateKey).slice(1));
  const address = keypair.getPublicKey().toSuiAddress();
  const suiClient = getSuiJsonRpcClient(process.env.NETWORK);

  return { address, keypair, suiClient };
}

const defaultTxOptions = {
  showEffects: true,
  showBalanceChanges: true,
  showObjectChanges: true,
} as const;

export async function dryRunTransactionBlock(txb: Transaction): Promise<void> {
  const { suiClient, address } = getExecStuff();
  txb.setSender(address);
  txb.setGasBudget(1_000_000_000);

  try {
    const serializedTxb = await txb.build({ client: suiClient });
    const res = await suiClient.dryRunTransactionBlock({
      transactionBlock: serializedTxb,
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (error) {
    console.error(error);
  }
}

export async function signAndExecuteTransaction(
  txb: Transaction,
): Promise<SuiTransactionBlockResponse> {
  const { keypair, suiClient, address } = getExecStuff();
  txb.setSenderIfNotSet(address);

  return suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: txb,
    options: defaultTxOptions,
  });
}

/** @deprecated use signAndExecuteTransaction */
export const executeTransactionBlock = signAndExecuteTransaction;

export async function devInspectTransactionBlock(
  txb: Transaction,
  sender: string,
): Promise<void> {
  const { suiClient } = getExecStuff();
  txb.setSender(sender);

  try {
    const res = await suiClient.devInspectTransactionBlock({
      transactionBlock: txb,
      sender,
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (error) {
    console.error(error);
  }
}

/** @deprecated use devInspectTransactionBlock */
export const simulateTransactionBlock = devInspectTransactionBlock;
