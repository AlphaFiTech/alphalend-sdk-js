import { SuiClient } from "@mysten/sui/client";
import { getConstants } from "../../constants/index.js";
import {
  PositionCapQueryType,
  PositionQueryType,
} from "../../utils/queryTypes.js";

// Function to fetch all owned objects and find the PositionCap
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

// Function to fetch all owned objects and find the PositionCap and return the positionId
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
