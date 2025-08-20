import { buildTx, getQuote, QuoteResponse } from "@7kprotocol/sdk-ts";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";

type sevenKSwapOptions = {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
};

export class SevenKGateway {
  constructor() {}

  async getQuote(options: sevenKSwapOptions) {
    const { tokenIn, tokenOut, amountIn } = options;
    const quoteResponse = await getQuote({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
    });
    return quoteResponse;
  }

  // getTransactionBlock returns a transaction and also returns a coinOut argument which is some coins left out that we have to transfer to the user seperately.
  async getTransactionBlock(
    address: string,
    slippage: number,
    quoteResponse: QuoteResponse,
    transaction?: Transaction,
  ): Promise<TransactionObjectArgument | undefined> {
    const txb = transaction ? transaction : new Transaction();
    const commissionPartnerAddress = "";
    const { coinOut } = await buildTx({
      quoteResponse,
      accountAddress: address,
      slippage,
      commission: {
        partner: commissionPartnerAddress,
        commissionBps: 0,
      },
      extendTx: {
        tx: txb,
      },
    });
    return coinOut;
  }
}
