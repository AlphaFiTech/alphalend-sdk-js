// Use CJS version to avoid broken ESM exports (DEFAULT_SOURCES missing)
import { type QuoteResponse } from "@7kprotocol/sdk-ts";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { CoinMetadata } from "./types.js";

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
  private coinMetadataMap: Map<string, CoinMetadata>;
  private static globalCoinMetadataMap: Map<string, CoinMetadata> = new Map();
  constructor() {
    this.coinMetadataMap = new Map();
  }

  updateCoinMetadataMap(coinMetadataMap: Map<string, CoinMetadata>): void {
    this.coinMetadataMap = coinMetadataMap;
    SevenKGateway.globalCoinMetadataMap = new Map(coinMetadataMap);
  }

  public async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippage?: number,
  ) {
    const sdk = await getSDK();

    const quoteResponse = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString().split(".")[0], //swap_amount.split(".")[0];
    });
    if (!slippage) {
      return quoteResponse;
    }
    // Use global map if instance map is empty
    const coinMap = this.coinMetadataMap.size > 0
      ? this.coinMetadataMap
      : SevenKGateway.globalCoinMetadataMap;

    const coinIn = coinMap.get(tokenIn);
    const coinOut = coinMap.get(tokenOut);
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

    let quote: any;
    const priceA = coinIn?.pythPrice || coinIn?.coingeckoPrice;
    const priceB = coinOut?.pythPrice || coinOut?.coingeckoPrice;
    const coinAExpo = coinIn?.decimals;
    const coinBExpo = coinOut?.decimals;
    if (priceA && priceB && coinAExpo && coinBExpo) {
      const inputAmountInUSD =
        (Number(amount) / Math.pow(10, coinAExpo)) *
        parseFloat(priceA);
      const outputAmountInUSD =
        (Number(sevenKEstimatedAmountOut) /
          Math.pow(10, coinBExpo)) *
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
        slippage: slippage,
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
  ): Promise<TransactionObjectArgument | undefined> {
    const sdk = await getSDK();
    const { coinOut } = await sdk.buildTx({
      quoteResponse,
      accountAddress: address,
      slippage,
      commission: {
        partner: address, // Use the user's address as partner
        commissionBps: 0, // 0 basis points = no commission
      },
      extendTx: {
        tx,
        coinIn,
      },
    });

    return coinOut;
  }
}
