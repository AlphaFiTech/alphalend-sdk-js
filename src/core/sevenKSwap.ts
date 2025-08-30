// Use CJS version to avoid broken ESM exports (DEFAULT_SOURCES missing)
import type { QuoteResponse } from "@7kprotocol/sdk-ts";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";

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

  async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    const sdk = await getSDK();
    console.log("tokenIn", tokenIn);
    console.log("tokenOut", tokenOut);
    console.log("amountIn", amountIn);
    const quoteResponse = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
    });
    return quoteResponse;
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
          partner: "0x401c29204828bed9a2f9f65f9da9b9e54b1e43178c88811e2584e05cf2c3eb6f", // Valid commission partner address
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
          this.sevenKQuote,
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
