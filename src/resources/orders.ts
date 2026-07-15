import type { LoftyClient } from '../client';
import { requirePathParam } from '../errors';
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
   * @example
   * const { orderId } = await lofty.orders.create({
   *   propertyId: 'prop_123',
   *   direction: 'buy',
   *   price: 52.00,
   *   quantity: 10,
   * });
   */
  async create(params: CreateOrderParams, idempotencyKey?: string): Promise<CreateOrderResponse> {
    return this.client._request<CreateOrderResponse>('POST', '/public/v1/orders', {
      body: {
        propertyId: params.propertyId,
        direction: params.direction,
        price: params.price,
        quantity: params.quantity,
        expireAt: params.expireAt,
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
