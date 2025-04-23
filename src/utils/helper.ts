import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { getConstants } from "../constants/index.js";
import { PriceData } from "./queryTypes.js";
import { pythPriceFeedIds } from "./priceFeedIds.js";
import { getMarketFromChain } from "../models/market.js";
import { getUserPosition } from "../models/position.js";

const constants = getConstants();

export async function getClaimRewardInput(
  suiClient: SuiClient,
  userAddress: string,
): Promise<{ marketId: number; coinTypes: string[] }[]> {
  const position = await getUserPosition(suiClient, userAddress);

  let rewardInput: {
    marketId: number;
    coinTypes: string[];
  }[] = [];

  let marketActionMap = new Map<number, { supply: boolean; borrow: boolean }>();
  console.log("position", position);
  for (const collaterals of position!.content.fields.value.fields.collaterals
    .fields.contents) {
    marketActionMap.set(Number(collaterals.fields.key), {
      supply: true,
      borrow: false,
    });
  }

  for (const loan of position!.content.fields.value.fields.loans) {
    if (marketActionMap.has(Number(loan.fields.market_id))) {
      marketActionMap.set(Number(loan.fields.market_id), {
        supply: true,
        borrow: true,
      });
    } else {
      marketActionMap.set(Number(loan.fields.market_id), {
        supply: false,
        borrow: true,
      });
    }
  }

  for (const [marketId, { supply, borrow }] of marketActionMap) {
    const market = await getMarketFromChain(suiClient, marketId);

    let coinTypes = new Set<string>();
    if (supply) {
      for (const reward of market!.content.fields.value.fields
        .deposit_reward_distributor.fields.rewards) {
        coinTypes.add(String(reward?.fields.coin_type.fields.name));
      }
    }
    if (borrow) {
      for (const reward of market!.content.fields.value.fields
        .borrow_reward_distributor.fields.rewards) {
        coinTypes.add(String(reward?.fields.coin_type.fields.name));
      }
    }

    rewardInput.push({ marketId: marketId, coinTypes: [...coinTypes] });
  }

  return rewardInput;
}

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

export const getPricesFromPyth = async (
  coinTypes: string[],
): Promise<PriceData[]> => {
  try {
    if (coinTypes.length === 0) {
      return [];
    }

    const feedIds: string[] = [];
    const feedIdToCoinType: Record<string, string> = {};
    // Collect feed IDs for given coin IDs
    coinTypes.forEach((coinType) => {
      const id = pythPriceFeedIds[coinType];
      if (!id) {
        console.error(`Coin ID not supported: ${coinType}`);
      }
      feedIdToCoinType[id] = coinType;
      feedIds.push(id);
    });

    if (feedIds.length === 0) {
      console.error("No feed IDs found for the requested coin IDs");
      return [];
    }

    // Construct URL with query parameters
    const queryParams = feedIds.map((id) => `ids[]=${id}`).join("&");
    const url = `${constants.PYTH_MAINNET_API_ENDPOINT}${constants.PYTH_PRICE_PATH}?${queryParams}`;

    // Fetch data from Pyth Network
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Failed to fetch from Pyth Network: HTTP ${response.status}`,
      );
      return [];
    }
    const prices = await response.json();
    if (!Array.isArray(prices)) {
      console.error("Invalid response format from Pyth Network");
      return [];
    }

    const result: PriceData[] = [];
    for (const price of prices) {
      result.push({
        coinType: feedIdToCoinType[price.id],
        price: price.price,
        ema_price: price.ema_price,
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching prices from Pyth Network:", error);
    throw error;
  }
};

export async function setPrice(
  tx: Transaction,
  coinType: string,
  price: number,
  ema: number,
  conf: number,
) {
  const priceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(price)],
  });
  const emaPriceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(ema)],
  });
  const confNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(conf)],
  });
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });
  tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::set_price_remove_for_mainnet`,
    arguments: [
      tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID),
      coinTypeName,
      emaPriceNumnber,
      priceNumnber,
      confNumnber,
      tx.object(constants.SUI_CLOCK_OBJECT_ID),
    ],
  });

  const coinTypeName1 = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });

  const oraclePriceInfo = tx.moveCall({
    target: `${constants.ALPHAFI_ORACLE_PACKAGE_ID}::oracle::get_price_info`,
    arguments: [tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID), coinTypeName1],
  });

  tx.moveCall({
    target: `${constants.ALPHALEND_PACKAGE_ID}::alpha_lending::update_price`,
    arguments: [tx.object(constants.LENDING_PROTOCOL_ID), oraclePriceInfo],
  });

  return tx;
}
