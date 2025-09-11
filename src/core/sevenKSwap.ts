// Use CJS version to avoid broken ESM exports (DEFAULT_SOURCES missing)
import type { QuoteResponse } from "@7kprotocol/sdk-ts";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { SwapOptions, SwapQuote } from "./types.js";
import { getLatestPrices, PythPriceIdPair } from "../coin/index.js";

// Dynamically import from CJS version which has working exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkPromise: Promise<any> | null = null;

function getSDK() {
  if (!sdkPromise) {
    // Use CJS export path which has all exports working
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Dynamic import path not resolvable in CJS config but works at runtime
    sdkPromise = import("@7kprotocol/sdk-ts/cjs");
  }
  return sdkPromise;
}

export class SevenKGateway {
  constructor() {}

  public async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    swapOptions?: SwapOptions,
  ) {
    const sdk = await getSDK();

    const quoteResponse = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString().split(".")[0], //swap_amount.split(".")[0];
    });
    if (!swapOptions) {
      return quoteResponse;
    }
    const sevenKEstimatedAmountOut = BigInt(
      quoteResponse ? quoteResponse.returnAmountWithDecimal.toString() : 0,
    );

    const sevenKEstimatedAmountOutWithoutFee = BigInt(
      quoteResponse
        ? quoteResponse.returnAmountWithoutSwapFees
          ? quoteResponse.returnAmountWithoutSwapFees.toString()
          : sevenKEstimatedAmountOut.toString()
        : sevenKEstimatedAmountOut.toString(),
    );

    const sevenKEstimatedFeeAmount =
      sevenKEstimatedAmountOut - sevenKEstimatedAmountOutWithoutFee;

    const amount = BigInt(
      quoteResponse ? quoteResponse.swapAmountWithDecimal : 0,
    );

    const pairNameA: PythPriceIdPair = (swapOptions.pair.coinA.name +
      "/" +
      "USD") as PythPriceIdPair;
    const pairNameB: PythPriceIdPair = (swapOptions.pair.coinB.name +
      "/" +
      "USD") as PythPriceIdPair;

    const [priceA, priceB] = await getLatestPrices(
      [pairNameA, pairNameB],
      true,
    );

    let quote: SwapQuote;

    if (priceA && priceB) {
      const inputAmountInUSD =
        (Number(amount) / Math.pow(10, swapOptions.pair.coinA.expo)) *
        parseFloat(priceA);
      const outputAmountInUSD =
        (Number(sevenKEstimatedAmountOut) /
          Math.pow(10, swapOptions.pair.coinB.expo)) *
        parseFloat(priceB);

      const slippage =
        (inputAmountInUSD - outputAmountInUSD) / inputAmountInUSD;

      quote = {
        gateway: "7k",
        estimatedAmountOut: sevenKEstimatedAmountOut,
        estimatedFeeAmount: sevenKEstimatedFeeAmount,
        inputAmount: amount,
        inputAmountInUSD: inputAmountInUSD,
        estimatedAmountOutInUSD: outputAmountInUSD,
        slippage: slippage,
      };
    } else {
      console.warn(
        "Could not get prices from Pyth Network, using fallback pricing.",
      );

      // Create quote with basic pricing (assuming 1:1 for simplicity)
      quote = {
        gateway: "7k",
        estimatedAmountOut: sevenKEstimatedAmountOut,
        estimatedFeeAmount: sevenKEstimatedFeeAmount,
        inputAmount: amount,
        inputAmountInUSD: 0, // Will be updated when prices are available
        estimatedAmountOutInUSD: 0, // Will be updated when prices are available
        slippage: swapOptions.slippage,
      };
    }

    return quote;
    // return quoteResponse;
  }

  async getTransactionBlock(
    tx: Transaction,
    address: string,
    slippage: number,
    quoteResponse: QuoteResponse,
    coinIn?: TransactionObjectArgument,
  ): Promise<{
    tx: Transaction;
    coinOut: TransactionObjectArgument | undefined;
  }> {
    try {
      const sdk = await getSDK();
      const { tx: resultTx, coinOut } = await sdk.buildTx({
        quoteResponse,
        accountAddress: address,
        slippage,
        commission: {
          partner:
            "0x401c29204828bed9a2f9f65f9da9b9e54b1e43178c88811e2584e05cf2c3eb6f", // Valid commission partner address
          commissionBps: 0, // 0 basis points = no commission
        },
        extendTx: {
          tx,
          coinIn,
        },
      });
      if (coinOut) {
        tx.transferObjects([coinOut], address);
      }
      /*
      const { tx, coinOut } = await this.sevenKGateway.getTransactionBlock(
          transaction || new Transaction(),
          this.swapOptions.senderAddress,
          this.swapOptions.slippage / 100, // Convert percentage to decimal
          quoteResponse,
        );
        
        // Transfer any remaining coins to the sender address
        if (coinOut) {
          tx.transferObjects([coinOut], this.swapOptions.senderAddress);
        }
      */
      return { tx: resultTx || tx, coinOut };
    } catch (error) {
      console.error("Error building 7K transaction:", error);
      return { tx, coinOut: undefined };
    }
  }
}
