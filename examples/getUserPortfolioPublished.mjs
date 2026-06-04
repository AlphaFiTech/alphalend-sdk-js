import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { AlphalendClient } from "@alphafi/alphalend-sdk";
import { displayPortfolio, handleError, validateAddress, getRpcUrl } from "./lib/portfolioDisplay.mjs";

/**
 * Example: Get User Portfolio (Published SDK v3.0.0)
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

  console.log(`\nTesting with Published SDK (@alphafi/alphalend-sdk@3.0.0)`);
  console.log(`Fetching portfolio for ${userAddress} on ${network}...`);

  const suiClient = new SuiJsonRpcClient({ url: getRpcUrl(network), network });
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
