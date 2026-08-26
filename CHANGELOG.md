# Changelog

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
