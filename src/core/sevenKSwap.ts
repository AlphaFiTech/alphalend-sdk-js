// Import from CJS export to workaround broken ESM exports issue
// The ESM version has missing DEFAULT_SOURCES export, but CJS version works correctly
import sdk from "@7kprotocol/sdk-ts/cjs";
import type { QuoteResponse } from "@7kprotocol/sdk-ts";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";

const { buildTx, getQuote } = sdk;

export class SevenKGateway {
  constructor() {}

  async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    const quoteResponse = await getQuote({
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
  ): Promise<TransactionObjectArgument | undefined> {
    const { coinOut } = await buildTx({
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
