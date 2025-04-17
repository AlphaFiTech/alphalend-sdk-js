import { Transaction } from "@mysten/sui/transactions";
import { getConstants } from "../constants/index.js";
import { PositionCapQueryType } from "./queryTypes.js";
import { SuiClient } from "@mysten/sui/client";

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

export async function getEstimatedGasBudget(
  suiClient: SuiClient,
  tx: Transaction,
  address: string,
): Promise<number | undefined> {
  try {
    const simResult = await suiClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });
    return (
      Number(simResult.effects.gasUsed.computationCost) +
      Number(simResult.effects.gasUsed.nonRefundableStorageFee) +
      1e8
    );
  } catch (err) {
    console.error(`Error estimating transaction gasBudget`, err);
  }
}
