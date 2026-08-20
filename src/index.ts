export { LoftyClient } from './client';
export type { LoftyClientOptions } from './client';

export {
  LoftyError,
  LoftyAuthError,
  LoftyTradingDisabledError,
  LoftyRateLimitError,
} from './errors';
export type { LoftyErrorCode, LoftyErrorBody } from './errors';

// Value exports (not types): quantity granularity constants.
export { ORDER_STEP, MIN_ORDER_NOTIONAL_USD } from './types';

export type {
  // AMM
  AmmAsset,
  AmmPoolFees,
  AmmPool,
  ListAmmPoolsResponse,
  GetAmmPoolResponse,
  QuoteSide,
  GetQuoteParams,
  GetQuoteByTokenAmount,
  GetQuoteByUsdcAmount,
  AmmQuote,
  ExecuteSwapParams,
  ExecuteSwapResponse,
  // Properties
  ListPropertiesParams,
  ListPropertiesResponse,
  PropertySummary,
  GetPropertyResponse,
  // Property Managers
  PropertyManagerSummary,
  PropertyManagerSocialLinks,
  PropertyManagerReference,
  PropertyManagerProfile,
  PropertyManagerStats,
  GetPropertyManagerResponse,
  ListPropertyManagerPropertiesParams,
  OrderBookLevel,
  OrderBook,
  GetOrderBookResponse,
  GetTradesResponse,
  // Orders
  OrderDirection,
  OrderStatus,
  CreateOrderParams,
  CreateOrderResponse,
  GetOrderResponse,
  CancelOrderParams,
  CancelOrderResponse,
  ListOrdersParams,
  ListOrdersResponse,
  Order,
  // Account
  AccountBalance,
  Position,
  PositionTotals,
  GetPositionsResponse,
  GetTradesParams,
  Trade,
  LpPosition,
  LpPositionTotals,
  GetLpPositionsResponse,
  LpReward,
  ListLpRewardsParams,
  ListLpRewardsResponse,
  // LP Rewards Programs (farming)
  LpRewardsProgram,
  ListLpRewardsProgramsResponse,
  GetLpRewardsProgramResponse,
} from './types';
