import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "../dist/esm/index.js";
import { displayPortfolio, handleError, validateAddress, getRpcUrl } from "./lib/portfolioDisplay.mjs";

/**
 * Example: Get User Portfolio (Local Build)
 *
 * This example uses the local build from ../dist/esm/index.js
 *
 * Prerequisites:
 *   cd ..
 *   npm run build
 *
 * Usage:
 *   USER_ADDRESS=0x... node getUserPortfolioLocal.mjs
 */

async function main() {
  const userAddress = process.env.USER_ADDRESS || "0x...";
  const network = process.env.NETWORK || "mainnet";

  if (!validateAddress(userAddress)) {
    process.exit(1);
  }

  console.log(`\nTesting with Local Build (../dist/esm/index.js)`);
  console.log(`Fetching portfolio for ${userAddress} on ${network}...`);

  const suiClient = new SuiClient({ url: getRpcUrl(network) });
  const alphalendClient = new AlphalendClient(network, suiClient);

  try {
    console.log("Initializing Alphalend client and fetching coin metadata...");
    const portfolio = await alphalendClient.getUserPortfolio(userAddress);
    displayPortfolio(portfolio);
    console.log("✅ Test completed successfully with local build!");
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

main().catch(console.error);
