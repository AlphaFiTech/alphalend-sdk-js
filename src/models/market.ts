import { Decimal } from "decimal.js";
import { MarketType, RewardDistributorType } from "../utils/parsedTypes.js";
import { getPricesFromPyth } from "../utils/helper.js";
import { MarketData } from "../core/types.js";

export class Market {
  market: MarketType;

  constructor(market: MarketType) {
    this.market = market;
  }

  async getMarketData(): Promise<MarketData> {
    this.refresh();

    const decimalDigit = new Decimal(this.market.decimalDigit);
    // Extract the market details and add to results
    const marketConfig = this.market.config;

    // Calculate utilization rate
    const totalSupply = new Decimal(this.totalLiquidity().toString()).div(
      decimalDigit,
    );
    const totalBorrow = new Decimal(this.market.borrowedAmount).div(
      decimalDigit,
    );
    const utilizationRate = this.utilizationRate();

    // Calculate borrow APR
    const borrowApr = this.calculateBorrowApr();
    const reserveFactor = new Decimal(marketConfig.protocolFeeShareBps).div(
      10000,
    );
    const supplyApr = this.calculateSupplyApr(
      borrowApr.interestApr,
      utilizationRate,
      reserveFactor,
    );

    // reward Aprs
    borrowApr.rewards = await this.calculateBorrowRewardApr();
    supplyApr.rewards = await this.calculateSupplyRewardApr();

    const allowedBorrowAmount = Decimal.max(
      0,
      Decimal.min(
        new Decimal(marketConfig.borrowLimit),
        new Decimal(this.totalLiquidity().toString()).mul(
          new Decimal(marketConfig.borrowLimitPercentage).div(100),
        ),
      ),
    );
    const allowedDepositAmount = Decimal.max(
      0,
      new Decimal(marketConfig.depositLimit)
        .sub(this.totalLiquidity().toString())
        .div(decimalDigit),
    );

    return {
      marketId: this.market.marketId,
      coinType: this.market.coinType,
      decimalDigit: decimalDigit.log(10).toNumber(),
      totalSupply,
      totalBorrow,
      utilizationRate,
      supplyApr,
      borrowApr,
      ltv: new Decimal(marketConfig.safeCollateralRatio).div(100),
      availableLiquidity: new Decimal(this.market.balanceHolding).div(
        decimalDigit,
      ),
      borrowFee: new Decimal(marketConfig.borrowFeeBps).div(100),
      borrowWeight: new Decimal(marketConfig.borrowWeight).div(1e18),
      liquidationThreshold: new Decimal(marketConfig.liquidationThreshold).div(
        100,
      ),
      allowedDepositAmount,
      allowedBorrowAmount,
      xtokenRatio: new Decimal(this.market.xtokenRatio),
    };
  }

  totalLiquidity(): bigint {
    const total =
      BigInt(this.market.balanceHolding) + BigInt(this.market.borrowedAmount);
    const deductions =
      BigInt(this.market.unclaimedSpreadFee) +
      BigInt(this.market.writeoffAmount) +
      BigInt(this.market.unclaimedSpreadFeeProtocol);

    if (total >= deductions) {
      return total - deductions;
    }
    return 0n;
  }

  utilizationRate(): Decimal {
    const totalSupply = new Decimal(this.totalLiquidity().toString());
    if (totalSupply.gt(0)) {
      return new Decimal(this.market.borrowedAmount).div(totalSupply);
    }
    return new Decimal(0);
  }

  refresh() {
    this.refreshCompoundInterest();
    this.refreshXTokenRatio();
    this.refreshRewardDistributors(this.market.depositRewardDistributor);
    this.refreshRewardDistributors(this.market.borrowRewardDistributor);
  }

  refreshCompoundInterest() {
    const currentTime = Date.now(); // Current time in milliseconds

    if (this.market.borrowedAmount !== "0") {
      const timeDelta = Math.floor(
        (currentTime - parseInt(this.market.lastAutoCompound)) / 1000,
      );

      if (timeDelta > 0) {
        // Calculate current interest rate
        const borrowApr = this.calculateBorrowApr();

        // Calculate multiplier (1 + interest_rate_per_second)
        const multiplier = new Decimal(1).add(
          borrowApr.interestApr.div(31536000),
        ); // 31536000 seconds in a year

        // Calculate compounded multiplier using exponentiation
        let result = BigInt(1e18);
        let base = BigInt(multiplier.mul(1e18).toFixed(0));
        let exponent = timeDelta;

        while (exponent > 0) {
          if (exponent % 2 === 1) {
            result = (result * base) / BigInt(1e18);
          }
          base = (base * base) / BigInt(1e18);
          exponent = Math.floor(exponent / 2);
        }
        const compoundedMultiplier = result;

        // Calculate new borrowed amount using bigint to avoid overflow
        let borrowed_u256 = BigInt(this.market.borrowedAmount);
        let new_borrowed =
          (borrowed_u256 * compoundedMultiplier) / BigInt(1e18);

        // Update borrowed amount
        this.market.borrowedAmount = new_borrowed.toString();
        // Update compounded interest
        this.market.compoundedInterest = (
          (BigInt(this.market.compoundedInterest) * compoundedMultiplier) /
          BigInt(1e18)
        ).toString();
      }
    }
  }

  refreshXTokenRatio() {
    let newXTokenRatio = BigInt(1e18);
    const totalLiquidity = this.totalLiquidity();
    if (this.market.xtokenSupply !== "0") {
      newXTokenRatio =
        (totalLiquidity * BigInt(1e18)) / BigInt(this.market.xtokenSupply);
    }

    const changedRatio = newXTokenRatio - BigInt(this.market.xtokenRatio);
    const spreadFeeRatio =
      (changedRatio * BigInt(this.market.config.spreadFeeBps)) / BigInt(10000);
    const addUnclaimedSpreadFee = totalLiquidity * spreadFeeRatio;
    const protocolShare =
      (addUnclaimedSpreadFee *
        BigInt(this.market.config.protocolSpreadFeeShareBps)) /
      BigInt(10000);

    // Updates
    this.market.unclaimedSpreadFeeProtocol = (
      BigInt(this.market.unclaimedSpreadFeeProtocol) +
      protocolShare / BigInt(1e18)
    ).toString();

    this.market.unclaimedSpreadFee = (
      BigInt(this.market.unclaimedSpreadFee) +
      (addUnclaimedSpreadFee - protocolShare) / BigInt(1e18)
    ).toString();

    this.market.xtokenRatio = (newXTokenRatio - spreadFeeRatio).toString();
  }

  refreshRewardDistributors(rewardDistributor: RewardDistributorType) {
    const currentTime = Date.now(); // Current time in milliseconds

    // If current time matches last update, no need to refresh
    if (currentTime === parseInt(rewardDistributor.lastUpdated)) {
      return;
    }
    // If no xTokens, nothing to distribute
    if (rewardDistributor.totalXtokens === "0" || !rewardDistributor.rewards) {
      return;
    }
    // Iterate through rewards
    rewardDistributor.rewards.forEach((reward) => {
      if (!reward) return;

      // Skip if reward hasn't started yet
      if (parseInt(reward.startTime) >= currentTime) {
        return;
      }
      // Skip if reward has already ended
      if (parseInt(reward.endTime) < parseInt(rewardDistributor.lastUpdated)) {
        return;
      }

      // Calculate time range for reward distribution
      const startTime = Math.max(
        parseInt(rewardDistributor.lastUpdated),
        parseInt(reward.startTime),
      );
      const endTime = Math.min(currentTime, parseInt(reward.endTime));
      const timeElapsed = endTime - startTime;

      // Calculate rewards generated during this period
      const totalRewards = BigInt(reward.totalRewards);
      const rewardDuration = BigInt(
        parseInt(reward.endTime) - parseInt(reward.startTime),
      );

      if (rewardDuration === BigInt(0)) return;

      const rewardsGenerated =
        ((totalRewards - BigInt(reward.distributedRewards)) *
          BigInt(timeElapsed)) /
        (BigInt(reward.endTime) - BigInt(rewardDistributor.lastUpdated));

      reward.distributedRewards = (
        BigInt(reward.distributedRewards) + rewardsGenerated
      ).toString();

      const rewardsPerShare =
        (rewardsGenerated * BigInt(1e18)) /
        BigInt(rewardDistributor.totalXtokens);

      reward.cummulativeRewardsPerShare = (
        BigInt(reward.cummulativeRewardsPerShare) + rewardsPerShare
      ).toString();
    });

    // Update last_updated timestamp
    rewardDistributor.lastUpdated = currentTime.toString();
  }

  calculateSupplyRewardApr = async (): Promise<
    {
      coinType: string;
      rewardApr: Decimal;
    }[]
  > => {
    const rewardAps: {
      coinType: string;
      rewardApr: Decimal;
    }[] = [];
    const MILLISECONDS_IN_YEAR = 365 * 24 * 60 * 60 * 1000; // 31536000000

    const distributor = this.market.depositRewardDistributor;
    const totalLiquidity = new Decimal(this.totalLiquidity().toString());
    if (totalLiquidity.isZero()) {
      return rewardAps;
    }

    const coinTypes: string[] = [];
    const marketCoinType = this.market.coinType;

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      const coinType = reward.coinType;
      if (!coinTypes.includes(coinType)) {
        coinTypes.push(coinType);
      }
    }
    const marketPrice = await getPricesFromPyth([marketCoinType]);
    const totalLiquidityValue = totalLiquidity.mul(marketPrice[0].price.price);
    const prices = await getPricesFromPyth(coinTypes);

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      if (reward.endTime <= reward.startTime) {
        continue;
      }

      const timeSpan = parseInt(reward.endTime) - parseInt(reward.startTime);
      if (timeSpan === 0) {
        continue;
      }

      const rewardCoinType = reward.coinType;
      const price = prices.find((p) => p.coinType === rewardCoinType);
      if (!price) continue;

      const rewardAmount = new Decimal(reward.totalRewards);
      const rewardValue = rewardAmount.mul(price.price.price);

      const rewardRate = rewardValue.div(timeSpan);
      const rewardApr = rewardRate
        .mul(MILLISECONDS_IN_YEAR)
        .div(totalLiquidityValue);

      rewardAps.push({
        coinType: rewardCoinType,
        rewardApr: rewardApr,
      });
    }

    return rewardAps;
  };

  calculateBorrowRewardApr = async (): Promise<
    {
      coinType: string;
      rewardApr: Decimal;
    }[]
  > => {
    const rewardAprs: {
      coinType: string;
      rewardApr: Decimal;
    }[] = [];
    const MILLISECONDS_IN_YEAR = 365 * 24 * 60 * 60 * 1000; // 31536000000

    const distributor = this.market.borrowRewardDistributor;
    const borrowedAmount = new Decimal(this.market.borrowedAmount);
    if (borrowedAmount.isZero()) {
      return rewardAprs;
    }

    const coinTypes: string[] = [];
    const marketCoinType = this.market.coinType;

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      const coinType = reward.coinType;
      if (!coinTypes.includes(coinType)) {
        coinTypes.push(coinType);
      }
    }
    const marketPrice = await getPricesFromPyth([marketCoinType]);
    const borrowedAmountValue = borrowedAmount.mul(marketPrice[0].price.price);
    const prices = await getPricesFromPyth(coinTypes);

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      if (reward.endTime <= reward.startTime) {
        continue;
      }

      const timeSpan = parseInt(reward.endTime) - parseInt(reward.startTime);
      if (timeSpan === 0) {
        continue;
      }

      const rewardCoinType = reward.coinType;
      const price = prices.find((p) => p.coinType === rewardCoinType);
      if (!price) continue;

      const rewardAmount = new Decimal(reward.totalRewards);
      const rewardValue = rewardAmount.mul(price.price.price);

      const rewardRate = rewardValue.div(timeSpan);
      const rewardApr = rewardRate
        .mul(MILLISECONDS_IN_YEAR)
        .div(borrowedAmountValue);

      rewardAprs.push({
        coinType: rewardCoinType,
        rewardApr: rewardApr,
      });
    }

    return rewardAprs;
  };

  calculateSupplyApr = (
    borrowApr: Decimal,
    utilizationRate: Decimal,
    reserveFactor: Decimal,
  ): {
    interestApr: Decimal;
    rewards: {
      coinType: string;
      rewardApr: Decimal;
    }[];
  } => {
    // Supply APR = Borrow APR * Utilization * (1 - Reserve Factor)
    const interestApr = borrowApr
      .mul(utilizationRate)
      .mul(new Decimal(1).sub(reserveFactor));
    return {
      interestApr,
      rewards: [], // Rewards would be added here if available
    };
  };

  calculateBorrowApr = (): {
    interestApr: Decimal;
    rewards: {
      coinType: string;
      rewardApr: Decimal;
    }[];
  } => {
    const utilizationRate = this.utilizationRate();
    const marketConfig = this.market.config;
    const utilizationRatePercentage = utilizationRate.mul(100);
    const kinks = marketConfig.interestRateKinks;
    const rates = marketConfig.interestRates;
    if (kinks.length === 0) {
      return {
        interestApr: new Decimal(rates[0]).div(10000),
        rewards: [], // Rewards would be added here if available
      };
    }

    for (let i = 0; i < kinks.length; i++) {
      if (utilizationRatePercentage.gte(kinks[i])) {
        continue;
      }

      // Calculate linear interpolation
      let leftApr = i == 0 ? new Decimal(0) : new Decimal(rates[i - 1]);
      let rightApr = new Decimal(rates[i]);
      let leftKink = i == 0 ? new Decimal(0) : new Decimal(kinks[i - 1]);
      let rightKink = new Decimal(kinks[i]);

      // Calculate interpolated rate
      let interestApr = leftApr.add(
        rightApr
          .sub(leftApr)
          .mul(utilizationRatePercentage.sub(leftKink))
          .div(rightKink.sub(leftKink)),
      );

      // Convert from bps to decimal
      return {
        interestApr: interestApr.div(10000),
        rewards: [], // Rewards would be added here if available
      };
    }

    return {
      interestApr: new Decimal(rates[0]).div(10000),
      rewards: [], // Rewards would be added here if available
    };
  };
}
