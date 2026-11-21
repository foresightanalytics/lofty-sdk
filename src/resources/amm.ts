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
   * List the AMM pools your account can trade.
   * Pass `propertyId` to find the current pool of one property.
   *
   * `settlementCurrency` is the asset your account settles in. A USDC account also sees pools
   * that quote USDL: the quote converts 1:1 at execution. Trade those pools with a market order
   * (`orders.create({ orderType: 'market' })`).
   *
   * @throws {LoftyError} `404 pool_not_found` when `propertyId` has no current pool for your
   * account (the call does not return an empty list or `null`); `409 amm_trading_paused` when
   * only a paused earlier-generation pool exists, or when no pool is available at all.
   *
   * @example
   * // All pools
   * const { pools } = await lofty.amm.listPools();
   *
   * // Pool for a specific property
   * const { pools } = await lofty.amm.listPools({ propertyId: 'prop_123' });
   * const pool = pools[0]; // Always present: a missing pool throws 404 pool_not_found.
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
   * `usdcAmount` must be positive and finite; sells target proceeds before fees.
   * Use `totalDebit` (buy) or `netProceeds` (sell) for the wallet amount.
   *
   * @throws {LoftyError} HTTP 400 `invalid_field` with `field: 'usdcAmount'` for a
   * non-positive or non-finite dollar amount; HTTP 409 `quote_unavailable` when an
   * AMM dollar quote has no usable reference price or no positive quote within the
   * requested amount. Try a smaller amount or request `tokenAmount`.
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
   * @deprecated Use `orders.create({ orderType: 'market' })` with `orders.getMarketQuote()`. The
   * market order uses the order book and the pool, checks the order grid and minimum, and gives
   * every rejection a final status. A USDC account on a pool that quotes USDL gets
   * `409 use_market_order` here. This method stays for accounts that already use it.
   *
   * Narrow the response on `routedTo` or `tradingPaused`: pool execution returns
   * a `batchId`; book routing returns an `orderId` and order details instead.
   * A book-routed order may partially fill and is not an atomic pool swap.
   *
   * For buys, `maxUsdcAmount` is required — it sets your slippage tolerance.
   * Get the expected cost first with `getQuote()`, then add a small buffer.
   * The cap covers the pool payment (`quote.usdcAmount`). On a pool from before
   * `pmmVersion: 'v2'`, swap fees are charged on top, so ensure your wallet balance
   * covers `quote.totalDebit`.
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
   * // Sell 5 tokens with a floor on what you receive (minUsdcAmount is REQUIRED for sells).
   * // On a v2 pool the floor applies to the proceeds after fees, so base it on netProceeds.
   * const quote = await lofty.amm.getQuote({ poolId: 123, side: 'sell', tokenAmount: 5 });
   * const result = await lofty.amm.executeSwap({
   *   poolId: 123,
   *   side: 'sell',
   *   tokenAmount: 5,
   *   minUsdcAmount: (quote.netProceeds ?? quote.usdcAmount) * 0.98, // 2% slippage tolerance
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
