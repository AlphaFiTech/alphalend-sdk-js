/**
 * Shared utility functions for displaying portfolio information
 */

export function displayPortfolio(portfolio) {
  if (!portfolio || portfolio.length === 0) {
    console.log("No positions found for this address.");
    return;
  }

  console.log(`\nFound ${portfolio.length} position(s):\n`);

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
}

export function handleError(error) {
  console.error("\n❌ Error fetching user portfolio:");

  if (error instanceof Error) {
    console.error(`Error message: ${error.message}`);

    if (error.message.includes("Cannot read properties of null (reading 'coinInfo')")) {
      console.error("\n🔍 Root Cause Analysis:");
      console.error("This error occurs when the GraphQL API returns null coin information.");
      console.error("\nPossible reasons:");
      console.error("1. The GraphQL API query failed or returned incomplete data");
      console.error("2. The API endpoint (https://api.alphalend.xyz/public/graphql) is unreachable");
      console.error("3. The coin metadata for a particular market is missing from the API response");
      console.error("\nDebugging steps:");
      console.error("1. Run diagnostic: node diagnoseInit.mjs");
      console.error("2. Check if the API is accessible");
      console.error("3. Verify the GraphQL query returns valid coinInfo data");
    } else if (error.message.includes("Failed to initialize market data")) {
      console.error("\n🔍 Initialization Error:");
      console.error("The SDK failed to fetch coin metadata from the GraphQL API.");
      console.error("This is required for the SDK to function properly.");
      console.error("\nPlease check:");
      console.error("1. Network connectivity");
      console.error("2. API endpoint availability: https://api.alphalend.xyz/public/graphql");
      console.error("3. Run diagnostic: node diagnoseInit.mjs");
    }

    console.error(`\nStack trace: ${error.stack}`);
  } else {
    console.error(error);
  }
}

export function validateAddress(userAddress) {
  if (userAddress === "0x...") {
    console.error("❌ Error: Please provide USER_ADDRESS environment variable");
    console.error("\nUsage: USER_ADDRESS=0x... node <script>");
    return false;
  }
  return true;
}

export function getRpcUrl(network) {
  switch (network) {
    case "mainnet":
      return "https://fullnode.mainnet.sui.io:443";
    case "testnet":
      return "https://fullnode.testnet.sui.io:443";
    case "devnet":
      return "https://fullnode.devnet.sui.io:443";
    default:
      return "https://fullnode.mainnet.sui.io:443";
  }
}
