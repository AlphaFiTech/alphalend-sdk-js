import { devConstants } from "./devConstants";

import { prodConstants } from "./prodConstants";

const CONF_ENV = process.env.NODE_ENV || "development";

export const getConstants = () => {
  if (CONF_ENV === "production") return prodConstants;
  else return devConstants;
};

export { devConstants, prodConstants };
