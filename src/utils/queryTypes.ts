export interface MarketQueryType {
  objectId: string;
  version: string;
  digest: string;
  content: {
    dataType: string;
    type: string;
    fields: {
      id: {
        id: string;
      };
      /// Unique identifier for the market
      market_id: string;
      /// Type of coin handled by this market
      coin_type: string;
      /// Type of xToken (interest-bearing token) for this market
      xtoken_type: string;
      /// Total supply of xTokens in circulation
      xtoken_supply: string;
      /// Current exchange rate between xTokens and underlying tokens
      xtoken_ratio: string;
      /// Total amount of tokens borrowed from the market
      borrowed_amount: string;
      /// Amount of tokens written off due to liquidations
      writeoff_amount: string;
      /// Amount of tokens held in the market
      balance_holding: string;
      /// Unclaimed spread fee in the market
      unclaimed_spread_fee: string;
      /// Unclaimed spread fee to be shared with protocol
      unclaimed_spread_fee_protocol: string;
      /// Compounded interest rate for the market
      compounded_interest: string;
      /// Timestamp when the market was last updated
      last_update: string;
      /// Timestamp when the market was auto compounded
      last_auto_compound: string;
      /// Configuration parameters for the market
      config: {
        fields: MarketConfigQueryType;
        type: string;
      };
      /// Price identifier for the market
      price_identifier: {
        fields: {
          price_identifier: string;
        };
        type: string;
      };
      /// Distributor for deposit rewards
      deposit_reward_distributor: {
        fields: RewardDistributorQueryType;
        type: string;
      };
      /// Distributor for borrow rewards
      borrow_reward_distributor: {
        fields: RewardDistributorQueryType;
        type: string;
      };
      /// Flow limiter for deposits
      deposit_flow_limiter: {
        fields: FlowLimiterQueryType;
        type: string;
      };
      /// Flow limiter for withdrawals
      outflow_limiter: {
        fields: FlowLimiterQueryType;
        type: string;
      };
      /// Number of mist in one token
      decimal_digit: string;
    };
  };
}

interface RewardDistributorQueryType {
  id: string;
  total_xtokens: string;
  rewards: (Reward | undefined)[];
  last_updated: string;
  market_id: string;
}

interface Reward {
  id: string;
  coin_type: string;
  distributor_id: string;
  is_auto_compounded: boolean;
  auto_compound_market_id: string;
  total_rewards: string;
  start_time: string;
  end_time: string;
  distributed_rewards: string;
  cummulative_rewards_per_share: string;
}

interface FlowLimiterQueryType {
  // Current flow amount in the window
  flow_delta: string;
  // Last time the flow was updated
  last_update: string;
  // Maximum amount that can flow in a window
  max_rate: string;
  // Time window in milliseconds
  window_duration: string;
}

interface MarketConfigQueryType {
  /// Minimum collateral ratio required for safe borrowing (in percentage)
  safe_collateral_ratio: string;
  /// Threshold at which positions become liquidatable (in percentage)
  liquidation_threshold: string;
  /// Maximum amount of deposits allowed in the market
  deposit_limit: string;
  /// Fee charged on borrows (in basis points)
  borrow_fee_bps: string;
  /// Fee charged on deposits (in basis points)
  deposit_fee_bps: string;
  /// Fee charged on withdrawals (in basis points)
  withdraw_fee_bps: string;
  /// Not used in the current implementation
  collateral_types: string[];
  /// Utilization rate at which interest rates change (in percentage)
  interest_rate_kinks: string[];
  /// Interest rates for different utilization rates (in basis points)
  interest_rates: string[];
  /// Bonus for liquidating positions (in basis points)
  liquidation_bonus_bps: string;
  /// Fee charged for liquidating positions (in basis points)
  liquidation_fee_bps: string;
  /// Fee charged for interest earned in the market (in basis points)
  spread_fee_bps: string;
  /// Flag indicating if the market is isolated
  isolated: boolean;
  /// ID of the cascade market (0 if not a cascade market) Not used in the current implementation
  cascade_market_id: string;
  /// Percentage of fee to be shared with protocol (in basis points)
  protocol_fee_share_bps: string;
  /// Percentage of spread fee to be shared with protocol (in basis points)
  protocol_spread_fee_share_bps: string;
  /// Timestamp when the market config can be updated
  time_lock: string;
  /// Timestamp when the Market config was last updated
  last_updated: string;
  /// Flag indicating if the market is a native market
  is_native: boolean;
  /// Borrow weight for the market
  borrow_weight: string;
  /// Extension fields for future use
  extension_fields: string;
  /// Flag indicating if the market is currently active
  active: boolean;
  /// Percentage of debt that can be closed in a single liquidation
  close_factor_percentage: string;
}

// You should adjust these types according to your actual contract structure
export interface PositionCapQueryType {
  objectId: string;
  version: string;
  digest: string;
  content: {
    dataType: string;
    type: string;
    fields: {
      id: {
        id: string;
      };
      /// Unique identifier for the position
      position_id: string;
    };
  };
}

export interface PriceData {
  coinType: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}
