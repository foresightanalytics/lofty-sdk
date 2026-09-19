import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoftyClient } from '../dist/index.mjs';

const client = () => new LoftyClient({ apiKey: 'lofty_test_00000000000000000000000000000000', baseUrl: 'http://localhost:9' });
const capture = () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), ...init, body: init?.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ batchId: 'batch' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
};
test('V2 withdrawal sends exact gross amount and both limits, never client identity', async () => {
  const calls = capture();
  await client().amm.withdraw({ poolId: 9000000001800001, side: 'quote', amount: 1.25, minAssetOut: 1.18, maxLpBurn: 1.3, userId: 'victim', wallet: 'victim' }, 'persistent-operation-key');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { poolId: 9000000001800001, side: 'quote', amount: 1.25, minAssetOut: 1.18, maxLpBurn: 1.3 });
  assert.match(calls[0].url, /\/amm\/withdraw$/);
  assert.equal(new Headers(calls[0].headers).get('Idempotency-Key'), 'persistent-operation-key');
});
test('V2 deposit preserves caller minimum LP output', async () => {
  const calls = capture();
  await client().amm.deposit({ poolId: 12, side: 'base', amount: 0.04, minLpOut: 0.035 }, 'deposit-key');
  assert.deepEqual(calls[0].body, { poolId: 12, side: 'base', amount: 0.04, minLpOut: 0.035 });
});
test('unsafe amounts and missing protections fail before any request', async () => {
  const calls = capture();
  for (const amount of [0, -1, NaN, Infinity, 0.0000001, 1e20]) {
    await assert.rejects(client().amm.deposit({ poolId: 12, side: 'base', amount, minLpOut: 1 }));
  }
  await assert.rejects(client().amm.withdraw({ poolId: 12, side: 'quote', amount: 1, minAssetOut: 0.9 }));
  await assert.rejects(client().amm.deposit({ poolId: 12, side: 'base', amount: 1 }));
  assert.equal(calls.length, 0);
});
test('liquidity quote and status are read-only calls', async () => {
  const calls = capture();
  await client().amm.getLiquidityQuote({ poolId: 12, operation: 'withdraw', side: 'base', amount: 0.25 });
  await client().amm.getLiquidityStatus('sdk-liquidity-test');
  assert.equal(calls[0].method, 'GET');
  assert.equal(new URL(calls[0].url).searchParams.get('amount'), '0.25');
  assert.equal(calls[1].method, 'GET');
  assert.match(calls[1].url, /\/swaps\/sdk-liquidity-test$/);
});
