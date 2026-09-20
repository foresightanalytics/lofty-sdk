import type { LoftyClient } from '../client';
import { requirePathParam } from '../errors';
import type {
  LiquidityQuoteParams,
  LiquidityQuote,
  PoolDepositParams,
  PoolWithdrawParams,
  LiquidityExecutionResponse,
  ListAmmPoolsResponse,
  GetAmmPoolResponse,
  GetQuoteParams,
  AmmQuote,
  ExecuteSwapParams,
  ExecuteSwapResponse,
  GetSwapStatusResponse,
} from '../types';

const requireLiquidityAmount = (value: number, name: string): void => {
  const micro = Math.round(value * 1_000_000);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(micro) || micro / 1_000_000 !== value) {
    throw new Error(`${name} must be positive, have at most six decimals, and fit safe integer microunits.`);
  }
};

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export class AmmResource {
  constructor(private readonly client: LoftyClient) {}

  /** Preview a V2 pool deposit or withdrawal. Amounts use whole asset/LP units.
   * Withdrawal amount is BEFORE penalty. No funds move through this method.
   * A passing pool preview does not guarantee wallet balance, KYC or ALGO funding.
   */
  async getLiquidityQuote(params: LiquidityQuoteParams): Promise<LiquidityQuote> {
    return this.client._request('GET', '/public/v1/amm/liquidity/quote', { params: { ...params } });
  }

  /** Deposit base tokens or USDC into a V2 pool from your Lofty wallet.
   * Set minLpOut from a fresh preview. Reuse your idempotency key after a timeout.
   */
  async deposit(params: PoolDepositParams, idempotencyKey?: string): Promise<LiquidityExecutionResponse> {
    requireLiquidityAmount(params.amount, 'amount');
    requireLiquidityAmount(params.minLpOut, 'minLpOut');
    return this.client._request('POST', '/public/v1/amm/deposit', {
      body: { poolId: params.poolId, side: params.side, amount: params.amount, minLpOut: params.minLpOut },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /** Withdraw gross asset amount from your V2 pool position to your Lofty wallet.
   * The pool deducts the previewed penalty from this amount. Both protections
   * are mandatory. This is separate from account.withdraw(), which sends wallet funds.
   */
  async withdraw(params: PoolWithdrawParams, idempotencyKey?: string): Promise<LiquidityExecutionResponse> {
    requireLiquidityAmount(params.amount, 'amount');
    requireLiquidityAmount(params.minAssetOut, 'minAssetOut');
    requireLiquidityAmount(params.maxLpBurn, 'maxLpBurn');
    return this.client._request('POST', '/public/v1/amm/withdraw', {
      body: { poolId: params.poolId, side: params.side, amount: params.amount,
        minAssetOut: params.minAssetOut, maxLpBurn: params.maxLpBurn },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /** Tracks deposits/withdrawals through the same authenticated batch status endpoint as swaps. */
  async getLiquidityStatus(batchId: string): Promise<GetSwapStatusResponse> {
    return this.getSwapStatus(batchId);
  }

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
   * Get a price quote from the on-chain AMM contract.
   * Pass either `tokenAmount` or `usdcAmount` — not both.
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
   * Execute an AMM swap. Buys or sells property tokens via the AMM pool.
   * Trading must be enabled on your API key.
   *
   * For buys, `maxUsdcAmount` is required — it sets your slippage tolerance.
   * Get the expected cost first with `getQuote()`, then add a small buffer.
   * V2 buy quotes already include base-denominated fees. Do not add includedFees
   * again. Use totalDebit for expected USDC spend. ALGO costs are additional.
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
   *   minUsdcAmount: Math.floor(quote.netProceeds! * 0.98 * 1e6) / 1e6, // 2% slippage tolerance
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
