import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromB64 } from "@mysten/sui/utils";
import { getConstants } from "../src/constants/index.js";
import { AlphalendClient } from "../src/core/client.js";
import * as dotenv from "dotenv";
import { setPrices } from "../src/utils/helper.js";
import { SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";

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
  const { suiClient, address } = getExecStuff();
  txb.setSender(address);
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

async function zapInSupply() {
  const { suiClient, keypair } = getExecStuff();
  let alc = new AlphalendClient("mainnet", suiClient);
  const tx = await alc.zapInSupply({
    address:
      "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3",
    positionCapId:
      "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d",
    marketId: "2",
    slippage: 0.01,
    marketCoinType:
      "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
    inputAmount: 100_000_000n,
    inputCoinType: "0x2::sui::SUI",
  });
  if (tx) {
    // dryRunTransactionBlock(tx);
    // await suiClient
    //   .signAndExecuteTransaction({
    //     signer: keypair,
    //     transaction: tx,
    //     requestType: "WaitForLocalExecution",
    //     options: {
    //       showEffects: true,
    //       showBalanceChanges: true,
    //       showObjectChanges: true,
    //     },
    //   })
    //   .then((res) => {
    //     console.log(JSON.stringify(res, null, 2));
    //   })
    //   .catch((error) => {
    //     console.error(error);
    //   });
  }
}
// zapInSupply();

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
  // res?.forEach((market) => {
  //   let supplyApr = market.supplyApr.interestApr;
  //   market.supplyApr.rewards.forEach((reward) => {
  //     supplyApr = supplyApr.add(reward.rewardApr);
  //   });
  //   supplyApr = supplyApr.add(market.supplyApr.stakingApr);
  //   let borrowApr = market.borrowApr.interestApr;
  //   market.borrowApr.rewards.forEach((reward) => {
  //     borrowApr = borrowApr.sub(reward.rewardApr);
  //   });
  //   console.log("Market#", market.marketId);
  //   console.log("Supply APR:", supplyApr.toString());
  //   console.log("Borrow APR:", borrowApr.toString());
  // });
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
getUserPortfolio();

async function withdraw() {
  const { suiClient } = getExecStuff();
  let tx: Transaction | undefined;
  let alc = new AlphalendClient("mainnet", suiClient);
  tx = await alc.withdraw({
    address:
      "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3",
    positionCapId:
      "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d",
    coinType:
      "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
    marketId: "2",
    amount: 1_000_000_000n,
    priceUpdateCoinTypes: [
      "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
      "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
      "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
      "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
      "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
      "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
      "0x4c981f3ff786cdb9e514da897ab8a953647dae2ace9679e8358eec1e3e8871ac::dmc::DMC",
    ],
  });
  if (tx) {
    dryRunTransactionBlock(tx);
  }
}
// withdraw();

async function run() {
  const { suiClient, keypair, address } = getExecStuff();
  // const tx = new Transaction();
  const constants = getConstants("mainnet");
  const pythClient = new SuiPythClient(
    suiClient,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const pythConnection = new SuiPriceServiceConnection(
    "https://hermes.pyth.network",
  );
  const positionCapId =
    "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d";
  // await getPriceInfoObjectIdsWithUpdate(
  //   tx,
  //   [pythPriceFeedIdMap[coinType]],
  //   pythClient,
  //   pythConnection,
  // );

  // console.log(pythPriceFeedIdMap[coinType]);
  // const priceInfoObjectIds = await pythClient.getPriceFeedObjectId(
  //   "c591a547856b091560b120ee14b165a84ca58eca23b2ab635df641340bde1f10",
  // );

  // const priceFeedUpdateData = await pythConnection.getPriceFeedsUpdateData([
  //   pythPriceFeedIdMap[coinType],
  // ]);

  // const priceInfoObjectIds = await pythClient.createPriceFeed(
  //   tx,
  //   priceFeedUpdateData,
  // );
  // console.log(priceInfoObjectIds);
  const alc = new AlphalendClient("mainnet", suiClient);
  const tx = await alc.zapInSupply({
    marketId: "1",
    slippage: 0.01,
    address: address,
    marketCoinType: "0x2::sui::SUI",
    inputAmount: 100_000n,
    inputCoinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    positionCapId,
  });
  // const tx = await alc.zapOutWithdraw({
  //   marketId: "1",
  //   slippage: 0.01,
  //   address,
  //   marketCoinType: "0x2::sui::SUI",
  //   amount: 18446744073709551615n,
  //   outputCoinType:
  //     "0x87dfe1248a1dc4ce473bd9cb2937d66cdc6c30fee63f3fe0dbb55c7a09d35dec::up::UP",
  //   positionCapId,
  //   priceUpdateCoinTypes: [
  //     "0x2::sui::SUI",
  //     "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
  //     "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  //     "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
  //     "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
  //     "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  //     "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
  //     "0x4c981f3ff786cdb9e514da897ab8a953647dae2ace9679e8358eec1e3e8871ac::dmc::DMC",
  //   ],
  // });
  // // tx.setGasBudget(1e9);
  if (tx) {
    dryRunTransactionBlock(tx);

    // await suiClient
    //   .signAndExecuteTransaction({
    //     signer: keypair,
    //     transaction: tx,
    //     requestType: "WaitForLocalExecution",
    //     options: {
    //       showEffects: true,
    //       showBalanceChanges: true,
    //       showObjectChanges: true,
    //     },
    //   })
    //   .then((res) => {
    //     console.log(JSON.stringify(res, null, 2));
    //   })
    //   .catch((error) => {
    //     console.error(error);
    //   });
  }
}
// run();
