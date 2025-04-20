import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";

const CONF_ENV = process.env.NODE_ENV || "development";

export const getConstants = () => {
  // Note: prodConstants is used for production environment keep this for final deployment
  // if (CONF_ENV === "production")
  //   return prodConstants;
  // else return devConstants;

  // Note: devConstants is used for local development and staging
  return devConstants;
};

export { devConstants, prodConstants };
