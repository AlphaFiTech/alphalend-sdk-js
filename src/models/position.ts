import { UserPortfolio, CoinMetadata } from "../core/types.js";
import {
  PositionType,
  RewardDistributorType,
  UserRewardDistributorType,
} from "../utils/parsedTypes.js";
import { Decimal } from "decimal.js";
import { Market } from "./market.js";
import { getPricesMap } from "../utils/helper.js";

export class Position {
  position: PositionType;
  private coinMetadataMap: Map<string, CoinMetadata>;

  constructor(
    position: PositionType,
    coinMetadataMap: Map<string, CoinMetadata>,
  ) {
    this.position = position;
    this.coinMetadataMap = coinMetadataMap;
  }

  /**
   * Gets decimal places for a coin type from coin metadata
   */
  private getDecimals(coinType: string): number {
    const coinMetadata = this.coinMetadataMap.get(coinType);
    if (coinMetadata?.decimals !== undefined) {
      return coinMetadata.decimals;
    }
    throw new Error(`No decimal places found for coin type: ${coinType}`);
  }

  async getUserPortfolio(markets: Market[]): Promise<UserPortfolio> {
    const marketMap = new Map<number, Market>();
    for (const market of markets) {
      market.refresh();
      marketMap.set(parseFloat(market.market.marketId), market);
    }
    this.refresh(marketMap);
    const prices = await getPricesMap();

    // Calculate total supplied and borrowed values
    // Calculate weighted average liquidation threshold
    let totalWeightedLiquidationThreshold = new Decimal(0);

    // Calculate weighted average APRs
    let totalWeightedSupplyApr = new Decimal(0);
    let totalWeightedBorrowApr = new Decimal(0);
    let totalWeightedAmount = new Decimal(0);
    let totalSuppliedUsd = new Decimal(0);
    let totalBorrowedUsd = new Decimal(0);
    let safeBorrowLimitUsd = new Decimal(0);

    // Calculate supplied values from collaterals
    for (const collateral of this.position.collaterals) {
      const market = marketMap.get(parseFloat(collateral.key));
      const xTokenAmount = BigInt(collateral.value);
      if (market) {
        const decimalDivisor = new Decimal(market.market.decimalDigit);
        const collateralAmount = new Decimal(
          (
            (xTokenAmount * BigInt(market.market.xtokenRatio)) /
            BigInt(10 ** 18)
          ).toString(),
        ).div(decimalDivisor);

        const price = prices.get(market.market.coinType);
        const collateralUsd = collateralAmount.mul(price ?? 0);

        totalSuppliedUsd = totalSuppliedUsd.add(collateralUsd);

        // Add to safe borrow limit
        const marketLtv = new Decimal(
          market.market.config.safeCollateralRatio,
        ).div(100);
        safeBorrowLimitUsd = safeBorrowLimitUsd.add(
          collateralUsd.mul(marketLtv),
        );
        const supplyApr = await market.calculateSupplyApr();

        // Get supply reward APRs and add them to the total
        const supplyRewards = market.calculateSupplyRewardApr(prices);
        const totalSupplyRewardApr = supplyRewards.reduce(
          (acc, reward) => acc.add(reward.rewardApr),
          new Decimal(0),
        );

        totalWeightedSupplyApr = totalWeightedSupplyApr.add(
          supplyApr.interestApr
            .add(supplyApr.stakingApr)
            .add(totalSupplyRewardApr)
            .mul(collateralUsd),
        );

        totalWeightedLiquidationThreshold =
          totalWeightedLiquidationThreshold.add(
            new Decimal(market.market.config.liquidationThreshold).mul(
              collateralUsd,
            ),
          );

        totalWeightedAmount = totalWeightedAmount.add(collateralUsd);
      }
    }

    const liquidationThresholdUsd = totalWeightedAmount.gt(0)
      ? totalWeightedLiquidationThreshold.div(100)
      : new Decimal(0);

    let totalBorrowedByWeightUsd = new Decimal(0);
    for (const loan of this.position.loans) {
      const market = marketMap.get(parseFloat(loan.marketId));
      if (market) {
        const decimalDivisor = new Decimal(market.market.decimalDigit);
        const compoundedLoanAmount = new Decimal(loan.amount).div(
          decimalDivisor,
        );
        const price = prices.get(market.market.coinType);
        const loanUsd = compoundedLoanAmount.mul(price ?? 0);

        totalBorrowedUsd = totalBorrowedUsd.add(loanUsd);

        const borrowApr = market.calculateBorrowApr();
        const borrowRewards = market.calculateBorrowRewardApr(prices);
        const totalBorrowRewardApr = borrowRewards.reduce(
          (acc, reward) => acc.add(reward.rewardApr),
          new Decimal(0),
        );

        totalWeightedBorrowApr = totalWeightedBorrowApr.add(
          borrowApr.interestApr.sub(totalBorrowRewardApr).mul(loanUsd),
        );

        totalBorrowedByWeightUsd = totalBorrowedByWeightUsd.add(
          loanUsd.mul(new Decimal(market.market.config.borrowWeight).div(1e18)),
        );

        totalWeightedAmount = totalWeightedAmount.sub(loanUsd);
      }
    }

    const netWorth = totalSuppliedUsd.sub(totalBorrowedUsd);

    const netApr = totalWeightedAmount.gt(0)
      ? totalWeightedSupplyApr
          .sub(totalWeightedBorrowApr)
          .div(totalWeightedAmount)
      : new Decimal(0);

    const aggregatedSupplyApr = totalSuppliedUsd.gt(0)
      ? totalWeightedSupplyApr.div(totalSuppliedUsd)
      : new Decimal(0);

    const rewardsToClaim = this.calculateRewardsToClaim();

    const rewardsToClaimUsd = rewardsToClaim.reduce((acc, reward) => {
      const price = prices.get(reward.coinType);
      return acc.add(reward.rewardAmount.mul(price ?? 0));
    }, new Decimal(0));

    return {
      positionId: this.position.id,
      netWorth,
      dailyEarnings: totalWeightedSupplyApr
        .sub(totalWeightedBorrowApr)
        .div(36500),
      netApr,
      safeBorrowLimit: safeBorrowLimitUsd,
      borrowLimitUsed: totalBorrowedByWeightUsd,
      liquidationThreshold: liquidationThresholdUsd,
      totalSuppliedUsd,
      aggregatedSupplyApr,
      totalBorrowedUsd,
      aggregatedBorrowApr: totalBorrowedUsd.gt(0)
        ? totalWeightedBorrowApr.div(totalBorrowedUsd)
        : new Decimal(0),
      suppliedAmounts: new Map(
        this.position.collaterals.map((collateral) => {
          const market = marketMap.get(parseFloat(collateral.key));
          if (market) {
            return [
              parseFloat(collateral.key),
              new Decimal(collateral.value)
                .mul(market.market.xtokenRatio)
                .div(market.market.decimalDigit)
                .div(1e18),
            ];
          }
          return [parseFloat(collateral.key), new Decimal(0)];
        }),
      ),
      borrowedAmounts: new Map(
        this.position.loans.map((loan) => {
          const market = marketMap.get(parseFloat(loan.marketId));
          if (market) {
            return [
              parseFloat(loan.marketId),
              new Decimal(loan.amount).div(market.market.decimalDigit),
            ];
          }
          return [parseFloat(loan.marketId), new Decimal(0)];
        }),
      ),
      rewardsToClaim,
      rewardsToClaimUsd,
    };
  }

  private calculateRewardsToClaim(): {
    coinType: string;
    rewardAmount: Decimal;
  }[] {
    const rewardsToClaim: {
      coinType: string;
      rewardAmount: Decimal;
    }[] = [];

    const rewardCoinTypeMap = new Map<string, Decimal>();

    for (const distributor of this.position.rewardDistributors) {
      for (const reward of distributor.rewards) {
        if (reward) {
          const divisor = new Decimal(10).pow(
            this.getDecimals(reward.coinType),
          );
          let earnedRewards = new Decimal(reward.earnedRewards).div(divisor);
          if (rewardCoinTypeMap.has(reward.coinType)) {
            earnedRewards = earnedRewards.add(
              rewardCoinTypeMap.get(reward.coinType)!,
            );
          }
          rewardCoinTypeMap.set(reward.coinType, earnedRewards);
        }
      }
    }

    for (const [coinType, rewardAmount] of rewardCoinTypeMap.entries()) {
      if (rewardAmount.gt(0)) {
        rewardsToClaim.push({
          coinType,
          rewardAmount,
        });
      }
    }

    return rewardsToClaim;
  }

  refresh(marketMap: Map<number, Market>) {
    const currentTime = Date.now();

    // First collect all market IDs we need to process
    const collateralMarketIds: number[] = this.position.collaterals.map(
      (collateral) => parseFloat(collateral.key),
    );
    const loanMarketIds: number[] = this.position.loans.map((loan) =>
      parseFloat(loan.marketId),
    );

    // Then process each market
    for (const marketId of collateralMarketIds) {
      const market = marketMap.get(marketId);
      if (market) {
        const depositDistributor = market.market.depositRewardDistributor;
        const userDistributorIdx = this.findOrAddUserRewardDistributor(
          depositDistributor,
          currentTime,
          true,
        );

        const userDistributor =
          this.position.rewardDistributors[userDistributorIdx];

        this.refreshUserRewardDistributor(
          userDistributor,
          depositDistributor,
          false,
          currentTime,
        );
      }
    }

    // Process borrow reward distributors and update loan amounts
    for (const marketId of loanMarketIds) {
      const market = marketMap.get(marketId);
      if (market) {
        const borrowDistributor = market.market.borrowRewardDistributor;
        const userDistributorIdx = this.findOrAddUserRewardDistributor(
          borrowDistributor,
          currentTime,
          false,
        );

        const userDistributor =
          this.position.rewardDistributors[userDistributorIdx];

        this.refreshUserRewardDistributor(
          userDistributor,
          borrowDistributor,
          false,
          currentTime,
        );

        // Update loan amounts with compounded interest
        for (const loan of this.position.loans) {
          if (parseFloat(loan.marketId) === marketId) {
            const newAmount =
              (BigInt(loan.amount) * BigInt(market.market.compoundedInterest)) /
              BigInt(loan.borrowCompoundedInterest);

            loan.amount = newAmount.toString();
            loan.borrowCompoundedInterest = market.market.compoundedInterest;
          }
        }
      }
    }

    this.position.lastRefreshed = currentTime.toString();
  }

  private findOrAddUserRewardDistributor(
    distributor: RewardDistributorType,
    currentTime: number,
    isDeposit: boolean,
  ): number {
    const index = this.findUserRewardDistributor(distributor);
    if (index === this.position.rewardDistributors.length) {
      const userDistributor: UserRewardDistributorType = {
        rewardDistributorId: distributor.id,
        marketId: distributor.marketId,
        share: "0",
        rewards: [],
        lastUpdated: "0",
        isDeposit,
      };
      this.refreshUserRewardDistributor(
        userDistributor,
        distributor,
        true,
        currentTime,
      );
      this.position.rewardDistributors.push(userDistributor);
    }
    return index;
  }

  private findUserRewardDistributor(
    distributor: RewardDistributorType,
  ): number {
    const index = this.position.rewardDistributors.findIndex(
      (rewardDistributor) =>
        rewardDistributor.rewardDistributorId === distributor.id,
    );
    if (index === -1) {
      return this.position.rewardDistributors.length;
    }
    return index;
  }

  private refreshUserRewardDistributor(
    userDistributor: UserRewardDistributorType,
    distributor: RewardDistributorType,
    isNew: boolean,
    currentTime: number,
  ): void {
    if (userDistributor.rewardDistributorId !== distributor.id) {
      throw new Error("Distributor ID does not match");
    }

    if (!isNew && parseFloat(userDistributor.lastUpdated) === currentTime) {
      return;
    }

    for (let i = 0; i < distributor.rewards.length; i++) {
      const reward = distributor.rewards[i];
      if (reward) {
        if (i >= userDistributor.rewards.length) {
          let earnedRewards = 0n;
          if (
            parseFloat(userDistributor.lastUpdated) <=
            parseFloat(reward.startTime)
          ) {
            earnedRewards =
              (BigInt(reward.cummulativeRewardsPerShare) *
                BigInt(userDistributor.share)) /
              BigInt(10 ** 18);
          }
          userDistributor.rewards.push({
            rewardId: reward.id,
            coinType: reward.coinType,
            earnedRewards: earnedRewards.toString(),
            cummulativeRewardsPerShare: reward.cummulativeRewardsPerShare,
            isAutoCompounded: reward.isAutoCompounded,
            autoCompoundMarketId: reward.autoCompoundMarketId,
          });
        } else {
          const userReward = userDistributor.rewards[i];
          if (userReward) {
            const rewardsDiff =
              BigInt(reward.cummulativeRewardsPerShare) -
              BigInt(userReward.cummulativeRewardsPerShare);
            const additionalRewards =
              (rewardsDiff * BigInt(userDistributor.share)) / BigInt(10 ** 18);
            userReward.earnedRewards = (
              BigInt(userReward.earnedRewards) + additionalRewards
            ).toString();
            userReward.cummulativeRewardsPerShare =
              reward.cummulativeRewardsPerShare;
          }
        }
      }
    }
    userDistributor.lastUpdated = currentTime.toString();
  }
}
