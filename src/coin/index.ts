import { Coin } from "./types.js";
import { PaginatedCoins, SuiClient } from "@mysten/sui/client";

export * from "./types.js";
export * from "./constants.js";

/**
 * Fetches all coins owned by a wallet address with pagination support
 *
 * @param owner - The Sui address of the wallet owner
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
 * @note This function uses pagination to handle large numbers of coins
 * and logs coin information to the console for debugging purposes
 */
export async function getWalletCoins(
  owner: string,
  suiClient: SuiClient,
): Promise<Coin[]> {
  const coins: Coin[] = [];
  let currentCursor: string | null | undefined = null;
  const coinTypes: string[] = [];

  // Loop through all pages of coins using cursor-based pagination
  while (true) {
    // Fetch a page of coins for the owner
    const paginatedCoins: PaginatedCoins = await suiClient.getAllCoins({
      owner: owner,
      cursor: currentCursor,
    });

    // Process each coin in the current page
    paginatedCoins.data.forEach((coin) => {
      // Log coin information for debugging
      console.log(`Coin Name: ${coin.coinType}, Coin Value: ${coin.balance}`);
      coinTypes.push(coin.coinType);
    });

    // Check if there are more pages to fetch
    if (paginatedCoins.hasNextPage && paginatedCoins.nextCursor) {
      currentCursor = paginatedCoins.nextCursor;
    } else {
      // No more pages available, exit the loop
      console.log("No more coins available.");
      break;
    }
  }

  return coins;
}
