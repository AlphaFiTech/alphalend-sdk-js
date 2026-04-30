import { AlphalendClient } from "../src/core/client.js";
import {
  getExecStuff,
  dryRunTransactionBlock,
  executeTransactionBlock,
} from "./utils.js";
import { getConstants } from "../src/constants/index.js";
import * as dotenv from "dotenv";

dotenv.config();

const network =
  (process.env.NETWORK as "mainnet" | "testnet" | "devnet") || "mainnet";

/**
 * Test adding collateral (supplying) to an Alphalend market
 */
async function addCollateral() {
  const { address, suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(network);

  // Example parameters - should be adjusted for actual testing
  const tx = await alphalendClient.supply({
    marketId: "2", // Example: SUI market ID
    amount: 10000n,
    coinType: getConstants(network).USDC_COIN_TYPE,
    address,
    // positionCapId: "YOUR_POSITION_CAP_ID", // Optional for new position
  });

  if (tx) {
    tx.setGasBudget(2e8);
    await dryRunTransactionBlock(tx);
    // await executeTransactionBlock(tx);
  } else {
    console.error("Failed to build supply transaction");
  }
}

/**
 * Test removing collateral (withdrawing) from an Alphalend market
 */
async function removeCollateral() {
  const { address, suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(network);
  const positionCapId =
    (await alphalendClient.getUserPositionCapIdFromAddress(address))!;

  const tx = await alphalendClient.withdraw({
    marketId: "2",
    amount: 5000n,
    coinType: getConstants(network).USDC_COIN_TYPE,
    positionCapId, // Required
    address,
    priceUpdateCoinTypes: [
      getConstants(network).USDC_COIN_TYPE,
      getConstants(network).SUI_COIN_TYPE,
    ], // Prices must be updated for withdrawals
  });

  if (tx) {
    tx.setGasBudget(2e8);
    await dryRunTransactionBlock(tx);
    // await executeTransactionBlock(tx);
  } else {
    console.error("Failed to build withdraw transaction");
  }
}

/**
 * Test borrowing from an Alphalend market
 */
async function borrow() {
  const { address, suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(network);
  const positionCapId =
    (await alphalendClient.getUserPositionCapIdFromAddress(address))!;
  const tx = await alphalendClient.borrow({
    marketId: "2", // Example: USDC market ID
    amount: 1000n, // 1 USDC (assuming 6 decimals)
    coinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    positionCapId, // Required
    address,
    priceUpdateCoinTypes: [
      "0x2::sui::SUI",
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    ],
  });

  if (tx) {
    tx.setGasBudget(2e8);
    await dryRunTransactionBlock(tx);
    // await executeTransactionBlock(tx);
  } else {
    console.error("Failed to build borrow transaction");
  }
}

/**
 * Test repaying debt to an Alphalend market
 */
async function repay() {
  const { address, suiClient } = getExecStuff();
  const alphalendClient = new AlphalendClient(network);
  const positionCapId =
    (await alphalendClient.getUserPositionCapIdFromAddress(address))!;
  const tx = await alphalendClient.repay({
    marketId: "2",
    amount: 100n,
    coinType:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    positionCapId,
    address,
  });

  if (tx) {
    tx.setGasBudget(2e8);
    await dryRunTransactionBlock(tx);
    // await executeTransactionBlock(tx);
  } else {
    console.error("Failed to build repay transaction");
  }
}
//function to get portfolio from position cap id

async function getPortfolioFromPositionCapId(positionCapId: string) {
  const alphalendClient = new AlphalendClient(network);
  const portfolio =
    await alphalendClient.getUserPortfolioFromPositionCapId(positionCapId);
  console.log("Portfolio:", portfolio); // Log the portfolio;
}

// Example usage: uncomment the function you want to test
// addCollateral().catch(console.error);
// removeCollateral().catch(console.error);
// borrow().catch(console.error);
repay().catch(console.error);
// getPortfolioFromPositionCapId(
//   "0x13ebdfb2c93b744e897eb043c52921329056f2956aaf7f018af3d5a4781838a6",
// ).catch(console.error);
