import { SuiClient } from "@mysten/sui/client";

// Main exports
export * from "./constants/index.js";
export * from "./core/client.js";
export * from "./utils/oracle.js";
export * from "./utils/priceFeedIds.js";
export * from "./coin/index.js";
export { updatePythIdentifierForCoin } from "./admin/oracle.js";
export { getUserPositionCapId } from "./models/position/functions.js";

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

export function getSuiClient(network?: string) {
  const mainnetUrls = [
    "https://fullnode.mainnet.sui.io/",
    "https://mainnet.suiet.app",
    "https://rpc-mainnet.suiscan.xyz/",
  ];
  const testnetUrls = ["https://fullnode.testnet.sui.io/"];
  const devnetUrls = ["https://fullnode.devnet.sui.io/"];
  const localnetUrls = ["http://localhost:9000"];

  let urls: string[] = [];
  if (network === "mainnet") {
    urls = mainnetUrls;
  } else if (network === "testnet") {
    urls = testnetUrls;
  } else if (network === "devnet") {
    urls = devnetUrls;
  } else {
    urls = localnetUrls;
  }

  return new SuiClient({
    url: urls[Math.floor(Math.random() * urls.length)],
  });
}
