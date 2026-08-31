import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoftyClient } from '../client';
import { LoftyError } from '../errors';
import { MIN_ORDER_QUANTITY, ORDER_STEP } from '../types';

const client = () => new LoftyClient({ apiKey: `lofty_test_${'a'.repeat(32)}` });

const stubFetch = () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify({ orderId: 'ord_1' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sentQuantity = (fetchMock: ReturnType<typeof stubFetch>): unknown => {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)).quantity;
};

const order = (quantity: unknown) => ({
  propertyId: 'prop_123',
  direction: 'buy' as const,
  price: 19.5,
  quantity: quantity as number,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('orders.create quantity validation', () => {
  it('sends a quantity on the API grid instead of rejecting it locally', async () => {
    const fetchMock = stubFetch();
    await client().orders.create(order(0.1025));
    expect(sentQuantity(fetchMock)).toBe(0.1025);
  });

  it('sends the order minimum', async () => {
    const fetchMock = stubFetch();
    await client().orders.create(order(MIN_ORDER_QUANTITY));
    expect(sentQuantity(fetchMock)).toBe(0.01);
  });

  it('sends a large on-grid quantity whose grid ratio carries float error', async () => {
    // 839.06 / 0.0001 is 8390599.999999998, so a tolerance on the ratio would reject it.
    expect(839.06 / ORDER_STEP).not.toBe(Math.round(839.06 / ORDER_STEP));
    const fetchMock = stubFetch();
    await client().orders.create(order(839.06));
    expect(sentQuantity(fetchMock)).toBe(839.06);
  });

  it('rejects a quantity finer than the grid without a round trip', async () => {
    const fetchMock = stubFetch();
    await expect(client().orders.create(order(0.10251))).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_field',
      field: 'quantity',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a quantity below the order minimum', async () => {
    const fetchMock = stubFetch();
    await expect(client().orders.create(order(0.005))).rejects.toBeInstanceOf(LoftyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or non-numeric quantity', async () => {
    const fetchMock = stubFetch();
    await expect(client().orders.create(order(0))).rejects.toBeInstanceOf(LoftyError);
    await expect(client().orders.create(order('abc'))).rejects.toBeInstanceOf(LoftyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still accepts a numeric string from an untyped caller', async () => {
    const fetchMock = stubFetch();
    await client().orders.create(order('5'));
    expect(sentQuantity(fetchMock)).toBe('5');
  });
});
