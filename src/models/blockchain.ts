import { DynamicFieldInfo, SuiClient } from "@mysten/sui/client";
import { getConstants } from "../constants/index.js";
import { Constants } from "../constants/types.js";
import {
  MarketQueryType,
  PositionQueryType,
  PositionCapQueryType,
} from "../utils/queryTypes.js";
import {
  parseMarket,
  parsePosition,
  parsePositionCap,
} from "../utils/parser.js";
import {
  MarketType,
  PositionType,
  PositionCapType,
} from "../utils/parsedTypes.js";

export class Blockchain {
  network: string;
  client: SuiClient;
  constants: Constants;

  constructor(network: string, client: SuiClient) {
    this.network = network;
    this.client = client;
    this.constants = getConstants(network);
  }

  async getMarketQuery(marketId: number): Promise<MarketQueryType> {
    const response = await this.client.getDynamicFieldObject({
      parentId: this.constants.MARKETS_TABLE_ID,
      name: {
        type: "u64",
        value: marketId.toString(),
      },
    });

    if (!response.data) {
      throw new Error(`Market ${marketId} not found`);
    }
    return response.data as MarketQueryType;
  }

  async getMarket(marketId: number): Promise<MarketType> {
    const response = await this.client.getDynamicFieldObject({
      parentId: this.constants.MARKETS_TABLE_ID,
      name: {
        type: "u64",
        value: marketId.toString(),
      },
    });

    if (!response.data) {
      throw new Error(`Market ${marketId} not found`);
    }
    return parseMarket(response.data as MarketQueryType);
  }

  async getAllMarkets(): Promise<MarketType[]> {
    let res: DynamicFieldInfo[] = [];
    let currentCursor: string | null | undefined = null;
    do {
      const response = await this.client.getDynamicFields({
        parentId: this.constants.MARKETS_TABLE_ID,
        cursor: currentCursor,
      });
      res = res.concat(response.data);

      // Check if there's a next page
      if (response.hasNextPage && response.nextCursor) {
        currentCursor = response.nextCursor;
      } else {
        // No more pages available
        // console.log("No more receipts available.");
        break;
      }
    } while (currentCursor !== null);

    const marketsResponse = await this.client.multiGetObjects({
      ids: res.map((m) => m.objectId),
      options: {
        showContent: true,
      },
    });
    const markets = marketsResponse.map((m) =>
      parseMarket(m.data as MarketQueryType),
    );
    return markets;
  }

  /**
   * Get position by position ID
   * @param positionId The position ID to fetch
   * @returns The position data
   */
  async getPosition(positionId: string): Promise<PositionType> {
    const response = await this.client.getDynamicFieldObject({
      parentId: this.constants.POSITION_TABLE_ID,
      name: {
        type: "0x2::object::ID",
        value: positionId,
      },
    });

    if (!response.data) {
      throw new Error(`Position ${positionId} not found`);
    }
    return parsePosition(response.data as PositionQueryType);
  }

  /**
   * Get all positions for a user address
   * @param userAddress The user address to get positions for
   * @returns Array of position data
   */
  async getPositionsForUser(userAddress: string): Promise<PositionType[]> {
    // First, get all position caps for the user
    const positionCaps = await this.getPositionCapsForUser(userAddress);

    // Then, get the position details for each cap
    const positions = await Promise.all(
      positionCaps.map((cap) => this.getPosition(cap.positionId)),
    );

    return positions;
  }

  /**
   * Get all position caps for a user address
   * @param userAddress The user address to get position caps for
   * @returns Array of position cap data
   */
  async getPositionCapsForUser(
    userAddress: string,
  ): Promise<PositionCapType[]> {
    // Get position caps owned by the user
    const objects = await this.client.getOwnedObjects({
      owner: userAddress,
      filter: {
        StructType: this.constants.POSITION_CAP_TYPE,
      },
      options: {
        showContent: true,
      },
    });

    // Parse each position cap
    const positionCaps = objects.data
      .filter((obj) => obj.data)
      .map((obj) => {
        // Use type assertion to tell TypeScript we know what we're doing
        return parsePositionCap(obj.data as unknown as PositionCapQueryType);
      });

    return positionCaps;
  }
}
