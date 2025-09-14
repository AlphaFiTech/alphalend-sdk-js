import { SuiClient } from "@mysten/sui/client";
import { getConstants } from "../src/constants/index.js";
import { AlphalendClient } from "../src/core/client.js";
import { getPricesMap } from "../src/utils/helper.js";
import { Decimal } from "decimal.js";
import * as dotenv from "dotenv";

dotenv.config();

function getSuiClient(network?: string) {
  const mainnetUrl = "https://fullnode.mainnet.sui.io/";
  const testnetUrl = "https://fullnode.testnet.sui.io/";
  const devnetUrl = "https://fullnode.devnet.sui.io/";

  let rpcUrl = mainnetUrl;
  if (network === "testnet") {
    rpcUrl = testnetUrl;
  } else if (network === "devnet") {
    rpcUrl = devnetUrl;
  }

  return new SuiClient({
    url: rpcUrl,
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params: { token?: string; address?: string; network?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && i + 1 < args.length) {
      params.token = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === "--address" && i + 1 < args.length) {
      params.address = args[i + 1];
      i++;
    } else if (args[i] === "--network" && i + 1 < args.length) {
      params.network = args[i + 1];
      i++;
    }
  }

  return params;
}

function formatAmount(amount: Decimal | string | number, decimals: number = 9): string {
  const divisor = new Decimal(10).pow(decimals);
  const formatted = new Decimal(amount.toString()).div(divisor);
  return formatted.toFixed(6);
}

async function main() {
  const { token, address, network = "mainnet" } = parseArgs();

  if (!token || !address) {
    console.error("Usage: npx tsx getUserTokenBalance.ts --token <TOKEN_SYMBOL> --address <SUI_ADDRESS> [--network <mainnet|testnet|devnet>]");
    console.error("Example: npx tsx getUserTokenBalance.ts --token IKA --address 0x027feedba1873a796656a39087961cc633a44b6374df32df532e1a18439d4b92");
    process.exit(1);
  }

  try {
    console.log(`\nFetching ${token} balance for address: ${address}`);
    console.log(`Network: ${network}\n`);

    const suiClient = getSuiClient(network);
    const alphalendClient = new AlphalendClient(network, suiClient);

    // Get all markets to map market IDs to coin types
    const markets = await alphalendClient.getMarketsChain();
    if (!markets) {
      console.error("Failed to fetch markets");
      process.exit(1);
    }

    // Create a map of market ID to market data
    const marketMap = new Map();
    for (const market of markets) {
      const marketId = parseFloat(market.market.marketId);
      marketMap.set(marketId, market);
    }

    // Get user portfolio
    const portfolios = await alphalendClient.getUserPortfolio(address);

    if (!portfolios || portfolios.length === 0) {
      console.log(`No positions found for address: ${address}`);
      process.exit(0);
    }

    // Get current prices
    const prices = await getPricesMap();

    let totalSupplied = new Decimal(0);
    let totalBorrowed = new Decimal(0);
    let totalRewards = new Decimal(0);
    let tokenFound = false;
    let supplyAPY = new Decimal(0);
    let borrowAPY = new Decimal(0);

    // Search through all positions
    for (const portfolio of portfolios) {
      // Check supplied amounts
      if (portfolio.suppliedAmounts) {
        for (const [marketId, amount] of portfolio.suppliedAmounts.entries()) {
          const market = marketMap.get(marketId);
          if (market) {
            const coinType = market.market.coinType;
            const coinSymbol = coinType.split("::").pop()?.toUpperCase();

            if (coinSymbol === token || coinType.toLowerCase().includes(token.toLowerCase())) {
              tokenFound = true;
              totalSupplied = totalSupplied.plus(amount);

              const price = prices.get(coinType) || new Decimal(0);
              const valueUsd = amount.mul(price);

              // Calculate APY for this market
              const supplyApr = await market.calculateSupplyApr();
              const supplyRewards = market.calculateSupplyRewardApr(prices);
              const totalSupplyRewardApr = supplyRewards.reduce(
                (acc, reward) => acc.add(reward.rewardApr),
                new Decimal(0),
              );

              supplyAPY = supplyApr.interestApr.add(supplyApr.stakingApr).add(totalSupplyRewardApr);

              console.log(`✅ Supplied: ${amount.toFixed(6)} ${token}`);
              console.log(`   Market ID: ${marketId}`);
              console.log(`   Value USD: $${valueUsd.toFixed(2)}`);
              console.log(`   APY: ${supplyAPY.toFixed(2)}%`);
            }
          }
        }
      }

      // Check borrowed amounts
      if (portfolio.borrowedAmounts) {
        for (const [marketId, amount] of portfolio.borrowedAmounts.entries()) {
          const market = marketMap.get(marketId);
          if (market) {
            const coinType = market.market.coinType;
            const coinSymbol = coinType.split("::").pop()?.toUpperCase();

            if (coinSymbol === token || coinType.toLowerCase().includes(token.toLowerCase())) {
              tokenFound = true;
              totalBorrowed = totalBorrowed.plus(amount);

              const price = prices.get(coinType) || new Decimal(0);
              const valueUsd = amount.mul(price);

              // Calculate APY for this market
              const borrowApr = market.calculateBorrowApr();
              const borrowRewards = market.calculateBorrowRewardApr(prices);
              const totalBorrowRewardApr = borrowRewards.reduce(
                (acc, reward) => acc.add(reward.rewardApr),
                new Decimal(0),
              );

              borrowAPY = borrowApr.interestApr.sub(totalBorrowRewardApr);

              console.log(`📉 Borrowed: ${amount.toFixed(6)} ${token}`);
              console.log(`   Market ID: ${marketId}`);
              console.log(`   Value USD: $${valueUsd.toFixed(2)}`);
              console.log(`   APY: ${borrowAPY.toFixed(2)}%`);
            }
          }
        }
      }

      // Check unclaimed rewards
      if (portfolio.rewardsToClaim) {
        for (const reward of portfolio.rewardsToClaim) {
          const coinSymbol = reward.coinType.split("::").pop()?.toUpperCase();
          if (coinSymbol === token || reward.coinType.toLowerCase().includes(token.toLowerCase())) {
            tokenFound = true;
            totalRewards = totalRewards.plus(reward.rewardAmount);

            const price = prices.get(reward.coinType) || new Decimal(0);
            const valueUsd = reward.rewardAmount.mul(price);

            console.log(`🎁 Unclaimed Rewards: ${reward.rewardAmount.toFixed(6)} ${token}`);
            console.log(`   Value USD: $${valueUsd.toFixed(2)}`);
          }
        }
      }
    }

    if (!tokenFound) {
      console.log(`No ${token} positions found for this address.`);
    } else {
      console.log("\n" + "=".repeat(50));
      console.log("SUMMARY:");
      if (!totalSupplied.isZero()) {
        console.log(`Total Supplied: ${totalSupplied.toFixed(6)} ${token}`);
      }
      if (!totalBorrowed.isZero()) {
        console.log(`Total Borrowed: ${totalBorrowed.toFixed(6)} ${token}`);
      }
      if (!totalRewards.isZero()) {
        console.log(`Total Unclaimed Rewards: ${totalRewards.toFixed(6)} ${token}`);
      }

      const netPosition = totalSupplied.minus(totalBorrowed);
      console.log(`Net Position: ${netPosition.toFixed(6)} ${token}`);
    }

  } catch (error) {
    console.error("Error fetching user balance:", error);
    process.exit(1);
  }
}

main().catch(console.error);