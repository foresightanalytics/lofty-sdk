# Changelog

## 0.12.0

### Current pools for USDC accounts, market quote (ENG-10967)

Requires the matching backend release. Before it, `amm.listPools()`, `amm.getPool()` and
`amm.getQuote()` answered `409 amm_trading_paused` or `404` for every USDC account, also
for properties that have a live pool.

- `amm.listPools()`, `amm.getPool()` and `amm.getQuote()` now answer for the current
  (`pmmVersion: 'v2'`) pools for USDC accounts and USDL accounts. Most of these pools quote
  USDL; for a USDC account the quote converts 1:1 at execution. Pool responses include
  `settlementCurrency`, and a v2 pool includes `controls: { buyEnabled, sellEnabled }`.
  `AmmPool` also types `totalReturn` and `cumulativeApy`, which the API already returned.
- New `orders.getMarketQuote({ propertyId, direction, quantity, maxSlippageBps? })`: the route
  (`book`, `pmm`, `split`) and totals of a market order placed now. It creates nothing.
- `orders.create({ orderType: 'market' })` accepts optional `limitTotal` (dollars). Pass
  `slippageBound` from a market quote requested with the same `maxSlippageBps`. The API answers
  `409 slippage_exceeded` and starts nothing when the route at order time is worse. `boundTotal`
  has no pool slippage in it: as `limitTotal` it refuses the order after any pool price move.
- `MarketOrder` and `SwapStatus` include `quoteSettlementStatus`:
  `not_applicable | pending | settled | held`.
- `amm.executeSwap()` is deprecated. Use market orders. A USDC account on a pool that quotes
  USDL gets `409 use_market_order`. USDL accounts and paused-pool book routing keep working.
- New exported types: `GetMarketQuoteParams`, `GetMarketQuoteResponse`, `QuoteSettlementStatus`,
  `SwapState`, `SwapStatus`, `GetSwapStatusResponse`.

### Behavior changes to check

- A market order that the market cannot fill now answers `409 insufficient_liquidity`
  (before: `400`). `trading_disabled` is `409`. A route that cannot be verified answers
  `503 quote_unavailable` (before: `500`). The codes did not change; branch on `error.code`.
- `amm.listPools({ propertyId })` answers `404 pool_not_found` when the property has no current
  pool for your account. The earlier doc comment said `null`; the API never returned that.
- A v2 pool that is inactive, spun down or replaced is `404 pool_not_found`, not
  `409 amm_trading_paused`.
- `amm.getQuote()` on a v2 pool answers `409 pool_buy_disabled` / `409 pool_sell_disabled`
  when that side is off, and `409 quote_unavailable` when the pool cannot price the amount.
  A failed pool simulation no longer returns `500` with contract text.
- `amm.executeSwap()` sells on a v2 pool: `minUsdcAmount` is compared with the proceeds after
  fees (`quote.netProceeds`). A floor based on `quote.usdcAmount` is refused.
- `amm.getQuote()` and `orders.getMarketQuote()` share a lower rate limit than other reads.
- A market order or swap that the pool refuses before it starts now gets a `4xx` (or
  `503 pool_unavailable`). Nothing started, and you can retry it with the same idempotency
  key. A market order that was already saved ends in the final state `cancelled`; before, it
  could stay in `execution_unknown`. A refused swap has no `batchId` and no status.
- A swap state `failed` and a market order state `cancelled` are final. The executor can try
  one pool trade up to three times; between those attempts the state stays `pending` /
  `execution_pending`, so a failure that you read is safe to act on.
- A market order with no Lofty wallet on the account gets `400 no_wallet`.

## 0.11.0

### Bank withdrawal payee (breaking)

- `account.withdraw({ destination: 'bank' })` now requires `payoutPayee: 'personal' | 'business'`:
  whose name the ACH transfer is paid in. Use the name on the receiving bank account; a
  mismatch usually makes the receiving bank return the transfer.
- `listWithdrawals().destinations.payoutPayees` lists the payees the account can use, with the
  exact name each pays. An account without a business lists only `personal` and always passes
  `payoutPayee: 'personal'`.
- `WithdrawParams` is now a union of `BankWithdrawParams` (requires `payoutPayee`) and
  `UsdcWithdrawParams` (rejects it). New exported types: `PayoutPayee`, `PayoutPayeeOption`.
- Local guards raise `LoftyError` `400` with `field: 'payoutPayee'`: `missing_field` (bank
  without it) and `invalid_field` (unknown value, or passed on a USDC withdrawal). The API
  answers `400 payout_payee_unavailable` when the account can't use the named payee; no
  withdrawal is created.
- Bank withdrawal responses and withdrawal records include `payoutPayee`.
- Requires the matching backend release. After it ships, bank withdrawals from SDK versions
  before 0.11.0 are rejected with `400 missing_field` until they pass `payoutPayee`.

## 0.10.0

### AMM response unions (type-level breaking change)

- `AmmQuote` now discriminates pool quotes (`source: 'amm'`) from paused order-book
  quotes (`source: 'orderbook', tradingPaused: true`). The pool branch types
  `tradingPaused` as optional `undefined` for direct narrowing.
- `ExecuteSwapResponse` now discriminates pool execution (`batchId`, `result`) from
  paused-book routing (`routedTo: 'orderbook'`, `tradingPaused: true`, `orderId`,
  `propertyId`, `side`, `quantity`, `limitPrice`, `expireAt`, and `message`). The pool
  branch types `routedTo` and `tradingPaused` as optional `undefined`.
- Narrow swaps before reading branch-only fields. Consumers extending the old response
  interfaces can instead extend the new exported branch interfaces. Request behavior
  and runtime JSON pass-through are unchanged.
- Added representative pool/paused-book transport tests and a strict, unbundled
  TypeScript consumer fixture covering both discriminant styles.

## 0.9.1

- `getStatus()` now routes routed-market `MKT_...` IDs to `GET /public/v1/orders/{id}`
  instead of misclassifying them as pool batch IDs.

## 0.9.0

### Routed market orders

- `orders.create({ orderType: 'market' })` requires an explicit integer
  `maxSlippageBps` from 0 to 9999 and rejects resting-price, expiry, trigger, gift,
  and rent fields. Market execution compares compatible book and V2 PMM liquidity.
- Added market acceptance/execution response types, `MarketOrder`, and
  `orders.list({ includeMarket: true })`. Acceptance is not a fill guarantee; poll
  order status and reconcile uncertain execution rather than replacing the order.
- Routed accounts may settle in USDC or USDL (`LUSDC` in API values). Limit-order
  request behavior is unchanged.

## 0.8.1

- Reverted the 0.8.0 V2 liquidity preview, deposit, withdrawal, reporting, and unit
  changes, restoring the pre-0.8.0 SDK surface. Existing account withdrawals remain
  separate from pool liquidity operations.

## 0.8.0

- Added V2 pool liquidity previews plus bounded deposits and withdrawals, V2 position
  and reporting types, and whole-unit liquidity fields. These changes were reverted in
  0.8.1 and are not part of the current SDK surface.

## 0.7.0

### Withdrawals

- `account.listWithdrawals()`, `account.withdraw()`, and `account.addBankAccount()` talk to `GET/POST /public/v1/account/withdrawals`.
- Sources: rental income or Lofty wallet cash. Destinations: ACH to a linked US bank, or USDC on **Algorand**. Cross-chain USDC outbound is not available; inbound other chains remain `users.getDepositAddresses`.
- `addBankAccount` does not require trading enabled and allows test keys. Payouts still require a live, trading-enabled key.
- An unknown `bankAccountId` is rejected (`unknown_bank_account`) instead of paying the legacy bank slot.
- Local guards: amount > 0, Algorand `destinationAddress` shape, bank routing/account/type.

### Orders

- Documented that open limit orders are allowed on many properties at once. `order_in_progress` is an in-flight create lock, not a resting-order cap.

### Partner onboarding

- `users.create()` accepts optional `referralCode` (Growsurf id, slug, or `grsf=` URL).

## 0.6.0

### Fractional order quantities: 0.0001 grid

- `orders.create()` no longer rejects API-valid fractional quantities. The local guard now matches
  the live API contract: quantities must be a multiple of `ORDER_STEP` (now **0.0001**, was 0.01)
  and at least `MIN_ORDER_QUANTITY` (**0.01** tokens, new export). A value like `0.1025` is sent to
  the server instead of failing locally. Per-property rules (whole shares when `assetDecimals: 0`,
  the $1 notional minimum) are unchanged and stay enforced server-side.
- Docs/types no longer claim every property is zero-decimal.
- Added regression tests (`npm test`) covering 0.1025, 0.01, off-grid, and below-minimum values.

## 0.5.3

- Internal: extends the Lofty-arranged partner integration surface.

## 0.5.2

- Internal: extends the Lofty-arranged partner integration surface.

## 0.5.1

- Internal: additional resource for Lofty-arranged partner integrations.

## 0.5.0

### Advanced order types (fractional properties)

`orders.create()` accepts `orderType: 'stop_loss' | 'stop_limit' | 'trailing_stop'` with
`triggerPrice` / `triggerLimitPrice` / `trailPercent` / `referenceWindowDays` (7 | 14 | 30).
Trigger orders rest hidden until the platform fires them against a manipulation-hardened
volume-weighted reference price, then convert into ordinary limit orders. Order reads
include the trigger lifecycle (`triggerState`, `trailWatermark`, `triggeredAt`, ...), and
`orders.list()` accepts a `triggerState` filter. `price` is now optional on trigger orders.

### Recurring investment plans (fractional properties)

New `lofty.recurring` resource: `create()` / `list()` / `cancel()`. Card-funded plans charge
the saved card off-session only when a run's order actually fills (charge-at-match);
Apple Pay / Google Pay cards are supported.

### Fixes

Corrected stale docs claiming quantity must be whole ("Minimum 1") — fractional
properties trade in multiples of 0.01 with a $1 minimum notional.

## 0.3.0

### Fractional share quantities

Some properties can now be traded in fractions of a share. Nothing changes for the properties you
trade today, but `quantity` is no longer guaranteed to be an integer, so check your parsing.

- **`PropertySummary.assetDecimals`** is now typed. It is the number of decimal places a property's
  Algorand asset supports:
  - `0` or absent - whole shares only. This is every property at the time of this release.
  - `> 0` - fractional shares, in multiples of `ORDER_STEP` (0.01), with a minimum order value of
    `MIN_ORDER_NOTIONAL_USD` ($1.00).
- **`quantity` may be fractional** on `OrderBookLevel`, `Order` and `Trade`. If you call `parseInt`,
  compare with `===`, or assume integers anywhere, update it before a fractional property goes live.
- **New exports**: `ORDER_STEP`, `MIN_ORDER_NOTIONAL_USD`.
- **`orders.create()` now validates quantity locally** and throws a `LoftyError`
  (`code: 'invalid_field'`) for a non-positive quantity or one that is not a multiple of `ORDER_STEP`,
  instead of failing on a round trip. Integer quantities are always valid.

No breaking type changes: every field keeps its name and type.
