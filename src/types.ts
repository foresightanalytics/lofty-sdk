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
   * Decimal places the property's Algorand asset supports, and therefore the smallest tradeable slice.
   * `0` or absent means whole shares only - this is every property today. When `assetDecimals > 0` the
   * property accepts fractional quantities; see `CreateOrderParams.quantity`.
   */
  assetDecimals?: number;
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

/**
 * One aggregated price level. Quantity is the total shares resting at that price, and may be
 * FRACTIONAL for a property whose `assetDecimals > 0` - do not assume an integer.
 */
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

/**
 * How an order behaves. `limit` (default) and `market` rest on the book at `price`.
 * The trigger types — fractional properties only — rest HIDDEN until the platform's
 * trigger engine fires them, then convert into ordinary limit orders:
 * - `stop_loss`: requires `triggerPrice`; fires when the reference crosses it
 *   (sell: at/below, buy: at/above), then goes live at the marketable book price.
 * - `stop_limit`: requires `triggerPrice` + `triggerLimitPrice` (sell: limit <= trigger,
 *   buy: limit >= trigger); goes live at `triggerLimitPrice`.
 * - `trailing_stop`: requires `trailPercent` (1-50); the trigger trails the
 *   reference's high (sell) / low (buy) watermark by that percent.
 * The reference is a volume-weighted average of real book fills over
 * `referenceWindowDays` — never a single trade print. A fired order never converts
 * more than 20% past its trigger line. Trigger orders are funded from your Lofty
 * USDC wallet only (no gift/rent), and are capped at 3 pending per property.
 */
export type OrderType = 'limit' | 'market' | 'stop_loss' | 'stop_limit' | 'trailing_stop';

/** Lifecycle of a trigger order. `pending` = armed and hidden; `triggered` = live on the book. */
export type TriggerState = 'pending' | 'triggered';

/** Allowed `referenceWindowDays` values for trigger orders. */
export const REFERENCE_WINDOW_CHOICES_DAYS = [7, 14, 30] as const;

export interface CreateOrderParams {
  propertyId: string;
  direction: OrderDirection;
  /**
   * Price per token in USD (e.g. 52.50). Required for `limit`/`market` orders.
   * Optional for trigger orders — the resting price is normalized server-side
   * (stop -> trigger price, stop_limit -> limit price).
   */
  price?: number;
  /**
   * Number of tokens.
   * - `assetDecimals: 0`: WHOLE tokens only.
   * - `assetDecimals > 0` (fractional properties): multiples of `ORDER_STEP` (0.01), and the
   *   order must be worth at least `MIN_ORDER_NOTIONAL_USD` ($1.00).
   * Read `assetDecimals` from the property to know which rule applies.
   */
  quantity: number;
  /** Order behavior; defaults to `'limit'`. See {@link OrderType}. */
  orderType?: OrderType;
  /** stop_loss / stop_limit: USD/token reference price that arms the order. */
  triggerPrice?: number;
  /** stop_limit only: limit price of the converted order once triggered. */
  triggerLimitPrice?: number;
  /** trailing_stop only: trail distance in percent (1-50). */
  trailPercent?: number;
  /**
   * Reference window for trigger orders, in days: 7, 14, or 30 (default 30).
   * The trigger watches the volume-weighted average price of real book fills over
   * this window; wash trades, sub-$5 fills, and flash pairs are excluded.
   */
  referenceWindowDays?: number;
  /**
   * Order expiry as a Unix timestamp in milliseconds.
   * Defaults to 30 days from now. Must be at least 29 days in the future.
   */
  expireAt?: number;
  /**
   * Gift-certificate balance to apply toward a **buy**, in whole US dollars
   * (the same unit `account.getBalance()` reports as `giftBalance`). Optional;
   * defaults to 0. Reduces the USDC your wallet must cover at match time. Only
   * valid on `direction: 'buy'`, and capped at your available gift balance —
   * over-requesting is rejected with `insufficient_gift`.
   */
  useGift?: number;
  /**
   * Rental-income balance to apply toward a **buy**, in whole US dollars (the
   * same unit `account.getBalance()` reports as `rentBalance`). Optional;
   * defaults to 0. Reduces the USDC your wallet must cover at match time. Only
   * valid on `direction: 'buy'`, and capped at your available rent balance —
   * over-requesting is rejected with `insufficient_rent`.
   */
  useRent?: number;
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
  /** Only trigger orders in this state — e.g. `'pending'` to list your armed stops. */
  triggerState?: TriggerState;
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
  /** REMAINING (unfilled) token count. Same value as `remainingQuantity`. May be fractional. */
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

  // ─── Trigger-order fields (present only on stop/stop-limit/trailing orders) ───
  /** Order behavior. Absent on pre-existing orders (treat as 'limit'). */
  orderType?: OrderType;
  /** `pending` = armed and hidden from the book; `triggered` = live. */
  triggerState?: TriggerState;
  triggerPrice?: number;
  triggerLimitPrice?: number;
  trailPercent?: number;
  /** trailing_stop: the high (sell) / low (buy) watermark the trail follows. */
  trailWatermark?: number;
  /** Unix ms the trigger engine fired this order. */
  triggeredAt?: number;
  /** Reference window (days) this order watches. */
  referenceWindowDays?: number;
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
  /** May be fractional for a property whose `assetDecimals > 0` - do not assume an integer. */
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
  /** Minimum remaining quantity (shares) an order must have to count. May be fractional. */
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

// ─── Quantity granularity ─────────────────────────────────────────────────────

/**
 * Smallest quantity increment the order book accepts for a property with `assetDecimals > 0`.
 * Properties with `assetDecimals: 0` accept whole tokens only.
 */
export const ORDER_STEP = 0.01;

/** Minimum order value in USD for a property with `assetDecimals > 0`. */
export const MIN_ORDER_NOTIONAL_USD = 1.0;

// ─── Recurring investment plans (fractional properties only) ─────────────────

export type RecurringCadence = 'weekly' | 'two_weeks' | 'monthly' | 'three_months';

/**
 * How each run funds the residual after rent-then-gift balances are applied:
 * your Lofty USDC wallet (run fails if short) or the saved card — charged
 * off-session only when the run's order actually fills (charge-at-match).
 */
export type RecurringFundingPreference = 'balances_then_wallet' | 'balances_then_card';

export type RecurringPlanStatus = 'active' | 'paused' | 'cancelled';

export interface RecurringPlan {
  planId: string;
  propertyId: string;
  /** Dollars per run. */
  usdAmount: number;
  cadence: RecurringCadence;
  fundingPreference: RecurringFundingPreference;
  savedPaymentMethodId?: string;
  status: RecurringPlanStatus;
  /** Why a paused plan paused (e.g. 'card_expired', 'no_reference_price'). */
  pauseReason?: string;
  /** Unix ms of the next scheduled run. */
  nextRunAt: number;
  lastRunAt?: number;
  lastRunOutcome?: string;
  createdAt: number;
}

export interface CreateRecurringPlanParams {
  propertyId: string;
  /** Dollars to invest per run. Minimum $5. */
  usdAmount: number;
  cadence: RecurringCadence;
  fundingPreference: RecurringFundingPreference;
  /**
   * Required for `balances_then_card`: a card id from
   * `account.getPaymentMethods()`. Express-wallet cards (Apple Pay / Google Pay)
   * are supported — the platform attaches them for off-session use.
   */
  savedPaymentMethodId?: string;
}

export interface CreateRecurringPlanResponse {
  plan: RecurringPlan;
}

export interface ListRecurringPlansResponse {
  plans: RecurringPlan[];
}

export interface CancelRecurringPlanResponse {
  planId: string;
  cancelled: boolean;
}

// ─── Partner user onboarding (restricted) ────────────────────────────────────
// Available only to partner accounts Lofty has explicitly enabled. All other
// accounts receive 403 `partner_not_whitelisted`. Deliberately undocumented in
// the README — access is arranged directly with Lofty.

export interface OnboardUserParams {
  /** Customer's email — becomes their Lofty login. Must not already have an account. */
  email: string;
  firstName: string;
  lastName: string;
  /** E.164, e.g. `+12025550123`. Stored pre-verified. */
  phoneNumber: string;
  /** `YYYY-MM-DD`. */
  birthdate: string;
  streetAddress: string;
  city: string;
  addressState: string;
  postalCode: string;
  country: string;
  /** US customers only; optional. */
  ssn?: string;
  /**
   * Optional initial password (min 10 chars). Omitted → Lofty generates one and
   * returns it as `temporaryPassword`. Either way it is TEMPORARY: the customer
   * must set their own password on first login, at which point the initial
   * credential stops working. Unused temporary passwords expire after 7 days.
   */
  password?: string;
}

export interface OnboardedUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** The customer's Lofty (Algorand) wallet address. */
  walletAddress: string | null;
  verificationStatus: 'accept';
}

export interface OnboardUserResponse {
  user: OnboardedUser;
  /** Present only when Lofty generated the password. Shown exactly once. */
  temporaryPassword?: string;
  mustChangePasswordOnFirstLogin: true;
}

export interface OnboardedUserSummary {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardedAt: number;
  /** The user's Lofty (Algorand) wallet, or null while provisioning. */
  walletAddress: string | null;
  verificationStatus: string | null;
}

export interface ListOnboardedUsersParams {
  /** Max users per page (1–100, default 50). */
  limit?: number;
  cursor?: string;
}

export interface ListOnboardedUsersResponse {
  users: OnboardedUserSummary[];
  nextCursor?: string;
}

export interface DepositAddressEntry {
  /** Source chain, e.g. `solana`, `ethereum`. */
  chainType: string;
  address: string;
}

export interface GetDepositAddressesResponse {
  user: { userId: string; email: string; };
  /** Where bridged funds land — the user's own Lofty wallet. Cross-check it. */
  destination: {
    chainType: 'algorand';
    address: string;
    tokenSymbol: 'USDC';
    note: string;
  };
  depositAddresses: DepositAddressEntry[];
  /** Convenience block when a Solana deposit wallet exists. */
  solanaUsdc?: {
    address: string;
    /** Canonical USDC mint on Solana mainnet. Send USDC (SPL) only. */
    tokenMint: string;
    note: string;
  };
}

export interface CreateUserApiKeyParams {
  /** A user YOUR account onboarded. */
  userId: string;
  /** Label shown in key listings (default `partner-managed`). */
  name?: string;
  /**
   * Whether the key may place orders and move funds. Defaults to `true` — a
   * partner key exists to act for the user. Pass `false` for a read-only key.
   */
  tradingEnabled?: boolean;
}

export interface UserApiKeySummary {
  keyId: string;
  name: string;
  /** Non-secret prefix, for matching a key you already hold. */
  prefix: string;
  mode: 'live' | 'test';
  tradingEnabled: boolean;
  createdAt: number;
  lastUsedAt?: number | null;
  /** True when your account minted this key; false if the user made it. */
  partnerManaged?: boolean;
}

export interface CreateUserApiKeyResponse {
  user: { userId: string; email: string; };
  apiKey: UserApiKeySummary;
  /** The secret. Returned EXACTLY ONCE — Lofty cannot recover it. */
  key: string;
}

export interface ListUserApiKeysResponse {
  user: { userId: string; email: string; };
  apiKeys: UserApiKeySummary[];
}

export interface RevokeUserApiKeyResponse {
  keyId: string;
  revoked: boolean;
}
