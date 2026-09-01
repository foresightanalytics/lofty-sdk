// Regression tests for the order-quantity grid (ENG-10671 follow-up).
//
// The live API validates fractional quantities on a 0.0001 grid with a 0.01-token minimum and a
// $1 notional minimum (frontend-microservices libs/token-units.ts, validateOrderQuantity). The SDK
// used to enforce a universal 0.01 grid locally and rejected API-valid quantities like 0.1025
// before they ever reached the server. These tests pin the corrected client-side contract:
// the SDK SENDS anything the API could accept, and rejects locally only what no property accepts.
//
// Runs against the built artifact (dist/), so it also proves the package matches the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LoftyClient, LoftyError, ORDER_STEP, MIN_ORDER_QUANTITY } from '../dist/index.mjs';

const API_KEY = 'lofty_test_00000000000000000000000000000000';

// Stub transport: capture the request instead of hitting the network.
const capture = () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ orderId: 'ord_test' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return calls;
};

const client = () => new LoftyClient({ apiKey: API_KEY, baseUrl: 'http://localhost:9' });

test('constants match the API contract', () => {
  assert.equal(ORDER_STEP, 0.0001);
  assert.equal(MIN_ORDER_QUANTITY, 0.01);
});

test('0.1025 is on the API grid and is SENT, not rejected locally', async () => {
  const calls = capture();
  const res = await client().orders.create({
    propertyId: 'prop_1', direction: 'buy', price: 10, quantity: 0.1025,
  });
  assert.equal(res.orderId, 'ord_test');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.quantity, 0.1025);
});

test('0.01 (the minimum fractional order) is sent', async () => {
  const calls = capture();
  await client().orders.create({ propertyId: 'prop_1', direction: 'buy', price: 100, quantity: 0.01 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.quantity, 0.01);
});

test('whole shares still pass for zero-decimal properties', async () => {
  const calls = capture();
  await client().orders.create({ propertyId: 'prop_1', direction: 'sell', price: 50, quantity: 3 });
  assert.equal(calls[0].body.quantity, 3);
});

test('a value off the 0.0001 grid is rejected locally, without a network call', async () => {
  const calls = capture();
  await assert.rejects(
    client().orders.create({ propertyId: 'prop_1', direction: 'buy', price: 10, quantity: 0.10253 }),
    (err) => err instanceof LoftyError && /multiple of 0\.0001/.test(err.message),
  );
  assert.equal(calls.length, 0);
});

test('a quantity below 0.01 is rejected locally - no property accepts it', async () => {
  const calls = capture();
  await assert.rejects(
    client().orders.create({ propertyId: 'prop_1', direction: 'buy', price: 10, quantity: 0.0099 }),
    (err) => err instanceof LoftyError && /at least 0\.01/.test(err.message),
  );
  assert.equal(calls.length, 0);
});

test('large on-grid quantities are not tripped by float noise', async () => {
  const calls = capture();
  await client().orders.create({ propertyId: 'prop_1', direction: 'buy', price: 1, quantity: 12345.6789 });
  assert.equal(calls[0].body.quantity, 12345.6789);
});
