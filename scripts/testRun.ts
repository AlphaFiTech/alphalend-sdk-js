import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../src/constants/index.js";
import { addCoinToOracle } from "../src/admin/oracle.js";
import { AlphalendClient } from "../src/core/client.js";
import * as dotenv from "dotenv";
import { Decimal } from "decimal.js";
import { setPrices } from "../src/utils/helper.js";
import { SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { pythPriceFeedIdMap } from "../src/utils/priceFeedIds.js";

dotenv.config();

export function getSuiClient(network?: string) {
  const mainnetUrl = "https://fullnode.mainnet.sui.io/";
  const testnetUrl = "https://fullnode.testnet.sui.io/";
  const devnetUrl = "https://fullnode.devnet.sui.io/";

  let rpcUrl = devnetUrl;
  if (network === "mainnet") {
    rpcUrl = mainnetUrl;
  } else if (network === "testnet") {
    rpcUrl = testnetUrl;
  }

  return new SuiClient({
    url: rpcUrl,
  });
}

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

  const suiClient = getSuiClient(process.env.NETWORK);

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
    claimAll: false,
    claimAlpha: false,
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}

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
    amount: 100000000000n,
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}

function setAlternate(txb: Transaction) {
  const constants = getConstants("testnet");
  const suiTypeName = txb.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: ["0x2::sui::SUI"],
  });
  const walTypeName = txb.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    ],
  });
  txb.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::add_alternate_price_identifier`,
    arguments: [
      txb.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      txb.object(constants.ALPHAFI_ORACLE_ADMIN_CAP_ID),
      walTypeName,
      suiTypeName,
    ],
  });
}

function removeAlternate(txb: Transaction) {
  const constants = getConstants("testnet");
  const walTypeName = txb.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [
      "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    ],
  });
  txb.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::remove_alternate_price_identifier`,
    arguments: [
      txb.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      txb.object(constants.ALPHAFI_ORACLE_ADMIN_CAP_ID),
      walTypeName,
    ],
  });
}

export async function executeTransactionBlock() {
  const { keypair, suiClient } = getExecStuff();
  const tx = new Transaction();
  const constants = getConstants("testnet");
  // removeAlternate(tx);
  // await removeCoinFromOracle(
  //   tx,
  //   constants.ALPHAFI_ORACLE_ADMIN_CAP_ID,
  //   "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
  //   "testnet",
  // );
  // await setPrice(tx, "0x2::sui::SUI", 10, 10, 1);
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

async function getAllMarkets() {
  const client = new AlphalendClient("mainnet", getSuiClient("mainnet"));
  const res = await client.getAllMarkets();
  console.log(res);
}
// getAllMarkets();

async function getUserPortfolio() {
  const client = new AlphalendClient("mainnet", getSuiClient("mainnet"));
  const res = await client.getUserPortfolio(
    "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3",
  );
  console.log(res);
}
// getUserPortfolio();

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
    amount: 1000000000n,
    priceUpdateCoinTypes: [],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}

async function run(coinType: string) {
  const { suiClient, keypair } = getExecStuff();
  const tx = new Transaction();
  const constants = getConstants("mainnet");
  const pythClient = new SuiPythClient(
    suiClient,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const pythConnection = new SuiPriceServiceConnection(
    "https://hermes.pyth.network",
  );

  // console.log(pythPriceFeedIdMap[coinType]);
  // const priceInfoObjectIds = await pythClient.getPriceFeedObjectId(
  //   pythPriceFeedIdMap[coinType],
  // );

  // const priceFeedUpdateData = await pythConnection.getPriceFeedsUpdateData([
  //   pythPriceFeedIdMap[coinType],
  // ]);

  // const priceInfoObjectIds = await pythClient.createPriceFeed(
  //   tx,
  //   priceFeedUpdateData,
  // );
  const alc = new AlphalendClient("mainnet", suiClient);
  await alc.updatePrices(tx, [coinType]);
  tx.setGasBudget(1e9);
  dryRunTransactionBlock(tx);

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
run(
  "0x4c981f3ff786cdb9e514da897ab8a953647dae2ace9679e8358eec1e3e8871ac::dmc::DMC",
);
