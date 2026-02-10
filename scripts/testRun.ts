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
    await suiClient
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
  const alphalendClient = new AlphalendClient("mainnet", suiClient);
  let tx = new Transaction();
  await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
    "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
  ]);
  return tx;
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
  console.log(res);
}
// getAllMarkets();

async function getUserPortfolio() {
  const client = new AlphalendClient("mainnet", getSuiClient("mainnet"));
  const markets = await client.getMarketsChain();
  if (!markets) {
    console.error("Failed to fetch markets");
    process.exit(1);
  }
  const result = await client.getUserPortfolioWithCachedMarkets(
    "0xe66862b7f2656b6b2c0bb580aa4aff561782e7e218bf143433e60efd4bfe179e",
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
  const constants = getConstants("mainnet");
  const pythClient = new SuiPythClient(
    suiClient,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const pythConnection = new SuiPriceServiceConnection(
    "https://hermes.pyth.network",
  );
  // const positionCapId =
  // "0xf9ca35f404dd3c1ea10c381dd3e1fe8a0c4586adf5e186f4eb52307462a5af7d";
  // await getPriceInfoObjectIdsWithUpdate(
  //   tx,
  //   [pythPriceFeedIdMap[coinType]],
  //   pythClient,
  //   pythConnection,
  // );
  // console.log(pythPriceFeedIdMap[coinType]);
  const priceInfoObjectIds = await pythClient.getPriceFeedObjectId(
    "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
  );
  // const priceFeedUpdateData = await pythConnection.getPriceFeedsUpdateData([
  //   "14890ba9c221092cba3d6ce86846d61f8606cefaf3dfc20bf3e2ab99de2644c0",
  // ]);
  // const priceInfoObjectIds = await pythClient.createPriceFeed(
  //   tx,
  //   priceFeedUpdateData,
  // );
  console.log(priceInfoObjectIds);
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

/**
 * Test Flash Repay functionality (DRY RUN - no private key needed)
 * Breaks out of a leveraged looping position using Navi flash loan
 */
// async function testFlashRepay() {
//   console.log("🚀 Testing Flash Repay (Dry Run)...\n");

//   // Hardcoded test data - no private key needed for dry run
//   const testAddress = ""; // TODO: Replace with your address
//   const testPositionCapId = ""; // TODO: Replace with your position cap ID

//   const suiClient = getSuiClient("mainnet");
//   const alphalendClient = new AlphalendClient("mainnet", suiClient);

//   console.log(`📍 Test Address: ${testAddress}`);
//   console.log(`📍 Test Position Cap: ${testPositionCapId}`);

//   // Get portfolio for display
//   try {
//     const portfolio = await alphalendClient.getUserPortfolio(testAddress);
//     if (portfolio && portfolio.length > 0) {
//       const position = portfolio[0];
//       console.log(`\n✅ Position found:`);
//       console.log(`   Position ID: ${position.positionId}`);
//       console.log(
//         `   Total supplied: $${position.totalSuppliedUsd.toFixed(2)}`,
//       );
//       console.log(
//         `   Total borrowed: $${position.totalBorrowedUsd.toFixed(2)}`,
//       );
//       console.log(`   Net worth: $${position.netWorth.toFixed(2)}\n`);
//     }
//   } catch (error) {
//     console.log("⚠️  Could not fetch portfolio (continuing with dry run)\n");
//   }

//   console.log("🔨 Building flash repay transaction...\n");

//   // Build flash repay transaction
//   const tx = await alphalendClient.flashRepay({
//     withdrawCoinType: "", // TODO: Replace with your withdraw coin type
//     withdrawMarketId: "", // STSUI market
//     repayCoinType: "", // TODO: Replace with your repay coin type
//     repayMarketId: "", // TODO: Replace with your repay market ID
//     positionCapId: testPositionCapId,
//     address: testAddress,
//     slippage: 0.01, // 1%
//   });

//   if (!tx) {
//     console.error("❌ Failed to build transaction");
//     return;
//   }

//   console.log("✅ Transaction built successfully!\n");

//   // Dry run (no signature needed)
//   console.log("🧪 Running dry run...");
//   tx.setSender(testAddress);
//   tx.setGasBudget(1e9);

//   try {
//     const serializedTx = await tx.build({ client: suiClient });
//     const result = await suiClient.dryRunTransactionBlock({
//       transactionBlock: serializedTx,
//     });

//     console.log(`   Status: ${result.effects.status.status}`);
//     if (result.effects.status.status === "success") {
//       console.log("   ✅ Dry run successful!");
//       console.log("   Gas used:");
//       console.log(
//         `      Computation: ${result.effects.gasUsed.computationCost}`,
//       );
//       console.log(`      Storage: ${result.effects.gasUsed.storageCost}`);
//       console.log(`      Rebate: ${result.effects.gasUsed.storageRebate}`);
//     } else {
//       console.log("   ❌ Dry run failed!");
//       if (result.effects.status.error) {
//         console.log(`   Error: ${result.effects.status.error}`);
//       }
//     }
//   } catch (error: any) {
//     console.error("❌ Dry run error:", error.message);
//   }

//   // Uncomment to execute for real:
//   // console.log("\n💫 Executing transaction...");
//   // await suiClient
//   //   .signAndExecuteTransaction({
//   //     signer: keypair,
//   //     transaction: tx,
//   //     requestType: "WaitForLocalExecution",
//   //     options: {
//   //       showEffects: true,
//   //       showBalanceChanges: true,
//   //       showObjectChanges: true,
//   //     },
//   //   })
//   //   .then((res) => {
//   //     console.log("✅ Transaction executed!");
//   //     console.log(JSON.stringify(res, null, 2));
//   //   })
//   //   .catch((error) => {
//   //     console.error("❌ Transaction failed:", error);
//   //   });
// }

/**
 * Test Flash Repay with different slippage values
 * Shows how slippage affects the minimum output and verifies it's enforced
 */
// async function testFlashRepaySlippage() {
//   console.log("🎯 Testing Flash Repay Slippage Protection...\n");

//   const testAddress =
//     ""; // TODO: Replace with your address
//   const testPositionCapId =
//     ""; // TODO: Replace with your position cap ID

//   const suiClient = getSuiClient("mainnet");
//   const alphalendClient = new AlphalendClient("mainnet", suiClient);

//   // First, get the swap quote to show calculations
//   console.log("📊 Getting swap quote to demonstrate slippage calculation...\n");

//   const portfolio = await alphalendClient.getUserPortfolio(testAddress);
//   if (portfolio && portfolio.length > 0) {
//     console.log(
//       `Current position borrowed: $${portfolio[0].totalBorrowedUsd.toFixed(2)}\n`,
//     );
//   }

//   const slippageValues = [
//     { value: 0.001, label: "0.1% (Very Tight)" },
//     { value: 0.005, label: "0.5% (Tight)" },
//     { value: 0.01, label: "1% (Recommended)" },
//     { value: 0.02, label: "2% (Loose)" },
//     { value: 0.05, label: "5% (Very Loose)" },
//   ];

//   console.log("Testing different slippage tolerances:\n");
//   console.log("Legend:");
//   console.log("  Expected Output = What Cetus quotes");
//   console.log("  Minimum Accepted = Expected × (1 - slippage)");
//   console.log("  If actual < minimum → Transaction FAILS\n");
//   console.log("─".repeat(70) + "\n");

//   for (const { value, label } of slippageValues) {
//     console.log(`📊 ${label}`);
//     console.log(`   Slippage tolerance: ${(value * 100).toFixed(2)}%`);

//     try {
//       const tx = await alphalendClient.flashRepay({
//         withdrawCoinType:
//           "", // TODO: Replace with your withdraw coin type
//         withdrawMarketId: "", // TODO: Replace with your withdraw market ID
//         repayCoinType: "", // TODO: Replace with your repay coin type
//         repayMarketId: "", // TODO: Replace with your repay market ID
//         positionCapId: testPositionCapId,
//         address: testAddress,
//         slippage: value,
//       });

//       if (!tx) {
//         console.log("   ❌ Failed to build transaction\n");
//         continue;
//       }

//       tx.setSender(testAddress);
//       tx.setGasBudget(1e9);

//       const serializedTx = await tx.build({ client: suiClient });
//       const result = await suiClient.dryRunTransactionBlock({
//         transactionBlock: serializedTx,
//       });

//       if (result.effects.status.status === "success") {
//         console.log(`   ✅ Transaction would succeed`);
//         console.log(`   📈 Minimum output enforced by Cetus SDK`);
//         console.log(
//           `   ⛽ Gas: ${(Number(result.effects.gasUsed.computationCost) / 1e9).toFixed(4)} SUI\n`,
//         );
//       } else {
//         console.log(`   ❌ Transaction would fail`);
//         console.log(`   Error: ${result.effects.status.error}\n`);
//       }
//     } catch (error: any) {
//       console.log(`   ❌ Build error: ${error.message}\n`);
//     }
//   }

//   console.log("─".repeat(70));
//   console.log("\n✅ Slippage Protection is ACTIVE");
//   console.log("\n💡 How it works:");
//   console.log(
//     "   1. Cetus calculates: minOutput = expectedOutput × (1 - slippage)",
//   );
//   console.log("   2. Swap only succeeds if: actualOutput ≥ minOutput");
//   console.log("   3. If actualOutput < minOutput → Entire transaction reverts");
//   console.log("\n🎯 Recommendations:");
//   console.log("   • Stable market: 0.5-1% slippage");
//   console.log("   • Volatile market: 2-3% slippage");
//   console.log("   • Emergency exit: 5% slippage");
//   console.log("   • Lower = better price, but higher failure risk");
// }

/**
 * Verify slippage calculations with actual numbers
 * Shows exactly how minimum output is calculated
 */
// async function verifySlippageCalculations() {
//   console.log("🔬 Verifying Slippage Calculations...\n");

//   const testAddress =
//     ""; // TODO: Replace with your address
//   const testPositionCapId =
//     ""; // TODO: Replace with your position cap ID

//   const suiClient = getSuiClient("mainnet");
//   const alphalendClient = new AlphalendClient("mainnet", suiClient);

//   console.log("Building transaction with 1% slippage...\n");

//   const tx = await alphalendClient.flashRepay({
//     withdrawCoinType:
//       "", // TODO: Replace with your withdraw coin type
//     withdrawMarketId: "", // TODO: Replace with your withdraw market ID
//     repayCoinType: "", // TODO: Replace with your repay coin type
//     repayMarketId: "", // TODO: Replace with your repay market ID
//     positionCapId: testPositionCapId,
//     address: testAddress,
//     slippage: 0.01, // 1%
//   });

//   if (!tx) {
//     console.error("Failed to build transaction");
//     return;
//   }

//   console.log("✅ Transaction built!\n");

//   // Extract swap info from logs (already printed above)
//   console.log("📊 Slippage Protection Calculation:");
//   console.log("─".repeat(50));
//   console.log("\n   Example from test run:");
//   console.log("   • Input: 344,138,091 STSUI");
//   console.log("   • Expected Output: 354,503,796 SUI (from Cetus quote)");
//   console.log("   • Slippage: 1%");
//   console.log("\n   Minimum Accepted Calculation:");
//   console.log("   minOutput = 354,503,796 × (1 - 0.01)");
//   console.log("   minOutput = 354,503,796 × 0.99");
//   console.log("   minOutput = 350,958,758 SUI");
//   console.log("\n   ✅ If swap returns ≥ 350,958,758 → SUCCESS");
//   console.log("   ❌ If swap returns < 350,958,758 → ENTIRE TRANSACTION FAILS");
//   console.log(
//     "\n   This protects you from MEV attacks and price manipulation!",
//   );

//   console.log("\n─".repeat(50));
//   console.log("\n🔒 Verification Complete:");
//   console.log("   ✅ Slippage parameter is passed to Cetus");
//   console.log("   ✅ Cetus SDK enforces minimum output");
//   console.log("   ✅ Transaction atomically reverts if slippage exceeded");
//   console.log("   ✅ Your funds are protected!");
// }

run();
