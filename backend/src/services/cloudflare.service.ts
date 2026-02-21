import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  name_servers: string[];
}

interface CloudflareDnsRecord {
  id: string;
  zone_id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

/**
 * Create a Cloudflare API client for a specific API token.
 * Each org can have its own token, so we create clients on-demand.
 */
export function createCloudflareClient(apiToken: string) {
  const client: AxiosInstance = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    timeout: 30000,
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    /**
     * Fetch all DNS zones from Cloudflare (paginated)
     */
    async getAllZones(): Promise<CloudflareZone[]> {
      const zones: CloudflareZone[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const response = await client.get('/zones', {
          params: { page, per_page: 50 },
        });

        const data = response.data;
        if (!data.success) {
          throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
        }

        zones.push(...data.result);
        totalPages = data.result_info.total_pages;
        page++;
      }

      logger.info(`Fetched ${zones.length} Cloudflare zones`);
      return zones;
    },

    /**
     * Fetch DNS records for a specific zone, filtered to A, AAAA, CNAME
     */
    async getFilteredDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
      const records: CloudflareDnsRecord[] = [];
      const types = ['A', 'AAAA', 'CNAME'];

      for (const type of types) {
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await client.get(`/zones/${zoneId}/dns_records`, {
            params: { type, page, per_page: 100 },
          });

          const data = response.data;
          if (!data.success) {
            logger.warn(`Failed to fetch ${type} records for zone ${zoneId}: ${JSON.stringify(data.errors)}`);
            break;
          }

          records.push(...data.result);
          totalPages = data.result_info.total_pages;
          page++;
        }
      }

      return records;
    },

    /**
     * Verify the API token is valid
     */
    async verifyToken(): Promise<boolean> {
      try {
        const response = await client.get('/user/tokens/verify');
        return response.data?.success === true;
      } catch {
        return false;
      }
    },
  };
}
