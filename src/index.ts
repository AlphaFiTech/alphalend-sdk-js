import { SuiClient } from "@mysten/sui/client";

// Main exports
export * from "./constants/index.js";
export * from "./core/client.js";
export * from "./utils/oracle.js";
export * from "./utils/priceFeedIds.js";
export * from "./coin/index.js";
export * from "./core/types.js";

// Re-export key types for easier access
export { AlphalendClient } from "./core/client.js";
export { getUserPositionCapId } from "./models/position/functions.js";
export { updatePythIdentifierForCoin } from "./admin/oracle.js";

export function getSuiClient(network?: string) {
  const mainnetUrl = "https://alphalen-suimain-ef6f.mainnet.sui.rpcpool.com";
  const testnetUrl = "https://fullnode.testnet.sui.io/";
  const devnetUrl = "https://fullnode.devnet.sui.io/";

  let rpcUrl = devnetUrl;
  if (network === "mainnet") {
    rpcUrl = mainnetUrl;
  } else if (network === "testnet") {
    rpcUrl = testnetUrl;
  }

  return new SuiClient({
    url: rpcUrl,
  });
}
