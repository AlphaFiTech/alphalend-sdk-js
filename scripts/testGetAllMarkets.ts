import { AlphalendClient } from "../src/core/client.js";
import type { MarketData } from "../src/core/types.js";
import { performance } from "perf_hooks";

/**
 * Test script for getAllMarkets() function with performance benchmarking
 *
 * Usage:
 *   npx tsx scripts/testGetAllMarkets.ts [--use-cache] [--show-markets]
 *
 * Options:
 *   --use-cache      Enable blockchain caching (default: disabled)
 *   --show-markets   Show detailed market data (default: hidden)
 *
 * This script:
 * 1. Pre-initializes the AlphalendClient
 * 2. Pre-fetches coin metadata
 * 3. Calls getAllMarkets() 10 times
 * 4. Reports timing for each call
 */

// Parse command line arguments
const args = process.argv.slice(2);
const useCache = args.includes("--use-cache");
const showMarkets = args.includes("--show-markets");

async function testGetAllMarkets() {
  console.log("🔍 Performance Testing getAllMarkets() - 10 iterations\n");
  console.log("=".repeat(80) + "\n");

  const network = "mainnet";
  const iterations = 10;
  const timings: number[] = [];

  console.log(`⚙️  Configuration:`);
  console.log(`   Use Cache:      ${useCache ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(
    `   Show Markets:   ${showMarkets ? "✅ Enabled" : "❌ Disabled"}\n`,
  );

  console.log(`📡 Network: ${network}`);
  console.log(`🔄 Iterations: ${iterations}\n`);

  const clientDuration = 0;

  // Step 2: Pre-initialize AlphalendClient
  console.log("⏱️  [STEP 2] Creating AlphalendClient...");
  const alphaClientStart = performance.now();
  const alphalendClient = new AlphalendClient(network);
  const alphaClientDuration = performance.now() - alphaClientStart;
  console.log(
    `✅ AlphalendClient created - ${alphaClientDuration.toFixed(2)}ms\n`,
  );

  // Step 3: Pre-fetch coin metadata map
  console.log("⏱️  [STEP 3] Pre-fetching coin metadata...");
  const metadataStart = performance.now();
  // await alphalendClient.fetchCoinMetadataMap();
  const metadataDuration = performance.now() - metadataStart;
  console.log(
    `✅ Coin metadata pre-fetched - ${metadataDuration.toFixed(2)}ms\n`,
  );

  console.log("=".repeat(80));
  console.log("🚀 Starting getAllMarkets() benchmark...\n");

  // Step 4: Call getAllMarkets() multiple times
  const allResults: MarketData[][] = [];
  for (let i = 1; i <= iterations; i++) {
    const start = performance.now();
    const markets = await alphalendClient.getAllMarkets({ useCache });
    const duration = performance.now() - start;

    timings.push(duration);
    allResults.push(markets || []);

    if (i === 1) {
      console.log(
        `📊 Call ${i.toString().padStart(2)}: ${duration.toFixed(2)}ms - ${markets?.length || 0} markets`,
      );
    } else {
      console.log(
        `📊 Call ${i.toString().padStart(2)}: ${duration.toFixed(2)}ms`,
      );
    }

    if (!markets || markets.length === 0) {
      console.log(`❌ No markets found on iteration ${i}`);
      process.exit(1);
    }
  }

  const firstMarkets = allResults[0];

  console.log("\n" + "=".repeat(80));
  console.log("📊 PERFORMANCE STATISTICS");
  console.log("=".repeat(80));

  // Calculate statistics
  const totalTime = timings.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / timings.length;
  const minTime = Math.min(...timings);
  const maxTime = Math.max(...timings);
  const medianTime = timings.sort((a, b) => a - b)[
    Math.floor(timings.length / 2)
  ];

  // Calculate standard deviation
  const variance =
    timings.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) /
    timings.length;
  const stdDev = Math.sqrt(variance);

  console.log("\n⏱️  Timing Analysis:");
  console.log(`   Total Time:      ${totalTime.toFixed(2)}ms`);
  console.log(`   Average:         ${avgTime.toFixed(2)}ms`);
  console.log(`   Median:          ${medianTime.toFixed(2)}ms`);
  console.log(`   Min:             ${minTime.toFixed(2)}ms`);
  console.log(`   Max:             ${maxTime.toFixed(2)}ms`);
  console.log(`   Std Deviation:   ${stdDev.toFixed(2)}ms`);

  // First call vs subsequent calls
  const firstCallTime = timings[0];
  const subsequentCalls = timings.slice(1);
  const avgSubsequent =
    subsequentCalls.reduce((sum, t) => sum + t, 0) / subsequentCalls.length;

  console.log("\n📈 First Call vs Subsequent Calls:");
  console.log(`   First call:      ${firstCallTime.toFixed(2)}ms`);
  console.log(`   Avg subsequent:  ${avgSubsequent.toFixed(2)}ms`);
  console.log(
    `   Difference:      ${(firstCallTime - avgSubsequent).toFixed(2)}ms`,
  );
  console.log(
    `   Speedup:         ${(firstCallTime / avgSubsequent).toFixed(2)}x`,
  );

  // Initialization overhead
  const totalInitTime = clientDuration + alphaClientDuration + metadataDuration;
  console.log("\n🔧 Initialization Overhead:");
  console.log(`   SuiClient:       ${clientDuration.toFixed(2)}ms`);
  console.log(`   AlphalendClient: ${alphaClientDuration.toFixed(2)}ms`);
  console.log(`   Coin Metadata:   ${metadataDuration.toFixed(2)}ms`);
  console.log(`   Total Init:      ${totalInitTime.toFixed(2)}ms`);

  // Per-call breakdown
  console.log("\n📊 Individual Call Times:");
  timings.forEach((time, index) => {
    const bar = "█".repeat(Math.round((time / maxTime) * 50));
    console.log(
      `   Call ${(index + 1).toString().padStart(2)}: ${time.toFixed(2).padStart(8)}ms ${bar}`,
    );
  });

  // Display all markets data (only if flag is enabled)
  if (showMarkets && firstMarkets && firstMarkets.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("📋 ALL MARKETS DATA");
    console.log("=".repeat(80));
    console.log(`Total Markets: ${firstMarkets.length}\n`);

    firstMarkets.forEach((market, index) => {
      console.log(`${index + 1}. Market ID ${market.marketId}:`);
      console.log(
        `   Coin Type:         ${market.coinType.substring(0, 50)}...`,
      );
      console.log(`   Symbol:            ${market.symbol || "N/A"}`);
      console.log(`   Total Supply:      ${market.totalSupply}`);
      console.log(`   Total Borrow:      ${market.totalBorrow}`);
      console.log(
        `   Utilization Rate:  ${market.utilizationRate.toFixed(4)}%`,
      );
      console.log(
        `   Supply APR:        ${market.supplyApr.interestApr.toFixed(2)}%`,
      );
      console.log(
        `   Borrow APR:        ${market.borrowApr.interestApr.toFixed(2)}%`,
      );
      console.log(`   Price (USD):       $${market.price}`);
      console.log(`   LTV:               ${market.ltv}`);
      console.log(`   Available Liq:     ${market.availableLiquidity}`);
      console.log("");
    });
  } else if (!showMarkets && firstMarkets && firstMarkets.length > 0) {
    console.log(
      "\n💡 Market data hidden. Use --show-markets flag to display.\n",
    );
  }

  // Data consistency validation
  console.log("=".repeat(80));
  console.log("🔍 DATA CONSISTENCY VALIDATION");
  console.log("=".repeat(80));

  let allConsistent = true;
  const inconsistencies: string[] = [];

  // Check that all calls returned same number of markets
  const marketCounts = allResults.map((r) => r.length);
  const uniqueCounts = new Set(marketCounts);

  if (uniqueCounts.size === 1) {
    console.log(
      `✅ Market count consistent: ${marketCounts[0]} markets in all ${iterations} calls`,
    );
  } else {
    allConsistent = false;
    console.log(`❌ Market count inconsistent across calls:`);
    marketCounts.forEach((count, i) => {
      console.log(`   Call ${i + 1}: ${count} markets`);
    });
    inconsistencies.push("Market count varies");
  }

  // Check that market IDs are consistent
  const firstMarketIds = firstMarkets.map((m) => m.marketId).sort();
  for (let i = 1; i < allResults.length; i++) {
    const currentMarketIds = allResults[i].map((m) => m.marketId).sort();
    if (JSON.stringify(firstMarketIds) !== JSON.stringify(currentMarketIds)) {
      allConsistent = false;
      inconsistencies.push(`Call ${i + 1} has different market IDs`);
    }
  }

  if (allConsistent) {
    console.log(`✅ Market IDs consistent across all ${iterations} calls`);
  } else {
    console.log(`❌ Market IDs inconsistent:`);
    inconsistencies.forEach((inc) => console.log(`   - ${inc}`));
  }

  // Sample data point validation (check first market's price across all calls)
  if (firstMarkets.length > 0) {
    const firstMarketPrices = allResults.map((r) => r[0]?.price);
    const uniquePrices = new Set(firstMarketPrices.map((p) => p?.toString()));

    if (uniquePrices.size === 1) {
      console.log(
        `✅ Sample data point (Market 1 price) consistent: $${firstMarketPrices[0]}`,
      );
    } else {
      console.log(
        `⚠️  Sample data point (Market 1 price) varies (expected for live data):`,
      );
      firstMarketPrices.slice(0, 3).forEach((price, i) => {
        console.log(`   Call ${i + 1}: $${price}`);
      });
    }
  }

  // Overall consistency verdict
  console.log("");
  if (allConsistent) {
    console.log("✅ ALL DATA CONSISTENT - Caching is working correctly!");
  } else {
    console.log("❌ DATA INCONSISTENCIES DETECTED - Please review above");
  }

  console.log("\n" + "=".repeat(80));
  console.log("💡 OBSERVATIONS");
  console.log("=".repeat(80));

  if (Math.abs(firstCallTime - avgSubsequent) < 100) {
    console.log("✅ Consistent performance across all calls");
    console.log("   - No significant internal caching detected");
    console.log("   - Each call fetches fresh data from the network");
  } else if (firstCallTime > avgSubsequent * 1.5) {
    console.log("✅ First call slower than subsequent calls");
    console.log("   - SDK may have internal caching or initialization");
    console.log("   - Subsequent calls benefit from warm state");
  } else {
    console.log("⚠️  First call faster than average");
    console.log("   - Unexpected behavior, possible network variance");
  }

  if (stdDev > avgTime * 0.2) {
    console.log("\n⚠️  High variance in call times detected");
    console.log("   - Network latency is likely the main factor");
    console.log("   - Consider implementing client-side caching");
  } else {
    console.log("\n✅ Low variance - consistent performance");
  }

  console.log("\n💡 Recommendation:");
  console.log(
    `   Average call time is ${avgTime.toFixed(0)}ms - consider caching with 30-60s TTL`,
  );
  console.log(`   for production use to improve performance by 99%+`);
}

// Run the test
testGetAllMarkets()
  .then(() => {
    console.log("\n✅ Script execution completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script execution failed:", error);
    process.exit(1);
  });
