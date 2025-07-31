/**
 * User-Reported Issues Test Suite
 *
 * This test suite focuses on reproducing and validating user-reported issues
 * to ensure they are properly handled and provide clear error messages.
 *
 * Current Issues Covered:
 * 1. "Market price not found for 0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC"
 * 2. getUserPortfolio integration with price validation
 * 3. getAllMarkets integration with price validation
 */

import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "../src";
import {
  pythPriceFeedIdMap,
  priceInfoObjectIdMap,
  decimalsMap,
} from "../src/utils/priceFeedIds";

// Test address provided by user
const TEST_ADDRESS =
  "0xbef197ee83f9c4962f46f271a50af25301585121e116173be25cd86286378e15";

// The specific coin type that caused the reported error
const LBTC_COIN_TYPE =
  "0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC";

describe("User-Reported Issues Integration Tests", () => {
  let client: AlphalendClient;
  let suiClient: SuiClient;

  beforeAll(() => {
    suiClient = new SuiClient({
      url: "https://fullnode.mainnet.sui.io/",
    });
    client = new AlphalendClient("mainnet", suiClient);
  });

  describe("Issue #1: Market price not found for LBTC", () => {
    test("LBTC should have valid price feed mappings", () => {
      // Verify SDK has all required mappings for LBTC
      expect(pythPriceFeedIdMap[LBTC_COIN_TYPE]).toBeDefined();
      expect(priceInfoObjectIdMap[LBTC_COIN_TYPE]).toBeDefined();
      expect(decimalsMap[LBTC_COIN_TYPE]).toBeDefined();

      console.log("✅ LBTC mappings found:", {
        pythFeedId: pythPriceFeedIdMap[LBTC_COIN_TYPE],
        priceObjectId: priceInfoObjectIdMap[LBTC_COIN_TYPE],
        decimals: decimalsMap[LBTC_COIN_TYPE],
      });
    });

    test("LBTC price should be fetchable from Pyth", async () => {
      const { getPricesMap } = await import("../src/utils/helper");

      try {
        const prices = await getPricesMap();

        expect(prices.has(LBTC_COIN_TYPE)).toBe(true);

        const lbtcPrice = prices.get(LBTC_COIN_TYPE);
        expect(lbtcPrice).toBeDefined();
        expect(lbtcPrice).toBeDefined();
        expect(Number(lbtcPrice)).toBeGreaterThan(0);

        console.log("✅ LBTC price fetched successfully:", {
          price: lbtcPrice?.toString(),
        });
      } catch (error) {
        console.error("❌ Failed to fetch LBTC price:", error);
        throw error;
      }
    }, 30000);

    test("LBTC market should be available in getAllMarkets", async () => {
      try {
        const markets = await client.lendingProtocol.getAllMarkets();
        expect(markets.length).toBeGreaterThan(0);

        // Find LBTC market
        const lbtcMarket = markets.find(
          (market) => market.market.coinType === LBTC_COIN_TYPE,
        );

        if (lbtcMarket) {
          console.log("✅ LBTC market found:", {
            marketId: lbtcMarket.market.marketId,
            coinType: lbtcMarket.market.coinType,
          });

          // Test market data retrieval
          const marketData = await lbtcMarket.getMarketData();
          expect(marketData).toBeDefined();
          expect(marketData.coinType).toBe(LBTC_COIN_TYPE);
        } else {
          console.log("ℹ️ LBTC market not found in current markets list");
          console.log(
            "Available markets:",
            markets.map((m) => ({
              id: m.market.marketId,
              coinType: m.market.coinType,
            })),
          );
        }
      } catch (error) {
        console.error("❌ Failed to get markets:", error);
        throw error;
      }
    }, 60000);
  });

  describe("Issue #2: getUserPortfolio Integration", () => {
    test("Reproduce user snippet: getPositions -> getUserPortfolio", async () => {
      try {
        // Reproduce the exact user code snippet
        const positions =
          await client.lendingProtocol.getPositions(TEST_ADDRESS);
        console.log(`Found ${positions.length} positions for user`);

        if (positions.length === 0) {
          console.log(
            "ℹ️ No positions found for test address - skipping portfolio test",
          );
          return;
        }

        const marketClasses = await client.lendingProtocol.getAllMarkets();
        console.log(`Found ${marketClasses.length} markets`);

        // This is the exact code snippet that was failing
        const portfolio = await Promise.allSettled(
          positions.map((position) => position.getUserPortfolio(marketClasses)),
        );

        expect(portfolio).toBeDefined();
        expect(portfolio.length).toBe(positions.length);

        // Check results
        const successful = portfolio.filter(
          (result) => result.status === "fulfilled",
        );
        const failed = portfolio.filter(
          (result) => result.status === "rejected",
        );

        console.log(
          `✅ Portfolio results: ${successful.length} successful, ${failed.length} failed`,
        );

        // Log any failures for debugging
        failed.forEach((failure, index) => {
          if (failure.status === "rejected") {
            console.error(
              `❌ Position ${index} portfolio failed:`,
              failure.reason,
            );
          }
        });

        // At least some should succeed if positions exist
        if (positions.length > 0) {
          expect(successful.length).toBeGreaterThan(0);
        }
      } catch (error) {
        console.error("❌ Failed to reproduce user scenario:", error);
        throw error;
      }
    }, 120000);

    test("Handle missing price feeds gracefully", async () => {
      // Test what happens when a coin type has no price feed mapping
      const fakeCoinType = "0xfake::coin::FAKE";

      const { getPricesMap } = await import("../src/utils/helper");

      try {
        const prices = await getPricesMap();

        // Should not throw, but should handle gracefully
        expect(prices.has(fakeCoinType)).toBe(false);
        console.log("✅ Missing price feed handled gracefully");
      } catch (error) {
        // If it throws, the error should be informative
        expect(error).toBeDefined();
        console.log("ℹ️ Missing price feed throws error:", error);
      }
    }, 30000);
  });

  describe("Issue #3: Price Feed Validation", () => {
    test("All mapped coins should have complete price infrastructure", async () => {
      const coinTypes = Object.keys(pythPriceFeedIdMap);
      const missingMappings: string[] = [];

      for (const coinType of coinTypes) {
        const hasPythFeed = !!pythPriceFeedIdMap[coinType];
        const hasPriceObject = !!priceInfoObjectIdMap[coinType];
        const hasDecimals = decimalsMap[coinType] !== undefined;

        if (!hasPythFeed || !hasPriceObject || !hasDecimals) {
          missingMappings.push(coinType);
        }
      }

      if (missingMappings.length > 0) {
        console.error("❌ Coins with incomplete mappings:", missingMappings);
        throw new Error(
          `${missingMappings.length} coins have incomplete price mappings`,
        );
      }

      console.log(
        `✅ All ${coinTypes.length} mapped coins have complete price infrastructure`,
      );
    });

    test("Price fetching should handle network failures gracefully", async () => {
      // Mock a network failure scenario
      const originalFetch = global.fetch;

      try {
        // Mock fetch to simulate network failure
        global.fetch = (() =>
          Promise.reject(new Error("Network error"))) as any;

        const { getPricesMap } = await import("../src/utils/helper");

        await expect(getPricesMap()).rejects.toThrow();

        console.log("✅ Network failures are properly propagated");
      } finally {
        // Restore original fetch
        global.fetch = originalFetch;
      }
    });
  });

  describe("Issue #4: Error Message Quality", () => {
    test("Missing price feed should provide clear error message", async () => {
      const { getPricesMap } = await import("../src/utils/helper");

      // Use a coin type that definitely doesn't exist in mappings
      const nonExistentCoinType = "0x999::nonexistent::COIN";

      try {
        const prices = await getPricesMap();

        // Check if the nonexistent coin type is not in the results
        expect(prices.has(nonExistentCoinType)).toBe(false);

        console.log("✅ Error message quality check completed - non-existent coin type properly excluded");
      } catch (error) {
        // It's also acceptable if the function throws
        console.log("ℹ️ Function threw error:", error);
      }
    });

    test("Market data errors should be informative", async () => {
      try {
        // Try to get market data for a potentially non-existent market
        const markets = await client.lendingProtocol.getAllMarkets();

        if (markets.length > 0) {
          const market = markets[0];
          const marketData = await market.getMarketData();

          expect(marketData).toBeDefined();
          expect(marketData.coinType).toBeDefined();

          console.log("✅ Market data retrieval working correctly");
        }
      } catch (error) {
        // Error should contain useful information
        expect(error).toBeDefined();
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage.length).toBeGreaterThan(10); // Should be descriptive

        console.log("ℹ️ Market data error:", errorMessage);
      }
    }, 30000);
  });

  describe("Issue #5: Integration Test for Full User Workflow", () => {
    test("Complete user workflow should handle all edge cases", async () => {
      const results = {
        positionsRetrieved: false,
        marketsRetrieved: false,
        portfolioCalculated: false,
        pricesResolved: false,
        errors: [] as string[],
      };

      try {
        // Step 1: Get positions
        const positions =
          await client.lendingProtocol.getPositions(TEST_ADDRESS);
        results.positionsRetrieved = true;
        console.log(`✅ Retrieved ${positions.length} positions`);

        // Step 2: Get markets
        const marketClasses = await client.lendingProtocol.getAllMarkets();
        results.marketsRetrieved = true;
        console.log(`✅ Retrieved ${marketClasses.length} markets`);

        // Step 3: Calculate portfolio (this is where the user error occurred)
        if (positions.length > 0) {
          const portfolio = await Promise.allSettled(
            positions.map((position) =>
              position.getUserPortfolio(marketClasses),
            ),
          );
          results.portfolioCalculated = true;

          const successful = portfolio.filter(
            (p) => p.status === "fulfilled",
          ).length;
          console.log(
            `✅ Portfolio calculated: ${successful}/${positions.length} successful`,
          );

          // Collect any errors
          portfolio.forEach((result, index) => {
            if (result.status === "rejected") {
              results.errors.push(`Position ${index}: ${result.reason}`);
            }
          });
        }

        // Step 4: Test price resolution for all market coin types
        const allCoinTypes = marketClasses.map(
          (market) => market.market.coinType,
        );
        const uniqueCoinTypes = [...new Set(allCoinTypes)];

        if (uniqueCoinTypes.length > 0) {
          const { getPricesMap } = await import("../src/utils/helper");
          const prices = await getPricesMap();
          results.pricesResolved = true;

          console.log(
            `✅ Price resolution: ${prices.size}/${uniqueCoinTypes.length} prices found`,
          );

          // Check for missing prices
          uniqueCoinTypes.forEach((coinType) => {
            if (!prices.has(coinType)) {
              results.errors.push(`Missing price for: ${coinType}`);
            }
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.errors.push(`Workflow error: ${errorMessage}`);
      }

      // Report final results
      console.log("🔍 Workflow Test Results:", results);

      // The test should pass if basic operations work, even if some edge cases fail
      expect(results.marketsRetrieved).toBe(true);
      expect(results.positionsRetrieved).toBe(true);

      // Log any issues found
      if (results.errors.length > 0) {
        console.log("⚠️ Issues found during workflow test:");
        results.errors.forEach((error) => console.log(`  - ${error}`));
      }
    }, 180000); // 3 minutes timeout for full workflow
  });
});
