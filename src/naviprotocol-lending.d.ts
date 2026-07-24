// NAVI v2 (@naviprotocol/lending) ships ESM `.d.ts` files with extensionless
// relative re-exports, which don't resolve under `moduleResolution: NodeNext`
// (the runtime bundle is a single self-contained file and works fine). Declare
// the flash-loan helpers we use so they type-resolve. Remove if NAVI fixes
// their packaging.
declare module "@naviprotocol/lending" {
  type NaviTx = import("@mysten/sui/transactions").Transaction;
  type NaviTxResult = import("@mysten/sui/transactions").TransactionResult;

  export function getAllFlashLoanAssets(options?: {
    env?: "prod" | "dev";
    cacheTime?: number;
    disableCache?: boolean;
    market?: string;
  }): Promise<
    Array<{
      max: string;
      min: string;
      assetId: number;
      poolId: string;
      supplierFee: number;
      flashloanFee: number;
      coinType: string;
    }>
  >;

  export function flashloanPTB(
    tx: NaviTx,
    identifier: string,
    amount: number | NaviTxResult,
    options?: { env?: "prod" | "dev"; market?: string },
  ): Promise<NaviTxResult[]>;

  export function repayFlashLoanPTB(
    tx: NaviTx,
    identifier: string,
    receipt: NaviTxResult | string,
    coinObject: NaviTxResult | string,
    options?: { env?: "prod" | "dev"; market?: string },
  ): Promise<NaviTxResult[]>;
}
