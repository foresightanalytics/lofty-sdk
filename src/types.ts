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
  /**
   * Restrict results to properties statically assigned to one property manager.
   * Must be an exact, case-sensitive registry manager ID (e.g. 'partner-eco-systems') —
   * see the `propertyManagers` catalog on every list response or the SDK README's
   * "Property manager IDs" snapshot table. Unknown IDs are rejected with HTTP 400.
   */
  managerId?: string;
}

export interface ListPropertiesMeta {
  page: number;
  pageSize: number;
  count: number;
  /** Next page number, present when more results exist. */
  next?: number;
  [key: string]: unknown;
}

export interface ListPropertiesResponse {
  page: number;
  pageSize: number;
  filters: Record<string, unknown>;
  /**
   * Compact catalog of every property manager in the static registry.
   * This runtime catalog is the authoritative, always-current discovery source
   * for manager IDs — it wins over any documentation snapshot on disagreement.
   */
  propertyManagers: PropertyManagerSummary[];
  result: {
    properties: PropertySummary[];
    meta: ListPropertiesMeta | null;
  };
}

export interface PropertySummary {
  id: string;
  /**
   * Registry-derived manager attribution, present only when the property is
   * statically assigned to a property manager in the registry. This is a
   * trusted server-side annotation, not the legacy internal `managerId` field.
   */
  managerId?: string;
  [key: string]: unknown;
}

export interface GetPropertyResponse {
  property: PropertySummary;
}

// ─── Property Managers ────────────────────────────────────────────────────────

/**
 * Compact property-manager catalog entry returned on every property list
 * response. Use `id` as the exact, case-sensitive `managerId` filter key.
 */
export interface PropertyManagerSummary {
  /** Immutable, exact, case-sensitive registry ID (the `managerId` filter key). */
  id: string;
  /** Unique, exact, case-sensitive profile lookup slug. */
  slug: string;
  name: string;
}

/** Public social links on a manager profile. Only these keys are ever returned. */
export interface PropertyManagerSocialLinks {
  instagram?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

/** A public reference link on a manager profile. */
export interface PropertyManagerReference {
  label: string;
  url: string;
}

/**
 * A property manager's public profile.
 *
 * Manager attribution is backed by a manually maintained static registry:
 * it intentionally follows the deployed registry, not live operational
 * assignments. `properties` returned alongside a profile are the manager's
 * registry assignments intersected with properties currently eligible for
 * the public marketplace (the same eligibility as `properties.list()`).
 */
export interface PropertyManagerProfile {
  /** Immutable, exact, case-sensitive registry ID. */
  id: string;
  slug: string;
  name: string;
  role: 'Property Manager';
  verified: boolean;
  location: string;
  photoUrl: string;
  description: string;
  socialLinks?: PropertyManagerSocialLinks;
  references?: PropertyManagerReference[];
}

export interface PropertyManagerStats {
  /**
   * Exact count of the manager's registry-assigned properties that are
   * currently eligible for the public marketplace. Always equals the length
   * of the `properties` array in the same response.
   */
  propertiesManaged: number;
}

/**
 * Response of `lofty.propertyManagers.get()` / `.getBySlug()`.
 * `properties` is the complete bounded public intersection (never paginated
 * or truncated), ordered through the public marketplace pipeline.
 */
export interface GetPropertyManagerResponse {
  manager: PropertyManagerProfile;
  stats: PropertyManagerStats;
  properties: PropertySummary[];
}

/** `listProperties()` params: normal list filters minus `managerId` (which is a required positional argument). */
export type ListPropertyManagerPropertiesParams = Omit<ListPropertiesParams, 'managerId'>;

// ─── Order Book ───────────────────────────────────────────────────────────────

/** One aggregated price level. Quantity is the total shares resting at that price. */
export interface OrderBookLevel {
  price: number | null;
  quantity: number | null;
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
  /** Highest price a holder can sell at right now (best limit bid or the AMM pool's sell price). */
  bestBid: number | null;
  /** Lowest price a buyer pays right now (best limit ask or the AMM pool's buy price). */
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

/**
 * Stable, normalized lifecycle for an order. Safe to branch on — unlike the raw
 * `status`, these values do not change over time. Returned on every order.
 */
export type OrderState =
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'pending';

/** Why a terminal order ended. Present only on terminal orders. */
export type OrderStatusReason =
  | 'filled'
  | 'user_cancel'
  | 'insufficient_funds'
  | 'expired'
  | 'partial_fill_cancelled';

export interface Order {
  orderId: string;
  propertyId: string;
  direction: OrderDirection;
  /** Price per token in USD */
  price: number;
  /** REMAINING (unfilled) token count. Same value as `remainingQuantity`. */
  quantity: number;
  status: OrderStatus;
  paymentCurrency: string;
  createdAt: number;
  expireAt: number;

  // ─── Tracking fields (added, backward-compatible) ───
  /** Normalized lifecycle. Present on every order; safe to branch on. */
  state?: OrderState;
  /** Total tokens the order was placed for. Single-order endpoint only. */
  originalQuantity?: number;
  /** Tokens filled so far. Single-order endpoint only. */
  filledQuantity?: number;
  /** Tokens still unfilled (== `quantity`). Single-order endpoint only. */
  remainingQuantity?: number;
  /** Volume-weighted average fill price in USD, or null before any fill. Single-order endpoint only. */
  averageFillPrice?: number | null;
  /** Why a terminal order ended. Single-order endpoint only. */
  statusReason?: OrderStatusReason;
  /** Unix ms of the most recent order event. Single-order endpoint only. */
  lastUpdatedAt?: number;
}

/** Normalized lifecycle for a pool-executed swap. */
export type SwapState = 'pending' | 'settled' | 'failed';

export interface SwapStatus {
  batchId: string;
  /** Normalized lifecycle. Safe to branch on. */
  state: SwapState;
  /** Raw internal status. */
  status: string;
  side?: OrderDirection;
  propertyId?: string;
  poolId?: number;
  /** Algorand round when the swap settled; null until `state: 'settled'`. */
  confirmedBlock?: number | null;
  /** Present only when `state: 'failed'`. */
  failureReason?: string;
  createdAt?: number;
}

export interface GetSwapStatusResponse {
  swap: SwapStatus;
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
   * The raw AMM pool payment for the swap. This is NOT the full wallet
   * movement: swap fees are charged separately on top (buys) or out of the
   * proceeds (sells). Use `totalDebit` (buys) / `netProceeds` (sells) for the
   * amount that actually hits your wallet.
   */
  usdcAmount: number;
  /**
   * Swap fee breakdown charged in addition to `usdcAmount` (platform + LP +
   * operating reserve), computed identically to on-chain execution.
   * Present on API deployments from 2026-07-21 onward.
   */
  fees?: {
    platform: number;
    lp: number;
    operatingReserve: number;
    total: number;
  };
  /** Buys only: total USDC your wallet is debited (`usdcAmount + fees.total`). */
  totalDebit?: number;
  /** Sells only: net USDC you receive (`usdcAmount - fees.total`). */
  netProceeds?: number;
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
   * Buys only — REQUIRED. Maximum USDC to spend; slippage cap enforced on-chain.
   * Get the expected cost from `getQuote()` then add a small buffer (e.g. 1–2%).
   * NOTE: the cap applies to the POOL PAYMENT (`quote.usdcAmount`), not
   * `quote.totalDebit` — swap fees are charged on top of it, so your wallet
   * must cover `totalDebit`, not just this cap.
   */
  maxUsdcAmount?: number;
  /**
   * Sells only — REQUIRED. Minimum USDC floor; slippage floor enforced by
   * the API immediately before execution. Get the quote from `getQuote()`
   * then subtract your tolerance (e.g. 1–2%). Without it the API rejects the sell.
   * NOTE: the floor applies to the POOL PAYMENT (`quote.usdcAmount`), not your
   * net proceeds — swap fees are deducted after, so you receive
   * `quote.netProceeds`, not the pool payment.
   */
  minUsdcAmount?: number;
}

/**
 * A swap that executed on the AMM pool. Track it with
 * `lofty.amm.getSwapStatus(batchId)`.
 */
export interface SwapExecutedResponse {
  /** Batch ID for tracking the pool transaction's status. */
  batchId: string;
  result: unknown;
}

/**
 * A swap placed on the order book instead of the pool (returned when pool
 * trading is paused). The swap became a limit order at your slippage bound;
 * track it with `lofty.orders.get(orderId)`. It may fill partially and rests
 * until filled, canceled, or expiry.
 */
export interface SwapRoutedToBookResponse {
  routedTo: 'orderbook';
  tradingPaused: true;
  /** The book order this swap became. Track with `orders.get(orderId)`. */
  orderId: string;
  propertyId: string;
  side: OrderDirection;
  quantity: number;
  /** Limit price the order rests at (your slippage bound per share). */
  limitPrice: number;
  /** Unix ms expiry. */
  expireAt: number;
  message: string;
}

/**
 * `executeSwap` returns one of two shapes. Branch on `routedTo`:
 *
 * ```typescript
 * const res = await lofty.amm.executeSwap(params);
 * if ('routedTo' in res) {
 *   // Placed on the order book — track with orders.get(res.orderId)
 * } else {
 *   // Executed on the pool — track with amm.getSwapStatus(res.batchId)
 * }
 * ```
 */
export type ExecuteSwapResponse = SwapExecutedResponse | SwapRoutedToBookResponse;

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

// ─── LP Rewards Programs (farming discovery) ───────────────────────────────────

/**
 * A property's active limit-order liquidity-rewards program. To earn, keep
 * resting limit orders on the property's book that satisfy every eligibility
 * rule below; the pool is split across hourly blocks and paid pro-rata to
 * qualifying liquidity.
 */
export interface LpRewardsProgram {
  propertyId: string;
  /** Total USDC paid out per day across all liquidity providers. */
  dailyRewards: number;
  /** USDC paid per hourly block (= dailyRewards / blocksPerDay). */
  perBlockRewards: number;
  /** Length of a reward block in milliseconds (currently 1 hour). */
  blockDurationMs: number;
  /** Reward blocks per day (currently 24). */
  blocksPerDay: number;
  /**
   * Max absolute USD distance from the book midpoint an order may sit and still
   * be eligible. Tighter (closer to midpoint) orders qualify; wide quotes don't.
   */
  allowedSpread: number;
  /** Minimum remaining quantity (shares) an order must have to count. */
  minContracts: number;
  /**
   * Minimum eligible liquidity (shares) required on EACH side of the book for
   * the block to pay out — you must quote BOTH bid and ask (two-sided).
   */
  minTwoSidedLiquidity: number;
  /** Orders younger than this (ms) are skipped by the sampler; let quotes rest. */
  minOrderAgeMs: number;
  address: { line1: string | null; line2: string | null };
  thumbnail: string | null;
  slug: string | null;
  updatedAt: number;
}

export interface ListLpRewardsProgramsResponse {
  programs: LpRewardsProgram[];
}

export interface GetLpRewardsProgramResponse {
  program: LpRewardsProgram;
}
