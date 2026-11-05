import type { AmmQuote, ExecuteSwapResponse } from './types';

// Compile-time consumer checks only. This file is intentionally absent from src/index.ts,
// so tsc checks it while the package entry point never bundles it.
function assertType<T>(_value: T): void {}

function checkQuoteNarrowing(quote: AmmQuote): void {
  if (quote.source === 'amm') {
    assertType<'amm'>(quote.source);
    assertType<undefined>(quote.tradingPaused);
  } else {
    assertType<'orderbook'>(quote.source);
    assertType<true>(quote.tradingPaused);
  }

  if (quote.tradingPaused) {
    assertType<'orderbook'>(quote.source);
    assertType<true>(quote.tradingPaused);
  } else {
    assertType<'amm'>(quote.source);
    assertType<undefined>(quote.tradingPaused);
  }
}

function checkSwapNarrowing(response: ExecuteSwapResponse): void {
  if (response.routedTo === 'orderbook') {
    assertType<'orderbook'>(response.routedTo);
    assertType<true>(response.tradingPaused);
    assertType<string>(response.orderId);
    assertType<string>(response.propertyId);
    assertType<'buy' | 'sell'>(response.side);
    assertType<number>(response.quantity);
    assertType<number>(response.limitPrice);
    assertType<number>(response.expireAt);
    assertType<string>(response.message);
    // @ts-expect-error Pool batch IDs are unavailable on a book-routed response.
    assertType<string>(response.batchId);
  } else {
    assertType<string>(response.batchId);
    assertType<unknown>(response.result);
    assertType<undefined>(response.routedTo);
    assertType<undefined>(response.tradingPaused);
    // @ts-expect-error Book order IDs are unavailable on a pool-executed response.
    assertType<string>(response.orderId);
  }

  if (response.tradingPaused) {
    assertType<string>(response.orderId);
    assertType<'orderbook'>(response.routedTo);
  } else {
    assertType<string>(response.batchId);
    assertType<undefined>(response.routedTo);
  }
}

void checkQuoteNarrowing;
void checkSwapNarrowing;
