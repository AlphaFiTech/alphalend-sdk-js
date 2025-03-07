import { SuiClient } from "@mysten/sui/client";

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
export class AlphalendClient {
  client: SuiClient;

  constructor(client: SuiClient) {
    this.client = client;
  }
}
