import { Decimal } from "decimal.js";
import { MarketType, RewardDistributorType } from "../utils/parsedTypes.js";
import { MarketData, CoinMetadata } from "../core/types.js";
import { fetchStSuiAPR } from "@alphafi/stsui-sdk";

export class Market {
  market: MarketType;
  private coinMetadataMap: Map<string, CoinMetadata>;

  constructor(market: MarketType, coinMetadataMap: Map<string, CoinMetadata>) {
    this.market = market;
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

  async getMarketData(prices: Map<string, Decimal>): Promise<MarketData> {
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
    const supplyApr = await this.calculateSupplyApr();

    // reward Aprs
    borrowApr.rewards = this.calculateBorrowRewardApr(prices);
    supplyApr.rewards = this.calculateSupplyRewardApr(prices);

    const allowedBorrowAmount = Decimal.max(
      0,
      Decimal.min(
        new Decimal(marketConfig.borrowLimit),
        new Decimal(this.totalLiquidity().toString()).mul(
          new Decimal(marketConfig.borrowLimitPercentage).div(100),
        ),
      )
        .sub(this.market.borrowedAmount)
        .div(decimalDigit),
    );
    const allowedDepositAmount = Decimal.max(
      0,
      new Decimal(marketConfig.depositLimit)
        .sub(this.totalLiquidity().toString())
        .div(decimalDigit),
    );

    return {
      marketId: this.market.marketId,
      price: new Decimal(prices.get(this.market.coinType) ?? 0),
      coinType: this.market.coinType,
      decimalDigit: decimalDigit.log(10).toNumber(),
      totalSupply,
      totalBorrow,
      utilizationRate,
      supplyApr,
      borrowApr,
      ltv: new Decimal(marketConfig.safeCollateralRatio),
      availableLiquidity: new Decimal(this.market.balanceHolding)
        .sub(this.market.unclaimedSpreadFee)
        .sub(this.market.unclaimedSpreadFeeProtocol)
        .div(decimalDigit),
      borrowFee: new Decimal(marketConfig.borrowFeeBps).div(100),
      borrowWeight: new Decimal(marketConfig.borrowWeight).div(1e18),
      liquidationThreshold: new Decimal(marketConfig.liquidationThreshold),
      allowedDepositAmount,
      allowedBorrowAmount,
      xtokenRatio: new Decimal(this.market.xtokenRatio).div(1e18),
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
      return Decimal.min(
        new Decimal(this.market.borrowedAmount).div(totalSupply),
        new Decimal(1),
      );
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
          borrowApr.interestApr.div(31536000 * 100),
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
        const borrowedU256 = BigInt(this.market.borrowedAmount);
        const newBorrowed =
          (borrowedU256 * compoundedMultiplier) / BigInt(1e18);

        const spreadFee =
          ((newBorrowed - borrowedU256) *
            BigInt(this.market.config.spreadFeeBps)) /
          BigInt(10000);

        this.market.unclaimedSpreadFee = (
          BigInt(this.market.unclaimedSpreadFee) + spreadFee
        ).toString();

        this.market.borrowedAmount = newBorrowed.toString();

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
    this.market.xtokenRatio = newXTokenRatio.toString();
  }

  refreshRewardDistributors(rewardDistributor: RewardDistributorType) {
    const currentTime = Date.now(); // Current time in milliseconds

    // If current time matches last update, no need to refresh
    if (currentTime === parseInt(rewardDistributor.lastUpdated)) {
      return;
    }
    // If no xTokens, nothing to distribute
    if (rewardDistributor.totalXtokens === "0") {
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
      const rewardsGenerated =
        ((BigInt(reward.totalRewards) - BigInt(reward.distributedRewards)) *
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

  calculateSupplyRewardApr = (
    prices: Map<string, Decimal>,
  ): {
    coinType: string;
    rewardApr: Decimal;
  }[] => {
    const rewardAprs: {
      coinType: string;
      rewardApr: Decimal;
    }[] = [];
    const MILLISECONDS_IN_YEAR = 365 * 24 * 60 * 60 * 1000; // 31536000000

    const distributor = this.market.depositRewardDistributor;
    const decimalDigit = new Decimal(this.market.decimalDigit);
    const totalLiquidity = new Decimal(this.totalLiquidity().toString()).div(
      decimalDigit,
    );
    if (totalLiquidity.isZero()) {
      return rewardAprs;
    }

    const marketPrice = prices.get(this.market.coinType);
    if (!marketPrice) {
      throw new Error("Market price not found for " + this.market.coinType);
    }
    const totalLiquidityValue = totalLiquidity.mul(marketPrice);

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      if (parseInt(reward.endTime) <= parseInt(reward.startTime)) {
        continue;
      }

      if (parseInt(reward.startTime) > parseInt(distributor.lastUpdated)) {
        continue;
      }

      let timeSpan = 0;
      if (parseInt(reward.endTime) > parseInt(distributor.lastUpdated)) {
        timeSpan = parseInt(reward.endTime) - parseInt(distributor.lastUpdated);
      }
      if (timeSpan === 0) {
        continue;
      }

      const rewardCoinType = reward.coinType;
      const rewardDecimalDivisor = new Decimal(10).pow(
        this.getDecimals(rewardCoinType),
      );
      const price = prices.get(rewardCoinType);
      if (!price) continue;

      const rewardAmount = new Decimal(reward.totalRewards)
        .sub(new Decimal(reward.distributedRewards))
        .div(rewardDecimalDivisor);
      const timeRatio = new Decimal(MILLISECONDS_IN_YEAR).div(timeSpan);

      const rewardValue = rewardAmount.mul(price).mul(timeRatio);

      const rewardApr = rewardValue.div(totalLiquidityValue);

      rewardAprs.push({
        coinType: rewardCoinType,
        rewardApr: rewardApr.mul(100),
      });
    }

    return rewardAprs;
  };

  calculateBorrowRewardApr = (
    prices: Map<string, Decimal>,
  ): {
    coinType: string;
    rewardApr: Decimal;
  }[] => {
    const rewardAprs: {
      coinType: string;
      rewardApr: Decimal;
    }[] = [];
    const MILLISECONDS_IN_YEAR = 365 * 24 * 60 * 60 * 1000; // 31536000000

    const distributor = this.market.borrowRewardDistributor;
    const decimalDigit = new Decimal(this.market.decimalDigit);
    const borrowedAmount = new Decimal(this.market.borrowedAmount).div(
      decimalDigit,
    );
    if (borrowedAmount.isZero()) {
      return rewardAprs;
    }

    const marketPrice = prices.get(this.market.coinType);
    if (!marketPrice) {
      throw new Error("Market price not found for " + this.market.coinType);
    }
    const borrowedAmountValue = borrowedAmount.mul(marketPrice);

    for (const reward of distributor.rewards) {
      if (!reward) continue;

      if (parseInt(reward.endTime) <= parseInt(reward.startTime)) {
        continue;
      }
      if (parseInt(reward.startTime) > parseInt(distributor.lastUpdated)) {
        continue;
      }

      let timeSpan = 0;
      if (parseInt(reward.endTime) > parseInt(distributor.lastUpdated)) {
        timeSpan = parseInt(reward.endTime) - parseInt(distributor.lastUpdated);
      }
      if (timeSpan === 0) {
        continue;
      }

      const rewardCoinType = reward.coinType;
      const rewardDecimalDivisor = new Decimal(10).pow(
        this.getDecimals(rewardCoinType),
      );
      const price = prices.get(rewardCoinType);
      if (!price) continue;

      const rewardAmount = new Decimal(reward.totalRewards)
        .sub(new Decimal(reward.distributedRewards))
        .div(rewardDecimalDivisor);
      const timeRatio = new Decimal(MILLISECONDS_IN_YEAR).div(timeSpan);

      const rewardValue = rewardAmount.mul(price).mul(timeRatio);

      const rewardApr = rewardValue.div(borrowedAmountValue);

      rewardAprs.push({
        coinType: rewardCoinType,
        rewardApr: rewardApr.mul(100),
      });
    }

    return rewardAprs;
  };

  calculateSupplyApr = async (): Promise<{
    interestApr: Decimal;
    stakingApr: Decimal;
    rewards: {
      coinType: string;
      rewardApr: Decimal;
    }[];
  }> => {
    const borrowApr = this.calculateBorrowApr();
    const utilizationRate = this.utilizationRate();
    const interestApr = borrowApr.interestApr
      .mul(utilizationRate)
      .mul(
        new Decimal(1).sub(
          new Decimal(this.market.config.spreadFeeBps).div(10000),
        ),
      );

    // Add staking APR for stSUI if applicable
    let stakingApr = new Decimal(0);
    if (
      this.market.coinType ===
      "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI"
    ) {
      const res = await fetchStSuiAPR(7);
      stakingApr = new Decimal(res);
    }

    return {
      interestApr,
      stakingApr,
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

    for (let i = 1; i < kinks.length; i++) {
      if (utilizationRatePercentage.gte(kinks[i])) {
        continue;
      }

      // Calculate linear interpolation
      const leftApr = new Decimal(rates[i - 1]);
      const rightApr = new Decimal(rates[i]);
      const leftKink = new Decimal(kinks[i - 1]);
      const rightKink = new Decimal(kinks[i]);

      // Calculate interpolated rate
      const interestApr = leftApr.add(
        rightApr
          .sub(leftApr)
          .mul(utilizationRatePercentage.sub(leftKink))
          .div(rightKink.sub(leftKink)),
      );

      // Convert from bps to decimal
      return {
        interestApr: interestApr.div(100),
        rewards: [], // Rewards would be added here if available
      };
    }

    return {
      interestApr: new Decimal(rates[rates.length - 1]).div(100),
      rewards: [], // Rewards would be added here if available
    };
  };
}
