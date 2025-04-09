import { coins } from "../coin/constants.js";
import { SuiClient } from "@mysten/sui/client";

/**
 * Fetches balances for specific tokens owned by an address
 *
 * @param owner - The Sui address of the wallet owner
 * @param tokenNames - Array of token names to fetch balances for (e.g., ['SUI', 'USDC'])
 * @param suiClient - Instance of SuiClient to interact with the Sui blockchain
 * @returns Promise resolving to an array of objects containing token names and their balances
 *
 * @example
 * const balances = await getBalances(
 *   '0x123...',
 *   ['SUI', 'USDC'],
 *   suiClient
 * );
 * // Returns: [{ tokenName: 'SUI', balance: '1000000000' }, { tokenName: 'USDC', balance: '500000000' }]
 */
export async function getBalances(
  owner: string,
  tokenNames: string[],
  suiClient: SuiClient,
): Promise<{ tokenName: string; balance: string }[]> {
  // Fetch all balances for the owner from the Sui blockchain
  const allBalances = await suiClient.getAllBalances({
    owner: owner,
  });

  // Filter coins based on requested token names
  const selectedCoins = Object.values(coins).filter((coin) =>
    tokenNames.includes(coin.name),
  );

  // Extract coin types from selected coins
  const coinTypes = selectedCoins.map((coin) => coin.type) as string[];

  // Filter and map balances to include only requested tokens
  const balances = allBalances
    .filter((balance) => coinTypes.includes(balance.coinType))
    .map((balance) => {
      const coin = selectedCoins.find((coin) => coin.type === balance.coinType);
      return {
        tokenName: coin ? coin.name : "Unknown",
        balance: balance.totalBalance,
      };
    });

  return balances;
}

/**
 * Fetches balances for all tokens owned by an address
 *
 * @param owner - The Sui address of the wallet owner
 * @param suiClient - Instance of SuiClient to interact with the Sui blockchain
 * @returns Promise resolving to an array of objects containing token names and their balances
 *
 * @example
 * const allBalances = await getAllBalances(
 *   '0x123...',
 *   suiClient
 * );
 * // Returns: [{ tokenName: 'SUI', balance: '1000000000' }, { tokenName: 'USDC', balance: '500000000' }, ...]
 */
export async function getAllBalances(
  owner: string,
  suiClient: SuiClient,
): Promise<{ tokenName: string; balance: string }[]> {
  // Fetch all balances for the owner from the Sui blockchain
  const allBalances = await suiClient.getAllBalances({ owner });

  // Map all balances to include token names
  const balances = allBalances.map((balance) => {
    const coin = Object.values(coins).find(
      (coin) => coin.type.toLowerCase() === balance.coinType.toLowerCase(),
    );
    return {
      tokenName: coin ? coin.name : "Unknown",
      balance: balance.totalBalance,
    };
  });

  return balances;
}
