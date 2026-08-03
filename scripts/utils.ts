import { fromBase64 } from "@mysten/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";

import * as dotenv from "dotenv";
import { Transaction } from "@mysten/sui/transactions";

dotenv.config();

type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

/** Default gRPC endpoints, overridable via the SUI_GRPC_URL env var. */
const GRPC_URL: Record<SuiNetwork, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  localnet: "http://127.0.0.1:9000",
};

export function getExecStuff() {
  if (!process.env.PK_B64) {
    throw new Error("env var PK_B64 not configured");
  }

  const b64PrivateKey = process.env.PK_B64 as string;
  const keypair = Ed25519Keypair.fromSecretKey(
    fromBase64(b64PrivateKey).slice(1),
  );
  const address = `${keypair.getPublicKey().toSuiAddress()}`;

  if (!process.env.NETWORK) {
    throw new Error("env var NETWORK not configured");
  }

  const network = process.env.NETWORK as SuiNetwork;
  const suiClient = new SuiGrpcClient({
    network,
    baseUrl: process.env.SUI_GRPC_URL ?? GRPC_URL[network],
  });

  return { address, keypair, suiClient };
}

export async function executeTransactionBlock(txb: Transaction) {
  const { keypair, suiClient } = getExecStuff();

  try {
    const res = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      include: {
        effects: true,
        balanceChanges: true,
        objectTypes: true,
      },
    });
    // Replaces the JSON-RPC "WaitForLocalExecution" request type.
    await suiClient.waitForTransaction({ result: res });
    console.log(JSON.stringify(res, null, 2));
  } catch (error) {
    console.error(error);
  }
}

export async function dryRunTransactionBlock(txb: Transaction) {
  const { suiClient, address } = getExecStuff();
  txb.setSender(address);
  try {
    const res = await suiClient.simulateTransaction({
      transaction: txb,
      include: {
        effects: true,
        balanceChanges: true,
      },
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.log(e);
  }
}

export async function simulateTransactionBlock(
  txb: Transaction,
  address: string,
) {
  const { suiClient } = getExecStuff();
  txb.setSender(address);
  try {
    // suiClient
    //   .devInspectTransactionBlock({
    //     transactionBlock: txb,
    //     sender: address,
    //   })
    //   .then((res) => {
    //     console.log(JSON.stringify(res, null, 2));
    //     // console.log(res.effects.status, res.balanceChanges);
    //   })
    //   .catch((error) => {
    //     console.error(error);
    //   });
    // checksEnabled: false mirrors devInspectTransactionBlock, allowing
    // non-entry/non-public functions to be inspected.
    const res = await suiClient.simulateTransaction({
      transaction: txb,
      checksEnabled: false,
      include: {
        effects: true,
        commandResults: true,
      },
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.log(e);
  }
}
