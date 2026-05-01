import { alphafiConstants } from "./alphafiConstants.js";
import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";
import { Constants } from "./types.js";

export type { Constants };

/**
 * Supported Sui networks for the AlphaLend SDK.
 */
export type Network = "mainnet" | "testnet" | "devnet";

export const getConstants = (network: Network) => {
  if (network === "mainnet") return prodConstants;
  else return devConstants;
};

export const getAlphafiConstants = () => {
  return alphafiConstants;
};
