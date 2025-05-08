interface NumberQueryType {
  fields: {
    value: string;
  };
  type: string;
}

interface TypeNameQueryType {
  fields: {
    name: string;
  };
  type: string;
}

// Market Query Types

export interface MarketQueryType {
  objectId: string;
  version: string;
  digest: string;
  content: {
    disassembled: {
      [key: string]: unknown;
    };
    dataType: string;
    type: string;
    fields: {
      id: {
        id: string;
      };
      name: string;
      value: {
        fields: {
          balance_holding: string;
          borrow_reward_distributor: {
            fields: RewardDistributorQueryType;
            type: string;
          };
          borrowed_amount: string;
          coin_type: TypeNameQueryType;
          compounded_interest: NumberQueryType;
          config: {
            fields: MarketConfigQueryType;
            type: string;
          };
          decimal_digit: NumberQueryType;
          deposit_flow_limiter: {
            fields: FlowLimiterQueryType;
            type: string;
          };
          deposit_reward_distributor: {
            fields: RewardDistributorQueryType;
            type: string;
          };
          id: {
            id: string;
          };
          last_auto_compound: string;
          last_update: string;
          market_id: string;
          outflow_limiter: {
            fields: FlowLimiterQueryType;
            type: string;
          };
          price_identifier: {
            fields: {
              coin_type: TypeNameQueryType;
            };
            type: string;
          };
          unclaimed_spread_fee: string;
          unclaimed_spread_fee_protocol: string;
          writeoff_amount: string;
          xtoken_ratio: NumberQueryType;
          xtoken_supply: string;
          xtoken_type: TypeNameQueryType;
        };
        type: string;
      };
    };
  };
}

export interface RewardDistributorQueryType {
  id: {
    id: string;
  };
  last_updated: string;
  market_id: string;
  rewards: (RewardQueryType | null)[];
  total_xtokens: string;
}

export interface RewardQueryType {
  type: string;
  fields: {
    id: {
      id: string;
    };
    coin_type: TypeNameQueryType;
    distributor_id: string;
    is_auto_compounded: boolean;
    auto_compound_market_id: string;
    total_rewards: string;
    start_time: string;
    end_time: string;
    distributed_rewards: {
      fields: {
        value: string;
      };
      type: string;
    };
    cummulative_rewards_per_share: {
      fields: {
        value: string;
      };
      type: string;
    };
  };
}

export interface FlowLimiterQueryType {
  flow_delta: NumberQueryType;
  last_update: string;
  max_rate: string;
  window_duration: string;
}

export interface MarketConfigQueryType {
  active: boolean;
  borrow_fee_bps: string;
  borrow_weight: NumberQueryType;
  borrow_limit: string;
  borrow_limit_percentage: string;
  cascade_market_id: string;
  close_factor_percentage: number;
  collateral_types: TypeNameQueryType[];
  deposit_fee_bps: string;
  deposit_limit: string;
  extension_fields: {
    fields: {
      id: {
        id: string;
      };
      size: string;
    };
    type: string;
  };
  interest_rate_kinks: number[];
  interest_rates: number[];
  is_native: boolean;
  isolated: boolean;
  last_updated: string;
  liquidation_bonus_bps: string;
  liquidation_fee_bps: string;
  liquidation_threshold: number;
  protocol_fee_share_bps: string;
  protocol_spread_fee_share_bps: string;
  safe_collateral_ratio: number;
  spread_fee_bps: string;
  time_lock: string;
  withdraw_fee_bps: string;
}

// Position Query Types

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
      position_id: string;
      client_address: string;
    };
  };
}

export interface PositionQueryType {
  objectId: string;
  version: string;
  digest: string;
  content: {
    disassembled: {
      [key: string]: unknown;
    };
    dataType: string;
    type: string;
    fields: {
      id: {
        id: string;
      };
      name: string;
      value: {
        fields: {
          additional_permissible_borrow_usd: NumberQueryType;
          collaterals: {
            fields: {
              contents: {
                fields: {
                  key: string;
                  value: string;
                };
                type: string;
              }[];
            };
            type: string;
          };
          id: {
            id: string;
          };
          is_isolated_borrowed: boolean;
          is_position_healthy: boolean;
          is_position_liquidatable: boolean;
          last_refreshed: string;
          liquidation_value: NumberQueryType;
          loans: {
            fields: BorrowQueryType;
            type: string;
          }[];
          lp_collaterals: {
            fields: LpPositionCollateralQueryType;
            type: string;
          } | null;
          partner_id: string | null;
          reward_distributors: {
            fields: UserRewardDistributorQueryType;
            type: string;
          }[];
          safe_collateral_usd: NumberQueryType;
          spot_total_loan_usd: NumberQueryType;
          total_collateral_usd: NumberQueryType;
          total_loan_usd: NumberQueryType;
          weighted_spot_total_loan_usd: NumberQueryType;
          weighted_total_loan_usd: NumberQueryType;
        };
        type: string;
      };
    };
  };
}

export interface LpPositionCollateralQueryType {
  config: {
    fields: LpPositionCollateralConfigQueryType;
    type: string;
  };
  last_updated: string;
  liquidity: string;
  liquidation_value: NumberQueryType;
  lp_position_id: string;
  lp_type: number;
  pool_id: string;
  safe_usd_value: NumberQueryType;
  usd_value: NumberQueryType;
}

export interface LpPositionCollateralConfigQueryType {
  close_factor_percentage: number;
  liquidation_bonus: string;
  liquidation_fee: string;
  liquidation_threshold: number;
  safe_collateral_ratio: number;
}

export interface BorrowQueryType {
  amount: string;
  borrow_compounded_interest: NumberQueryType;
  borrow_time: string;
  coin_type: TypeNameQueryType;
  market_id: string;
  reward_distributor_index: string;
}

export interface UserRewardDistributorQueryType {
  reward_distributor_id: string;
  market_id: string;
  share: string;
  rewards: {
    fields: UserRewardQueryType | null;
    type: string;
  }[];
  last_updated: string;
  is_deposit: boolean;
}

export interface UserRewardQueryType {
  reward_id: string;
  coin_type: TypeNameQueryType;
  earned_rewards: NumberQueryType;
  cummulative_rewards_per_share: NumberQueryType;
  is_auto_compounded: boolean;
  auto_compound_market_id: string;
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

export interface Receipt {
  objectId: string;
  version: string;
  digest: string;
  content: {
    dataType: string;
    type: string;
    hasPublicTransfer: boolean;
    fields: {
      id: { id: string };
      image_url: string;
      last_acc_reward_per_xtoken: {
        type: string;
        fields: {
          contents: {
            type: string;
            fields: {
              value: string;
              key: {
                type: string;
                fields: {
                  name: string;
                };
              };
            };
          }[];
        };
      };
      locked_balance:
        | {
            type: string;
            fields: {
              head: string;
              id: { id: string };
              size: string;
              tail: string;
            };
          }
        | undefined;
      name: string;
      owner: string;
      pending_rewards: {
        type: string;
        fields: {
          contents: {
            fields: {
              key: {
                type: string;
                fields: {
                  name: string;
                };
              };
              value: string;
            };
            type: string;
          }[];
        };
      };
      pool_id: string;
      xTokenBalance: string;
      unlocked_xtokens: string | undefined;
    };
  };
}
