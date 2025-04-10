import { getConstants } from "../constants/index.js";
import { PositionCapQueryType } from "./queryTypes.js";

// Function to check if an object is a PositionCap
export const isPositionCapObject = (object: PositionCapQueryType): boolean => {
  try {
    if (object.content && object.content.type) {
      return object.content.type === getConstants().POSITION_CAP_TYPE;
    }
    return false;
  } catch (error) {
    console.error("Error checking if object is PositionCap:", error);
    return false;
  }
};
