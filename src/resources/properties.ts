import type { LoftyClient } from '../client';
import { requirePathParam } from '../errors';
import type {
  ListPropertiesParams,
  ListPropertiesResponse,
  GetPropertyResponse,
  GetOrderBookResponse,
  GetTradesResponse,
} from '../types';

export class PropertiesResource {
  constructor(private readonly client: LoftyClient) {}

  /**
   * List all properties available on the Lofty marketplace.
   *
   * @example
   * const { result } = await lofty.properties.list({ pageSize: 20 });
   */
  async list(params: ListPropertiesParams = {}): Promise<ListPropertiesResponse> {
    return this.client._request<ListPropertiesResponse>('GET', '/public/v1/properties', {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        location: params.location,
        propertyType: params.propertyType,
        minPry: params.minPry,
        minPan: params.minPan,
      },
    });
  }

  /**
   * Get details for a single property.
   *
   * @param propertyId - The Lofty property ID
   */
  async get(propertyId: string): Promise<GetPropertyResponse> {
    requirePathParam(propertyId, 'propertyId');
    return this.client._request<GetPropertyResponse>('GET', `/public/v1/properties/${encodeURIComponent(propertyId)}`);
  }

  /**
   * Get the current order book for a property.
   * Returns bids (buy orders) and asks (sell orders) aggregated by price level.
   *
   * @param propertyId - The Lofty property ID
   *
   * @example
   * const { orderbook } = await lofty.properties.getOrderBook('prop_123');
   * console.log('Best bid:', orderbook.bids[0]?.price);
   * console.log('Best ask:', orderbook.asks[0]?.price);
   */
  async getOrderBook(propertyId: string): Promise<GetOrderBookResponse> {
    requirePathParam(propertyId, 'propertyId');
    return this.client._request<GetOrderBookResponse>('GET', `/public/v1/properties/${encodeURIComponent(propertyId)}/orderbook`);
  }

  /**
   * Get recent trades and market info for a property.
   *
   * @param propertyId - The Lofty property ID
   */
  async getTrades(propertyId: string): Promise<GetTradesResponse> {
    requirePathParam(propertyId, 'propertyId');
    return this.client._request<GetTradesResponse>('GET', `/public/v1/properties/${encodeURIComponent(propertyId)}/trades`);
  }
}
