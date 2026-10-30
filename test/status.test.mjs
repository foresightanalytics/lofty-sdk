import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoftyClient } from '../dist/index.mjs';

for (const [id, kind, endpoint] of [
  ['MKT_01M64M1ZZJPQZ4N2R5GZXHGBQQ', 'order', '/orders/'],
  ['01M64M1ZZJPQZ4N2R5GZXHGBQQ', 'order', '/orders/'],
  ['sdk-swap-example', 'swap', '/swaps/'],
]) {
  test(`getStatus reads ${id} from the ${kind} endpoint`, async (t) => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      calls.push(new URL(url).pathname);
      return new Response(JSON.stringify({ [kind]: { id, state: 'filled' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const client = new LoftyClient({ apiKey: 'lofty_test_00000000000000000000000000000000', baseUrl: 'http://localhost:9' });
    assert.deepEqual(await client.getStatus(id), { kind, [kind]: { id, state: 'filled' } });
    assert.deepEqual(calls, [`/public/v1${endpoint}${id}`]);
  });
}
