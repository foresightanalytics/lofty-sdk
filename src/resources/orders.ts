import type { LoftyClient } from '../client';
import { LoftyError, requirePathParam } from '../errors';
import { MIN_ORDER_QUANTITY, ORDER_STEP, REFERENCE_WINDOW_CHOICES_DAYS } from '../types';
import type {
  CreateOrderParams,
  CreateOrderResponse,
  GetOrderResponse,
  CancelOrderParams,
  CancelOrderResponse,
  ListOrdersParams,
  ListOrdersResponse,
} from '../types';

const TRIGGER_ORDER_TYPES = ['stop_loss', 'stop_limit', 'trailing_stop'];

/** Property assets carry at most 6 decimals, so a quantity is an exact integer count of 1e-6 tokens. */
const TOKEN_UNITS_PER_TOKEN = 1_000_000;
const TOKEN_UNITS_PER_STEP = Math.round(ORDER_STEP * TOKEN_UNITS_PER_TOKEN);

/**
 * True when `quantity` sits on the book's grid. Compared as integer token units rather than as
 * `quantity / ORDER_STEP`, whose float error grows with the quantity: 8918 / 0.0001 is
 * 89179999.99999999, which a tolerance on the ratio would reject.
 */
const isOnOrderGrid = (quantity: number): boolean => {
  const units = Math.round(quantity * TOKEN_UNITS_PER_TOKEN);
  return Number.isSafeInteger(units) && units % TOKEN_UNITS_PER_STEP === 0;
};

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export class OrdersResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * Place an order on the Lofty exchange. Funded from your Lofty USDC wallet.
   * Trading must be enabled on your API key.
   *
   * `orderType` defaults to `'limit'`. On fractional properties you can also place
   * `stop_loss` / `stop_limit` / `trailing_stop` orders — they rest hidden until
   * the platform's trigger engine fires them (see {@link OrderType}):
   *
   * @example
   * // Stop loss: sell 10 tokens if the 30-day average price falls to $45
   * const { orderId } = await lofty.orders.create({
   *   propertyId: 'prop_123', direction: 'sell', quantity: 10,
   *   orderType: 'stop_loss', triggerPrice: 45,
   * });
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
    // properties (assetDecimals 0) are unaffected: an integer is always a multiple of ORDER_STEP, and
    // the server applies the whole-share rule for them.
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
    if (!isOnOrderGrid(quantity)) {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: `quantity must be a multiple of ${ORDER_STEP}.`,
        field: 'quantity',
        hint: 'Properties with assetDecimals 0 accept whole shares only; check the property\'s assetDecimals.',
      });
    }
    if (quantity < MIN_ORDER_QUANTITY) {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: `quantity must be at least ${MIN_ORDER_QUANTITY}.`,
        field: 'quantity',
      });
    }
    // Trigger orders: fail locally on shapes the API will reject, so integrators see
    // the problem at the call site instead of a round trip. All values are re-validated
    // server-side; these checks only mirror the contract.
    const orderType = params.orderType;
    const isTriggerOrder = orderType !== undefined && TRIGGER_ORDER_TYPES.includes(orderType);
    if (isTriggerOrder) {
      if (orderType !== 'trailing_stop' && !(Number(params.triggerPrice) > 0)) {
        throw new LoftyError(400, {
          code: 'invalid_trigger_price',
          message: `${orderType} orders require a positive triggerPrice.`,
          field: 'triggerPrice',
        });
      }
      if (orderType === 'stop_limit' && !(Number(params.triggerLimitPrice) > 0)) {
        throw new LoftyError(400, {
          code: 'invalid_trigger_price',
          message: 'stop_limit orders require a positive triggerLimitPrice.',
          field: 'triggerLimitPrice',
        });
      }
      if (orderType === 'trailing_stop') {
        const trail = Number(params.trailPercent);
        if (!Number.isFinite(trail) || trail < 1 || trail > 50) {
          throw new LoftyError(400, {
            code: 'invalid_trail_percent',
            message: 'trailing_stop orders require trailPercent between 1 and 50.',
            field: 'trailPercent',
          });
        }
      }
      if (params.referenceWindowDays !== undefined
        && !(REFERENCE_WINDOW_CHOICES_DAYS as readonly number[]).includes(Number(params.referenceWindowDays))) {
        throw new LoftyError(400, {
          code: 'invalid_trigger_params',
          message: `referenceWindowDays must be one of ${REFERENCE_WINDOW_CHOICES_DAYS.join(', ')}.`,
          field: 'referenceWindowDays',
        });
      }
      if ((Number(params.useGift) || 0) > 0 || (Number(params.useRent) || 0) > 0) {
        throw new LoftyError(400, {
          code: 'invalid_field',
          message: 'Trigger orders are funded from your Lofty USDC wallet only — gift/rent cannot be applied.',
          field: 'orderType',
        });
      }
    } else if (params.price === undefined || params.price === null) {
      throw new LoftyError(400, {
        code: 'missing_field',
        message: 'price is required for limit/market orders.',
        field: 'price',
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
        orderType: params.orderType,
        triggerPrice: params.triggerPrice,
        triggerLimitPrice: params.triggerLimitPrice,
        trailPercent: params.trailPercent,
        referenceWindowDays: params.referenceWindowDays,
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
        triggerState: params.triggerState,
        all: params.all ? 'true' : undefined,
      },
    });
  }
}
