import { SuiClient } from "@mysten/sui/client";

// Main exports
export * from "./constants/index.js";
export * from "./core/client.js";
export * from "./utils/oracle.js";
export * from "./utils/priceFeedIds.js";
export * from "./coin/index.js";
export * from "./core/types.js";
export { updatePythIdentifierForCoin } from "./admin/oracle.js";
export { getUserPositionCapId } from "./models/position/functions.js";

// Re-export key types for easier access
export { AlphalendClient } from "./core/client.js";

export function getSuiClient(network?: string) {
  return new SuiClient({
    url: "https://alphalen-suimain-ef6f.mainnet.sui.rpcpool.com",
  });
}
