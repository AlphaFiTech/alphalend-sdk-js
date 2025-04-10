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
