import { Transaction } from "@mysten/sui/transactions";
import { getAlphafiConstants, getConstants } from "../constants/index.js";
import { Receipt, ReceiptGql } from "./queryTypes.js";
import { getUserPosition } from "../models/position/functions.js";
import { Blockchain } from "../models/blockchain.js";
import {
  MarketType,
  RewardDistributorType,
  UserRewardDistributorType,
  UserRewardType,
} from "./parsedTypes.js";

/**
 * Determine which rewards are claimable for the user, grouped by market id.
 * Uses parsed `PositionType` and `MarketType` (GraphQL-backed) — no raw
 * JSON-RPC shapes are consumed.
 */
export async function getClaimRewardInput(
  blockchain: Blockchain,
  userAddress: string,
): Promise<{ marketId: number; coinTypes: string[] }[]> {
  const position = await getUserPosition(blockchain, userAddress);
  if (!position) return [];
  const rewardInput: { marketId: number; coinTypes: string[] }[] = [];
  const marketActionMap: Map<number, string[]> = new Map();

  for (const rewardDistributor of position.rewardDistributors) {
    const marketId = Number(rewardDistributor.marketId);
    const coinTypes: Set<string> = new Set(marketActionMap.get(marketId) ?? []);
    const marketRewardDistributor = await getRewardDistributor(
      blockchain,
      marketId,
      rewardDistributor.isDeposit,
    );
    if (!marketRewardDistributor) continue;

    addClaimableCoinTypes(rewardDistributor, marketRewardDistributor, coinTypes);
    marketActionMap.set(marketId, [...coinTypes]);
  }

  for (const [marketId, coinTypes] of marketActionMap.entries()) {
    rewardInput.push({ marketId, coinTypes });
  }
  return rewardInput;
}

function addClaimableCoinTypes(
  userDistributor: UserRewardDistributorType,
  marketDistributor: RewardDistributorType,
  coinTypes: Set<string>,
): void {
  const lastUpdated = parseFloat(userDistributor.lastUpdated);
  const share = parseFloat(userDistributor.share);

  for (let i = 0; i < marketDistributor.rewards.length; i++) {
    const marketReward = marketDistributor.rewards[i];
    if (!marketReward) continue;
    const userReward: UserRewardType | null =
      i < userDistributor.rewards.length ? userDistributor.rewards[i] : null;

    const timeElapsed =
      Math.min(parseFloat(marketReward.endTime), Date.now()) -
      Math.max(parseFloat(marketReward.startTime), lastUpdated);

    if (timeElapsed > 0 && share > 0) {
      coinTypes.add(marketReward.coinType);
      continue;
    }

    if (userReward) {
      if (parseFloat(userReward.earnedRewards) !== 0) {
        coinTypes.add(marketReward.coinType);
      } else if (
        parseFloat(marketReward.cummulativeRewardsPerShare) >
          parseFloat(userReward.cummulativeRewardsPerShare) &&
        share > 0
      ) {
        coinTypes.add(marketReward.coinType);
      }
    } else if (
      share > 0 &&
      parseFloat(marketReward.cummulativeRewardsPerShare) > 0
    ) {
      coinTypes.add(marketReward.coinType);
    }
  }
}

async function getRewardDistributor(
  blockchain: Blockchain,
  marketId: number,
  isDepositRewardDistributor: boolean,
): Promise<RewardDistributorType | undefined> {
  const market: MarketType = await blockchain.getMarket(marketId);
  if (!market) return undefined;
  return isDepositRewardDistributor
    ? market.depositRewardDistributor
    : market.borrowRewardDistributor;
}

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

/**
 * Fetch all AlphaPool receipts owned by `address`, via paginated GraphQL.
 * Filtering by StructType is done server-side (via the `type` filter), so no
 * client-side re-check is necessary.
 */
export async function getAlphaReceipt(
  blockchain: Blockchain,
  address: string,
): Promise<Receipt[]> {
  const constants = getAlphafiConstants();
  if (constants.ALPHA_POOL_RECEIPT === "") {
    return [];
  }
  const nodes = await blockchain.getOwnedObjectsOfType<ReceiptGql>(
    address,
    constants.ALPHA_POOL_RECEIPT,
  );
  return nodes
    .filter((n) => !!n.contents)
    .map((n) => ({
      objectId: n.address,
      fields: n.contents as ReceiptGql,
    }));
}
