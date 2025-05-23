import { alphafiConstants } from "./alphafiConstants.js";
import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";
import { Constants } from "./types.js";

export type { Constants };

export const getConstants = (network: string) => {
  if (network === "mainnet") return prodConstants;
  else return devConstants;
};

export const getAlphafiConstants = () => {
  return alphafiConstants;
};
