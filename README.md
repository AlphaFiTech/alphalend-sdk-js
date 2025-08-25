[![Documentation](https://img.shields.io/badge/docs-latest-blue)](https://alphafitech.github.io/alphalend-sdk-js/)

# AlphaLend JavaScript SDK

AlphaLend SDK for JavaScript/TypeScript applications built on the Sui blockchain. This SDK provides a comprehensive interface to interact with the AlphaLend lending protocol.

## Features

- Supply assets as collateral
- Borrow assets against your collateral
- Repay borrowed assets
- Withdraw collateral
- Zap-in supply: Swap any token and supply as collateral in one transaction
- Zap-in withdraw: Withdraw collateral and swap to any token in one transaction
- Claim rewards
- Liquidate unhealthy positions
- Query protocol metrics and market data
- Track user portfolios and positions

## Installation

```bash
npm install @alphafi/alphalend-sdk
```

## Getting Started

### Creating an instance of the AlphaLend client

```typescript
import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "alphalend-sdk";

// Create a SUI client
const suiClient = new SuiClient({
  url: "https://rpc.mainnet.sui.io",
});

// Create AlphaLend client instance
const alphalendClient = new AlphalendClient("mainnet", suiClient);
```

### Update Prices

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Create a transaction
const tx = new Transaction();

// Update price information for assets from Pyth oracle
await alphalendClient.updatePrices(tx, [
  "0x2::sui::SUI",
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC",
  // Add other coin types as needed
]);

// Set gas budget and execute the transaction
const wallet = await import("@mysten/wallet-kit");
tx.setGasBudget(100_000_000);
await wallet.signAndExecuteTransaction(tx);
```

### Supply Collateral

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Supply tokens as collateral
const supplyParams = {
  marketId: "1", // Market ID to supply to
  amount: 1000000000n, // Amount in lowest denomination (in mists)
  coinType: "0x2::sui::SUI", // Coin type to supply
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Optional: your position capability
  address: "0xYOUR_ADDRESS", // Address of the user supplying collateral
};

// Create supply transaction
const supplyTx = await alphalendClient.supply(supplyParams);

// Set gas budget and execute the transaction
const wallet = await import("@mysten/wallet-kit");
await wallet.signAndExecuteTransaction(supplyTx);
```

### Borrow Assets

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Borrow against your collateral
const borrowParams = {
  marketId: "2", // Market ID to borrow from
  amount: 500000000n, // Amount to borrow (in mists)
  coinType:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC", // Coin type to borrow
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user
  priceUpdateCoinTypes: [
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC",
    "0x2::sui::SUI",
  ], // Coin types to update prices for
};

// Create borrow transaction
const borrowTx = await alphalendClient.borrow(borrowParams);

// Execute the transaction
await wallet.signAndExecuteTransaction(borrowTx);
```

### Repay Borrowed Assets

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Repay borrowed assets
const repayParams = {
  marketId: "2", // Market ID where debt exists
  amount: 500000000n, // Amount to repay (in mists)
  coinType:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC", // Coin type to repay
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user repaying the debt
};

// Create repay transaction
const repayTx = await alphalendClient.repay(repayParams);

// Execute the transaction
await wallet.signAndExecuteTransaction(repayTx);
```

### Withdraw Collateral

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { MAX_U64 } from "alphalend-sdk";

// Withdraw collateral (partial amount)
const withdrawParams = {
  marketId: "1", // Market ID to withdraw from
  amount: 500000000n, // Amount to withdraw (in mists)
  coinType: "0x2::sui::SUI", // Coin type to withdraw
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user
  priceUpdateCoinTypes: ["0x2::sui::SUI"], // Coin types to update prices for
};

// To withdraw all collateral, use MAX_U64
const withdrawAllParams = {
  marketId: "1",
  amount: MAX_U64, // Special value to withdraw all collateral
  coinType: "0x2::sui::SUI",
  positionCapId: "0xYOUR_POSITION_CAP_ID",
  address: "0xYOUR_ADDRESS",
  priceUpdateCoinTypes: ["0x2::sui::SUI"], // Coin types to update prices for
};

// Create withdraw transaction
const withdrawTx = await alphalendClient.withdraw(withdrawParams);

// Execute the transaction
await wallet.signAndExecuteTransaction(withdrawTx);
```

### Zap-in Supply (Swap and Supply in One Transaction)

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Swap any token and supply as collateral in a single transaction
const zapInSupplyParams = {
  marketId: "1", // Market ID where collateral is being added
  inputAmount: 1000000000n, // Amount of input tokens to swap (in mists)
  inputCoinType:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // Token to swap from (USDC)
  marketCoinType: "0x2::sui::SUI", // Market's collateral token to swap to (SUI)
  slippage: 0.01, // Maximum allowed slippage (1%)
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Optional: your position capability
  address: "0xYOUR_ADDRESS", // Address of the user
};

// Create zap-in supply transaction
const zapInSupplyTx = await alphalendClient.zapInSupply(zapInSupplyParams);

if (zapInSupplyTx) {
  // Execute the transaction
  await wallet.signAndExecuteTransaction(zapInSupplyTx);
} else {
  console.error("Failed to create zap-in supply transaction");
}
```

### Zap-in Withdraw (Withdraw and Swap in One Transaction)

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { MAX_U64 } from "alphalend-sdk";

// Withdraw collateral and swap to desired token in a single transaction
const zapOutWithdrawParams = {
  marketId: "1", // Market ID from which to withdraw
  amount: 500000000n, // Amount to withdraw (in mists)
  marketCoinType: "0x2::sui::SUI", // Market's collateral token type (SUI)
  outputCoinType:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // Token to swap to (USDC)
  slippage: 0.01, // Maximum allowed slippage (1%)
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user
  priceUpdateCoinTypes: [
    "0x2::sui::SUI",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ], // Coin types to update prices for
};

// To withdraw all collateral and swap, use MAX_U64
const zapOutWithdrawAllParams = {
  marketId: "1",
  amount: MAX_U64, // Special value to withdraw all collateral
  marketCoinType: "0x2::sui::SUI",
  outputCoinType:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  slippage: 0.01,
  positionCapId: "0xYOUR_POSITION_CAP_ID",
  address: "0xYOUR_ADDRESS",
  priceUpdateCoinTypes: [
    "0x2::sui::SUI",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ],
};

// Create zap-out withdraw transaction
const zapOutWithdrawTx =
  await alphalendClient.zapOutWithdraw(zapOutWithdrawParams);

if (zapOutWithdrawTx) {
  // Execute the transaction
  await wallet.signAndExecuteTransaction(zapOutWithdrawTx);
} else {
  console.error("Failed to create zap-out withdraw transaction");
}
```

### Claim Rewards

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Claim accrued rewards
const claimRewardsParams = {
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user claiming rewards
  claimAndDepositAlpha: true, // Whether to claim and deposit Alpha token rewards
  claimAndDepositAll: true, // Whether to claim and deposit all other reward tokens
  // DEPRECATED: Use claimAndDepositAlpha and claimAndDepositAll instead
  // claimAlpha: true, // ⚠️ DEPRECATED - use claimAndDepositAlpha instead
  // claimAll: true,  // ⚠️ DEPRECATED - use claimAndDepositAll instead
};

// Create claim rewards transaction
const claimRewardsTx = await alphalendClient.claimRewards(claimRewardsParams);

// Execute the transaction
await wallet.signAndExecuteTransaction(claimRewardsTx);
```

### Liquidate Unhealthy Position

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Create a transaction
const tx = new Transaction();

// Get a coin to use for repayment
const repayAmount = 500000000n;
const repayCoin = await someFunction.getCoinForRepayment(tx, repayAmount);

// Liquidate an unhealthy position
const liquidateParams = {
  tx: tx, // Optional: use existing transaction
  liquidatePositionId: "0xPOSITION_ID_TO_LIQUIDATE", // Position to liquidate
  borrowMarketId: "2", // Market ID where debt is repaid
  withdrawMarketId: "1", // Market ID where collateral is seized
  repayCoin: repayCoin, // Transaction argument for repay coin
  borrowCoinType:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC", // Coin type of debt
  withdrawCoinType: "0x2::sui::SUI", // Coin type of collateral to seize
  priceUpdateCoinTypes: [
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::USDC",
    "0x2::sui::SUI",
  ], // Coin types to update prices for
};

// Liquidate the position
const [repaidCoin, seizedCoin] =
  await alphalendClient.liquidate(liquidateParams);

// Transfer the seized collateral to the liquidator
tx.transferObjects([seizedCoin], "0xLIQUIDATOR_ADDRESS");

// Execute the transaction
await wallet.signAndExecuteTransaction(tx);
```

## Types

The SDK includes TypeScript definitions for all operations, making it easy to use in TypeScript projects:

- `SupplyParams`: Parameters for supplying collateral
  - `marketId`: Market ID where collateral is being added
  - `amount`: Amount to supply as collateral in base units (bigint, in mists)
  - `coinType`: Fully qualified coin type to supply (e.g., "0x2::sui::SUI")
  - `positionCapId?`: Object ID of the position capability object (optional)
  - `address`: Address of the user supplying collateral

- `WithdrawParams`: Parameters for withdrawing collateral
  - `marketId`: Market ID from which to withdraw
  - `amount`: Amount to withdraw in base units (bigint, in mists, use MAX_U64 constant to withdraw all)
  - `coinType`: Fully qualified coin type to withdraw (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user withdrawing collateral
  - `priceUpdateCoinTypes`: Array of coin types to update prices for

- `BorrowParams`: Parameters for borrowing assets
  - `marketId`: Market ID to borrow from
  - `amount`: Amount to borrow in base units (bigint, in mists)
  - `coinType`: Fully qualified coin type to borrow (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user borrowing tokens
  - `priceUpdateCoinTypes`: Array of coin types to update prices for

- `RepayParams`: Parameters for repaying borrowed assets
  - `marketId`: Market ID where the debt exists
  - `amount`: Amount to repay in base units (bigint, in mists)
  - `coinType`: Fully qualified coin type to repay (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user repaying the debt

- `ClaimRewardsParams`: Parameters for claiming rewards
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user claiming rewards
  - `claimAndDepositAlpha`: Whether to claim and deposit Alpha token rewards (boolean)
  - `claimAndDepositAll`: Whether to claim and deposit all other reward tokens (boolean)
  - `claimAlpha`: ⚠️ **DEPRECATED** - Use `claimAndDepositAlpha` instead (boolean)
  - `claimAll`: ⚠️ **DEPRECATED** - Use `claimAndDepositAll` instead (boolean)

- `LiquidateParams`: Parameters for liquidating unhealthy positions
  - `tx?`: Optional existing transaction to build upon
  - `liquidatePositionId`: Object ID of the position to liquidate
  - `borrowMarketId`: Market ID where debt is repaid
  - `withdrawMarketId`: Market ID where collateral is seized
  - `repayCoin`: Transaction argument representing the repay coin
  - `borrowCoinType`: Fully qualified coin type for debt repayment
  - `withdrawCoinType`: Fully qualified coin type for collateral to seize
  - `priceUpdateCoinTypes`: Array of coin types to update prices for

- `ZapInSupplyParams`: Parameters for zap-in supply operation (swap and supply in one transaction)
  - `marketId`: Market ID where collateral is being added
  - `inputAmount`: Amount of input tokens to swap and supply (bigint, in mists)
  - `inputCoinType`: Fully qualified type of the input token to swap from (e.g., "0x2::sui::SUI")
  - `marketCoinType`: Fully qualified type of the market's collateral token to swap to
  - `slippage`: Maximum allowed slippage percentage for the swap (e.g., 0.01 for 1%)
  - `positionCapId?`: Object ID of the position capability object (optional)
  - `address`: Address of the user performing the zap-in supply

- `ZapOutWithdrawParams`: Parameters for zap-out withdraw operation (withdraw and swap in one transaction)
  - `marketId`: Market ID from which to withdraw
  - `amount`: Amount to withdraw (bigint, in mists, use MAX_U64 constant to withdraw all)
  - `marketCoinType`: Fully qualified type of the market's collateral token to withdraw from
  - `outputCoinType`: Fully qualified type of the desired output token to swap to
  - `slippage`: Maximum allowed slippage percentage for the swap (e.g., 0.01 for 1%)
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user performing the zap-in withdraw
  - `priceUpdateCoinTypes`: Array of coin types to update prices for

- `updatePrices`: Function to update price feeds
  - Parameters:
    - `tx`: Transaction object to add price update calls to
    - `coinTypes`: Array of fully qualified coin types to update prices for

## Query Methods

### Get All Markets

```typescript
// Get all markets with their details
const markets = await alphalendClient.getAllMarkets();

console.log(markets);
// Example output:
// [
//   {
//     marketId: "1",
//     price: new Decimal("1.546187202"),
//     coinType: "0x2::sui::SUI",
//     decimalDigit: 9,
//     totalSupply: new Decimal("1000000000"),
//     totalBorrow: new Decimal("500000000"),
//     utilizationRate: new Decimal("0.5"),
//     supplyApr: {
//       interestApr: new Decimal("0.04"),
//       rewards: [
//         { coinType: "0x..::alpha::ALPHA", rewardApr: new Decimal("0.02") }
//       ]
//     },
//     borrowApr: {
//       interestApr: new Decimal("0.1"),
//       rewards: []
//     },
//     ltv: new Decimal("0.7"),
//     liquidationThreshold: new Decimal("0.8"),
//     availableLiquidity: new Decimal("500000000"),
//     borrowFee: new Decimal("0.001"),
//     allowedBorrowAmount: new Decimal("10000000000"),
//     allowedDepositAmount: new Decimal("1000000000000"),
//     borrowWeight: new Decimal("1"),
//     xtokenRatio: new Decimal("1.05")
//   },
//   // ... more markets
// ]
```

### Get market data for a particular market

```typescript
// Get market data for a particular market
const marketData = await alphalendClient.getMarketDataFromId(1);
```

### Get Markets Chain Data (Caching)

```typescript
// Get market chain data for caching and reuse
const marketsChain = await alphalendClient.getMarketsChain();

// Later use the cached markets with other functions
```

### Get All Markets with Cached Markets

```typescript
// Use cached markets to get market data more efficiently
const marketsChain = await alphalendClient.getMarketsChain();
const markets =
  await alphalendClient.getAllMarketsWithCachedMarkets(marketsChain);

console.log(markets);
// Same output format as getAllMarkets but more efficient when called multiple times
```

### Get Protocol Stats

```typescript
// Get protocol statistics
const stats = await alphalendClient.getProtocolStats();

console.log(stats);
// Example output:
// {
//   totalSuppliedUsd: "1000000.00", // Total value supplied across all markets (USD)
//   totalBorrowedUsd: "500000.00"   // Total value borrowed across all markets (USD)
// }
```

### Get User Portfolio

```typescript
// Get user portfolio information including supplied/borrowed assets
const userPortfolio = await alphalendClient.getUserPortfolio("0xUSER_ADDRESS");

console.log(userPortfolio);
// Example output:
// [
//   {
//     positionId: "0x...",
//     netWorth: new Decimal("1500.00"),
//     dailyEarnings: new Decimal("0.82"),
//     netApr: new Decimal("0.02"),
//     safeBorrowLimit: new Decimal("700.00"),
//     borrowLimitUsed: new Decimal("0.35"),
//     liquidationThreshold: new Decimal("800.00"),
//     totalSuppliedUsd: new Decimal("1000.00"),
//     aggregatedSupplyApr: new Decimal("0.04"),
//     totalBorrowedUsd: new Decimal("300.00"),
//     aggregatedBorrowApr: new Decimal("0.08"),
//     suppliedAmounts: new Map([
//       [1, new Decimal("100000000000")], // Key is marketId, value is amount
//       [3, new Decimal("50000000")]
//     ]),
//     borrowedAmounts: new Map([
//       [2, new Decimal("300000000")]
//     ]),
//     rewardsToClaimUsd: new Decimal("5.72"),
//     rewardsToClaim: [
//       {
//         coinType: "0x..::alpha::ALPHA",
//         rewardAmount: new Decimal("10.5")
//       }
//     ]
//   }
// ]
```

### Get User Portfolio with Cached Markets

```typescript
// Get user portfolio using cached markets for better performance
const marketsChain = await alphalendClient.getMarketsChain();
const userPortfolio = await alphalendClient.getUserPortfolioWithCachedMarkets(
  "0xUSER_ADDRESS",
  marketsChain,
);

// Same output format as getUserPortfolio but more efficient when retrieving multiple portfolios
// or when used in combination with other market data queries
```

### Get User Portfolio from Position

```typescript
// Get user portfolio information for a specific position ID
const userPortfolio =
  await alphalendClient.getUserPortfolioFromPosition("0xPOSITION_ID");

console.log(userPortfolio);
// Example output:
// {
//   positionId: "0x...",
//   netWorth: new Decimal("1500.00"),
//   dailyEarnings: new Decimal("0.82"),
//   netApr: new Decimal("0.02"),
//   safeBorrowLimit: new Decimal("700.00"),
//   borrowLimitUsed: new Decimal("0.35"),
//   liquidationThreshold: new Decimal("800.00"),
//   totalSuppliedUsd: new Decimal("1000.00"),
//   aggregatedSupplyApr: new Decimal("0.04"),
//   totalBorrowedUsd: new Decimal("300.00"),
//   aggregatedBorrowApr: new Decimal("0.08"),
//   suppliedAmounts: new Map([
//     [1, new Decimal("100000000000")], // Key is marketId, value is amount
//     [3, new Decimal("50000000")]
//   ]),
//   borrowedAmounts: new Map([
//     [2, new Decimal("300000000")]
//   ]),
//   rewardsToClaimUsd: new Decimal("5.72"),
//   rewardsToClaim: [
//     {
//       coinType: "0x..::alpha::ALPHA",
//       rewardAmount: new Decimal("10.5")
//     }
//   ]
// }
```

### Testing
