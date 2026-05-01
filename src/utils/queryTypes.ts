// ---------------------------------------------------------------------------
// GraphQL-flat Move struct shapes
// ---------------------------------------------------------------------------
//
// These interfaces mirror what `asMoveObject.contents.json` (or
// `dynamicField.value.json`) returns from Sui GraphQL: all Move struct
// `fields` wrappers are stripped and only the inner flat object is kept.
// Type discriminators like `type: string` are also absent.
//
// Old JSON-RPC shapes: `X.fields.Y`  →  GraphQL shape: `X.Y`.

// ---- Shared primitives ----------------------------------------------------

export interface NumberGql {
  value: string;
}

// ---- Markets --------------------------------------------------------------
// Note: Sui's `0x1::type_name::TypeName` flattens to a plain type string in
// the GraphQL `json` output (no inner `name` wrapper), e.g. `"0x2::sui::SUI"`
// or `"0x..::market::XToken<0x2::sui::SUI>"`. Hence all `*_type` / `coin_type`
// fields below are typed as plain `string`.

export interface FlowLimiterGql {
  flow_delta: NumberGql;
  last_update: string;
  max_rate: string;
  window_duration: string;
}

export interface MarketConfigGql {
  active: boolean;
  borrow_fee_bps: string;
  borrow_weight: NumberGql;
  borrow_limit: string;
  borrow_limit_percentage: string;
  cascade_market_id: string;
  close_factor_percentage: number;
  collateral_types: string[];
  deposit_fee_bps: string;
  deposit_limit: string;
  extension_fields: {
    id: string;
    size: string;
  };
  /**
   * GraphQL encodes `vector<u8>` as a base64 string in the flattened `json`
   * output. The parser decodes it into the canonical `number[]` form.
   */
  interest_rate_kinks: string | number[];
  interest_rates: string[] | number[];
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

export interface RewardGql {
  id: string;
  coin_type: string;
  distributor_id: string;
  is_auto_compounded: boolean;
  auto_compound_market_id: string;
  total_rewards: string;
  start_time: string;
  end_time: string;
  distributed_rewards: NumberGql;
  cummulative_rewards_per_share: NumberGql;
}

export interface RewardDistributorGql {
  id: string;
  last_updated: string;
  market_id: string;
  rewards: (RewardGql | null)[];
  total_xtokens: string;
}

export interface MarketGqlFields {
  id: string;
  balance_holding: string;
  borrow_reward_distributor: RewardDistributorGql;
  borrowed_amount: string;
  coin_type: string;
  compounded_interest: NumberGql;
  config: MarketConfigGql;
  decimal_digit: NumberGql;
  deposit_flow_limiter: FlowLimiterGql;
  deposit_reward_distributor: RewardDistributorGql;
  last_auto_compound: string;
  last_update: string;
  market_id: string;
  outflow_limiter: FlowLimiterGql;
  // The GraphQL flattened shape does NOT carry the outer wrapper's `type`
  // discriminator (`...::oracle::PriceIdentifier`); only the inner fields
  // are present. The parser reconstructs `type` from `Constants` when
  // building the domain `PriceIdentifier`.
  price_identifier: {
    coin_type: string;
  };
  unclaimed_spread_fee: string;
  unclaimed_spread_fee_protocol: string;
  writeoff_amount: string;
  xtoken_ratio: NumberGql;
  xtoken_supply: string;
  xtoken_type: string;
}

// ---- Position cap ---------------------------------------------------------

export interface PositionCapGqlFields {
  id: string;
  position_id: string;
  client_address: string;
}

// ---- Position -------------------------------------------------------------

export interface BorrowGql {
  amount: string;
  borrow_compounded_interest: NumberGql;
  borrow_time: string;
  coin_type: string;
  market_id: string;
  reward_distributor_index: string;
}

export interface UserRewardGql {
  reward_id: string;
  coin_type: string;
  earned_rewards: NumberGql;
  cummulative_rewards_per_share: NumberGql;
  is_auto_compounded: boolean;
  auto_compound_market_id: string;
}

export interface UserRewardDistributorGql {
  reward_distributor_id: string;
  market_id: string;
  share: string;
  rewards: (UserRewardGql | null)[];
  last_updated: string;
  is_deposit: boolean;
}

export interface LpPositionCollateralConfigGql {
  close_factor_percentage: number;
  liquidation_bonus: string;
  liquidation_fee: string;
  liquidation_threshold: number;
  safe_collateral_ratio: number;
}

export interface LpPositionCollateralGql {
  config: LpPositionCollateralConfigGql;
  last_updated: string;
  liquidity: string;
  liquidation_value: NumberGql;
  lp_position_id: string;
  lp_type: number;
  pool_id: string;
  safe_usd_value: NumberGql;
  usd_value: NumberGql;
}

export interface PositionGqlFields {
  id: string;
  additional_permissible_borrow_usd: NumberGql;
  collaterals: {
    contents: { key: string; value: string }[];
  };
  is_isolated_borrowed: boolean;
  is_position_healthy: boolean;
  is_position_liquidatable: boolean;
  last_refreshed: string;
  liquidation_value: NumberGql;
  loans: BorrowGql[];
  lp_collaterals: LpPositionCollateralGql | null;
  partner_id: string | null;
  reward_distributors: UserRewardDistributorGql[];
  safe_collateral_usd: NumberGql;
  spot_total_loan_usd: NumberGql;
  total_collateral_usd: NumberGql;
  total_loan_usd: NumberGql;
  weighted_spot_total_loan_usd: NumberGql;
  weighted_total_loan_usd: NumberGql;
}

// ---- Alpha pool receipt (GraphQL flat) ------------------------------------

export interface ReceiptGql {
  id: string;
  image_url: string;
  last_acc_reward_per_xtoken: {
    contents: {
      value: string;
      key: { name: string };
    }[];
  };
  locked_balance?: {
    head: string;
    id: string;
    size: string;
    tail: string;
  };
  name: string;
  owner: string;
  pending_rewards: {
    contents: {
      key: { name: string };
      value: string;
    }[];
  };
  pool_id: string;
  xTokenBalance: string;
  unlocked_xtokens?: string;
}

/**
 * Result type for `getAlphaReceipt`. The migration exposes each receipt as
 * `{ objectId, fields }` so existing callers (which only read
 * `receipt.objectId` and sometimes pass `receipt.content.type`) keep working
 * with a shallow rewrite.
 */
export interface Receipt {
  objectId: string;
  fields: ReceiptGql;
}
