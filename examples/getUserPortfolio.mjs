import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "../dist/esm/index.js";

/**
 * Example: Get User Portfolio
 *
 * This example demonstrates how to fetch a user's portfolio from the Alphalend protocol.
 *
 * The error "Cannot read properties of null (reading 'coinInfo')" occurs when:
 * 1. The GraphQL API returns null for some coin information
 * 2. The coinMetadataMap doesn't have the required coin type
 * 3. The initialization hasn't completed successfully
 */

async function main() {
  // Replace with your test address or use a known active address
  const userAddress = process.env.USER_ADDRESS || "0x...";

  // Choose network: "mainnet", "testnet", or "devnet"
  const network = process.env.NETWORK || "mainnet";

  console.log(`Fetching portfolio for ${userAddress} on ${network}...`);

  // Initialize Sui client
  const rpcUrl =
    network === "mainnet"
      ? "https://fullnode.mainnet.sui.io:443"
      : network === "testnet"
      ? "https://fullnode.testnet.sui.io:443"
      : "https://fullnode.devnet.sui.io:443";

  const suiClient = new SuiClient({ url: rpcUrl });

  // Initialize Alphalend client
  const alphalendClient = new AlphalendClient(network, suiClient);

  try {
    console.log("Initializing Alphalend client and fetching coin metadata...");

    // The getUserPortfolio method will automatically trigger initialization
    // through ensureInitialized() which calls fetchAndCacheCoinMetadata()
    const portfolio = await alphalendClient.getUserPortfolio(userAddress);

    if (!portfolio || portfolio.length === 0) {
      console.log("No positions found for this address.");
      return;
    }

    console.log(`\nFound ${portfolio.length} position(s):\n`);

    // Display portfolio information
    portfolio.forEach((position, index) => {
      console.log(`Position #${index + 1}:`);
      console.log(`  Position ID: ${position.positionId}`);
      console.log(`  Net Worth: $${position.netWorth.toFixed(2)}`);
      console.log(`  Total Supplied: $${position.totalSuppliedUsd.toFixed(2)}`);
      console.log(`  Total Borrowed: $${position.totalBorrowedUsd.toFixed(2)}`);
      console.log(`  Safe Borrow Limit: $${position.safeBorrowLimit.toFixed(2)}`);
      console.log(`  Borrow Limit Used: $${position.borrowLimitUsed.toFixed(2)}`);
      console.log(`  Net APR: ${position.netApr.toFixed(2)}%`);
      console.log(`  Daily Earnings: $${position.dailyEarnings.toFixed(4)}`);
      console.log(`  Rewards to Claim: $${position.rewardsToClaimUsd.toFixed(2)}`);

      if (position.suppliedAmounts.size > 0) {
        console.log(`  Supplied Assets:`);
        position.suppliedAmounts.forEach((amount, marketId) => {
          if (amount.gt(0)) {
            console.log(`    Market ${marketId}: ${amount.toFixed(6)}`);
          }
        });
      }

      if (position.borrowedAmounts.size > 0) {
        console.log(`  Borrowed Assets:`);
        position.borrowedAmounts.forEach((amount, marketId) => {
          if (amount.gt(0)) {
            console.log(`    Market ${marketId}: ${amount.toFixed(6)}`);
          }
        });
      }

      if (position.rewardsToClaim.length > 0) {
        console.log(`  Claimable Rewards:`);
        position.rewardsToClaim.forEach((reward) => {
          console.log(`    ${reward.coinType}: ${reward.rewardAmount.toFixed(6)}`);
        });
      }

      console.log();
    });

  } catch (error) {
    console.error("\n❌ Error fetching user portfolio:");

    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);

      // Check if this is the specific coinInfo error
      if (error.message.includes("Cannot read properties of null (reading 'coinInfo')")) {
        console.error("\n🔍 Root Cause Analysis:");
        console.error("This error occurs when the GraphQL API returns null coin information.");
        console.error("\nPossible reasons:");
        console.error("1. The GraphQL API query failed or returned incomplete data");
        console.error("2. The API endpoint (https://api.alphalend.xyz/public/graphql) is unreachable");
        console.error("3. The coin metadata for a particular market is missing from the API response");
        console.error("\nDebugging steps:");
        console.error("1. Check if the API is accessible");
        console.error("2. Verify the GraphQL query returns valid coinInfo data");
        console.error("3. Ensure all markets have corresponding coin metadata in the API");
      }

      if (error.message.includes("Failed to initialize market data")) {
        console.error("\n🔍 Initialization Error:");
        console.error("The SDK failed to fetch coin metadata from the GraphQL API.");
        console.error("This is required for the SDK to function properly.");
        console.error("\nPlease check:");
        console.error("1. Network connectivity");
        console.error("2. API endpoint availability: https://api.alphalend.xyz/public/graphql");
        console.error("3. GraphQL API response format");
      }

      console.error(`\nStack trace: ${error.stack}`);
    } else {
      console.error(error);
    }
  }
}

// Run the example
main().catch(console.error);
