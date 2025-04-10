import { SuiClient } from "@mysten/sui/client";

// Main exports
export * from "./constants/index.js";
export * from "./core/client.js";
export * from "./core/types.js";
export * from "./utils/oracle.js";
export * from "./utils/priceFeedIds.js";
export * from "./coin/index.js";

// Re-export key types for easier access
export { AlphalendClient } from "./core/client.js";

export {
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
  ClaimRewardsParams,
  LiquidateParams,
  MAX_U64,
  Market,
  Position,
  Portfolio,
  Loan,
  TransactionResponse,
} from "./core/types.js";

export function getSuiClient() {
  return new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
}
