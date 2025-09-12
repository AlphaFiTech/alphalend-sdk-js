#!/usr/bin/env node

/**
 * Debug test script for SwapGateway bestQuote issue
 * Run with: node debug-test.mjs
 */

import { SwapGateway } from './dist/esm/index.js';
import { SuiClient } from '@mysten/sui/client';

async function debugSwapGateway() {
  console.log("🔍 Starting SwapGateway Debug Test");
  console.log("=" * 50);

  try {
    // Initialize SuiClient
    const suiClient = new SuiClient({ 
      url: "https://fullnode.mainnet.sui.io" 
    });
    console.log("✅ SuiClient initialized");

    // Initialize SwapGateway
    const swapGateway = new SwapGateway(suiClient, "mainnet", { debug: true });
    console.log("✅ SwapGateway initialized");
    console.log("Initial bestQuote:", swapGateway.bestQuote);

    // Define test swap options
    const swapOptions = {
      pair: {
        coinA: { 
          name: "SUI", 
          coinType: "0x2::sui::SUI",
          type: "0x2::sui::SUI", 
          expo: 9 
        },
        coinB: { 
          name: "USDC", 
          coinType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          type: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN", 
          expo: 6 
        }
      },
      inAmount: 1000000000n, // 1 SUI
      slippage: 0.01, // 1%
      senderAddress: "0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef12"
    };

    console.log("🚀 Test swapOptions:", JSON.stringify(swapOptions, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2
    ));

    // Test getBestQuoteFromAll
    console.log("\n📊 Calling getBestQuoteFromAll...");
    const quote = await swapGateway.getBestQuoteFromAll(swapOptions, true);
    
    console.log("\n📋 RESULTS:");
    console.log("quote returned:", quote);
    console.log("swapGateway.bestQuote:", swapGateway.bestQuote);
    console.log("bestQuote === quote:", swapGateway.bestQuote === quote);
    
    if (quote) {
      console.log("✅ Quote received successfully!");
      console.log("Quote details:", {
        gateway: quote.gateway,
        estimatedAmountOut: quote.estimatedAmountOut.toString(),
        estimatedFeeAmount: quote.estimatedFeeAmount.toString(),
        inputAmount: quote.inputAmount.toString(),
        inputAmountInUSD: quote.inputAmountInUSD,
        estimatedAmountOutInUSD: quote.estimatedAmountOutInUSD,
        slippage: quote.slippage
      });

      // Test getTransactionBlock
      console.log("\n🔧 Testing getTransactionBlock...");
      const tx = await swapGateway.getTransactionBlock(true);
      console.log("Transaction returned:", tx ? "✅ Success" : "❌ Failed");
      
    } else {
      console.log("❌ No quote received!");
    }

  } catch (error) {
    console.error("💥 Error during test:");
    console.error(error);
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }
  }

  console.log("\n" + "=" * 50);
  console.log("🏁 Debug test completed");
}

// Run the debug test
debugSwapGateway();
