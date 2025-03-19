import { devConstants } from "./devConstants.js";

import { prodConstants } from "./prodConstants.js";

const CONF_ENV = process.env.NODE_ENV || "development";

export const getConstants = () => {
  if (CONF_ENV === "production") return prodConstants;
  else return devConstants;
};

export { devConstants, prodConstants };
