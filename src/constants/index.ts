import { devConstants } from "./devConstants.js";
import { prodConstants } from "./prodConstants.js";

const CONF_ENV: string = "development";

export const getConstants = () => {
  if (CONF_ENV === "production") return prodConstants;
  else return devConstants;
};

export { devConstants, prodConstants };
