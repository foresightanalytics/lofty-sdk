import type { LoftyClient } from '../client';
import { LoftyError, requirePathParam } from '../errors';
import type {
  CancelRecurringPlanResponse,
  CreateRecurringPlanParams,
  CreateRecurringPlanResponse,
  ListRecurringPlansResponse,
} from '../types';

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Recurring investment plans — fractional properties only.
 *
 * A plan buys `usdAmount` of the property at the marketable book price on a
 * schedule. Each run applies your rent balance, then gift balance (whole
 * dollars); the residual comes from your Lofty USDC wallet
 * (`balances_then_wallet`) or is charged to a saved card off-session when the
 * run's order fills (`balances_then_card` — charge-at-match; if the order never
 * fills, the card is never charged). Plans pause after 3 consecutive failed
 * runs, or immediately on permanent problems (card removed/expired, property no
 * longer tradable) — `pauseReason` says why. The first run happens one cadence
 * after creation.
 */
export class RecurringResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * Create a recurring investment plan.
   *
   * @example
   * const { plan } = await lofty.recurring.create({
   *   propertyId: 'prop_123',
   *   usdAmount: 50,
   *   cadence: 'monthly',
   *   fundingPreference: 'balances_then_card',
   *   savedPaymentMethodId: 'pm_...', // from account.getPaymentMethods()
   * });
   */
  async create(params: CreateRecurringPlanParams, idempotencyKey?: string): Promise<CreateRecurringPlanResponse> {
    const amount = Number(params.usdAmount);
    if (!Number.isFinite(amount) || amount < 5) {
      throw new LoftyError(400, {
        code: 'invalid_recurring_plan',
        message: 'usdAmount must be at least $5 per run.',
        field: 'usdAmount',
      });
    }
    if (params.fundingPreference === 'balances_then_card' && !params.savedPaymentMethodId) {
      throw new LoftyError(400, {
        code: 'invalid_recurring_plan',
        message: 'balances_then_card plans require savedPaymentMethodId (see account.getPaymentMethods()).',
        field: 'savedPaymentMethodId',
      });
    }
    return this.client._request<CreateRecurringPlanResponse>('POST', '/public/v1/recurring-plans', {
      body: {
        propertyId: params.propertyId,
        usdAmount: params.usdAmount,
        cadence: params.cadence,
        fundingPreference: params.fundingPreference,
        savedPaymentMethodId: params.savedPaymentMethodId,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /** List your non-cancelled recurring plans. */
  async list(): Promise<ListRecurringPlansResponse> {
    return this.client._request<ListRecurringPlansResponse>('GET', '/public/v1/recurring-plans');
  }

  /**
   * Cancel a recurring plan permanently. Does not cancel any order a past run
   * already placed — cancel those via `orders.cancel()` if needed.
   */
  async cancel(planId: string, idempotencyKey?: string): Promise<CancelRecurringPlanResponse> {
    requirePathParam(planId, 'planId');
    return this.client._request<CancelRecurringPlanResponse>(
      'DELETE',
      `/public/v1/recurring-plans/${encodeURIComponent(planId)}`,
      { idempotencyKey: idempotencyKey ?? generateIdempotencyKey() },
    );
  }
}
