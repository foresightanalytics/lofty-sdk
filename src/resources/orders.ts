import type { LoftyClient } from '../client';
import { LoftyError, requirePathParam } from '../errors';
import { ORDER_STEP } from '../types';
import type {
  CreateOrderParams,
  CreateOrderResponse,
  GetOrderResponse,
  CancelOrderParams,
  CancelOrderResponse,
  ListOrdersParams,
  ListOrdersResponse,
} from '../types';

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export class OrdersResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * Place a limit order on the Lofty exchange. Funded from your Lofty USDC wallet.
   * Trading must be enabled on your API key.
   *
   * Optionally apply gift and/or rental-income balance toward a buy with
   * `useGift` / `useRent` (whole US dollars); read the amounts you have from
   * `account.getBalance()`.
   *
   * @example
   * const { orderId } = await lofty.orders.create({
   *   propertyId: 'prop_123',
   *   direction: 'buy',
   *   price: 52.00,
   *   quantity: 10,
   *   useGift: 25, // apply $25 of gift balance; the rest funds from your USDC wallet
   * });
   */
  async create(params: CreateOrderParams, idempotencyKey?: string): Promise<CreateOrderResponse> {
    // Fail locally on a quantity the book cannot represent, rather than on a round trip. Whole-share
    // properties (assetDecimals 0) are unaffected: an integer is always a multiple of ORDER_STEP.
    //
    // Coerced with Number() rather than checked with typeof: an untyped JS caller passing "5" was
    // accepted before this guard existed (the API parses the body value), and must keep working.
    const quantity = Number(params.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: 'quantity must be a number greater than 0.',
        field: 'quantity',
      });
    }
    const steps = quantity / ORDER_STEP;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: `quantity must be a multiple of ${ORDER_STEP}.`,
        field: 'quantity',
        hint: 'Properties with assetDecimals 0 accept whole shares only; check the property\'s assetDecimals.',
      });
    }
    // Gift/rent credit is optional and applies only to a buy. Validated locally
    // (same fail-fast style as quantity, same Number() coercion for untyped JS
    // callers) ONLY when a value is supplied — omitting both leaves the request
    // byte-for-byte unchanged. The authoritative balance check runs server-side.
    for (const [field, value] of [['useGift', params.useGift], ['useRent', params.useRent]] as const) {
      if (value === undefined || value === null) { continue; }
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new LoftyError(400, {
          code: 'invalid_field',
          message: `${field} must be a non-negative number of dollars.`,
          field,
        });
      }
      if (amount > 0 && params.direction !== 'buy') {
        throw new LoftyError(400, {
          code: 'invalid_field',
          message: `${field} can only be applied to buy orders.`,
          field: 'direction',
        });
      }
    }
    return this.client._request<CreateOrderResponse>('POST', '/public/v1/orders', {
      body: {
        propertyId: params.propertyId,
        direction: params.direction,
        price: params.price,
        quantity: params.quantity,
        expireAt: params.expireAt,
        useGift: params.useGift,
        useRent: params.useRent,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /**
   * Get a single order by its ID.
   *
   * @param orderId - The order ID returned by `orders.create()`
   *
   * @example
   * const { order } = await lofty.orders.get('01J...');
   * console.log(order.status); // 'active' | 'executed' | 'cancelled' | ...
   */
  async get(orderId: string): Promise<GetOrderResponse> {
    requirePathParam(orderId, 'orderId');
    return this.client._request<GetOrderResponse>('GET', `/public/v1/orders/${encodeURIComponent(orderId)}`);
  }

  /**
   * Cancel an active order. The order must belong to your account.
   * You no longer need to provide `propertyId` — the API resolves it automatically.
   *
   * @example
   * await lofty.orders.cancel({ orderId: '01J...' });
   */
  async cancel(params: CancelOrderParams, idempotencyKey?: string): Promise<CancelOrderResponse> {
    requirePathParam(params?.orderId, 'orderId');
    return this.client._request<CancelOrderResponse>(
      'DELETE',
      `/public/v1/orders/${encodeURIComponent(params.orderId)}`,
      { idempotencyKey: idempotencyKey ?? generateIdempotencyKey() },
    );
  }

  /**
   * List your orders.
   *
   * Pass `propertyId` to filter to a single property, or `all: true` to fetch
   * all open orders across every property you hold.
   *
   * @example
   * // All open orders
   * const { orders } = await lofty.orders.list({ all: true });
   *
   * // Orders for a specific property
   * const { orders } = await lofty.orders.list({ propertyId: 'prop_123' });
   *
   * // Only active
   * const { orders } = await lofty.orders.list({ propertyId: 'prop_123', status: 'active' });
   */
  async list(params: ListOrdersParams): Promise<ListOrdersResponse> {
    if (!params.all && !params.propertyId) {
      throw new Error('Provide propertyId or set all: true');
    }
    return this.client._request<ListOrdersResponse>('GET', '/public/v1/orders', {
      params: {
        propertyId: params.propertyId,
        status: params.status,
        all: params.all ? 'true' : undefined,
      },
    });
  }
}
