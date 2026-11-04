import type { LoftyClient } from '../client';
import { requirePathParam } from '../errors';
import type {
  ListAmmPoolsResponse,
  GetAmmPoolResponse,
  GetQuoteParams,
  AmmQuote,
  ExecuteSwapParams,
  ExecuteSwapResponse,
  GetSwapStatusResponse,
} from '../types';

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export class AmmResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * List all active AMM pools.
   * Pass `propertyId` to find the pool for a specific property.
   *
   * @example
   * // All pools
   * const { pools } = await lofty.amm.listPools();
   *
   * // Pool for a specific property
   * const { pools } = await lofty.amm.listPools({ propertyId: 'prop_123' });
   * const pool = pools[0]; // null if no AMM pool for this property
   */
  async listPools(params: { propertyId?: string } = {}): Promise<ListAmmPoolsResponse> {
    return this.client._request<ListAmmPoolsResponse>('GET', '/public/v1/amm/pools', {
      params: { propertyId: params.propertyId },
    });
  }

  /**
   * Get details for a single AMM pool by numeric pool ID.
   */
  async getPool(poolId: number): Promise<GetAmmPoolResponse> {
    requirePathParam(poolId, 'poolId');
    return this.client._request<GetAmmPoolResponse>('GET', `/public/v1/amm/pools/${poolId}`);
  }

  /**
   * Get an executable price quote from the on-chain AMM contract, or from the
   * live order book while pool trading is paused. Pass either `tokenAmount` or
   * `usdcAmount` — not both. Narrow the response on `source` or `tradingPaused`.
   *
   * @example
   * // Cost to buy 10 tokens
   * const q = await lofty.amm.getQuote({ poolId: 123, side: 'buy', tokenAmount: 10 });
   *
   * // How many tokens $500 USDC buys
   * const q = await lofty.amm.getQuote({ poolId: 123, side: 'buy', usdcAmount: 500 });
   *
   * // USDC received for selling 5 tokens
   * const q = await lofty.amm.getQuote({ poolId: 123, side: 'sell', tokenAmount: 5 });
   */
  async getQuote(params: GetQuoteParams): Promise<AmmQuote> {
    return this.client._request<AmmQuote>('GET', '/public/v1/amm/quote', {
      params: {
        poolId: params.poolId,
        side: params.side,
        tokenAmount: params.tokenAmount,
        usdcAmount: params.usdcAmount,
      },
    });
  }

  /**
   * Execute a swap on the AMM pool, or place a limit order on the book while
   * pool trading is paused. Trading must be enabled on your API key.
   *
   * Narrow the response on `routedTo` or `tradingPaused`: pool execution returns
   * a `batchId`; book routing returns an `orderId` and order details instead.
   * A book-routed order may partially fill and is not an atomic pool swap.
   *
   * For buys, `maxUsdcAmount` is required — it sets your slippage tolerance.
   * Get the expected cost first with `getQuote()`, then add a small buffer.
   * The cap covers the pool payment (`quote.usdcAmount`); swap fees are charged
   * on top, so ensure your wallet balance covers `quote.totalDebit`.
   *
   * @example
   * // Buy 10 tokens, willing to pay up to $540
   * const quote = await lofty.amm.getQuote({ poolId: 123, side: 'buy', tokenAmount: 10 });
   * const result = await lofty.amm.executeSwap({
   *   poolId: 123,
   *   side: 'buy',
   *   tokenAmount: 10,
   *   maxUsdcAmount: quote.usdcAmount * 1.02, // 2% slippage tolerance
   * });
   *
   * @example
   * // Sell 5 tokens, requiring at least $255 back (minUsdcAmount is REQUIRED for sells)
   * const quote = await lofty.amm.getQuote({ poolId: 123, side: 'sell', tokenAmount: 5 });
   * const result = await lofty.amm.executeSwap({
   *   poolId: 123,
   *   side: 'sell',
   *   tokenAmount: 5,
   *   minUsdcAmount: quote.usdcAmount * 0.98, // 2% slippage tolerance
   * });
   */
  async executeSwap(params: ExecuteSwapParams, idempotencyKey?: string): Promise<ExecuteSwapResponse> {
    if (params.side === 'buy' && !(params.maxUsdcAmount! > 0)) {
      throw new Error('maxUsdcAmount is required for buys (slippage cap). Get it from getQuote() and add a buffer.');
    }
    if (params.side === 'sell' && !(params.minUsdcAmount! > 0)) {
      throw new Error('minUsdcAmount is required for sells (slippage floor). Get it from getQuote() and subtract a buffer.');
    }
    return this.client._request<ExecuteSwapResponse>('POST', '/public/v1/amm/swap', {
      body: {
        poolId: params.poolId,
        side: params.side,
        tokenAmount: params.tokenAmount,
        maxUsdcAmount: params.maxUsdcAmount,
        minUsdcAmount: params.minUsdcAmount,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /**
   * Track a pool-executed swap by the `batchId` that `executeSwap()` returns
   * when it runs on the AMM pool. (When pool trading is paused, `executeSwap()`
   * routes to the order book and returns an `orderId` instead — track that with
   * `orders.get(orderId)`.)
   *
   * @param batchId - The `batchId` from an `executeSwap()` response
   *
   * @example
   * const { swap } = await lofty.amm.getSwapStatus(batchId);
   * // swap.state: 'pending' | 'settled' | 'failed'
   * if (swap.state === 'settled') console.log('block', swap.confirmedBlock);
   */
  async getSwapStatus(batchId: string): Promise<GetSwapStatusResponse> {
    requirePathParam(batchId, 'batchId');
    return this.client._request<GetSwapStatusResponse>(
      'GET',
      `/public/v1/swaps/${encodeURIComponent(batchId)}`,
    );
  }
}
