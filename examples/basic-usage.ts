/**
 * AlphaLend SDK - Basic Usage Examples
 * 
 * This file demonstrates how to use the AlphaLend SDK for common operations:
 * - Creating a lending position
 * - Supplying collateral
 * - Borrowing assets
 * - Repaying borrowed assets
 * - Withdrawing collateral
 * - Checking position and market information
 */

import { SuiClient } from '@mysten/sui/client';
import { 
  AlphalendClient, 
  SupplyParams, 
  WithdrawParams, 
  BorrowParams, 
  RepayParams,
  MAX_U64
} from '../src';

// This is a demo - you would need a real wallet integration in a real app
const mockWallet = {
  async signAndExecuteTransaction(tx: any) {
    console.log('Mock wallet signing transaction:', tx);
    return { txDigest: '123', status: 'success', objectId: '0xMOCK_POSITION_CAP_ID' };
  }
};

async function exampleUsage() {
  try {
    // Initialize the client by connecting to Sui network
    const suiClient = new SuiClient({ url: 'https://rpc.mainnet.sui.io' });
    const alphalend = new AlphalendClient(suiClient);
    
    console.log('Connected to AlphaLend protocol');

    // Step 1: Create a position to interact with the protocol
    console.log('\n--- Creating a lending position ---');
    const createPositionTx = await alphalend.createPosition();
    const result = await mockWallet.signAndExecuteTransaction(createPositionTx);
    const positionCapId = result.objectId;
    console.log(`Created position with capability ID: ${positionCapId}`);

    // Step 2: Supply collateral (example with SUI)
    console.log('\n--- Supplying collateral ---');
    const supplyParams: SupplyParams = {
      marketId: '1', // SUI market
      amount: BigInt(1_000_000_000), // 1 SUI
      coinType: '0x2::sui::SUI',
      positionCapId,
      coinObjectId: '0xMOCK_COIN_OBJECT_ID'
    };
    const supplyTx = await alphalend.supply(supplyParams);
    await mockWallet.signAndExecuteTransaction(supplyTx);
    console.log('Successfully supplied collateral');

    // Step 3: Borrow USDC against collateral
    console.log('\n--- Borrowing assets ---');
    const borrowParams: BorrowParams = {
      marketId: '2', // USDC market
      amount: BigInt(10_000_000), // 10 USDC
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      positionCapId
    };
    const borrowTx = await alphalend.borrow(borrowParams);
    await mockWallet.signAndExecuteTransaction(borrowTx);
    console.log('Successfully borrowed assets');

    // Step 4: Repay borrowed assets
    console.log('\n--- Repaying borrowed assets ---');
    const repayParams: RepayParams = {
      marketId: '2', // USDC market
      amount: BigInt(5_000_000), // 5 USDC
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      positionCapId,
      coinObjectId: '0xMOCK_USDC_OBJECT_ID'
    };
    const repayTx = await alphalend.repay(repayParams);
    await mockWallet.signAndExecuteTransaction(repayTx);
    console.log('Successfully repaid borrowed assets');

    // Step 5: Withdraw collateral
    console.log('\n--- Withdrawing collateral ---');
    const withdrawParams: WithdrawParams = {
      marketId: '1', // SUI market
      amount: BigInt(500_000_000), // 0.5 SUI
      coinType: '0x2::sui::SUI',
      positionCapId
    };
    const withdrawTx = await alphalend.withdraw(withdrawParams);
    await mockWallet.signAndExecuteTransaction(withdrawTx);
    console.log('Successfully withdrawn collateral');

    // Step 6: Query protocol information
    console.log('\n--- Getting market information ---');
    const markets = await alphalend.getAllMarkets();
    console.log(`Found ${markets.length} markets`);
    
    if (markets.length > 0) {
      console.log('\nMarket details:');
      markets.forEach(market => {
        console.log(`Market ID: ${market.marketId}`);
        console.log(`Asset: ${market.coinType}`);
        console.log(`Utilization: ${(market.utilizationRate * 100).toFixed(2)}%`);
        console.log(`Supply APR: ${(market.supplyApr * 100).toFixed(2)}%`);
        console.log(`Borrow APR: ${(market.borrowApr * 100).toFixed(2)}%`);
        console.log('---');
      });
    }

    // Step 7: Get user position information
    console.log('\n--- Getting position information ---');
    const position = await alphalend.getUserPosition(positionCapId);
    
    if (position) {
      console.log('Position details:');
      console.log(`ID: ${position.id}`);
      console.log(`Total collateral value: $${position.totalCollateralUsd.toFixed(2)}`);
      console.log(`Total borrowed value: $${position.totalLoanUsd.toFixed(2)}`);
      console.log(`Health factor: ${position.healthFactor.toFixed(2)}`);
      console.log(`Liquidatable: ${position.isLiquidatable ? 'Yes' : 'No'}`);
    } else {
      console.log('Position not found');
    }

  } catch (error) {
    console.error('Error running example:', error);
  }
}

// Run the example
exampleUsage().then(() => console.log('Example completed'));