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
   * `0` or absent means whole shares only. When `assetDecimals > 0` the property accepts fractional
   * quantities; see `CreateOrderParams.quantity`. Most marketplace properties are fractional today,
   * so do not assume whole shares.
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
 * How an order behaves. `limit` (default) rests on the book at `price`.
 * `market` routes across compatible book and V3 PMM liquidity with explicit slippage.
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

interface CreateOrderBase {
  propertyId: string;
  direction: OrderDirection;
  /**
   * Price per token in USD (e.g. 52.50). Required for `limit` orders. Omit for routed market orders.
   * Optional for trigger orders — the resting price is normalized server-side
   * (stop -> trigger price, stop_limit -> limit price).
   */
  price?: number;
  /**
   * Number of tokens.
   * - `assetDecimals: 0`: WHOLE tokens only.
   * - `assetDecimals > 0` (fractional properties): multiples of `ORDER_STEP` (0.0001), at least
   *   `MIN_ORDER_QUANTITY` (0.01) tokens, and the order must be worth at least
   *   `MIN_ORDER_NOTIONAL_USD` ($1.00).
   * Read `assetDecimals` from the property to know which rule applies. The grid and the minimum
   * are different numbers on purpose: the grid is how precisely a quantity can be expressed, the
   * minimum is how small an order may be.
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

/** Market execution requires an explicit slippage limit; no dollar or percentage default applies. */
export type CreateOrderParams = CreateOrderBase & (
  | {
    orderType: 'market'; maxSlippageBps: number;
    /**
     * Optional total in US dollars that the order must not be worse than: the most a buy pays, or
     * the least a sell receives, fees included. Pass `slippageBound` from `orders.getMarketQuote()`
     * (request the quote with the same `maxSlippageBps`) to keep your slippage allowance.
     * `boundTotal` allows no pool slippage: with it, any pool price move refuses the order.
     * The API finds the route again at order time. When that route is worse than `limitTotal`, it
     * answers `409 slippage_exceeded` and starts nothing. The limit can only make the bound
     * tighter than `maxSlippageBps` allows.
     */
    limitTotal?: number;
    price?: never; expireAt?: never; useGift?: never; useRent?: never; triggerPrice?: never; triggerLimitPrice?: never; trailPercent?: never; referenceWindowDays?: never;
  }
  | { orderType?: Exclude<OrderType, 'market'>; maxSlippageBps?: never; limitTotal?: never; }
);

/**
 * Conversion state of a trade on a pool that quotes USDL, for an account that settles in USDC.
 * - `not_applicable`: the trade has no conversion (order book, a pool in the account's own asset,
 *   or a trade that did not execute).
 * - `pending`: the conversion has not finished.
 * - `settled`: the account holds the result in its own asset.
 * - `held`: the conversion of a sell waits for review. The sale itself is final. Contact support.
 */
export type QuoteSettlementStatus = 'pending' | 'settled' | 'held' | 'not_applicable';

export interface GetMarketQuoteParams {
  propertyId: string;
  direction: OrderDirection;
  /** Number of tokens. The same grid and minimum as `orders.create()`. */
  quantity: number;
  /** Optional. With it, the response includes `slippageBound` for the same value on `orders.create()`. */
  maxSlippageBps?: number;
}

/** The route a market order placed now would take. A quote reserves nothing and creates no order. */
export interface GetMarketQuoteResponse {
  propertyId: string;
  direction: OrderDirection;
  quantity: number;
  /** `book`: order book only. `pmm`: pool only. `split`: both. */
  route: 'book' | 'pmm' | 'split';
  bookQuantity: number;
  poolQuantity: number;
  /** Worst book price of the route. `null` when the route has no book part. */
  bookPrice: number | null;
  /** The pool of the route. `null` when the route has no pool part. */
  poolId: number | null;
  /** Expected total in dollars, trading fees included: what a buy pays or a sell receives. */
  quotedTotal: number;
  /**
   * Worst total of this route with no pool slippage (for a pool-only route it equals `quotedTotal`).
   * As `limitTotal` it gives the pool leg no room to move. Use `slippageBound` to keep your allowance.
   */
  boundTotal: number;
  /** Total if the pool filled the full quantity. `null` when the pool cannot. */
  poolOnlyTotal: number | null;
  settlementCurrency: 'USDC' | 'LUSDC';
  /**
   * Present when the request had `maxSlippageBps`: the bound `orders.create()` would enforce.
   * Pass it as `limitTotal` to keep that slippage allowance.
   */
  slippageBound?: number;
  /** Unix ms. Prices move: quote again before you place an order with an old quote. */
  quotedAt: number;
}

export interface CreateOrderResponse {
  orderId: string;
  /** Market requests return acceptance, never a claim of a completed fill. */
  state?: 'execution_pending';
  route?: 'book' | 'pmm' | 'split';
  settlementCurrency?: 'USDC' | 'LUSDC';
  quotedTotal?: number;
  slippageBound?: number;
  submissionIncomplete?: boolean;
  message?: string;
}

export interface MarketOrder {
  orderId: string;
  propertyId: string;
  direction: OrderDirection;
  orderType: 'market';
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  state: 'execution_pending' | 'execution_unknown' | 'filled' | 'partially_filled_cancelled' | 'cancelled';
  settlementCurrency: 'USDC' | 'LUSDC';
  createdAt: number;
  expireAt: number;
  bookOrderId?: string;
  batchId?: string;
  /** Conversion state of the pool part. See {@link QuoteSettlementStatus}. */
  quoteSettlementStatus?: QuoteSettlementStatus;
}

export interface GetOrderResponse {
  order: Order | MarketOrder;
}

export interface CancelOrderParams {
  orderId: string;
}

export interface CancelOrderResponse {
  orderId: string;
  cancelled: boolean;
}

export interface ListOrdersParams {
  /** Include routed market parents in the separate marketOrders array. */
  includeMarket?: boolean;
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

/**
 * Normalized lifecycle for a pool-executed swap.
 * `settled` and `failed` are final. The executor can try one swap up to three times; between
 * those attempts the state stays `pending`.
 */
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
  /** Conversion state of the swap. See {@link QuoteSettlementStatus}. */
  quoteSettlementStatus?: QuoteSettlementStatus;
}

export interface GetSwapStatusResponse {
  swap: SwapStatus;
}

export interface ListOrdersResponse {
  orders: Order[];
  marketOrders?: MarketOrder[];
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

export type WithdrawSource = 'rent' | 'wallet';
export type WithdrawDestination = 'bank' | 'usdc';

/**
 * Whose name a bank withdrawal is paid in. `personal` = the person on the
 * account. `business` = the account's business entity. Pick the name on the
 * receiving bank account: a mismatch usually makes the bank return the transfer.
 */
export type PayoutPayee = 'personal' | 'business';

/** A payee this account can use, with the exact name the bank payout carries. */
export type PayoutPayeeOption = {
  payee: PayoutPayee;
  name: string;
};

type WithdrawBaseParams = {
  /** `rent` = rental-income ledger. `wallet` = Lofty USDC wallet cash. */
  source: WithdrawSource;
  /** USD amount. Bank minimum $1; USDC minimum $0.05. */
  amount: number;
  /** Saved bank id from `listWithdrawals().destinations.bankAccounts`, or `legacy`. */
  bankAccountId?: string;
  /**
   * Algorand address to receive USDC. Must be opted into USDC. Omit to use the
   * account's saved receiving wallet (wallet-cash) or Lofty wallet (rent).
   */
  destinationAddress?: string;
};

/** ACH to a linked US bank. */
export type BankWithdrawParams = WithdrawBaseParams & {
  /** `bank` = ACH to a linked US bank. */
  destination: 'bank';
  /**
   * Required. One of `listWithdrawals().destinations.payoutPayees[].payee`.
   * An account without a business always passes `'personal'`.
   */
  payoutPayee: PayoutPayee;
};

/** Algorand USDC. A USDC payout has no payee: do not pass `payoutPayee`. */
export type UsdcWithdrawParams = WithdrawBaseParams & {
  /** `usdc` = Algorand USDC only. */
  destination: 'usdc';
  payoutPayee?: never;
};

export type WithdrawParams = BankWithdrawParams | UsdcWithdrawParams;

export type WithdrawResponse = {
  amount: number;
  source: WithdrawSource;
  destination: WithdrawDestination;
  destinationAddress?: string;
  bankAccountId?: string;
  /** Bank withdrawals only: the name the payout is paid in. */
  payoutPayee?: PayoutPayee;
};

export type WithdrawalRecord = {
  id: string;
  createdAt: number;
  updatedAt?: number;
  amount: number;
  feeAmount?: number;
  netAmount?: number;
  status: string;
  paymentType?: string;
  paymentSubtype?: string;
  transferMethod?: string;
  /** Bank withdrawals only: whose name the payout was paid in. */
  payoutPayee?: PayoutPayee;
};

export type BankAccountSummary = {
  id: string;
  nickname?: string;
  last4: string;
  routingLast4: string;
  accountType?: string;
};

export type WithdrawalDestinations = {
  bankAccounts: BankAccountSummary[];
  usdcReceivingWallet: string | null;
  loftyWalletAddress: string | null;
  /**
   * Valid `payoutPayee` values for a bank withdrawal, with the name each pays.
   * An account without a business lists only `personal`.
   */
  payoutPayees: PayoutPayeeOption[];
};

export type PayoutMethod = {
  id: WithdrawDestination;
  sources: WithdrawSource[];
  minimum: number;
  network: string;
  note: string;
};

export type ListWithdrawalsParams = {
  limit?: number;
  status?: string;
};

export type ListWithdrawalsResponse = {
  withdrawals: WithdrawalRecord[];
  destinations: WithdrawalDestinations;
  methods: PayoutMethod[];
};

export type AddBankAccountParams = {
  achRoutingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  nickname?: string;
};

export type AddBankAccountResponse = {
  bankAccount: BankAccountSummary;
};

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
  /** Present on a current-generation pool. A pool from before it omits this field. */
  pmmVersion?: 'v2';
  /**
   * Side switches from the saved pool state, on a `pmmVersion: 'v2'` pool. `amm.getQuote()` and
   * `orders.getMarketQuote()` read the live switches, so a quote is the authority.
   */
  controls?: { buyEnabled: boolean; sellEnabled: boolean };
  /**
   * Market price (USDC per token) when `priceVersion` is `2`. After a successful
   * sell sample, it is the midpoint of `priceHigh` and `priceLow` only when the same
   * refresh quotes a buy, the pool holds at least 0.1 token, and the ask exceeds the
   * bid. Otherwise it is the 0.01-token sell quote before fees, scaled to one token.
   * Older rows use the one-token sell quote before fees, equal to `priceLow`.
   * Failed V2 sell samples retain the previous price tuple. See `priceVersion`.
   * This is not the pool's oracle price. The API does not return the oracle price.
   */
  price: number;
  /**
   * Buy reference (USDC per token). With `priceVersion: 2`, normally the 0.01-token
   * buy quote scaled to one token, buy fees included. A failed buy retains the prior
   * ask, which can still be the older one-token quote during migration.
   * Older rows use the one-token buy quote: fees included on V2, before fees on V1.
   * Failed V2 sell samples also retain this value. See `priceVersion`.
   */
  priceHigh: number;
  /**
   * Bid (USDC per token): what a seller receives for each token, after the sell fees.
   * With `priceVersion: 2`, the 0.01-token sell quote after fees, scaled to one token.
   * Older rows use the one-token sell quote before fees. See `priceVersion`.
   */
  priceLow: number;
  /**
   * Price semantics marker, separate from the pool's contract version. The API
   * returns `2` only when the stored marker is `2` and `price > priceLow`.
   * V2 refreshes sample the smallest order (0.01 token), scaled to one token.
   * A larger order can get a worse price per token. Use `amm.getQuote()` for your order.
   *
   * If a V2 refresh cannot quote a sell, `priceHigh`, `priceLow`, `price`, and the
   * stored `priceVersion` all keep their last values. If only the buy fails, the bid
   * and market price still update, but the ask keeps its last value, even if it is
   * an older one-token quote.
   * The prices follow the pool state. On a pool with few tokens, one trade can move
   * them a lot.
   *
   * V1 pools keep the older one-token prices and omit this field. Older V2 rows
   * retain their previous tuple until a sell sample succeeds. Because the API also
   * checks `price > priceLow`, an omitted marker alone does not guarantee a one-token
   * sample. The public pool object does not expose `legacyPriceHigh`.
   */
  priceVersion?: 2;
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
  totalReturn?: { base: number; quote: number } | null;
  cumulativeApy?: { base: number; quote: number } | null;
  vol24h: { buys: number; sells: number };
  vol7d: { buys: number; sells: number };
}

export interface ListAmmPoolsResponse {
  pools: AmmPool[];
  /**
   * The asset your account settles in. A USDC account also sees pools that quote USDL
   * (`assets.quote`): the quote converts 1:1 at execution. Trade those pools with a market
   * order (`orders.create({ orderType: 'market' })`), not with `amm.executeSwap()`.
   */
  settlementCurrency?: 'USDC' | 'LUSDC';
}

export interface GetAmmPoolResponse {
  pool: AmmPool;
  /** See {@link ListAmmPoolsResponse.settlementCurrency}. */
  settlementCurrency?: 'USDC' | 'LUSDC';
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
  /**
   * Positive, finite USDC target for the pool payment or order-book total.
   * Sells target proceeds before fees. Buys may charge additional fees; see `totalDebit`.
   * Invalid amounts produce `LoftyError` with HTTP 400, code `invalid_field`, field `usdcAmount`.
   */
  usdcAmount: number;
  tokenAmount?: never;
}

export type GetQuoteParams = GetQuoteByTokenAmount | GetQuoteByUsdcAmount;

interface AmmQuoteBase {
  poolId: number;
  side: QuoteSide;
  /** Property tokens involved */
  tokenAmount: number;
  /**
   * Pool payment or order-book total. V2 AMM buys already include native buy fees;
   * their additional `fees` are zero and `totalDebit` equals this amount. Other buys
   * add fees, and sells deduct fees. Use `totalDebit` (buys) / `netProceeds` (sells)
   * for the wallet amount.
   */
  usdcAmount: number;
  /**
   * Additional fees added to buys or deducted from sells. V2 AMM buy fees are
   * already included in `usdcAmount`, so all these fields are zero on those buys.
   * Other pool quotes contain swap fees; paused order-book quotes contain the
   * exchange fee in `platform`, with `lp` and `operatingReserve` set to zero.
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
  /** `usdcAmount / tokenAmount` in USDC; excludes additional fees, including sell fees. */
  usdcPerToken: number;
  /**
   * Reference price for `slippage` and `priceImpact`. An AMM quote uses the pool's
   * `priceHigh` on a buy and `priceLow` on a sell. A paused-book quote uses the top
   * of the live order book. On a sell from a pool with `priceVersion: 2`, `slippage`
   * and `priceImpact` compare `netProceeds` with this price. All other quotes compare
   * `usdcAmount`.
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

/** A quote produced by simulating the swap on the on-chain AMM contract. */
export interface AmmPoolQuote extends AmmQuoteBase {
  source: 'amm';
  /** Absent on pool quotes; `true` identifies a paused order-book quote. */
  tradingPaused?: undefined;
}

/** A quote walked from the live order book while AMM trading is paused. */
export interface AmmOrderBookQuote extends AmmQuoteBase {
  source: 'orderbook';
  tradingPaused: true;
}

/**
 * Executable quote from either supported venue. Narrow on `source`, or check
 * `tradingPaused`, to select the pool or paused order-book branch.
 */
export type AmmQuote = AmmPoolQuote | AmmOrderBookQuote;

export interface ExecuteSwapParams {
  poolId: number;
  side: QuoteSide;
  /** Number of property tokens to buy or sell */
  tokenAmount: number;
  /**
   * Buys only — REQUIRED. Maximum to spend, in dollars of your settlement asset; the cap is
   * enforced on-chain. Get the expected cost from `getQuote()` then add a small buffer (e.g. 1–2%).
   * The cap applies to the POOL PAYMENT (`quote.usdcAmount`). On a `pmmVersion: 'v2'` pool that
   * payment already includes the fees, so it equals `quote.totalDebit`. On a pool from before it,
   * fees are charged on top: your wallet must cover `quote.totalDebit`, not only this cap.
   */
  maxUsdcAmount?: number;
  /**
   * Sells only — REQUIRED. Minimum to receive, in dollars of your settlement asset. Without it
   * the API rejects the sell. Get the quote from `getQuote()` then subtract your tolerance
   * (e.g. 1–2%).
   * On a `pmmVersion: 'v2'` pool the floor applies to what you RECEIVE AFTER FEES
   * (`quote.netProceeds`), and the pool contract enforces it. Base it on `quote.netProceeds`:
   * a floor based on `quote.usdcAmount` is above the proceeds and the sell is refused.
   * On a pool from before it, the floor applies to the pool payment (`quote.usdcAmount`) and the
   * API checks it immediately before execution.
   */
  minUsdcAmount?: number;
}

/** A swap accepted for execution on the AMM pool. */
export interface ExecutePoolSwapResponse {
  /** Batch ID for tracking the transaction status on-chain */
  batchId: string;
  result: unknown;
  /** Absent on pool swaps; `'orderbook'` identifies a paused-book swap. */
  routedTo?: undefined;
  /** Absent on pool swaps; `true` identifies a paused-book swap. */
  tradingPaused?: undefined;
}

/** A swap placed as a limit order on the book while AMM trading is paused. */
export interface ExecuteOrderBookSwapResponse {
  routedTo: 'orderbook';
  tradingPaused: true;
  /** Track this order with `orders.get(orderId)`, not `amm.getSwapStatus()`. */
  orderId: string;
  propertyId: string;
  side: QuoteSide;
  quantity: number;
  /** Limit price derived from the swap's slippage bound. */
  limitPrice: number;
  /** Unix milliseconds; the resting order expires 30 days after acceptance. */
  expireAt: number;
  message: string;
}

/**
 * Result of submitting a swap. Narrow on `routedTo` or `tradingPaused` before
 * accessing the pool `batchId` or order-book order fields. A book-routed swap
 * may fill partially and is not an atomic pool execution.
 */
export type ExecuteSwapResponse = ExecutePoolSwapResponse | ExecuteOrderBookSwapResponse;

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
 * Quantity GRID for a property with `assetDecimals > 0`: every order quantity must be a whole
 * multiple of this. Properties with `assetDecimals: 0` accept whole tokens only.
 *
 * This is the grid ONLY, not the minimum order size - that is `MIN_ORDER_QUANTITY`, 100 steps up.
 * The two are separate so a dollar-entered amount can be priced to the cent without allowing
 * dust-sized positions.
 */
export const ORDER_STEP = 0.0001;

/**
 * Smallest order quantity, in tokens, for a property with `assetDecimals > 0`. Orders below this
 * are rejected by the API even when they sit on the `ORDER_STEP` grid.
 */
export const MIN_ORDER_QUANTITY = 0.01;

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
  /**
   * Growsurf referral id, slug (`name-id`), or a URL containing `grsf=`.
   * Qualifying signups credit the partner. Invalid codes are rejected with
   * 400 `invalid_referral_code`; Growsurf outages do not fail onboarding.
   */
  referralCode?: string;
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
