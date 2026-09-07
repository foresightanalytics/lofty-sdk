// Regression tests for withdrawals + referralCode (ENG-10687).
// Runs against the built artifact (dist/).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LoftyClient, LoftyError } from '../dist/index.mjs';

const API_KEY = 'lofty_test_00000000000000000000000000000000';
const VALID_ADDR = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const capture = () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), method: init?.method, body, headers: init?.headers });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return calls;
};

const client = () => new LoftyClient({ apiKey: API_KEY, baseUrl: 'http://localhost:9' });

test('withdraw sends source/destination/amount and never a client userId', async () => {
  const calls = capture();
  await client().account.withdraw({
    source: 'rent',
    destination: 'usdc',
    amount: 12.5,
    destinationAddress: VALID_ADDR,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/public\/v1\/account\/withdrawals$/);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.source, 'rent');
  assert.equal(calls[0].body.destination, 'usdc');
  assert.equal(calls[0].body.amount, 12.5);
  assert.equal(calls[0].body.destinationAddress, VALID_ADDR);
  assert.equal(calls[0].body.userId, undefined);
});

test('withdraw trims destinationAddress before sending', async () => {
  const calls = capture();
  await client().account.withdraw({
    source: 'wallet',
    destination: 'usdc',
    amount: 10,
    destinationAddress: `  ${VALID_ADDR}  `,
  });
  assert.equal(calls[0].body.destinationAddress, VALID_ADDR);
});

test('withdraw rejects a bad Algorand destination locally', async () => {
  const calls = capture();
  await assert.rejects(
    client().account.withdraw({
      source: 'wallet',
      destination: 'usdc',
      amount: 10,
      destinationAddress: 'not-an-address',
    }),
    (err) => err instanceof LoftyError && err.code === 'invalid_destination',
  );
  assert.equal(calls.length, 0);
});

test('withdraw rejects a non-positive amount locally', async () => {
  const calls = capture();
  await assert.rejects(
    client().account.withdraw({ source: 'rent', destination: 'bank', amount: 0 }),
    (err) => err instanceof LoftyError && err.code === 'invalid_field',
  );
  assert.equal(calls.length, 0);
});

test('addBankAccount posts action add_bank after sanitizing digits', async () => {
  const calls = capture();
  await client().account.addBankAccount({
    achRoutingNumber: '021-000-021',
    accountNumber: '1234 5678',
    accountType: 'checking',
    nickname: 'Ops',
  });
  assert.equal(calls[0].body.action, 'add_bank');
  assert.equal(calls[0].body.achRoutingNumber, '021000021');
  assert.equal(calls[0].body.accountNumber, '12345678');
});

test('addBankAccount rejects a short routing number locally', async () => {
  const calls = capture();
  await assert.rejects(
    client().account.addBankAccount({
      achRoutingNumber: '123',
      accountNumber: '12345678',
      accountType: 'checking',
    }),
    (err) => err instanceof LoftyError && err.code === 'invalid_routing_number',
  );
  assert.equal(calls.length, 0);
});

test('listWithdrawals hits GET /account/withdrawals', async () => {
  const calls = capture();
  await client().account.listWithdrawals({ limit: 10, status: 'pending' });
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /\/public\/v1\/account\/withdrawals\?limit=10&status=pending$/);
});

const onboardBase = {
  email: 'customer@example.com',
  firstName: 'Amina',
  lastName: 'Hussein',
  phoneNumber: '+12025550123',
  birthdate: '1992-04-11',
  streetAddress: '12 Main St',
  city: 'Dearborn',
  addressState: 'MI',
  postalCode: '48124',
  country: 'US',
};

test('users.create forwards referralCode', async () => {
  const calls = capture();
  await client().users.create({ ...onboardBase, referralCode: 'bquf0e' });
  assert.equal(calls[0].body.referralCode, 'bquf0e');
});

test('users.create rejects a blank referralCode locally', async () => {
  const calls = capture();
  await assert.rejects(
    client().users.create({ ...onboardBase, referralCode: '   ' }),
    (err) => err instanceof LoftyError && err.code === 'invalid_referral_code',
  );
  assert.equal(calls.length, 0);
});
