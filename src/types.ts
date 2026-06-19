// ─── Properties ──────────────────────────────────────────────────────────────

export type PropertyType = 'RESIDENTIAL' | 'COMMERCIAL' | 'ALL';

export interface ListPropertiesParams {
  page?: number;
  pageSize?: number;
  /** Filter by city/state, or 'all' */
  location?: string;
  propertyType?: PropertyType;
  /** Minimum projected rental yield (%) */
  minPry?: number;
  /** Minimum projected annual appreciation (%) */
  minPan?: number;
}

export interface ListPropertiesResponse {
  page: number;
  pageSize: number;
  filters: Record<string, unknown>;
  result: PropertySummary[];
}

export interface PropertySummary {
  id: string;
  [key: string]: unknown;
}

export interface GetPropertyResponse {
  property: PropertySummary;
}

// ─── Order Book ───────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface GetOrderBookResponse {
  propertyId: string;
  orderbook: OrderBook;
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export interface Trade {
  [key: string]: unknown;
}

export interface GetTradesResponse {
  propertyId: string;
  recentTrades: Trade[];
  bestBid: number | null;
  bestAsk: number | null;
  limitTokensAvailable: number;
  marketTokensAvailable: number;
  totalInvestors: number;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderDirection = 'buy' | 'sell';

export type OrderStatus =
  | 'active'
  | 'pending'
  | 'executing'
  | 'executed'
  | 'cancelled'
  | 'expired'
  | 'intent';

export interface CreateOrderParams {
  propertyId: string;
  direction: OrderDirection;
  /** Price per token in USD (e.g. 52.50) */
  price: number;
  /** Number of tokens */
  quantity: number;
  /**
   * Order expiry as a Unix timestamp in milliseconds.
   * Defaults to 30 days from now. Must be at least 29 days in the future.
   */
  expireAt?: number;
}

export interface CreateOrderResponse {
  orderId: string;
}

export interface GetOrderResponse {
  order: Order;
}

export interface CancelOrderParams {
  orderId: string;
}

export interface CancelOrderResponse {
  orderId: string;
  cancelled: boolean;
}

export interface ListOrdersParams {
  /** Filter to a single property. Provide this or `all: true`. */
  propertyId?: string;
  /** Fetch all orders across all properties. Provide this or `propertyId`. */
  all?: boolean;
  status?: OrderStatus;
}

export interface Order {
  orderId: string;
  propertyId: string;
  direction: OrderDirection;
  /** Price per token in USD */
  price: number;
  quantity: number;
  status: OrderStatus;
  paymentCurrency: string;
  createdAt: number;
  expireAt: number;
}

export interface ListOrdersResponse {
  orders: Order[];
}

// ─── Account ──────────────────────────────────────────────────────────────────

export interface AccountBalance {
  userId: string;
  /** Available USDC balance in USD */
  usdc: number;
  /** Available ALGO balance */
  algo: number;
  /** Accumulated rental income balance in USD */
  rentBalance: number;
  /** Gift certificate balance in USD */
  giftBalance: number;
}

// ─── Positions ────────────────────────────────────────────────────────────────

export interface Position {
  propertyId: string;
  currentTokens: number;
  pendingTokens: number;
  currentEffectiveTokens: number;
  costBasis: number | null;
  totalSpent: number | null;
  totalSellValue: number | null;
  /** Current market value of your holding */
  currentValue: number | null;
  currentPrice: number | null;
  totalRentEarned: number | null;
  tokensPurchased: number | null;
  tokensSold: number | null;
}

export interface PositionTotals {
  totalCurrentTokens: number;
  totalPurchasedTokens: number;
  totalCurrentPrincipal: number;
  totalSellValue: number;
  totalRentEarned: number;
  totalProperties: number;
}

export interface GetPositionsResponse {
  positions: Position[];
  totals: PositionTotals | null;
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export interface GetTradesParams {
  propertyId?: string;
  direction?: 'buy' | 'sell';
  /** Max trades to return (default 200, max 500) */
  limit?: number;
}

export interface Trade {
  tradeId: string;
  propertyId: string;
  direction: 'buy' | 'sell';
  price: number;
  quantity: number;
  paymentCurrency: string;
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  blockchainSwapTxnId: string | null;
  createdAt: number;
}

export interface GetTradesResponse {
  trades: Trade[];
}

// ─── LP Positions ─────────────────────────────────────────────────────────────

export interface LpPosition {
  propertyId: string;
  poolId: number;
  baseLpTokensHeld: number;
  baseTokensStaked: number;
  baseOwnershipPct: number;
  baseClaimedRewards: number;
  baseUnclaimedRewards: number;
  quoteLpTokensHeld: number;
  quoteTokensStaked: number;
  quoteOwnershipPct: number;
  quoteClaimedRewards: number;
  quoteUnclaimedRewards: number;
  tvl: number;
  apy: { base: number; quote: number; overall?: number } | null;
}

export interface LpPositionTotals {
  tvl: number;
  quoteTvl: number;
  baseTvl: number;
  rewardsClaimed: unknown;
  rewardsUnclaimed: unknown;
  numPools: number;
}

export interface GetLpPositionsResponse {
  positions: LpPosition[];
  totals: LpPositionTotals | null;
}


// ─── AMM ─────────────────────────────────────────────────────────────────────

export interface AmmAsset {
  id: number;
  symbol: string;
  name: string;
}

export interface AmmPoolFees {
  /** LP fee rate (e.g. 500 = 0.5%) */
  lp: number;
  /** Platform buy fee rate */
  platformBuy: number;
  /** Platform sell fee rate */
  platformSell: number;
  /** Operating reserve fee rate */
  operatingReserve: number;
}

export interface AmmPool {
  poolId: number;
  propertyId: string;
  active: boolean;
  /** Oracle price (USDC per token) */
  price: number;
  /** Upper price bound used as buy reference */
  priceHigh: number;
  /** Lower price bound used as sell reference */
  priceLow: number;
  fees: AmmPoolFees;
  liquidity: {
    /** Base (property token) balance in pool */
    base: number;
    /** Quote (USDC) balance in pool */
    quote: number;
    baseUSD: number;
    quoteUSD: number;
  };
  assets: {
    base: AmmAsset;
    quote: AmmAsset;
  };
  apy7d: { base: number; quote: number };
  apy30d: { base: number; quote: number } | null;
  vol24h: { buys: number; sells: number };
  vol7d: { buys: number; sells: number };
}

export interface ListAmmPoolsResponse {
  pools: AmmPool[];
}

export interface GetAmmPoolResponse {
  pool: AmmPool;
}

export type QuoteSide = 'buy' | 'sell';

export interface GetQuoteByTokenAmount {
  poolId: number;
  side: QuoteSide;
  /** Number of property tokens */
  tokenAmount: number;
  usdcAmount?: never;
}

export interface GetQuoteByUsdcAmount {
  poolId: number;
  side: QuoteSide;
  /** USDC amount */
  usdcAmount: number;
  tokenAmount?: never;
}

export type GetQuoteParams = GetQuoteByTokenAmount | GetQuoteByUsdcAmount;

export interface AmmQuote {
  poolId: number;
  side: QuoteSide;
  /** Property tokens involved */
  tokenAmount: number;
  /**
   * For buy: USDC you will pay.
   * For sell: USDC you will receive.
   */
  usdcAmount: number;
  /** Effective price per token in USDC */
  usdcPerToken: number;
  /**
   * Reference (oracle) price used for comparison.
   * priceHigh for buys, priceLow for sells.
   */
  referencePrice: number;
  /**
   * Slippage as a percentage relative to the reference price.
   * Positive = paid more than reference (buy). Negative = received less (sell).
   */
  slippage: number;
  /** Price impact per token vs reference price (in USDC) */
  priceImpact: number;
}

export interface ExecuteSwapParams {
  poolId: number;
  side: QuoteSide;
  /** Number of property tokens to buy or sell */
  tokenAmount: number;
  /**
   * Maximum USDC to spend. Required for buys — sets your slippage cap.
   * Get the expected cost from `getQuote()` then add a small buffer (e.g. 1–2%).
   */
  maxUsdcAmount?: number;
}

export interface ExecuteSwapResponse {
  /** Batch ID for tracking the transaction status on-chain */
  batchId: string;
  result: unknown;
}

// ─── LP Rewards ───────────────────────────────────────────────────────────────

export interface LpReward {
  rewardId: string;
  propertyId: string;
  /** USDC amount earned */
  amount: number;
  /** Share of the pool this reward represented (0–100) */
  percentOfPool: number;
  /** Unix ms timestamp of the reward period start */
  periodStart: number;
  /** Unix ms timestamp when this reward was recorded */
  createdAt: number;
}

export interface ListLpRewardsParams {
  /** Only return rewards at or after this Unix ms timestamp */
  since?: number;
  /** Maximum number of rewards to return (max 200) */
  limit?: number;
  /** Pagination cursor from a previous response */
  cursor?: string;
}

export interface ListLpRewardsResponse {
  rewards: LpReward[];
  nextCursor: string | null;
}
