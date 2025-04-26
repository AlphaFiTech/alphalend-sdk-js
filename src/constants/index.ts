import { alphafiConstants } from "./alphafiConstants.js";
import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";

export const getConstants = (network: string) => {
  if (network === "mainnet") return prodConstants;
  else return devConstants;
};

export const getAlphafiConstants = () => {
  return alphafiConstants;
};
