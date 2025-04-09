# AlphaLend JavaScript SDK

AlphaLend SDK for JavaScript/TypeScript applications built on the Sui blockchain. This SDK provides a comprehensive interface to interact with the AlphaLend lending protocol.

## Features

- Create lending positions
- Supply assets as collateral
- Borrow assets against your collateral
- Repay borrowed assets
- Withdraw collateral
- Claim earned rewards
- Liquidate unhealthy positions
- Query protocol and user information

## Installation

```bash
npm install alphalend-sdk
```

## Getting Started

### Creating an instance of the AlphaLend client

```typescript
import { Connection } from '@mysten/sui.js';
import { SuiClient } from '@mysten/sui/client';
import { AlphalendClient } from 'alphalend-sdk';

// Connect to Sui network
const connection = new Connection({
  fullnode: 'https://rpc.mainnet.sui.io'
});
const suiClient = new SuiClient(connection);

// Create AlphaLend client instance
const alphalendClient = new AlphalendClient(suiClient);
```

### Creating a Position

```typescript
// Create a position to use the protocol
const createPositionTx = await alphalendClient.createPosition();

// Sign and execute the transaction (with wallet provider)
const result = await wallet.signAndExecuteTransaction(createPositionTx);
const positionCapId = result.objectId; // Store this to interact with your position
```

### Supply Collateral

```typescript
import { SupplyParams } from 'alphalend-sdk';

// Supply tokens as collateral
const supplyParams: SupplyParams = {
  marketId: "1", // Market ID to supply to
  amount: BigInt(1000000000), // Amount in lowest denomination
  coinType: "0x2::sui::SUI", // Coin type to supply
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  coinObjectId: "0xYOUR_COIN_OBJECT_ID" // Coin object to use
};

const supplyTx = await alphalendClient.supply(supplyParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(supplyTx);
```

### Borrow Assets

```typescript
import { BorrowParams } from 'alphalend-sdk';

// Borrow against your collateral
const borrowParams: BorrowParams = {
  marketId: "2", // Market ID to borrow from
  amount: BigInt(500000000), // Amount to borrow
  coinType: "0x::usdc::USDC", // Coin type to borrow
  positionCapId: "0xYOUR_POSITION_CAP_ID" // Your position capability
};

const borrowTx = await alphalendClient.borrow(borrowParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(borrowTx);
```

### Repay Borrowed Assets

```typescript
import { RepayParams } from 'alphalend-sdk';

// Repay borrowed assets
const repayParams: RepayParams = {
  marketId: "2", // Market ID where debt exists
  amount: BigInt(500000000), // Amount to repay
  coinType: "0x::usdc::USDC", // Coin type to repay
  positionCapId: "0xYOUR_POSITION_CAP_ID", // Your position capability
  coinObjectId: "0xYOUR_COIN_OBJECT_ID" // Coin object to use for repayment
};

const repayTx = await alphalendClient.repay(repayParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(repayTx);
```

### Withdraw Collateral

```typescript
import { WithdrawParams, MAX_U64 } from 'alphalend-sdk';

// Withdraw collateral (partial amount)
const withdrawParams: WithdrawParams = {
  marketId: "1", // Market ID to withdraw from
  amount: BigInt(500000000), // Amount to withdraw
  coinType: "0x2::sui::SUI", // Coin type to withdraw
  positionCapId: "0xYOUR_POSITION_CAP_ID" // Your position capability
};

// To withdraw all collateral, use MAX_U64
const withdrawAllParams: WithdrawParams = {
  marketId: "1",
  amount: MAX_U64, // Special value to withdraw all collateral
  coinType: "0x2::sui::SUI",
  positionCapId: "0xYOUR_POSITION_CAP_ID"
};

const withdrawTx = await alphalendClient.withdraw(withdrawParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(withdrawTx);
```

### Claim Rewards

```typescript
import { ClaimRewardsParams } from 'alphalend-sdk';

// Claim earned rewards
const claimParams: ClaimRewardsParams = {
  marketId: "1", // Market ID to claim rewards from
  coinType: "0x::reward::TOKEN", // Reward token type
  positionCapId: "0xYOUR_POSITION_CAP_ID" // Your position capability
};

const claimTx = await alphalendClient.claimRewards(claimParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(claimTx);
```

### Liquidating Positions

```typescript
import { LiquidateParams } from 'alphalend-sdk';

// Liquidate an unhealthy position
const liquidateParams: LiquidateParams = {
  liquidatePositionId: "0xUNHEALTHY_POSITION_ID", // Position to liquidate
  borrowMarketId: "2", // Market ID where debt is repaid
  withdrawMarketId: "1", // Market ID for seizing collateral
  repayAmount: BigInt(1000000), // Amount to repay
  borrowCoinType: "0x::usdc::USDC", // Type of coin to repay
  withdrawCoinType: "0x2::sui::SUI", // Type of collateral to seize
  coinObjectId: "0xYOUR_COIN_OBJECT_ID" // Coin object to use for repayment
};

const liquidateTx = await alphalendClient.liquidate(liquidateParams);

// Sign and execute the transaction
await wallet.signAndExecuteTransaction(liquidateTx);
```

### Query Information

```typescript
// Get all markets in the protocol
const markets = await alphalendClient.getAllMarkets();

// Get a specific user position
const position = await alphalendClient.getUserPosition("0xPOSITION_ID");

// Get user portfolio (all positions and summary)
const portfolio = await alphalendClient.getUserPortfolio("0xUSER_ADDRESS");
```

## Advanced Usage

### Registering Custom Price Feeds

```typescript
import { registerPriceFeed } from 'alphalend-sdk';

// Register a new token price feed
registerPriceFeed(
  "0x123::custom::TOKEN", // Coin type
  "CTOKEN", // Symbol
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" // Pyth price feed ID
);
```

## Types

The SDK includes TypeScript definitions for all operations, making it easy to use in TypeScript projects:

- `SupplyParams`: Parameters for supplying collateral
- `WithdrawParams`: Parameters for withdrawing collateral
- `BorrowParams`: Parameters for borrowing assets
- `RepayParams`: Parameters for repaying borrowed assets
- `ClaimRewardsParams`: Parameters for claiming rewards
- `LiquidateParams`: Parameters for liquidating positions
- `Market`: Market data model
- `Position`: Position data model
- `Portfolio`: User portfolio data model

## License

MIT
