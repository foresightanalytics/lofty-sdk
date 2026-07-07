import type { LoftyClient } from '../client';
import { LoftyError } from '../errors';
import type {
  ListLpRewardsProgramsResponse,
  GetLpRewardsProgramResponse,
  GetLpPositionsResponse,
  ListLpRewardsParams,
  ListLpRewardsResponse,
} from '../types';

/**
 * Liquidity-provider rewards: discover which properties pay for order-book
 * liquidity, read the program terms, and track your own positions and payouts.
 *
 * ## How farming works
 * Some properties run a limit-order liquidity-rewards program. Each pays a fixed
 * USDC pool per day, split across hourly "blocks" and distributed pro-rata to
 * liquidity that qualifies. To earn on a property, keep resting limit orders on
 * its book that meet ALL of the program's rules:
 *
 * - **Two-sided:** quote BOTH a bid and an ask — at least `minTwoSidedLiquidity`
 *   eligible shares on each side, or the block pays nothing for you.
 * - **Tight:** each order must sit within `allowedSpread` (USD) of the book
 *   midpoint. Wide quotes are ignored.
 * - **Size:** each order needs at least `minContracts` remaining shares.
 * - **Rested:** orders younger than `minOrderAgeMs` are skipped, and the sampler
 *   snapshots the book at unpredictable moments — so leave your quotes up rather
 *   than trying to time it.
 *
 * The tighter your two-sided quotes and the larger your eligible share vs. the
 * rest of the book, the bigger your slice of each hourly block.
 *
 * @example
 * // Find the best-paying program and check its rules
 * const { programs } = await lofty.lpRewards.listPrograms();
 * const best = programs.sort((a, b) => b.dailyRewards - a.dailyRewards)[0];
 * console.log(`${best.propertyId}: $${best.dailyRewards}/day, quote within $${best.allowedSpread} of mid on both sides`);
 */
export class LpRewardsResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * List every property currently running an LP-rewards program, with its full
   * terms (daily/hourly pool, allowed spread, min contracts, two-sided minimum).
   * Use this to decide where to provide liquidity.
   */
  async listPrograms(): Promise<ListLpRewardsProgramsResponse> {
    return this.client._request<ListLpRewardsProgramsResponse>('GET', '/public/v1/account/lp-programs');
  }

  /**
   * Get the LP-rewards program terms for a single property. Filters the full
   * program list client-side. Throws `LoftyError` (404, `program_not_found`) if
   * the property has no active program.
   */
  async getProgram(propertyId: string): Promise<GetLpRewardsProgramResponse> {
    const { programs } = await this.listPrograms();
    const program = programs.find((p) => p.propertyId === propertyId);
    if (!program) {
      throw new LoftyError(404, {
        code: 'program_not_found',
        message: `No active LP rewards program for property ${propertyId}.`,
      });
    }
    return { program };
  }

  /**
   * Your AMM LP positions — LP tokens held, ownership %, and unclaimed rewards
   * per pool. (Same data as `account.getLpPositions()`, surfaced here for a
   * one-stop farming view.)
   */
  async getPositions(): Promise<GetLpPositionsResponse> {
    return this.client._request<GetLpPositionsResponse>('GET', '/public/v1/account/lp-positions');
  }

  /**
   * Your LP reward payout history, newest first. Rewards are distributed hourly.
   *
   * @example
   * // Everything you've earned in the last 7 days
   * const { rewards } = await lofty.lpRewards.getHistory({
   *   since: Date.now() - 7 * 24 * 60 * 60 * 1000,
   * });
   * const total = rewards.reduce((sum, r) => sum + r.amount, 0);
   */
  async getHistory(params: ListLpRewardsParams = {}): Promise<ListLpRewardsResponse> {
    return this.client._request<ListLpRewardsResponse>('GET', '/public/v1/account/lp-rewards', {
      params: {
        since: params.since,
        limit: params.limit,
        cursor: params.cursor,
      },
    });
  }
}
