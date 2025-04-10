# AlphaLend JavaScript SDK

AlphaLend SDK for JavaScript/TypeScript applications built on the Sui blockchain. This SDK provides a comprehensive interface to interact with the AlphaLend lending protocol.

## Features

- Supply assets as collateral
- Borrow assets against your collateral
- Repay borrowed assets
- Withdraw collateral
- Update price information from oracles

## Installation

```bash
npm install alphalend-sdk
```

## Getting Started

### Creating an instance of the AlphaLend client

```typescript
import { Connection } from "@mysten/sui.js";
import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "alphalend-sdk";

// Connect to Sui network
const connection = new Connection({
  fullnode: "https://rpc.mainnet.sui.io",
});
const suiClient = new SuiClient(connection);

// Create AlphaLend client instance
const alphalendClient = new AlphalendClient(suiClient);
```

### Update Prices

```typescript
import { Transaction } from "@mysten/sui/transactions";

// Update price information for assets from Pyth oracle
const tx = new Transaction();
const updatedTx = await alphalendClient.updatePrices(tx, [
  "0x2::sui::SUI",
  "0x::usdc::USDC",
  // Add other coin types as needed
]);

// Sign and execute the transaction
updatedTx.setGasBudget(100_000_000);
await wallet.signAndExecuteTransaction(updatedTx);
```

### Supply Collateral

```typescript
import { SupplyParams } from "alphalend-sdk";

// Supply tokens as collateral
const supplyParams: SupplyParams = {
  marketId: "1", // Market ID to supply to
  amount: BigInt(1000000000), // Amount in lowest denomination
  supplyCoinType: "0x2::sui::SUI", // Coin type to supply
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability (optional)
  address: "0xYOUR_ADDRESS", // Address of the user supplying collateral
  priceUpdateCoinTypes: ["0x2::sui::SUI"], // Coin types to update prices for
};

const supplyTx = await alphalendClient.supply(supplyParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(supplyTx);
```

### Borrow Assets

```typescript
import { BorrowParams } from "alphalend-sdk";

// Borrow against your collateral
const borrowParams: BorrowParams = {
  marketId: "2", // Market ID to borrow from
  amount: BigInt(500000000), // Amount to borrow
  borrowCoinType: "0x::usdc::USDC", // Coin type to borrow
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  priceUpdateCoinTypes: ["0x::usdc::USDC", "0x2::sui::SUI"], // Coin types to update prices for
};

const borrowTx = await alphalendClient.borrow(borrowParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(borrowTx);
```

### Repay Borrowed Assets

```typescript
import { RepayParams } from "alphalend-sdk";

// Repay borrowed assets
const repayParams: RepayParams = {
  marketId: "2", // Market ID where debt exists
  amount: BigInt(500000000), // Amount to repay
  repayCoinType: "0x::usdc::USDC", // Coin type to repay
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  address: "0xYOUR_ADDRESS", // Address of the user repaying the debt
  priceUpdateCoinTypes: ["0x::usdc::USDC"], // Coin types to update prices for
};

const repayTx = await alphalendClient.repay(repayParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(repayTx);
```

### Withdraw Collateral

```typescript
import { WithdrawParams, MAX_U64 } from "alphalend-sdk";

// Withdraw collateral (partial amount)
const withdrawParams: WithdrawParams = {
  marketId: "1", // Market ID to withdraw from
  amount: BigInt(500000000), // Amount to withdraw
  withdrawCoinType: "0x2::sui::SUI", // Coin type to withdraw
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  priceUpdateCoinTypes: ["0x2::sui::SUI"], // Coin types to update prices for
};

// To withdraw all collateral, use MAX_U64
const withdrawAllParams: WithdrawParams = {
  marketId: "1",
  amount: MAX_U64, // Special value to withdraw all collateral
  withdrawCoinType: "0x2::sui::SUI",
  positionCapId: "0xYOUR_POSITION_CAP_ID",
  priceUpdateCoinTypes: ["0x2::sui::SUI"], // Coin types to update prices for
};

const withdrawTx = await alphalendClient.withdraw(withdrawParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(withdrawTx);
```

## Types

The SDK includes TypeScript definitions for all operations, making it easy to use in TypeScript projects:

- `SupplyParams`: Parameters for supplying collateral

  - `marketId`: Market ID where collateral is being added
  - `amount`: Amount to supply as collateral in base units
  - `supplyCoinType`: Supply coin type (e.g., "0x2::sui::SUI")
  - `positionCapId?`: Object ID of the position capability object (optional)
  - `address`: Address of the user supplying collateral
  - `priceUpdateCoinTypes`: Coin types to update prices for

- `WithdrawParams`: Parameters for withdrawing collateral

  - `marketId`: Market ID from which to withdraw
  - `amount`: Amount to withdraw (use MAX_U64 constant to withdraw all)
  - `withdrawCoinType`: Withdraw coin type (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `priceUpdateCoinTypes`: Coin types to update prices for

- `BorrowParams`: Parameters for borrowing assets

  - `marketId`: Market ID to borrow from
  - `amount`: Amount to borrow in base units
  - `borrowCoinType`: Borrow coin type (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `priceUpdateCoinTypes`: Coin types to update prices for

- `RepayParams`: Parameters for repaying borrowed assets

  - `marketId`: Market ID where the debt exists
  - `amount`: Amount to repay in base units
  - `repayCoinType`: Repay coin type (e.g., "0x2::sui::SUI")
  - `positionCapId`: Object ID of the position capability object
  - `address`: Address of the user repaying the debt
  - `priceUpdateCoinTypes`: Coin types to update prices for

- `updatePrices`: Function to update price feeds
  - Parameters:
    - `tx`: Transaction object to add price update calls to
    - `coinTypes`: Array of coin types to update prices for

## Query Methods

### Get All Markets

The SDK provides methods to query on-chain data from AlphaLend protocol:

```typescript
// Get all markets with their details
const markets = await alphalendClient.getAllMarkets();

// Example market data
console.log(markets);
// [
//   {
//     marketId: "0x123...",
//     coinType: "0x2::sui::SUI",
//     totalSupply: 1000000000n,
//     totalBorrow: 500000000n,
//     utilizationRate: 0.5,
//     supplyApr: {
//       interestApr: 0.04,
//       rewards: []
//     },
//     borrowApr: {
//       interestApr: 0.1,
//       rewards: []
//     },
//     ltv: 0.7,
//     liquidationThreshold: 0.8,
//     depositLimit: 10000000000n
//   },
//   // ... more markets
// ]
```

Each market object contains:

- `marketId`: Unique identifier for the market
- `coinType`: Type of the coin in the market (e.g., "0x2::sui::SUI")
- `totalSupply`: Total supply in the market (BigInt)
- `totalBorrow`: Total borrowed amount (BigInt)
- `utilizationRate`: Current utilization rate (0.0 to 1.0)
- `supplyApr`: Supply APR details including interest and rewards
- `borrowApr`: Borrow APR details including interest and rewards
- `ltv`: Loan-to-Value ratio (0.0 to 1.0)
- `liquidationThreshold`: Threshold at which positions can be liquidated
- `depositLimit`: Maximum amount that can be deposited

### Get Protocol Stats

Get aggregated statistics about the entire protocol:

```typescript
// Get protocol statistics
const stats = await alphalendClient.getProtocolStats();

// Example stats data
console.log(stats);
// {
//   totalSuppliedUsd: "1000000", // Total value supplied across all markets (USD)
//   totalBorrowedUsd: "500000"   // Total value borrowed across all markets (USD)
// }
```

The protocol stats object contains:

- `totalSuppliedUsd`: Total value of all supplied assets across all markets (USD as string)
- `totalBorrowedUsd`: Total value of all borrowed assets across all markets (USD as string)

### Get User Portfolio

Get a user's complete portfolio information including balances, positions, and metrics:

```typescript
// Get user's portfolio data
const userAddress = "0xYOUR_USER_ADDRESS";
const portfolio = await alphalendClient.getUserPortfolio(userAddress);

// Example portfolio data
console.log(portfolio);
// {
//   userAddress: "0xYOUR_USER_ADDRESS",
//   netWorth: "75000",
//   totalSuppliedUsd: "100000",
//   totalBorrowedUsd: "25000",
//   safeBorrowLimit: "80000",
//   liquidationLimit: "85000",
//   rewardsToClaimUsd: "100",
//   rewardsByToken: [
//     { token: "0x2::sui::SUI", amount: "50" },
//     { token: "0x::reward::TOKEN", amount: "25" }
//   ],
//   dailyEarnings: "10",
//   netApr: "4.5",
//   aggregatedSupplyApr: "5.0",
//   aggregatedBorrowApr: "8.0",
//   userBalances: [
//     { 
//       marketId: "1", 
//       suppliedAmount: 1000000000n, 
//       borrowedAmount: 0n 
//     },
//     { 
//       marketId: "2", 
//       suppliedAmount: 0n, 
//       borrowedAmount: 500000000n 
//     }
//   ]
// }
```

The portfolio object contains:

- `userAddress`: The address of the portfolio owner
- `netWorth`: Total value of assets minus liabilities (USD as string)
- `totalSuppliedUsd`: Total value of supplied assets (USD as string)
- `totalBorrowedUsd`: Total value of borrowed assets (USD as string)
- `safeBorrowLimit`: Maximum amount that can be borrowed (USD as string)
- `liquidationLimit`: Threshold at which positions can be liquidated (USD as string)
- `rewardsToClaimUsd`: Value of unclaimed rewards (USD as string)
- `rewardsByToken`: Array of rewards broken down by token
- `dailyEarnings`: Estimated daily earnings (USD as string)
- `netApr`: Net annual percentage rate (as string)
- `aggregatedSupplyApr`: Aggregated supply APR across all positions (as string)
- `aggregatedBorrowApr`: Aggregated borrow APR across all positions (as string)
- `userBalances`: Array of user balances by market
