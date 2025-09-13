// Use CJS version to avoid broken ESM exports (DEFAULT_SOURCES missing)
import { type QuoteResponse } from "@7kprotocol/sdk-ts";
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

  public async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    const sdk = await getSDK();

    const quoteResponse = await sdk.getQuote({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString().split(".")[0],
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
