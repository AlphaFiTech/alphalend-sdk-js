/**
 * Diagnostic Script: Test SDK Initialization
 *
 * This script helps diagnose initialization issues by:
 * 1. Testing the GraphQL API endpoint
 * 2. Fetching and displaying coin metadata
 * 3. Identifying any null or missing data
 */

async function testGraphQLAPI() {
  const apiUrl = "https://api.alphalend.xyz/public/graphql";

  console.log("=".repeat(80));
  console.log("AlphaLend SDK Initialization Diagnostic");
  console.log("=".repeat(80));

  console.log(`\n1. Testing GraphQL API endpoint: ${apiUrl}\n`);

  const query = `
    query {
      coinInfo {
        coinType
        pythPriceFeedId
        pythPriceInfoObjectId
        decimals
        pythSponsored
        symbol
        coingeckoPrice
        pythPrice
      }
    }
  `;

  try {
    console.log("Sending GraphQL query...");
    const startTime = Date.now();

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${duration}ms`);
    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ GraphQL request failed with status ${response.status}`);
      const text = await response.text();
      console.error("Response body:", text);
      return;
    }

    const result = await response.json();

    if (result.errors) {
      console.error("❌ GraphQL errors:", JSON.stringify(result.errors, null, 2));
      return;
    }

    const coinInfoArray = result.data?.coinInfo;

    if (!coinInfoArray) {
      console.error("❌ No coinInfo data in response");
      console.error("Response:", JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\n2. Analyzing coin metadata (${coinInfoArray.length} coins found)\n`);

    let validCoins = 0;
    let coinsWithIssues = 0;
    const issues = [];

    coinInfoArray.forEach((coin, index) => {
      const hasAllRequiredFields =
        coin.coinType &&
        coin.pythSponsored !== null &&
        coin.decimals &&
        coin.symbol;

      if (hasAllRequiredFields) {
        validCoins++;
      } else {
        coinsWithIssues++;
        const missingFields = [];
        if (!coin.coinType) missingFields.push("coinType");
        if (coin.pythSponsored === null) missingFields.push("pythSponsored");
        if (!coin.decimals) missingFields.push("decimals");
        if (!coin.symbol) missingFields.push("symbol");

        issues.push(
          `  Coin #${index + 1}: ${coin.symbol || "UNKNOWN"} - Missing: ${missingFields.join(", ")}`
        );
      }
    });

    console.log(`✅ Valid coins: ${validCoins}`);
    console.log(`⚠️  Coins with issues: ${coinsWithIssues}`);

    if (coinsWithIssues > 0) {
      console.log("\nIssues found:");
      issues.forEach((issue) => console.log(issue));
    }

    console.log("\n3. Sample coin data:\n");

    // Show first 5 valid coins
    const validSampleCoins = coinInfoArray
      .filter(
        (coin) =>
          coin.coinType &&
          coin.pythSponsored !== null &&
          coin.decimals &&
          coin.symbol
      )
      .slice(0, 5);

    validSampleCoins.forEach((coin) => {
      console.log(`Symbol: ${coin.symbol}`);
      console.log(`  Coin Type: ${coin.coinType}`);
      console.log(`  Decimals: ${coin.decimals}`);
      console.log(`  Pyth Sponsored: ${coin.pythSponsored}`);
      console.log(`  Pyth Price Feed ID: ${coin.pythPriceFeedId || "N/A"}`);
      console.log(`  Pyth Price: ${coin.pythPrice || "N/A"}`);
      console.log(`  CoinGecko Price: ${coin.coingeckoPrice || "N/A"}`);
      console.log();
    });

    console.log("\n4. Testing SDK initialization simulation:\n");

    const coinMetadataMap = new Map();
    let processedCoins = 0;
    let skippedCoins = 0;

    for (const coin of coinInfoArray) {
      if (
        coin.coinType &&
        coin.pythSponsored !== null &&
        coin.decimals &&
        coin.symbol
      ) {
        coinMetadataMap.set(coin.coinType, {
          coinType: coin.coinType,
          pythPriceFeedId: coin.pythPriceFeedId,
          pythPriceInfoObjectId: coin.pythPriceInfoObjectId,
          decimals: coin.decimals,
          pythSponsored: coin.pythSponsored,
          symbol: coin.symbol,
          coingeckoPrice: coin.coingeckoPrice,
          pythPrice: coin.pythPrice,
        });
        processedCoins++;
      } else {
        skippedCoins++;
      }
    }

    console.log(`✅ Processed ${processedCoins} coins into metadata map`);
    if (skippedCoins > 0) {
      console.log(`⚠️  Skipped ${skippedCoins} coins due to missing required fields`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("Diagnosis Summary");
    console.log("=".repeat(80));

    if (coinsWithIssues === 0) {
      console.log("✅ All checks passed! The SDK should initialize successfully.");
    } else {
      console.log("⚠️  Issues detected that may cause initialization problems:");
      console.log(`   - ${coinsWithIssues} coin(s) have missing required fields`);
      console.log("   - These coins will be skipped during initialization");
      console.log("   - If your portfolio uses these coins, you may encounter errors");
    }

    console.log("\nNext Steps:");
    console.log("1. If you see this diagnostic run successfully, try running:");
    console.log("   USER_ADDRESS=your_address node examples/getUserPortfolio.mjs");
    console.log("2. If you encounter errors, please share this diagnostic output with support");

  } catch (error) {
    console.error("\n❌ Error during diagnostic:\n");
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    } else {
      console.error(error);
    }

    console.log("\nPossible causes:");
    console.log("1. No internet connection");
    console.log("2. API endpoint is down or unreachable");
    console.log("3. Firewall or proxy blocking the request");
    console.log("4. Network timeout");
  }
}

// Run the diagnostic
testGraphQLAPI().catch(console.error);
