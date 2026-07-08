# @loftyaicode/sdk

Official TypeScript SDK for the [Lofty](https://lofty.ai) trading API.

Monitor LP rewards, view order books, place/cancel limit orders, and get AMM price quotes — all funded from your Lofty USDC wallet.

---

## Requirements

- Node.js 18+ (or any modern browser)
- A Lofty account that has completed KYC
- An API key generated from your Lofty dashboard

---

## Installation

```bash
npm install @loftyaicode/sdk
```

---

## API Keys

API keys are managed in your Lofty account dashboard (**Settings → API Keys**). You must be KYC-verified to generate a key.

Keys look like `lofty_live_...` (production) or `lofty_test_...` (sandbox).

To enable order placement and cancellation, turn on **Trading** for the key. Read-only keys work for market data and account balance without trading enabled.

**Keep your API key secret.** Do not commit it to version control or expose it in client-side code.

---

## Quick Start

```typescript
import { LoftyClient } from '@loftyaicode/sdk';

const lofty = new LoftyClient({ apiKey: 'lofty_live_...' });

// View the order book for a property
const { orderbook } = await lofty.properties.getOrderBook('prop_123');
console.log('Best bid:', orderbook.bids[0]?.price);
console.log('Best ask:', orderbook.asks[0]?.price);

// Check your USDC balance
const { usdc } = await lofty.account.getBalance();
console.log(`Available: $${usdc.toFixed(2)} USDC`);

// Place a limit buy order
const { orderId } = await lofty.orders.create({
  propertyId: 'prop_123',
  direction: 'buy',
  price: 52.00,   // USD per token
  quantity: 10,
});
console.log('Order placed:', orderId);

// Cancel it
await lofty.orders.cancel({ orderId, propertyId: 'prop_123' });
```

---

## Reference

### `new LoftyClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Your Lofty API key |
| `baseUrl` | `string` | prod API | Override for staging/local |
| `timeout` | `number` | `30000` | Request timeout in ms |

---

### `lofty.properties`

#### `.list(params?)`

List all properties on the Lofty marketplace.

```typescript
const { result, page, pageSize } = await lofty.properties.list({
  page: 1,
  pageSize: 50,
  propertyType: 'RESIDENTIAL',
});
```

| Param | Type | Default |
|-------|------|---------|
| `page` | `number` | `1` |
| `pageSize` | `number` | `50` (max 200) |
| `location` | `string` | `'all'` |
| `propertyType` | `'RESIDENTIAL' \| 'COMMERCIAL' \| 'ALL'` | `'ALL'` |
| `minPry` | `number` | `0` |
| `minPan` | `number` | `0` |

#### `.get(propertyId)`

Get details for a single property.

```typescript
const { property } = await lofty.properties.get('prop_123');
```

#### `.getOrderBook(propertyId)`

Get the current order book (bids and asks by price level).

```typescript
const { orderbook } = await lofty.properties.getOrderBook('prop_123');
// orderbook.bids — sorted best-to-worst (highest price first)
// orderbook.asks — sorted best-to-worst (lowest price first)
```

#### `.getTrades(propertyId)`

Get recent trades and market summary.

```typescript
const { recentTrades, bestBid, bestAsk } = await lofty.properties.getTrades('prop_123');
```

---

### `lofty.orders`

All order methods require **trading enabled** on your API key.

Orders are funded from your Lofty USDC wallet. Ensure you have sufficient balance before placing buy orders.

#### `.create(params, idempotencyKey?)`

Place a limit order. Returns the `orderId`.

```typescript
const { orderId } = await lofty.orders.create({
  propertyId: 'prop_123',
  direction: 'buy',     // 'buy' or 'sell'
  price: 52.00,         // USD per token
  quantity: 10,
  expireAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // optional, defaults to 30 days
});
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `propertyId` | `string` | yes | Lofty property ID |
| `direction` | `'buy' \| 'sell'` | yes | Order side |
| `price` | `number` | yes | Price per token in USD (min $0.01) |
| `quantity` | `number` | yes | Number of tokens (min 1) |
| `expireAt` | `number` | no | Unix ms expiry (min 29 days from now, default 30 days) |

Pass an `idempotencyKey` to safely retry a failed request without double-submitting:

```typescript
const key = crypto.randomUUID();
const result = await lofty.orders.create(params, key);
// If the network drops, retry with the same key:
const result = await lofty.orders.create(params, key); // returns the same order
```

#### `.cancel(params, idempotencyKey?)`

Cancel an active order.

```typescript
await lofty.orders.cancel({ orderId: '01J...', propertyId: 'prop_123' });
```

#### `.list(params)`

List your orders for a property. Optionally filter by status.

```typescript
const { orders } = await lofty.orders.list({
  propertyId: 'prop_123',
  status: 'active', // optional
});
```

Available statuses: `active`, `pending`, `executing`, `executed`, `cancelled`, `expired`, `intent`.

---

### `lofty.account`

#### `.getBalance()`

```typescript
const { usdc, algo, rentBalance, giftBalance } = await lofty.account.getBalance();
```

| Field | Description |
|-------|-------------|
| `usdc` | Available USDC (USD) |
| `algo` | Available ALGO |
| `rentBalance` | Accumulated rental income (USD) |
| `giftBalance` | Gift certificate balance (USD) |

#### `.getPositions()`

List your current token holdings by property. Only properties with a non-zero balance are returned.

```typescript
const { positions } = await lofty.account.getPositions();
for (const p of positions) {
  console.log(`${p.propertyId}: ${p.currentTokens} tokens owned`);
}
```

#### `.getLpRewards(params?)`

List your LP reward payouts. Rewards are distributed hourly.

```typescript
// Last 7 days
const { rewards, nextCursor } = await lofty.account.getLpRewards({
  since: Date.now() - 7 * 24 * 60 * 60 * 1000,
  limit: 100,
});
const total = rewards.reduce((sum, r) => sum + r.amount, 0);
console.log(`Earned $${total.toFixed(4)} USDC in the last week`);
```

Paginate with the `cursor`:

```typescript
let cursor: string | null | undefined;
do {
  const page = await lofty.account.getLpRewards({ limit: 50, cursor: cursor ?? undefined });
  process(page.rewards);
  cursor = page.nextCursor;
} while (cursor);
```

---

---

### `lofty.amm`

AMM (automated market maker) pool data and price quotes. Quotes hit the on-chain Algorand contract for exact pricing.

#### `.listPools()`

List all active AMM pools.

```typescript
const { pools } = await lofty.amm.listPools();
for (const p of pools) {
  console.log(`Pool ${p.poolId}: bid ~$${p.priceLow} / ask ~$${p.priceHigh}`);
}
```

#### `.getPool(poolId)`

Get a single AMM pool by its numeric ID.

```typescript
const { pool } = await lofty.amm.getPool(123);
console.log(`Liquidity: ${pool.liquidity.base} tokens / $${pool.liquidity.quote} USDC`);
```

#### `.getQuote(params)`

Get an exact price quote from the on-chain AMM contract. Pass **either** `tokenAmount` or `usdcAmount`.

```typescript
// Cost to buy 10 tokens
const q = await lofty.amm.getQuote({ poolId: 123, side: 'buy', tokenAmount: 10 });
// q.usdcAmount  → exact USDC cost
// q.usdcPerToken → effective price per token
// q.slippage    → % vs reference price (positive = paying a premium)

// How many tokens $500 buys
const q = await lofty.amm.getQuote({ poolId: 123, side: 'buy', usdcAmount: 500 });
// q.tokenAmount → tokens you'll receive
// q.usdcAmount  → actual USDC spent (≤ your input, rounded to achievable token qty)

// USDC received for selling 5 tokens
const q = await lofty.amm.getQuote({ poolId: 123, side: 'sell', tokenAmount: 5 });
// q.usdcAmount  → USDC received after fees

// Tokens needed to receive $200 USDC
const q = await lofty.amm.getQuote({ poolId: 123, side: 'sell', usdcAmount: 200 });
// q.tokenAmount → tokens you need to sell
```

| Field | Description |
|-------|-------------|
| `tokenAmount` | Property tokens involved |
| `usdcAmount` | USDC paid (buy) or received (sell) |
| `usdcPerToken` | Effective exchange rate |
| `referencePrice` | Oracle price used for comparison (`priceHigh` on buys, `priceLow` on sells) |
| `slippage` | `%` deviation from reference price. Positive = worse than reference. |
| `priceImpact` | Per-token USDC difference vs reference (negative impact is favorable for buys) |

> **Note on `usdcAmount` queries:** When you pass `usdcAmount`, the SDK converges on the closest achievable token quantity using 2–4 on-chain calls. The returned `usdcAmount` reflects the exact cost/receipt for that quantity and may differ slightly from your input.

---

### `lofty.lpRewards`

Earn USDC by providing order-book liquidity. Some properties run a **limit-order
liquidity-rewards program**: a fixed daily USDC pool, split across 24 hourly
blocks and paid pro-rata to liquidity that qualifies.

#### How to farm well

To earn on a property, keep resting limit orders on its book that meet **all** of
its program rules:

- **Two-sided** — quote both a bid and an ask, at least `minTwoSidedLiquidity`
  eligible shares on each side. One-sided liquidity earns nothing.
- **Tight** — each order must sit within `allowedSpread` (USD) of the book
  midpoint. Wide quotes are ignored.
- **Sized** — each order needs at least `minContracts` remaining shares.
- **Rested** — orders younger than `minOrderAgeMs` are skipped, and the book is
  sampled at unpredictable moments each hour. Leave your quotes up; don't try to
  time the snapshot.

Your share of each hourly block scales with how tight your two-sided quotes are
and how large your eligible size is versus the rest of the book.

#### `.listPrograms()`

Discover every property currently paying LP rewards, with full terms. Sort by
`dailyRewards` to find the richest pools.

```ts
const { programs } = await lofty.lpRewards.listPrograms();
for (const p of programs) {
  console.log(
    `${p.propertyId}: $${p.dailyRewards}/day ($${p.perBlockRewards.toFixed(2)}/hr) — ` +
    `quote both sides within $${p.allowedSpread} of mid, min ${p.minContracts} shares/side`,
  );
}
```

Each `program` has: `propertyId`, `dailyRewards`, `perBlockRewards`,
`blockDurationMs`, `blocksPerDay`, `allowedSpread`, `minContracts`,
`minTwoSidedLiquidity`, `minOrderAgeMs`, `address`, `thumbnail`, `slug`, `updatedAt`.

#### `.getProgram(propertyId)`

Terms for a single property. Throws `LoftyError` (`404 program_not_found`) if it
has no active program.

```ts
const { program } = await lofty.lpRewards.getProgram('prop_123');
```

#### `.getPositions()`

Your current LP positions and unclaimed rewards per pool (same data as
`account.getLpPositions()`).

#### `.getHistory(params?)`

Your reward payout history, newest first. Params: `since` (Unix ms), `limit`
(max 200), `cursor`.

```ts
// A worked farming loop: pick the best program, quote both sides tight to mid
const { programs } = await lofty.lpRewards.listPrograms();
const best = programs.sort((a, b) => b.dailyRewards - a.dailyRewards)[0];

const { recentTrades, bestBid, bestAsk } = await lofty.properties.getTrades(best.propertyId);
const mid = (bestBid! + bestAsk!) / 2;
const edge = Math.min(best.allowedSpread, 0.05); // sit just inside the allowed band

await lofty.orders.create({ propertyId: best.propertyId, direction: 'buy',  price: +(mid - edge).toFixed(2), quantity: best.minContracts });
await lofty.orders.create({ propertyId: best.propertyId, direction: 'sell', price: +(mid + edge).toFixed(2), quantity: best.minContracts });

// ...leave them resting, then check what you earned
const { rewards } = await lofty.lpRewards.getHistory({ since: Date.now() - 24 * 60 * 60 * 1000 });
console.log('Earned last 24h:', rewards.reduce((s, r) => s + r.amount, 0));
```

---

## Error Handling

All methods throw `LoftyError` subclasses on failure. Check `error.code` for programmatic handling.

```typescript
import { LoftyError, LoftyRateLimitError, LoftyAuthError } from '@loftyaicode/sdk';

try {
  await lofty.orders.create({ ... });
} catch (err) {
  if (err instanceof LoftyRateLimitError) {
    console.log(`Rate limited. Retry in ${err.retryAfter}s`);
  } else if (err instanceof LoftyAuthError) {
    console.log('Invalid or revoked API key');
  } else if (err instanceof LoftyError) {
    console.log(`API error ${err.code}: ${err.message}`);
  } else {
    throw err; // network error, timeout, etc.
  }
}
```

### Error classes

| Class | Status | When |
|-------|--------|------|
| `LoftyAuthError` | 401 | Invalid or revoked API key |
| `LoftyTradingDisabledError` | 403 | Trading not enabled on API key |
| `LoftyRateLimitError` | 429 | Rate limit exceeded; check `.retryAfter` |
| `LoftyError` | 4xx/5xx | All other API errors |

### Rate limits

Per API key, fixed one-minute window:

| Operation | Default limit |
|-----------|--------------|
| Read (GET) | 300 / minute |
| Write (POST / DELETE) | 30 / minute |

Writes are **additionally** capped at **60 / minute per account** across all of your
keys, so extra keys can't multiply your write throughput. Need more? Contact
support to raise your key's override.

Rate limit headers are returned on every response:
- `X-RateLimit-Limit` — your limit for this window
- `X-RateLimit-Remaining` — requests remaining
- `X-RateLimit-Reset` — Unix timestamp when the window resets

On `429`, the SDK automatically retries honoring `Retry-After` (writes retry on
`429` only — never on `5xx`, since a write's outcome after a server error is
unknown).

---

## Idempotency

Write operations (create order, cancel order) require an `Idempotency-Key` header to prevent duplicate submissions. The SDK auto-generates one per call. Pass your own key explicitly if you need retry safety:

```typescript
const key = crypto.randomUUID(); // generate once, keep it
const result = await lofty.orders.create(params, key);
// Network drops → retry with the same key, get the same result back
const result2 = await lofty.orders.create(params, key); // identical to result
```

Keys are deduplicated for 24 hours.
