import {
  AggregatorClient,
  getProvidersExcluding,
  RouterDataV3,
} from "@cetusprotocol/aggregator-sdk";
// import { getFullnodeUrl } from '@mysten/sui/client/network.js';
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";

// Re-export RouterDataV3 type for external use
export type { RouterDataV3 } from "@cetusprotocol/aggregator-sdk";

export class CetusSwap {
  network: "mainnet" | "testnet" | "devnet" | "localnet";
  client: AggregatorClient;
  cetusRouterDataV3: RouterDataV3 | null;

  constructor(network: "mainnet" | "testnet" | "devnet" | "localnet") {
    this.network = network;
    this.client = new AggregatorClient({});
    this.cetusRouterDataV3 = null;
  }

  async getCetusSwapQuote(
    from: string,
    target: string,
    amount: string,
  ): Promise<RouterDataV3 | undefined> {
    try {
      const providersExcept = getProvidersExcluding([
        "STEAMM_OMM_V2",
        "OBRIC",
        "METASTABLE",
        "HAEDALHMMV2",
        "HAEDALPMM",
      ]);

      const router = await this.client.findRouters({
        from,
        target,
        amount,
        byAmountIn: true, // `true` means fix input amount, `false` means fix output amount
        providers: providersExcept,
      });
      return router || undefined;
    } catch (error) {
      console.error("Error getting cetus swap quote", error);
      throw error;
    }
  }

  async cetusSwapTokensTxb(
    router: RouterDataV3,
    slippage: number,
    inputCoin?: TransactionObjectArgument | string,
    address?: string,
    existingTx?: Transaction,
  ): Promise<TransactionObjectArgument | Transaction> {
    //Promise<{ tx: Transaction; coinOut?: TransactionObjectArgument }> {
    try {
      if (!router) {
        throw new Error("No routers found");
      }
      console.log("cetus swap tokens txb", {
        router,
        slippage,
        inputCoin,
        address,
        existingTx,
      });
      // Use existing transaction if provided, otherwise create new one
      const txb = existingTx || new Transaction();

      if (inputCoin && address) {
        // Use routerSwap to completely consume the input coin
        const coinOut = await this.client.routerSwap({
          router,
          txb,
          inputCoin: inputCoin as TransactionObjectArgument,
          slippage: slippage || 0.01, // Use provided slippage or 1% default
        });

        // Return target coin for use in subsequent operations
        return coinOut;
      } else {
        // Use fastRouterSwap for simple swaps
        await this.client.fastRouterSwap({
          router,
          txb,
          slippage: slippage || 0.01,
        });

        return txb;
      }
    } catch (error) {
      console.error("Error swapping tokens in cetus swap", error);
      throw error;
    }
  }

  /**
   * Build swap transaction using routerSwap method (BuildRouterSwapParamsV3)
   * This method will completely consume the input coin amount and return target coin object.
   * 
   * @param router - RouterData Object returned by findRouters method
   * @param txb - The programmable transaction builder
   * @param inputCoin - The input coin object to be swapped (will be completely consumed)
   * @param slippage - A value between 0 and 1, representing the maximum allowed price slippage
   * @returns TransactionObjectArgument - The target coin object that can be used in PTB
   */
  async routerSwapWithInputCoin(
    router: RouterDataV3,
    txb: Transaction,
    inputCoin: TransactionObjectArgument,
    slippage: number,
  ): Promise<TransactionObjectArgument> {
    try {
      if (!router) {
        throw new Error("No router data provided");
      }

      console.log("Cetus routerSwap - completely consuming input coin", {
        amountIn: router.amountIn.toString(),
        amountOut: router.amountOut.toString(),
        slippage,
      });

      const targetCoin = await this.client.routerSwap({
        router,
        txb,
        inputCoin,
        slippage,
      });

      console.log("Swap completed, target coin object returned");
      return targetCoin;
    } catch (error) {
      console.error("Error in routerSwap:", error);
      throw error;
    }
  }
}
