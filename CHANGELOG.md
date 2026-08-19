# Changelog

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
