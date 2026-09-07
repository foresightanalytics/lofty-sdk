import type { LoftyClient } from '../client';
import { LoftyError } from '../errors';
import type {
  AccountBalance,
  AddBankAccountParams,
  AddBankAccountResponse,
  GetPositionsResponse,
  ListLpRewardsParams,
  ListLpRewardsResponse,
  ListWithdrawalsParams,
  ListWithdrawalsResponse,
  GetTradesParams,
  GetTradesResponse,
  GetLpPositionsResponse,
  WithdrawParams,
  WithdrawResponse,
} from '../types';

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const ALGO_ADDRESS_RE = /^[A-Z2-7]{58}$/;

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

  /**
   * List recent withdrawals plus payout destinations (masked bank accounts,
   * saved USDC wallet, Lofty wallet) and method minimums.
   *
   * USDC withdrawals are Algorand-only. Inbound USDC on other chains uses
   * `users.getDepositAddresses` (partner onboarding).
   */
  async listWithdrawals(params: ListWithdrawalsParams = {}): Promise<ListWithdrawalsResponse> {
    return this.client._request<ListWithdrawalsResponse>('GET', '/public/v1/account/withdrawals', {
      params: {
        limit: params.limit,
        status: params.status,
      },
    });
  }

  /**
   * Withdraw rental income or Lofty wallet cash to a linked US bank (ACH) or
   * to an Algorand USDC address. Requires trading enabled. Test keys are rejected.
   *
   * Cross-chain USDC outbound (Circle / other networks) is not available.
   */
  async withdraw(params: WithdrawParams, idempotencyKey?: string): Promise<WithdrawResponse> {
    if (params.source !== 'rent' && params.source !== 'wallet') {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: 'source must be "rent" or "wallet".',
        field: 'source',
      });
    }
    if (params.destination !== 'bank' && params.destination !== 'usdc') {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: 'destination must be "bank" or "usdc".',
        field: 'destination',
      });
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new LoftyError(400, {
        code: 'invalid_field',
        message: 'amount must be a number greater than 0.',
        field: 'amount',
      });
    }
    const destinationAddress = params.destinationAddress !== undefined
      ? String(params.destinationAddress).trim()
      : undefined;
    if (destinationAddress !== undefined && !ALGO_ADDRESS_RE.test(destinationAddress)) {
      throw new LoftyError(400, {
        code: 'invalid_destination',
        message: 'destinationAddress must be a valid Algorand address.',
        field: 'destinationAddress',
      });
    }

    return this.client._request<WithdrawResponse>('POST', '/public/v1/account/withdrawals', {
      body: {
        source: params.source,
        destination: params.destination,
        amount: params.amount,
        bankAccountId: params.bankAccountId,
        destinationAddress,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /**
   * Link a US bank account for ACH withdrawals. Does not require trading
   * enabled. Test keys are allowed (no funds move).
   * The returned `last4` is the only account-number fragment the API stores
   * in list responses.
   */
  async addBankAccount(params: AddBankAccountParams, idempotencyKey?: string): Promise<AddBankAccountResponse> {
    const achRoutingNumber = String(params.achRoutingNumber ?? '').replace(/\D/g, '');
    const accountNumber = String(params.accountNumber ?? '').replace(/\D/g, '');
    const accountType = String(params.accountType ?? '').toLowerCase();
    if (achRoutingNumber.length !== 9) {
      throw new LoftyError(400, {
        code: 'invalid_routing_number',
        message: 'Routing number must be 9 digits.',
        field: 'achRoutingNumber',
      });
    }
    if (accountNumber.length < 4) {
      throw new LoftyError(400, {
        code: 'invalid_account_number',
        message: 'Account number is invalid.',
        field: 'accountNumber',
      });
    }
    if (accountType !== 'checking' && accountType !== 'savings') {
      throw new LoftyError(400, {
        code: 'invalid_account_type',
        message: 'Account type must be checking or savings.',
        field: 'accountType',
      });
    }

    return this.client._request<AddBankAccountResponse>('POST', '/public/v1/account/withdrawals', {
      body: {
        action: 'add_bank',
        achRoutingNumber,
        accountNumber,
        accountType,
        nickname: params.nickname,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }
}
