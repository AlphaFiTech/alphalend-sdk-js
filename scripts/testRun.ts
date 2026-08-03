import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { getConstants } from "../src/constants/index.js";
import { AlphalendClient } from "../src/core/client.js";
import * as dotenv from "dotenv";
import { setPrices } from "../src/utils/helper.js";
import { SuiGrpcClient } from "@mysten/sui/grpc";

dotenv.config();

export function getSuiClient(network?: string) {
  const mainnetUrl = "https://fullnode.mainnet.sui.io:443";
  const testnetUrl = "https://fullnode.testnet.sui.io:443";
  const devnetUrl = "https://fullnode.devnet.sui.io:443";

  let grpcUrl = devnetUrl;
  if (network === "mainnet") {
    grpcUrl = mainnetUrl;
  } else if (network === "testnet") {
    grpcUrl = testnetUrl;
  }

  return new SuiGrpcClient({
    network: network ?? "mainnet",
    baseUrl: process.env.SUI_GRPC_URL ?? grpcUrl,
  });
}

const constants = getConstants("testnet");

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

  const suiClient = getSuiClient(process.env.NETWORK);

  return { address, keypair, suiClient };
}

export async function dryRunTransactionBlock(
  txb: Transaction,
  address: string,
) {
  const { suiClient } = getExecStuff();
  txb.setSender(address);
  txb.setGasBudget(1e8);
  try {
    const res = await suiClient.simulateTransaction({
      transaction: txb,
      include: {
        effects: true,
        balanceChanges: true,
      },
    });
    console.log(JSON.stringify(res, null, 2));
    // console.log(res.effects.status, res.balanceChanges);
  } catch (e) {
    console.log(e);
  }
}

async function updatePricesCaller() {
  const alphalendClient = new AlphalendClient("mainnet");
  const tx = new Transaction();
  await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
    "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
  ]);
  return tx;
}

async function claimRewards() {
  let tx: Transaction | undefined = new Transaction();
  // await addCoinToOracleCaller(tx);
  await setPrices(tx);
  const address =
    "0xa511088cc13a632a5e8f9937028a77ae271832465e067360dd13f548fe934d1a";
  const alc = new AlphalendClient("testnet");
  tx = await alc.claimRewards({
    address: address,
    positionCapId:
      "0x8465d2416b01d3e76460912cd290e5dd9c4a36cfbe52f348cfe04e8ae769de4e",
    claimAll: false,
    claimAlpha: false,
  });
  if (tx) {
    dryRunTransactionBlock(tx, address);
  }
}

async function zapInSupply() {
  const alc = new AlphalendClient("mainnet");
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
  const alc = new AlphalendClient("mainnet");
  const address =
    "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";
  const tx: Transaction | undefined = await alc.borrow({
    address: address,
    positionCapId:
      "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d",
    coinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    marketId: "6",
    amount: 100_000n,
    priceUpdateCoinTypes: [
      "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI",
      "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
      "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
    ],
  });
  if (tx) {
    // dryRunTransactionBlock(tx, address);
    await executeTransactionBlock(tx);
  }
}
// borrow();

export async function executeTransactionBlock(tx: Transaction) {
  const { keypair, suiClient } = getExecStuff();
  const constants = getConstants("mainnet");
  tx.setGasBudget(1e8);
  try {
    const res = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
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
// executeTransactionBlock();

async function getAllMarkets() {
  const client = new AlphalendClient("mainnet");
  const res = await client.getAllMarkets();
  console.log(res);
}
// getAllMarkets();

async function getUserPortfolio() {
  const client = new AlphalendClient("mainnet");
  const markets = await client.getMarketsChain();
  if (!markets) {
    console.error("Failed to fetch markets");
    process.exit(1);
  }
  const result = await client.getUserPortfolioWithCachedMarkets(
    "0x8e3ab1581df48a7bdb72fa8d2138877c432420c503a4a9f03b762387f9dcd600",
    markets,
  );
  console.log(result);
  // const res = await client.getUserPortfolio(
  //   "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3",
  // );
  // console.log(res);
}
// getUserPortfolio();

async function withdraw() {
  const alc = new AlphalendClient("mainnet");
  const address =
    "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";
  const tx: Transaction | undefined = await alc.withdraw({
    address: address,
    positionCapId:
      "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d",
    coinType:
      "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    marketId: "7",
    amount: 1n,
    priceUpdateCoinTypes: [
      "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
      "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI",
      "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    ],
  });
  if (tx) {
    // dryRunTransactionBlock(tx, address);
    executeTransactionBlock(tx);
  }
}
withdraw();

async function supply() {
  const alc = new AlphalendClient("mainnet");
  const address =
    "0xe136f0b6faf27ee707725f38f2aeefc51c6c31cc508222bee5cbc4f5fcf222c3";
  const tx: Transaction | undefined = await alc.supply({
    address: address,
    positionCapId:
      "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d",
    coinType:
      "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
    marketId: "21",
    amount: 100_000_000n,
  });
  if (tx) {
    executeTransactionBlock(tx);
  }
}
// supply();

async function run() {
  const { keypair, address } = getExecStuff();
  // 🔥 TEST FLASH REPAY
  // Choose which test to run:
  // Basic flash repay test (with default 1% slippage)
  // await testFlashRepay();
  // Compare different slippage values (uncomment to compare)
  // await testFlashRepaySlippage();
  // Verify slippage calculations
  // await verifySlippageCalculations();
  // Other tests (commented out)
  // const { suiClient, keypair, address } = getExecStuff();
  // const tx = new Transaction();
  // const positionCapId =
  // "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d";
  // const tx = await updatePricesCaller();
  // const tx = await alc.supply({
  //   marketId: "1",
  //   address,
  //   coinType: "0x2::sui::SUI",
  //   amount: 100_000_000n,
  //   positionCapId,
  // });
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
  // if (tx) {
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
  // }
}
// run();
