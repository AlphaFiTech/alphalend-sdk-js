import { Transaction } from "@mysten/sui/transactions";
import { PaginatedObjectsResponse, SuiClient } from "@mysten/sui/client";
import { getAlphafiConstants, getConstants } from "../constants/index.js";
import {
  PriceData,
  Receipt,
  RewardDistributorQueryType,
} from "./queryTypes.js";
import { pythPriceFeedIdMap } from "./priceFeedIds.js";
import { getUserPosition } from "../models/position/functions.js";
import { Blockchain } from "../models/blockchain.js";
import { Decimal } from "decimal.js";

export async function getClaimRewardInput(
  suiClient: SuiClient,
  network: string,
  userAddress: string,
): Promise<{ marketId: number; coinTypes: string[] }[]> {
  const position = await getUserPosition(suiClient, network, userAddress);
  const positionFields = position!.content.fields.value.fields;
  const rewardInput: {
    marketId: number;
    coinTypes: string[];
  }[] = [];

  const marketActionMap: Map<number, string[]> = new Map();

  for (const rewardDistributor of positionFields.reward_distributors) {
    const marketId = Number(rewardDistributor.fields.market_id);
    const coinTypes: Set<string> = new Set(marketActionMap.get(marketId) || []);
    const lastUpdated = rewardDistributor.fields.last_updated;
    const marketRewardDistributorObj = await getRewardDistributor(
      suiClient,
      network,
      marketId,
      rewardDistributor.fields.is_deposit,
    );
    const userRewardDistributorObj = rewardDistributor.fields.rewards;
    if (!marketRewardDistributorObj) continue;

    for (let i = 0; i < marketRewardDistributorObj.rewards.length; i++) {
      const marketReward = marketRewardDistributorObj.rewards[i];
      if (!marketReward) continue;
      const userReward =
        i < userRewardDistributorObj.length
          ? userRewardDistributorObj[i]
          : null;

      const timeElapsed =
        Math.min(parseFloat(marketReward.fields.end_time), Date.now()) -
        Math.max(
          parseFloat(marketReward.fields.start_time),
          parseFloat(lastUpdated),
        );

      const userRewardFields = userReward?.fields;

      // reward currently ruuning and user has share
      if (timeElapsed > 0 && parseFloat(rewardDistributor.fields.share) > 0) {
        coinTypes.add(marketReward.fields.coin_type.fields.name);
      } else if (userReward && userRewardFields) {
        // user has earned rewards in past and not claimed
        if (parseFloat(userRewardFields.earned_rewards.fields.value) !== 0) {
          coinTypes.add(marketReward.fields.coin_type.fields.name);
        } else if (
          // user has share and some rewards have been distributed after last update
          parseFloat(
            marketReward.fields.cummulative_rewards_per_share.fields.value,
          ) >
            parseFloat(
              userRewardFields.cummulative_rewards_per_share.fields.value,
            ) &&
          parseFloat(rewardDistributor.fields.share) > 0
        ) {
          coinTypes.add(marketReward.fields.coin_type.fields.name);
        }
      } else if (
        // new reward started and finished after last update and user has share
        parseFloat(rewardDistributor.fields.share) > 0 &&
        parseFloat(
          marketReward.fields.cummulative_rewards_per_share.fields.value,
        ) > 0
      ) {
        coinTypes.add(marketReward.fields.coin_type.fields.name);
      }
    }
    marketActionMap.set(marketId, [...coinTypes]);
  }

  for (const [marketId, coinTypes] of marketActionMap.entries()) {
    rewardInput.push({
      marketId,
      coinTypes,
    });
  }

  return rewardInput;
}

async function getRewardDistributor(
  suiClient: SuiClient,
  network: string,
  marketId: number,
  isDepositRewardDistributor: boolean,
): Promise<RewardDistributorQueryType | undefined> {
  const blockchainClient = new Blockchain(network, suiClient);
  const market = await blockchainClient.getMarketQuery(marketId);
  if (!market) return undefined;

  return isDepositRewardDistributor
    ? market.content.fields.value.fields.deposit_reward_distributor.fields
    : market.content.fields.value.fields.borrow_reward_distributor.fields;
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
): Promise<Map<string, PriceData>> => {
  try {
    const result: Map<string, PriceData> = new Map();
    const constants = getConstants("mainnet");
    const alphafiConstants = getAlphafiConstants();
    if (coinTypes.length === 0) {
      return result;
    }
    if (coinTypes.includes(alphafiConstants.ALPHA_COIN_TYPE)) {
      const req_url = `https://api.alphafi.xyz/alpha/fetchPrices?pairs=ALPHA/USD`;
      const response = await fetch(req_url);
      const data = (await response.json())[0] as {
        pair: string;
        price: string;
      };
      result.set(alphafiConstants.ALPHA_COIN_TYPE, {
        coinType: alphafiConstants.ALPHA_COIN_TYPE,
        price: {
          price: data.price,
          conf: "1",
          expo: 9,
          publish_time: Date.now(),
        },
        ema_price: {
          price: data.price,
          conf: "1",
          expo: 9,
          publish_time: Date.now(),
        },
      });
      coinTypes = coinTypes.filter(
        (coinType) => coinType !== alphafiConstants.ALPHA_COIN_TYPE,
      );
    }

    const feedIds: string[] = [];
    const feedIdToCoinType: Record<string, string> = {};
    // Collect feed IDs for given coin IDs
    coinTypes.forEach((coinType) => {
      const id = pythPriceFeedIdMap[coinType];
      if (!id) {
        console.error(`Coin ID not supported: ${coinType}`);
      }
      feedIdToCoinType[id] = coinType;
      feedIds.push(id);
    });

    if (feedIds.length === 0) {
      return result;
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
      return result;
    }
    const prices = await response.json();
    if (!Array.isArray(prices)) {
      console.error("Invalid response format from Pyth Network");
      return result;
    }

    for (const price of prices) {
      result.set(feedIdToCoinType[price.id], {
        coinType: feedIdToCoinType[price.id],
        price: {
          price: new Decimal(price.price.price)
            .mul(Math.pow(10, price.price.expo))
            .toString(),
          conf: price.price.conf,
          expo: price.price.expo,
          publish_time: price.price.publish_time,
        },
        ema_price: {
          price: new Decimal(price.ema_price.price)
            .mul(Math.pow(10, price.ema_price.expo))
            .toString(),
          conf: price.ema_price.conf,
          expo: price.ema_price.expo,
          publish_time: price.ema_price.publish_time,
        },
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching prices from Pyth Network:", error);
    throw error;
  }
};

export async function setPrices(tx: Transaction) {
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin1::TESTCOIN1",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin2::TESTCOIN2",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin3::TESTCOIN3",
    90000,
    90000,
    1,
  );
  await setPrice(
    tx,
    "0x3a8117ec753fb3c404b3a3762ba02803408b9eccb7e31afb8bbb62596d778e9a::testcoin4::TESTCOIN4",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin5::TESTCOIN5",
    1,
    1,
    1,
  );
  await setPrice(
    tx,
    "0xf357286b629e3fd7ab921faf9ab1344fdff30244a4ff0897181845546babb2e1::testcoin6::TESTCOIN6",
    1,
    1,
    1,
  );
  await setPrice(tx, "0x2::sui::SUI", 4, 4, 1);
}

async function setPrice(
  tx: Transaction,
  coinType: string,
  price: number,
  ema: number,
  conf: number,
) {
  const constants = getConstants("testnet");
  const priceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(price)],
  });
  const emaPriceNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(ema)],
  });
  const confNumnber = tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_STDLIB_PACKAGE_ID}::math::from`,
    arguments: [tx.pure.u64(conf)],
  });
  const coinTypeName = tx.moveCall({
    target: `0x1::type_name::get`,
    typeArguments: [coinType],
  });
  tx.moveCall({
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::set_price_remove_for_mainnet`,
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
    target: `${constants.ALPHAFI_LATEST_ORACLE_PACKAGE_ID}::oracle::get_price_info`,
    arguments: [tx.object(constants.ALPHAFI_ORACLE_OBJECT_ID), coinTypeName1],
  });

  tx.moveCall({
    target: `${constants.ALPHALEND_LATEST_PACKAGE_ID}::alpha_lending::update_price`,
    arguments: [tx.object(constants.LENDING_PROTOCOL_ID), oraclePriceInfo],
  });

  return tx;
}

export async function getAlphaReceipt(
  suiClient: SuiClient,
  address: string,
): Promise<Receipt[]> {
  const constants = getAlphafiConstants();
  const nfts: Receipt[] = [];
  if (constants.ALPHA_POOL_RECEIPT == "") {
    return nfts;
  }
  let currentCursor: string | null | undefined = null;
  while (true) {
    const paginatedObjects: PaginatedObjectsResponse =
      await suiClient.getOwnedObjects({
        owner: address,
        cursor: currentCursor,
        filter: {
          // StructType: `${first_package}::${module}::Receipt`,
          StructType: constants.ALPHA_POOL_RECEIPT,
        },
        options: {
          showContent: true,
        },
      });
    // Traverse the current page data and push to coins array
    paginatedObjects.data.forEach((obj) => {
      const o = obj.data as Receipt;
      if (o) {
        if (constants.ALPHA_POOL_RECEIPT === o.content.type) {
          nfts.push(o);
        }
      }
    });
    // Check if there's a next page
    if (paginatedObjects.hasNextPage && paginatedObjects.nextCursor) {
      currentCursor = paginatedObjects.nextCursor;
    } else {
      break;
    }
  }
  return nfts;
}
