import type { LoftyClient } from '../client';
import { requirePathParam } from '../errors';
import type { PropertiesResource } from './properties';
import type {
  GetPropertyManagerResponse,
  ListPropertiesResponse,
  ListPropertyManagerPropertiesParams,
} from '../types';

/**
 * Discover property managers, read their public profiles, and list the
 * properties currently attributed to them on the public Lofty marketplace.
 *
 * Attribution is backed by a manually maintained static registry (see the
 * "Property manager IDs" section of the README): it intentionally follows
 * the deployed registry rather than live operational assignments. Returned
 * properties are the manager's registry assignments intersected with
 * inventory currently eligible for the public marketplace.
 *
 * All manager IDs and slugs are exact and case-sensitive. Unknown values are
 * rejected by the API with HTTP 400.
 */
export class PropertyManagersResource {
  constructor(
    private readonly client: LoftyClient,
    private readonly properties: PropertiesResource,
  ) {}

  /**
   * Get a manager's public profile plus the complete set of their
   * registry-assigned properties currently eligible for the public
   * marketplace (never paginated or truncated).
   *
   * @param managerId - Exact, case-sensitive registry manager ID (e.g. 'partner-eco-systems')
   *
   * @example
   * const { manager, stats, properties } = await lofty.propertyManagers.get('partner-eco-systems');
   * console.log(`${manager.name} manages ${stats.propertiesManaged} public properties`);
   */
  async get(managerId: string): Promise<GetPropertyManagerResponse> {
    requirePathParam(managerId, 'managerId');
    // `view=manager` is a private transport detail of the properties route;
    // consumers never see it. Nonblank input is transmitted unchanged — the
    // backend owns exact/case-sensitive validation.
    return this.client._request<GetPropertyManagerResponse>('GET', '/public/v1/properties', {
      params: { view: 'manager', managerId },
    });
  }

  /**
   * Same as `get()`, but looks the manager up by their profile slug.
   *
   * @param slug - Exact, case-sensitive registry slug (e.g. 'eco-systems-llc')
   */
  async getBySlug(slug: string): Promise<GetPropertyManagerResponse> {
    requirePathParam(slug, 'managerSlug');
    return this.client._request<GetPropertyManagerResponse>('GET', '/public/v1/properties', {
      params: { view: 'manager', managerSlug: slug },
    });
  }

  /**
   * List one manager's currently public properties with ordinary paginated
   * list semantics (unlike `get()`, which returns the complete bounded set
   * plus the profile in one call).
   *
   * @param managerId - Exact, case-sensitive registry manager ID
   * @param params - Normal property-list filters and pagination (without `managerId`)
   *
   * @example
   * const { result } = await lofty.propertyManagers.listProperties('partner-eco-systems', {
   *   pageSize: 50,
   *   location: 'Albany, NY',
   * });
   */
  async listProperties(
    managerId: string,
    params: ListPropertyManagerPropertiesParams = {},
  ): Promise<ListPropertiesResponse> {
    requirePathParam(managerId, 'managerId');
    // managerId is applied last so it can never be overridden by params.
    return this.properties.list({ ...params, managerId });
  }
}
