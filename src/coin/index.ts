import { CoinBalance, SuiClient } from "@mysten/sui/client";

export * from "./types.js";
export * from "./constants.js";

/**
 * Fetches all coins owned by a wallet address with pagination support
 *
 * @param userAddress - The Sui address of the wallet owner
 * @param suiClient - Instance of SuiClient to interact with the Sui blockchain
 * @returns Promise resolving to an array of Coin objects containing coin information
 *
 * @example
 * const walletCoins = await getWalletCoins(
 *   '0x123...',
 *   suiClient
 * );
 * // Returns: Array of Coin objects with coin type and balance information
 *
 * @remarks This function uses pagination to handle large numbers of coins
 * and logs coin information to the console for debugging purposes
 */
export async function getWalletCoins(
  userAddress: string,
  suiClient: SuiClient,
): Promise<Map<string, string> | undefined> {
  try {
    const res = await suiClient.getAllBalances({
      owner: userAddress,
    });

    const resMap: Map<string, string> = new Map();
    res.forEach((enrty: CoinBalance) => {
      resMap.set(enrty.coinType, enrty.totalBalance);
    });
    return resMap;
  } catch (error) {
    console.error("Error fetching tokenBalances!", error);
  }
}

