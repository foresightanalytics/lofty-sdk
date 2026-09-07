import type { LoftyClient } from '../client';
import { LoftyError } from '../errors';
import type {
  CreateUserApiKeyParams,
  CreateUserApiKeyResponse,
  GetDepositAddressesResponse,
  ListUserApiKeysResponse,
  RevokeUserApiKeyResponse,
  ListOnboardedUsersParams,
  ListOnboardedUsersResponse,
  OnboardUserParams,
  OnboardUserResponse,
} from '../types';

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED: Array<keyof OnboardUserParams> = [
  'email', 'firstName', 'lastName', 'phoneNumber', 'birthdate',
  'streetAddress', 'city', 'addressState', 'postalCode', 'country',
];

/**
 * Partner user onboarding — restricted.
 *
 * Only partner accounts Lofty has explicitly enabled may call this; all other
 * accounts receive 403 `partner_not_whitelisted`. Access is arranged directly
 * with Lofty. Intentionally absent from the README.
 */
export class UsersResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * Create a fully-provisioned Lofty account for a customer your organization
   * has already KYC'd. The account is created verified — login (email + phone
   * pre-verified), wallet, and on-chain verification — and is immediately able
   * to deposit and trade. The customer must set their own password on first
   * login; the initial credential stops working at that moment.
   *
   * Duplicate protection you cannot bypass: an email that already has a Lofty
   * account → 409 `user_already_exists`; an identity (name + address) that
   * already has one → 409 `identity_already_exists`. Pass `referralCode` to
   * credit a Growsurf partner on qualifying signups.
   */
  async create(params: OnboardUserParams, idempotencyKey?: string): Promise<OnboardUserResponse> {
    for (const field of REQUIRED) {
      if (!String(params[field] ?? '').trim()) {
        throw new LoftyError(400, {
          code: 'missing_field',
          message: `${field} is required.`,
          field,
        });
      }
    }
    if (!EMAIL_RE.test(params.email.trim())) {
      throw new LoftyError(400, { code: 'invalid_email', message: 'email must be a valid email address.', field: 'email' });
    }
    if (!E164_RE.test(params.phoneNumber.replace(/[\s()-]/g, ''))) {
      throw new LoftyError(400, { code: 'invalid_phone', message: 'phoneNumber must be E.164 (e.g. +12025550123).', field: 'phoneNumber' });
    }
    if (!DOB_RE.test(params.birthdate)) {
      throw new LoftyError(400, { code: 'invalid_birthdate', message: 'birthdate must be YYYY-MM-DD.', field: 'birthdate' });
    }
    if (params.password !== undefined && String(params.password).length < 10) {
      throw new LoftyError(400, { code: 'invalid_password', message: 'password must be at least 10 characters.', field: 'password' });
    }
    if (params.referralCode !== undefined) {
      const referralCode = String(params.referralCode).trim();
      if (!referralCode || referralCode.length > 500 || /\s/.test(referralCode)) {
        throw new LoftyError(400, {
          code: 'invalid_referral_code',
          message: 'referralCode must be a Growsurf id, slug, or URL containing grsf=.',
          field: 'referralCode',
        });
      }
    }

    return this.client._request<OnboardUserResponse>('POST', '/public/v1/users', {
      body: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        phoneNumber: params.phoneNumber,
        birthdate: params.birthdate,
        streetAddress: params.streetAddress,
        city: params.city,
        addressState: params.addressState,
        postalCode: params.postalCode,
        country: params.country,
        ssn: params.ssn,
        password: params.password,
        referralCode: params.referralCode,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /**
   * List the users YOUR account onboarded, newest first. Strictly scoped to
   * your own onboards — other accounts' users never appear.
   */
  async list(params: ListOnboardedUsersParams = {}): Promise<ListOnboardedUsersResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) { query.set('limit', String(params.limit)); }
    if (params.cursor) { query.set('cursor', params.cursor); }
    const qs = query.toString();
    return this.client._request<ListOnboardedUsersResponse>('GET', `/public/v1/users${qs ? `?${qs}` : ''}`);
  }

  /**
   * Cross-chain funding addresses for a user you onboarded. Send USDC on a
   * listed source chain (e.g. Solana — see `solanaUsdc`) to its address and
   * Unifold bridges it into the user's Lofty Algorand wallet as USDC.
   *
   * Addresses are stable per user, so cache-friendly. Only users onboarded by
   * YOUR account resolve; anything else is 404 `user_not_found`. Send exactly
   * the token/network a wallet entry names — wrong tokens or networks may be
   * unrecoverable.
   */
  async getDepositAddresses(userId: string): Promise<GetDepositAddressesResponse> {
    if (!String(userId ?? '').trim()) {
      throw new LoftyError(400, { code: 'missing_field', message: 'userId is required.', field: 'userId' });
    }
    return this.client._request<GetDepositAddressesResponse>(
      'GET',
      `/public/v1/users/deposit-addresses?userId=${encodeURIComponent(userId)}`,
    );
  }

  /**
   * Mint an API key that ACTS AS a user you onboarded, so you can trade and
   * manage funds on their behalf. Works immediately — even if the user has
   * never signed in and still holds their temporary password.
   *
   * The returned `key` is shown **exactly once**; store it securely, Lofty
   * cannot recover it. Trading is enabled by default — pass
   * `tradingEnabled: false` for a read-only key. Users are capped at 2 active
   * keys (409 `too_many_active_keys`); revoke one first.
   */
  async createApiKey(params: CreateUserApiKeyParams, idempotencyKey?: string): Promise<CreateUserApiKeyResponse> {
    if (!String(params?.userId ?? '').trim()) {
      throw new LoftyError(400, { code: 'missing_field', message: 'userId is required.', field: 'userId' });
    }
    return this.client._request<CreateUserApiKeyResponse>('POST', '/public/v1/users/api-keys', {
      body: {
        userId: params.userId,
        name: params.name,
        tradingEnabled: params.tradingEnabled,
      },
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
    });
  }

  /** List an onboarded user's active API keys. Secrets are never returned. */
  async listApiKeys(userId: string): Promise<ListUserApiKeysResponse> {
    if (!String(userId ?? '').trim()) {
      throw new LoftyError(400, { code: 'missing_field', message: 'userId is required.', field: 'userId' });
    }
    return this.client._request<ListUserApiKeysResponse>(
      'GET',
      `/public/v1/users/api-keys?userId=${encodeURIComponent(userId)}`,
    );
  }

  /** Revoke one of an onboarded user's API keys. Takes effect immediately. */
  async revokeApiKey(userId: string, keyId: string): Promise<RevokeUserApiKeyResponse> {
    if (!String(userId ?? '').trim()) {
      throw new LoftyError(400, { code: 'missing_field', message: 'userId is required.', field: 'userId' });
    }
    if (!String(keyId ?? '').trim()) {
      throw new LoftyError(400, { code: 'missing_field', message: 'keyId is required.', field: 'keyId' });
    }
    return this.client._request<RevokeUserApiKeyResponse>(
      'DELETE',
      `/public/v1/users/api-keys?userId=${encodeURIComponent(userId)}&keyId=${encodeURIComponent(keyId)}`,
    );
  }
}
