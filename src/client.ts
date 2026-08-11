import { LoftyError, LoftyAuthError, LoftyTradingDisabledError, LoftyRateLimitError, type LoftyErrorBody } from './errors';
import { PropertiesResource } from './resources/properties';
import { OrdersResource } from './resources/orders';
import { AccountResource } from './resources/account';
import { AmmResource } from './resources/amm';
import { LpRewardsResource } from './resources/lpRewards';
import { PropertyManagersResource } from './resources/propertyManagers';

export interface LoftyClientOptions {
  apiKey: string;
  /**
   * Override the base URL. Defaults to the Lofty production API.
   * Set to your staging URL during development.
   */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 30000. */
  timeout?: number;
}

const DEFAULT_BASE_URL = 'https://api.lofty.ai';
const KEY_PATTERN = /^lofty_(live|test)_[A-Za-z0-9]{32,}$/;

export class LoftyClient {
  /** Access property listings, order books, and recent trades. */
  readonly properties: PropertiesResource;
  /** Create, cancel, and list orders. Requires trading to be enabled on your API key. */
  readonly orders: OrdersResource;
  /** Account balance, token positions, and LP reward history. */
  readonly account: AccountResource;
  /** AMM pool info, price quotes, and swap execution. */
  readonly amm: AmmResource;
  /** Discover LP-rewards programs, read farming terms, and track your payouts. */
  readonly lpRewards: LpRewardsResource;
  /** Discover property managers, read public profiles, and list their public properties. */
  readonly propertyManagers: PropertyManagersResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(opts: LoftyClientOptions) {
    if (!opts.apiKey) throw new Error('apiKey is required.');
    if (!KEY_PATTERN.test(opts.apiKey)) {
      throw new Error('apiKey must start with lofty_live_ or lofty_test_ followed by at least 32 alphanumeric characters.');
    }
    // API keys grant full account access — never let this run in a browser where
    // the key would be exposed to end users. Server-side only.
    if (typeof window !== 'undefined' && typeof (globalThis as any).document !== 'undefined') {
      throw new Error('LoftyClient cannot run in a browser — your API key would be exposed. Use it server-side and proxy if needed.');
    }

    const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    // The key is sent as a Bearer token to baseUrl on every request; refuse plaintext.
    if (!/^https:\/\//i.test(baseUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl)) {
      throw new Error('baseUrl must use https (http is allowed only for localhost).');
    }

    this.apiKey = opts.apiKey;
    this.baseUrl = baseUrl;
    this.timeout = opts.timeout ?? 30_000;

    this.properties = new PropertiesResource(this);
    this.orders = new OrdersResource(this);
    this.account = new AccountResource(this);
    this.amm = new AmmResource(this);
    this.lpRewards = new LpRewardsResource(this);
    // Constructed after `properties` because it delegates to it.
    this.propertyManagers = new PropertyManagersResource(this, this.properties);
  }

  /** @internal Used by resource classes. Not part of the public API. */
  async _request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    opts: {
      params?: Record<string, string | number | undefined>;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    let url: URL;
    try {
      url = new URL(this.baseUrl + path);
    } catch {
      throw new Error(`Invalid baseUrl/path combination: ${this.baseUrl}${path}`);
    }

    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = {};
    }

    if (!response.ok) {
      const errorBody: LoftyErrorBody = (json as any)?.error ?? {
        code: 'internal_error',
        message: `HTTP ${response.status}`,
      };

      if (response.status === 401) throw new LoftyAuthError(errorBody);
      if (response.status === 403 && errorBody.code === 'trading_disabled') {
        throw new LoftyTradingDisabledError(errorBody);
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? 60);
        const resetAt = Number(response.headers.get('X-RateLimit-Reset') ?? 0);
        throw new LoftyRateLimitError(errorBody, retryAfter, resetAt);
      }
      throw new LoftyError(response.status, errorBody);
    }

    return json as T;
  }
}
