import { SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { getConstants } from "../constants/index.js";
import { Transaction } from "@mysten/sui/transactions";
import {
  getPriceInfoObjectIds,
  updatePriceTransaction,
} from "../utils/oracle.js";
import { pythPriceFeedIds } from "../utils/priceFeedIds.js";

/**
 * AlphaLend Client
 *
 * The main entry point for interacting with the AlphaLend protocol:
 * - Provides methods for all protocol actions (supply, borrow, withdraw, repay)
 * - Handles connection to the Sui blockchain
 * - Manages transaction building, signing and submission
 * - Exposes query methods for protocol state and user positions
 * - Initializes and coordinates other protocol components
 */

const constants = getConstants();

export class AlphalendClient {
  client: SuiClient;
  pythClient: SuiPythClient;
  pythConnection: SuiPriceServiceConnection;

  constructor(client: SuiClient) {
    this.client = client;
    this.pythClient = new SuiPythClient(
      client,
      constants.PYTH_STATE_ID,
      constants.WORMHOLE_STATE_ID,
    );
    this.pythConnection = new SuiPriceServiceConnection(
      "https://hermes.pyth.network",
    );
  }

  /**
   * Updates price information for an asset from Pyth oracle
   */
  async updatePrices(coinNames: string[]): Promise<Transaction> {
    let tx = new Transaction();
    const priceIDs = coinNames.map((coin) => pythPriceFeedIds[coin]);
    const priceInfoObjectIds = await getPriceInfoObjectIds(
      tx,
      priceIDs,
      this.pythClient,
      this.pythConnection,
    );
    priceInfoObjectIds.forEach((priceInfoObjectId) => {
      tx = updatePriceTransaction(tx, {
        oracle: constants.ORACLE_OBJECT_ID,
        priceInfoObject: priceInfoObjectId,
        clock: constants.SUI_CLOCK_OBJECT_ID,
      });
    });
    return tx;
  }
}
