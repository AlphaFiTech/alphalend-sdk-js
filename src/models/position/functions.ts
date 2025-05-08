/**
 * Position Functions Module
 * 
 * This module provides utility functions for working with user positions in the AlphaLend protocol:
 * - Fetching position capability IDs and position IDs
 * - Retrieving user position data
 * - Managing position objects and their relationships
 */
import { SuiClient } from "@mysten/sui/client";
import { getConstants } from "../../constants/index.js";
import {
  PositionCapQueryType,
  PositionQueryType,
} from "../../utils/queryTypes.js";

/**
 * Fetches a user's position capability ID
 * 
 * @param suiClient - SuiClient instance
 * @param network - Network name ("mainnet", "testnet", or "devnet")
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position capability ID or undefined if not found
 */
export const getUserPositionCapId = async (
  suiClient: SuiClient,
  network: string,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    const constants = getConstants(network);
    // Fetch owned objects for the user
    const response = await suiClient.getOwnedObjects({
      owner: userAddress,
      options: {
        showContent: true, // Include object content to access fields
      },
      filter: {
        StructType: constants.POSITION_CAP_TYPE,
      },
    });

    if (!response || !response.data || response.data.length === 0) {
      return undefined;
    }
    return response.data[0].data?.objectId;
  } catch (error) {
    console.error("Error fetching user positionCap ID:", error);
  }
};

/**
 * Fetches a user's position ID from their position capability
 * 
 * @param suiClient - SuiClient instance
 * @param network - Network name ("mainnet", "testnet", or "devnet")
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position ID or undefined if not found
 */
export const getUserPositionId = async (
  suiClient: SuiClient,
  network: string,
  userAddress: string,
): Promise<string | undefined> => {
  try {
    const constants = getConstants(network);
    // Fetch owned objects for the user
    const response = await suiClient.getOwnedObjects({
      owner: userAddress,
      options: {
        showContent: true, // Include object content to access fields
      },
      filter: {
        StructType: constants.POSITION_CAP_TYPE,
      },
    });

    if (!response || !response.data || response.data.length === 0) {
      return undefined;
    }

    // Find the first PositionCap object and extract the positionCap ID
    const positionCapObject = response
      .data[0].data as unknown as PositionCapQueryType;

    return positionCapObject.content.fields.position_id;
  } catch (error) {
    console.error("Error fetching user position ID:", error);
  }
};

/**
 * Retrieves the complete position object for a user
 * 
 * @param suiClient - SuiClient instance
 * @param network - Network name ("mainnet", "testnet", or "devnet")
 * @param userAddress - Address of the user
 * @returns Promise resolving to the position object or undefined if not found
 */
export const getUserPosition = async (
  suiClient: SuiClient,
  network: string,
  userAddress: string,
): Promise<PositionQueryType | undefined> => {
  const constants = getConstants(network);
  const positionId = await getUserPositionId(suiClient, network, userAddress);
  if (!positionId) {
    console.error("No position ID found");
    return undefined;
  }

  const response = await suiClient.getDynamicFieldObject({
    parentId: constants.POSITION_TABLE_ID,
    name: {
      type: "0x2::object::ID",
      value: positionId,
    },
  });

  return response.data as unknown as PositionQueryType;
};
