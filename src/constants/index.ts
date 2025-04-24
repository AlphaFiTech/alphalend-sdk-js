import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";

export const getConstants = (network: string) => {
  if (network === "mainnet") return prodConstants;
  else return devConstants;
};
