import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { flashloanPTB, repayFlashLoanPTB } from "@naviprotocol/lending";
import { Decimal } from "decimal.js";
import { FlashRepayParams } from "./types.js";
import type { AlphalendClient } from "./client.js";

/**
 * Builds a flash repay transaction (break out of looping position via Navi flash loan).
 * Same pattern as other flows: client passes itself; no handler class or stored client.
 *
 * Steps:
 * 1. Flash borrow repay coin from Navi
 * 2. Repay all debt on AlphaLend
 * 3. Update oracle prices
 * 4. Withdraw collateral
 * 5. Swap collateral to repay coin (if different coins)
 * 6. Repay flash loan to Navi
 * 7. Transfer remaining profit to user
 *
 * @param client AlphalendClient instance (passed by client.flashRepay)
 * @param params Flash repay parameters
 * @returns Transaction ready for signing and execution (throws on error, same as withdraw/repay)
 */
export async function buildFlashRepayTransaction(
  client: AlphalendClient,
  params: FlashRepayParams,
): Promise<Transaction> {
  // -------------------------------------------------------------------------
  // QUERY PHASE - Get position and market data
  // -------------------------------------------------------------------------

  const portfolio = await client.getUserPortfolioFromPositionCapId(
    params.positionCapId,
  );
  if (!portfolio) {
    throw new Error("No portfolio found for this position");
  }

  const allMarkets = await client.getAllMarkets();
  if (!allMarkets || allMarkets.length === 0) {
    throw new Error("Failed to fetch markets");
  }

  const repayMarket = allMarkets.find(
    (m) => m.coinType === params.repayCoinType,
  );
  const withdrawMarket = allMarkets.find(
    (m) => m.coinType === params.withdrawCoinType,
  );

  if (!repayMarket) {
    throw new Error(`No market found for repay coin: ${params.repayCoinType}`);
  }
  if (!withdrawMarket) {
    throw new Error(
      `No market found for withdraw coin: ${params.withdrawCoinType}`,
    );
  }

  const repayMarketIdNum = parseInt(params.repayMarketId);
  const borrowedTokens = portfolio.borrowedAmounts.get(repayMarketIdNum);

  if (!borrowedTokens || borrowedTokens.isZero()) {
    throw new Error(
      `No debt found in market ${params.repayMarketId} for ${params.repayCoinType}`,
    );
  }

  // -------------------------------------------------------------------------
  // CALCULATION PHASE
  // -------------------------------------------------------------------------

  const repayDecimals = repayMarket.decimalDigit;
  const withdrawDecimals = withdrawMarket.decimalDigit;

  const borrowedBaseUnits = borrowedTokens.mul(
    new Decimal(10).pow(repayDecimals),
  );
  const flashLoanAmount = borrowedBaseUnits.mul(1.005).ceil().toFixed(0);

  const flashLoanValue = new Decimal(flashLoanAmount)
    .div(new Decimal(10).pow(repayDecimals))
    .mul(repayMarket.price.toNumber());
  const withdrawAmount = flashLoanValue
    .mul(1.1)
    .div(withdrawMarket.price.toNumber())
    .mul(new Decimal(10).pow(withdrawDecimals))
    .ceil()
    .toFixed(0);

  const priceUpdateCoinTypes = (() => {
    const coinTypes = [params.repayCoinType, params.withdrawCoinType];
    for (const market of allMarkets) {
      const mId = parseInt(market.marketId);
      if (
        portfolio.suppliedAmounts.get(mId)?.gt(0) ||
        portfolio.borrowedAmounts.get(mId)?.gt(0)
      ) {
        if (!coinTypes.includes(market.coinType))
          coinTypes.push(market.coinType);
      }
    }
    return coinTypes;
  })();

  console.log(`Borrowed amount: ${borrowedTokens.toFixed(6)} tokens`);
  console.log(`Flash loan amount: ${flashLoanAmount} base units`);
  console.log(`Withdraw amount: ${withdrawAmount} base units`);
  console.log(`Price update coins: ${priceUpdateCoinTypes.join(", ")}`);

  // -------------------------------------------------------------------------
  // TRANSACTION BUILDING PHASE
  // -------------------------------------------------------------------------

  const tx = new Transaction();

  console.log("Step 1: Flash borrow from Navi");
  const [flashBalance, receipt] = await flashloanPTB(
    tx,
    params.repayCoinType,
    Number(flashLoanAmount),
    { env: "prod" },
  );

  console.log("Step 2: Balance → Coin");
  const flashCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [params.repayCoinType],
    arguments: [flashBalance],
  });

  console.log("Step 3: Repay debt on AlphaLend");
  const remainingCoin = tx.moveCall({
    target: `${client.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
    typeArguments: [params.repayCoinType],
    arguments: [
      tx.object(client.constants.LENDING_PROTOCOL_ID),
      tx.object(params.positionCapId),
      tx.pure.u64(params.repayMarketId),
      flashCoin,
      tx.object(client.constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  console.log("Step 4: Update oracle prices");
  if (client.network === "mainnet") {
    await client.updatePrices(tx, priceUpdateCoinTypes);
  }

  console.log("Step 5: Withdraw collateral");
  const promise = tx.moveCall({
    target: `${client.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::remove_collateral`,
    typeArguments: [params.withdrawCoinType],
    arguments: [
      tx.object(client.constants.LENDING_PROTOCOL_ID),
      tx.object(params.positionCapId),
      tx.pure.u64(params.withdrawMarketId),
      tx.pure.u64(withdrawAmount),
      tx.object(client.constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  const withdrawnCoin = await (
    client as unknown as {
      handlePromise(
        tx: Transaction,
        promise: unknown,
        coinType: string,
      ): Promise<TransactionObjectArgument | undefined>;
    }
  ).handlePromise(tx, promise, params.withdrawCoinType);
  if (!withdrawnCoin) {
    throw new Error("Failed to fulfill withdrawal promise");
  }

  let coinToMerge: TransactionObjectArgument;
  if (params.withdrawCoinType === params.repayCoinType) {
    console.log("Step 6: Same coin — skip swap");
    coinToMerge = withdrawnCoin;
  } else {
    console.log("Step 6: Swap withdrawn collateral → repay coin via Cetus");
    const router = await client.cetusSwap.getCetusSwapQuote(
      params.withdrawCoinType,
      params.repayCoinType,
      withdrawAmount,
    );
    if (!router) {
      throw new Error("Failed to get swap quote from Cetus. No route found.");
    }
    console.log(
      `  Cetus quote: ${router.amountIn.toString()} → ${router.amountOut.toString()}`,
    );
    coinToMerge = await client.cetusSwap.routerSwapWithInputCoin(
      router,
      tx,
      withdrawnCoin,
      params.slippage,
    );
  }

  console.log("Step 7: Merge coins");
  tx.mergeCoins(coinToMerge, [remainingCoin]);

  console.log("Step 8-9: Repay flash loan");
  const repayBalance = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [params.repayCoinType],
    arguments: [coinToMerge],
  });

  const [remainingBalance] = await repayFlashLoanPTB(
    tx,
    params.repayCoinType,
    receipt,
    repayBalance,
    { env: "prod" },
  );

  console.log("Step 10: Transfer profit to user");
  const profitCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [params.repayCoinType],
    arguments: [remainingBalance],
  });
  tx.transferObjects([profitCoin], params.address);

  return tx;
}
