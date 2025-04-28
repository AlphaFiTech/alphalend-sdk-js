import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  ObjectRef,
  Transaction,
  UpgradePolicy,
} from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../constants/index.js";
import { addCoinToOracle, updatePythIdentifierForCoin } from "./oracle.js";
import { AlphalendClient } from "../core/client.js";
import * as dotenv from "dotenv";
import { Decimal } from "decimal.js";
import { setPrices } from "../utils/helper.js";
import path from "path";
import { homedir } from "os";
import { execSync } from "child_process";

dotenv.config();

const constants = getConstants("testnet");

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
  const { suiClient } = getExecStuff();
  txb.setSender(
    "0xa1eb94d1700652aa85b417b46fa6775575b8b98d3352d864fb5146eb45d335fb",
  );
  txb.setGasBudget(1e9);
  try {
    let serializedTxb = await txb.build({ client: suiClient });
    suiClient
      .dryRunTransactionBlock({
        transactionBlock: serializedTxb,
      })
      .then((res) => {
        console.log(JSON.stringify(res, null, 2));
        // console.log(res.effects.status, res.balanceChanges);
      })
      .catch((error) => {
        console.error(error);
      });
  } catch (e) {
    console.log(e);
  }
}

async function addCoinToOracleCaller(tx: Transaction) {
  const { suiClient } = getExecStuff();
  const adminCapId = constants.ALPHAFI_ORACLE_ADMIN_CAP_ID;
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    1,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    1,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin3::TESTCOIN3",
    1,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin4::TESTCOIN4",
    0,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin5::TESTCOIN5",
    0,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin6::TESTCOIN6",
    1,
    1000,
    "testnet",
    suiClient,
  );
  await addCoinToOracle(
    tx,
    adminCapId,
    "0x2::sui::SUI",
    1,
    1000,
    "testnet",
    suiClient,
  );

  return tx;
}

async function updatePricesCaller() {
  const { suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient("testnet", suiClient);
  let tx = new Transaction();
  return await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    // "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  ]);
}

async function claimRewards() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined = new Transaction();
  // await addCoinToOracleCaller(tx);
  await setPrices(tx);
  let alc = new AlphalendClient("testnet", suiClient);
  tx = await alc.claimRewards({
    address:
      "0xa511088cc13a632a5e8f9937028a77ae271832465e067360dd13f548fe934d1a",
    positionCapId:
      "0x8465d2416b01d3e76460912cd290e5dd9c4a36cfbe52f348cfe04e8ae769de4e",
    priceUpdateCoinTypes: [],
    claimAll: false,
    claimAlpha: false,
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// updatePricesCaller();

async function borrow() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  let alc = new AlphalendClient("testnet", suiClient);
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

export async function executeTransactionBlock() {
  const { keypair, suiClient } = getExecStuff();
  const tx = new Transaction();
  const alphalendClient = new AlphalendClient("testnet", suiClient);
  await alphalendClient.updatePrices(tx, ["0x2::sui::SUI"]);
  await suiClient
    .signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
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
// executeTransactionBlock();

async function setPriceCaller() {
  const tx = new Transaction();
  const { suiClient } = getExecStuff();
  // await updatePythIdentifierForCoin(
  //   tx,
  //   "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
  //   suiClient,
  //   "mainnet",
  // );

  updatePythIdentifierForCoin(
    tx,
    "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
    suiClient,
    "mainnet"
  );

  if (tx) {
    dryRunTransactionBlock(tx);
    // executeTransactionBlock(tx);
  }
}
setPriceCaller();

// withdraw();

// borrow();
// claimRewards();

async function withdraw() {
  const { suiClient, keypair } = getExecStuff();
  let tx: Transaction | undefined;
  let alc = new AlphalendClient("testnet", suiClient);
  tx = await alc.withdraw({
    address:
      "0xa511088cc13a632a5e8f9937028a77ae271832465e067360dd13f548fe934d1a",
    positionCapId:
      "0x8465d2416b01d3e76460912cd290e5dd9c4a36cfbe52f348cfe04e8ae769de4e",
    coinType: "0x2::sui::SUI",
    marketId: "6",
    amount: new Decimal(1000000000),
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// withdraw();

async function upgradePackageDryRun() {
  const { suiClient } = getExecStuff();
  const txb = new Transaction();
  const multiSigAddress =
    "0xa1eb94d1700652aa85b417b46fa6775575b8b98d3352d864fb5146eb45d335fb";
  // <------------  -------------->

  // Path to Move contracts
  const pathToContracts = path.join(
    homedir(),
    "work",
    "alphalend",
    "alphalend-contracts",
    "alphafi_oracle",
  );
  const { modules, dependencies, digest } = JSON.parse(
    execSync(
      `sui move build --dump-bytecode-as-base64 --path ${pathToContracts}`,
      { encoding: "utf-8" },
    ),
  );

  const packageId =
    "0x378b2a104e8bcd7ed0317f5e6a0ec4fd271d4d12e2fe6c99bcd1f12be725cf4f";

  const upgradeCapId =
    "0x003f74baef0bc40394b59dfc134516435ac0750a1b55dd3bfdb0ffc68559019d";

  const cap = txb.object(upgradeCapId);

  // // Create a ticket for the upgrade
  const ticket = txb.moveCall({
    target: `0x2::package::authorize_upgrade`,
    arguments: [
      cap,
      txb.pure.u8(UpgradePolicy.COMPATIBLE),
      txb.pure.vector("u8", digest),
    ],
  });

  // // Define the upgrade transaction
  const result = txb.upgrade({
    modules,
    dependencies,
    package: packageId,
    ticket,
  });

  // // Commit the upgrade
  txb.moveCall({
    target: `0x2::package::commit_upgrade`,
    arguments: [cap, result],
  });

  // Fetch coins to set as gas payment
  const res = await suiClient.getCoins({
    owner: multiSigAddress,
    coinType: "0x2::sui::SUI",
  });

  const coin = res.data.find((coin) => {
    return Number(coin.balance) >= 1_000_000_000;
  });

  if (!coin) {
    console.error("Multisig address has less than 1 Sui");
    process.exit(1);
  }
  txb.setGasPayment([
    {
      objectId: coin.coinObjectId,
      version: coin.version,
      digest: coin.digest,
    } as ObjectRef,
  ]);

  if (txb) {
    dryRunTransactionBlock(txb);
  }
}
// upgradePackageDryRun();
