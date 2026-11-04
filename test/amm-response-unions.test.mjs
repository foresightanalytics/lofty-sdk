import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LoftyClient } from '../dist/index.mjs';

const API_KEY = 'lofty_test_00000000000000000000000000000000';
const client = () => new LoftyClient({ apiKey: API_KEY, baseUrl: 'http://localhost:9' });

const poolQuote = {
  poolId: 123,
  side: 'buy',
  tokenAmount: 10,
  usdcAmount: 500,
  usdcPerToken: 50,
  referencePrice: 49.5,
  slippage: 1.0101,
  priceImpact: 0.5,
  fees: { platform: 2.5, lp: 1.5, operatingReserve: 1, total: 5 },
  totalDebit: 505,
  source: 'amm',
};

const pausedBookQuote = {
  poolId: 123,
  side: 'sell',
  tokenAmount: 5,
  usdcAmount: 250,
  usdcPerToken: 50,
  referencePrice: 50,
  slippage: 0,
  priceImpact: 0,
  fees: { platform: 1.25, lp: 0, operatingReserve: 0, total: 1.25 },
  netProceeds: 248.75,
  source: 'orderbook',
  tradingPaused: true,
};

const poolSwap = {
  batchId: 'sdk-swap-01JZK7N4K2E7J2E6K0F2Q7G4M5',
  result: { txId: 'POOLTRANSACTIONID' },
};

const pausedBookSwap = {
  routedTo: 'orderbook',
  tradingPaused: true,
  orderId: '01JZK7N4K2E7J2E6K0F2Q7G4M5',
  propertyId: 'prop_123',
  side: 'buy',
  quantity: 10,
  limitPrice: 50,
  expireAt: 1793836800000,
  message: 'AMM trading is paused; this swap was placed on the order book as a limit order at your slippage bound.',
};

const mockJson = (t, payload) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
};

for (const [name, response] of [['pool', poolQuote], ['paused order-book', pausedBookQuote]]) {
  test(`getQuote passes through a representative ${name} response`, async (t) => {
    const calls = mockJson(t, response);
    const result = await client().amm.getQuote({
      poolId: 123,
      side: response.side,
      tokenAmount: response.tokenAmount,
    });

    assert.deepEqual(result, response);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/public/v1/amm/quote');
    assert.equal(calls[0].url.searchParams.get('poolId'), '123');
    assert.equal(calls[0].url.searchParams.get('side'), response.side);
    assert.equal(calls[0].url.searchParams.get('tokenAmount'), String(response.tokenAmount));
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.body, undefined);
  });
}

for (const [name, response] of [['pool', poolSwap], ['paused order-book', pausedBookSwap]]) {
  test(`executeSwap passes through a representative ${name} response without changing the request`, async (t) => {
    const calls = mockJson(t, response);
    const result = await client().amm.executeSwap({
      poolId: 123,
      side: 'buy',
      tokenAmount: 10,
      maxUsdcAmount: 500,
    }, 'amm-response-test-key');

    assert.deepEqual(result, response);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/public/v1/amm/swap');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      poolId: 123,
      side: 'buy',
      tokenAmount: 10,
      maxUsdcAmount: 500,
    });
  });
}
