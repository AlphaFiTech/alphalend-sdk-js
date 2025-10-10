import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "@alphafi/alphalend-sdk";
import { displayPortfolio, handleError, validateAddress, getRpcUrl } from "./lib/portfolioDisplay.mjs";

/**
 * Example: Get User Portfolio (Published SDK v1.1.20)
 *
 * This example uses the published @alphafi/alphalend-sdk package from npm.
 *
 * Setup:
 *   cd examples
 *   npm install
 *
 * Usage:
 *   USER_ADDRESS=0x... node getUserPortfolioPublished.mjs
 */

async function main() {
  const userAddress = process.env.USER_ADDRESS || "0x...";
  const network = process.env.NETWORK || "mainnet";

  if (!validateAddress(userAddress)) {
    process.exit(1);
  }

  console.log(`\nTesting with Published SDK (@alphafi/alphalend-sdk@1.1.20)`);
  console.log(`Fetching portfolio for ${userAddress} on ${network}...`);

  const suiClient = new SuiClient({ url: getRpcUrl(network) });
  const alphalendClient = new AlphalendClient(network, suiClient);

  try {
    console.log("Initializing Alphalend client and fetching coin metadata...");
    const portfolio = await alphalendClient.getUserPortfolio(userAddress);
    displayPortfolio(portfolio);
    console.log("✅ Test completed successfully with published SDK!");
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

main().catch(console.error);
