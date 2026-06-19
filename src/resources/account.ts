import type { LoftyClient } from '../client';
import type {
  AccountBalance,
  GetPositionsResponse,
  ListLpRewardsParams,
  ListLpRewardsResponse,
  GetTradesParams,
  GetTradesResponse,
  GetLpPositionsResponse,
} from '../types';

export class AccountResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * Get your account balances: USDC, ALGO, rental income, and gift certificates.
   */
  async getBalance(): Promise<AccountBalance> {
    return this.client._request<AccountBalance>('GET', '/public/v1/account/balance');
  }

  /**
   * Get your current token holdings grouped by property, including cost basis and P&L data.
   *
   * @example
   * const { positions, totals } = await lofty.account.getPositions();
   * for (const p of positions) {
   *   const unrealized = (p.currentValue ?? 0) - (p.costBasis ?? 0);
   *   console.log(`${p.propertyId}: ${p.currentTokens} tokens, unrealized P&L: $${unrealized.toFixed(2)}`);
   * }
   */
  async getPositions(): Promise<GetPositionsResponse> {
    return this.client._request<GetPositionsResponse>('GET', '/public/v1/account/positions');
  }

  /**
   * Get your executed trade history (completed buys and sells).
   *
   * @example
   * // All trades
   * const { trades } = await lofty.account.getTrades({});
   *
   * // Trades for a specific property
   * const { trades } = await lofty.account.getTrades({ propertyId: 'prop_123' });
   *
   * // Only sells
   * const { trades } = await lofty.account.getTrades({ direction: 'sell' });
   */
  async getTrades(params: GetTradesParams = {}): Promise<GetTradesResponse> {
    return this.client._request<GetTradesResponse>('GET', '/public/v1/account/trades', {
      params: {
        propertyId: params.propertyId,
        direction: params.direction,
        limit: params.limit,
      },
    });
  }

  /**
   * Get your AMM LP positions — LP tokens held, ownership %, and unclaimed rewards per pool.
   *
   * @example
   * const { positions, totals } = await lofty.account.getLpPositions();
   * console.log(`Total TVL: $${totals?.tvl.toFixed(2)}`);
   * for (const p of positions) {
   *   console.log(`Pool ${p.poolId}: ${p.baseOwnershipPct.toFixed(2)}% ownership, $${p.baseUnclaimedRewards.toFixed(4)} unclaimed`);
   * }
   */
  async getLpPositions(): Promise<GetLpPositionsResponse> {
    return this.client._request<GetLpPositionsResponse>('GET', '/public/v1/account/lp-positions');
  }

  /**
   * List your LP reward payouts. Rewards are distributed hourly for qualified liquidity.
   *
   * @example
   * const { rewards } = await lofty.account.getLpRewards({
   *   since: Date.now() - 7 * 24 * 60 * 60 * 1000,
   * });
   * const total = rewards.reduce((sum, r) => sum + r.amount, 0);
   */
  async getLpRewards(params: ListLpRewardsParams = {}): Promise<ListLpRewardsResponse> {
    return this.client._request<ListLpRewardsResponse>('GET', '/public/v1/account/lp-rewards', {
      params: {
        since: params.since,
        limit: params.limit,
        cursor: params.cursor,
      },
    });
  }
}
