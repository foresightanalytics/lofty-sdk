import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LoftyClient, LoftyError } from '../dist/index.mjs';

const client = () => new LoftyClient({ apiKey: 'lofty_test_00000000000000000000000000000000', baseUrl: 'http://localhost:9' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('getMarketQuote reads the market-quote endpoint and sends no body', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), method: init?.method, body: init?.body });
    return json({ route: 'pmm', poolId: 7, bookPrice: null, quotedTotal: 97.5, boundTotal: 97.5 });
  });
  const quote = await client().orders.getMarketQuote({ propertyId: 'prop_1', direction: 'buy', quantity: 2, maxSlippageBps: 100 });
  assert.equal(quote.boundTotal, 97.5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.pathname, '/public/v1/orders/market-quote');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { propertyId: 'prop_1', direction: 'buy', quantity: '2', maxSlippageBps: '100' });
  assert.equal(calls[0].body, undefined);
});

test('getMarketQuote leaves maxSlippageBps out when the caller sends none', async (t) => {
  let url;
  t.mock.method(globalThis, 'fetch', async (requested) => { url = new URL(requested); return json({ route: 'book' }); });
  await client().orders.getMarketQuote({ propertyId: 'prop_1', direction: 'sell', quantity: 0.5 });
  assert.equal(url.searchParams.has('maxSlippageBps'), false);
});

for (const [name, params, field] of [
  ['a missing propertyId', { direction: 'buy', quantity: 1 }, 'propertyId'],
  ['an unknown direction', { propertyId: 'p', direction: 'hold', quantity: 1 }, 'direction'],
  ['a zero quantity', { propertyId: 'p', direction: 'buy', quantity: 0 }, 'quantity'],
  ['a fractional slippage', { propertyId: 'p', direction: 'buy', quantity: 1, maxSlippageBps: 1.5 }, 'maxSlippageBps'],
]) {
  test(`getMarketQuote rejects ${name} before any request`, async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({}));
    await assert.rejects(client().orders.getMarketQuote(params), (error) => error instanceof LoftyError && error.field === field);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

test('a market order sends limitTotal, and a limit order cannot', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => { bodies.push(JSON.parse(init.body)); return json({ orderId: 'MKT_1', state: 'execution_pending' }); });
  const market = { propertyId: 'p', direction: 'buy', quantity: 2, orderType: 'market', maxSlippageBps: 100 };
  await client().orders.create({ ...market, limitTotal: 97.5 }, 'key-00000001');
  await client().orders.create(market, 'key-00000002');
  assert.equal(bodies[0].limitTotal, 97.5);
  assert.equal('limitTotal' in bodies[1], false);
  for (const limitTotal of [0, -1, '97.5', Number.NaN]) {
    await assert.rejects(client().orders.create({ ...market, limitTotal }, 'key-00000003'), (error) => error.field === 'limitTotal');
  }
  await assert.rejects(client().orders.create({ propertyId: 'p', direction: 'buy', quantity: 2, price: 50, limitTotal: 100 }, 'key-00000004'),
    (error) => error.field === 'limitTotal');
  assert.equal(bodies.length, 2);
});

test('use_market_order from executeSwap reaches the caller as a 409 with its code', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ error: { code: 'use_market_order', message: 'Use a market order.' } }, 409));
  await assert.rejects(client().amm.executeSwap({ poolId: 7, side: 'sell', tokenAmount: 2, minUsdcAmount: 90 }, 'key-00000005'),
    (error) => error instanceof LoftyError && error.statusCode === 409 && error.code === 'use_market_order');
});
