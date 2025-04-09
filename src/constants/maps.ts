import { getConstants } from "./index.js";

/**
 * Mapping Constants
 *
 * Contains various mapping objects used in the protocol:
 * - Asset symbol to object ID mappings
 * - Network ID to RPC URL mappings
 * - Error code to message mappings
 * - Protocol action to move function mappings
 * - Token decimal precision mappings
 * - Asset risk parameter mappings
 */
const constants = getConstants();

export const coinNameToCoinType: { [key: string]: string } = {
  SUI: constants.SUI_COIN_TYPE,
  USDC: constants.USDC_COIN_TYPE,
  USDT: constants.USDT_COIN_TYPE,
  STSUI: constants.STSUI_COIN_TYPE,
};
