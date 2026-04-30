/**
 * Position Functions Module
 *
 * This module provides utility functions for working with user positions in
 * the AlphaLend protocol. All functions go through the `Blockchain` (GraphQL)
 * primitive — no JSON-RPC / `SuiClient` is used.
 */
import { Blockchain } from "../blockchain.js";
import { PositionType } from "../../utils/parsedTypes.js";

/**
 * Fetches a user's position capability ID (first cap returned by GraphQL).
 *
 * @param blockchain - Blockchain client
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position capability ID or undefined if
 *          the user owns no PositionCap.
 */
export const getUserPositionCapId = async (
  blockchain: Blockchain,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    const caps = await blockchain.getPositionCapsForUser(userAddress);
    return caps[0]?.id;
  } catch (error) {
    console.error("Error fetching user positionCap ID:", error);
  }
};

/**
 * Fetches a user's position capability IDs sorted by creation time (oldest first).
 *
 * @param blockchain - Blockchain client
 * @param userAddress - Address of the user
 * @returns Promise resolving to sorted position capability IDs or undefined
 *          on error. Returns empty array if the user has no caps.
 */
export const getUserPositionCapIds = async (
  blockchain: Blockchain,
  userAddress: string,
): Promise<(string | undefined)[] | undefined> => {
  try {
    const caps = await blockchain.getPositionCapsForUser(userAddress);
    if (caps.length === 0) return undefined;

    const withTimestamps = await Promise.all(
      caps.map(async (cap) => {
        const tx = await blockchain.getEarliestTxForObject(cap.id);
        return { id: cap.id, ts: tx?.timestampMs ?? 0 };
      }),
    );
    withTimestamps.sort((a, b) => a.ts - b.ts);
    return withTimestamps.map((entry) => entry.id);
  } catch (error) {
    console.error("Error fetching user positionCap IDs:", error);
  }
};

/**
 * Fetches a user's position ID (first cap's position_id).
 *
 * @param blockchain - Blockchain client
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position ID or undefined if not found.
 */
export const getUserPositionId = async (
  blockchain: Blockchain,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    const caps = await blockchain.getPositionCapsForUser(userAddress);
    return caps[0]?.positionId;
  } catch (error) {
    console.error("Error fetching user position ID:", error);
  }
};

/**
 * Fetches all of a user's position IDs from their position capabilities.
 *
 * @param blockchain - Blockchain client
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position IDs, empty array if not found,
 *          undefined on error.
 */
export const getUserPositionIds = async (
  blockchain: Blockchain,
  userAddress: string,
): Promise<string[] | undefined> => {
  try {
    const caps = await blockchain.getPositionCapsForUser(userAddress);
    return caps.map((c) => c.positionId);
  } catch (error) {
    console.error("Error fetching user position IDs:", error);
  }
};

/**
 * Retrieves the complete position object for a user.
 *
 * @param blockchain - Blockchain client
 * @param userAddress - Address of the user
 * @returns Promise resolving to the parsed position or undefined if not found.
 */
export const getUserPosition = async (
  blockchain: Blockchain,
  userAddress: string,
): Promise<PositionType | undefined> => {
  const positionId = await getUserPositionId(blockchain, userAddress);
  if (!positionId) {
    console.error("No position ID found");
    return undefined;
  }
  return blockchain.getPosition(positionId);
};
