import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import {
  flashloanPTB,
  repayFlashLoanPTB,
  getAllFlashLoanAssets,
} from "@naviprotocol/lending";
import { Decimal } from "decimal.js";
import { FlashRepayParams } from "./types.js";
import type { AlphalendClient } from "./client.js";

/** Minimum withdraw buffer for flash repay (decimal, e.g. 0.01 = 1%). Withdraw buffer = max(this, params.slippage). */
const FLASH_REPAY_MIN_WITHDRAW_BUFFER = 0.01;

function normalizeCoinType(coinType: string): string {
  return coinType.replace(/^0x0+/, "0x").toLowerCase();
}

export async function getNaviFlashLoanSupportedCoinTypes(options?: {
  env?: "prod";
  cacheTime?: number;
}): Promise<Set<string>> {
  const cacheTime = options?.cacheTime ?? 60_000;
  const assets = await getAllFlashLoanAssets({
    env: "prod",
    cacheTime,
  });
  const set = new Set<string>();
  for (const a of assets) {
    set.add(normalizeCoinType(a.coinType));
  }
  return set;
}

export async function getNaviFlashLoanFeeForCoinType(
  coinType: string,
  options?: { cacheTime?: number },
): Promise<number | null> {
  const cacheTime = options?.cacheTime ?? 60_000;
  const assets = await getAllFlashLoanAssets({
    env: "prod",
    cacheTime,
  });
  const normalized = normalizeCoinType(coinType);
  const asset = assets.find(
    (a) => normalizeCoinType(a.coinType) === normalized,
  );
  if (!asset || asset.flashloanFee == null) {
    return null;
  }
  const fee = Number(asset.flashloanFee);
  // Navi flashloanFee: if <= 1 treat as decimal (0.005), else as percentage (0.5)
  if (fee <= 1) {
    return fee;
  }
  return fee / 100;
}

/**
 * Builds a flash repay transaction (break out of looping position via Navi flash loan).
 * Supports full or partial repay: pass optional repayAmountBaseUnits to repay only that amount; omit for full exit.
 *
 * Steps:
 * 1. Flash borrow repay coin from Navi (repay amount + fee, e.g. 0.5%); get Balance + receipt.
 * 2. Convert Balance → Coin so it can be used in AlphaLend repay.
 * 3. Repay (full or partial) debt on AlphaLend; receive leftover repay-coin (if any).
 * 4. Update oracle prices for position coins (mainnet only).
 * 5. Withdraw collateral in withdraw-coin (exact amount to cover flash loan value).
 * 6. If withdraw ≠ repay coin: swap withdrawn collateral → repay coin via Cetus; else use as-is.
 * 7. Merge merged/same-coin with leftover from repay into one coin.
 * 8–9. Convert to Balance and repay flash loan to Navi; receive remaining balance.
 * 10. Repay same-coin debt with that balance (clears dust); AlphaLend returns leftover coin.
 * 11. Transfer leftover to user.
 *
 * @param client AlphalendClient instance (passed by client.flashRepay)
 * @param params Flash repay parameters (repayAmountBaseUnits optional for partial repay)
 * @returns Transaction ready for signing and execution (throws on error, same as withdraw/repay)
 */
export async function buildFlashRepayTransaction(
  client: AlphalendClient,
  params: FlashRepayParams,
): Promise<Transaction> {
  // -------------------------------------------------------------------------
  // PARAMS VALIDATION
  // -------------------------------------------------------------------------
  if (params.repayAmountBaseUnits != null) {
    const repayAmount = new Decimal(params.repayAmountBaseUnits);
    if (!repayAmount.gt(0)) {
      throw new Error("Repay amount must be positive");
    }
  }

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

  // Partial repay: use provided amount (capped to debt); otherwise full debt
  const effectiveRepayBaseUnits = Decimal.min(
    params.repayAmountBaseUnits
      ? new Decimal(params.repayAmountBaseUnits)
      : borrowedBaseUnits,
    borrowedBaseUnits,
  );

  // Navi docs: repay = borrow + fee; get per-asset fee from getAllFlashLoanAssets → flashloanFee (no default)
  const feeDecimal = await getNaviFlashLoanFeeForCoinType(
    params.repayCoinType,
    {
      cacheTime: 60_000,
    },
  );
  if (feeDecimal == null) {
    throw new Error(
      `Navi flash loan fee not available for ${params.repayCoinType}. Asset may not support flash loans or API returned no fee.`,
    );
  }
  const flashLoanAmount = effectiveRepayBaseUnits
    .mul(1 + feeDecimal)
    .ceil()
    .toFixed(0);

  const flashLoanValue = new Decimal(flashLoanAmount)
    .div(new Decimal(10).pow(repayDecimals))
    .mul(repayMarket.price.toNumber());

  // Slippage (decimal, e.g. 0.01 = 1%): (1) min output for Cetus swap, (2) withdraw buffer so we have enough after swap to repay Navi.
  const slippage =
    Number.isFinite(params.slippage) && params.slippage >= 0
      ? Math.min(1, params.slippage)
      : FLASH_REPAY_MIN_WITHDRAW_BUFFER;
  const withdrawBuffer = Math.max(FLASH_REPAY_MIN_WITHDRAW_BUFFER, slippage);
  const withdrawValueWithBuffer = flashLoanValue.mul(1 + withdrawBuffer);
  const withdrawAmountRaw = withdrawValueWithBuffer
    .div(withdrawMarket.price.toNumber())
    .mul(new Decimal(10).pow(withdrawDecimals))
    .ceil()
    .toFixed(0);

  // Cap withdraw to actual supplied balance so remove_token_collateral never exceeds supply (avoids MoveAbort)
  const withdrawMarketIdNum = parseInt(params.withdrawMarketId);
  const suppliedTokens = portfolio.suppliedAmounts.get(withdrawMarketIdNum);
  if (!suppliedTokens || suppliedTokens.isZero()) {
    throw new Error(
      `No supplied collateral in withdraw market ${params.withdrawMarketId}`,
    );
  }
  const suppliedBaseUnits = suppliedTokens
    .mul(new Decimal(10).pow(withdrawDecimals))
    .floor()
    .toFixed(0);
  const withdrawAmount = Decimal.min(
    new Decimal(withdrawAmountRaw),
    new Decimal(suppliedBaseUnits),
  )
    .floor()
    .toFixed(0);
  if (new Decimal(withdrawAmount).lte(0)) {
    throw new Error(
      "Insufficient collateral: computed withdraw amount is zero or negative",
    );
  }

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

  // const isPartial = params.repayAmountBaseUnits != null;
  // console.log(
  //   `Repay mode: ${isPartial ? "partial" : "full"}; borrowed (tokens): ${borrowedTokens.toFixed(6)}`,
  // );
  // console.log(`Flash loan amount: ${flashLoanAmount} base units`);
  // console.log(`Withdraw amount: ${withdrawAmount} base units`);
  // console.log(`Price update coins: ${priceUpdateCoinTypes.join(", ")}`);

  // -------------------------------------------------------------------------
  // TRANSACTION BUILDING PHASE
  // -------------------------------------------------------------------------

  const tx = new Transaction();

  // Step 1: Flash borrow from Navi — borrow repay-coin from Navi’s flash loan pool (amount = debt + 0.5% buffer). Returns a Balance and a receipt used later to repay.
  // console.log("Step 1: Flash borrow from Navi");
  const [flashBalance, receipt] = await flashloanPTB(
    tx,
    params.repayCoinType,
    Number(flashLoanAmount),
    { env: "prod" },
  );

  // Step 2: Balance → Coin — convert the flash-loan Balance into a Coin<T> so it can be passed to AlphaLend’s repay.
  // console.log("Step 2: Balance → Coin");
  const flashCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [params.repayCoinType],
    arguments: [flashBalance],
  });

  // Step 3: Repay debt on AlphaLend — call AlphaLend repay with the flash coin; debt is fully paid. Returns the leftover repay-coin (if any) after repaying.
  // console.log("Step 3: Repay debt on AlphaLend");
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

  // Step 4: Update oracle prices — refresh on-chain oracle prices for all coins in the position so withdraw/collateral math is correct (mainnet only).
  // console.log("Step 4: Update oracle prices");
  if (client.network === "mainnet") {
    await client.updatePrices(tx, priceUpdateCoinTypes);
  }

  // Step 5: Withdraw collateral — remove collateral in withdraw-coin (exact value needed to cover flash loan; no 10% buffer). Uses promise so the withdrawn coin can be used in the next step.
  // console.log("Step 5: Withdraw collateral");
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

  // Step 6: Same coin or swap — if withdraw coin equals repay coin, use withdrawn coin as-is; otherwise swap withdrawn collateral to repay coin via Cetus so we can repay the flash loan.
  let coinToMerge: TransactionObjectArgument;
  if (params.withdrawCoinType === params.repayCoinType) {
    // console.log("Step 6: Same coin — skip swap");
    coinToMerge = withdrawnCoin;
  } else {
    // console.log("Step 6: Swap withdrawn collateral → repay coin via Cetus");
    const router = await client.cetusSwap.getCetusSwapQuote(
      params.withdrawCoinType,
      params.repayCoinType,
      withdrawAmount,
    );
    if (!router) {
      throw new Error("Failed to get swap quote from Cetus. No route found.");
    }
    // console.log(
    //   `  Cetus quote: ${router.amountIn.toString()} → ${router.amountOut.toString()}`,
    // );
    coinToMerge = await client.cetusSwap.routerSwapWithInputCoin(
      router,
      tx,
      withdrawnCoin,
      slippage,
    );
  }

  // Step 7: Merge coins — combine the coin used for swap/same-coin (coinToMerge) with any leftover from AlphaLend repay (remainingCoin) into one repay-coin balance for Navi.
  // console.log("Step 7: Merge coins");
  tx.mergeCoins(coinToMerge, [remainingCoin]);

  // Step 8–9: Repay flash loan — convert merged coin to Balance and call Navi’s repayFlashLoanPTB with the receipt; Navi takes what it’s owed and returns the remaining balance as user profit.
  // console.log("Step 8-9: Repay flash loan");
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

  // Step 10a: Convert Navi excess to coin, then repay same-coin debt with it (clears dust); AlphaLend returns leftover coin.
  const excessCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [params.repayCoinType],
    arguments: [remainingBalance],
  });
  const leftoverCoin = tx.moveCall({
    target: `${client.constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::repay`,
    typeArguments: [params.repayCoinType],
    arguments: [
      tx.object(client.constants.LENDING_PROTOCOL_ID),
      tx.object(params.positionCapId),
      tx.pure.u64(params.repayMarketId),
      excessCoin,
      tx.object(client.constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  // Step 10b: Transfer any leftover (after second repay) to user.
  tx.transferObjects([leftoverCoin], params.address);

  return tx;
}
