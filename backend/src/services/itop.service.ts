import axios, { AxiosInstance } from 'axios';

interface ITopConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiVersion: string;
}

interface ITopQuery {
  operation: string;
  class: string;
  key: string;
  output_fields?: string;
}

interface ITopResponse {
  code: number;
  message?: string;
  objects?: Record<string, any>;
}

class ITopService {
  private config: ITopConfig;
  private client: AxiosInstance;

  constructor() {
    this.config = {
      baseUrl: process.env.ITOP_BASE_URL || '',
      username: process.env.ITOP_USERNAME || '',
      password: process.env.ITOP_PASSWORD || '',
      apiVersion: process.env.ITOP_API_VERSION || '1.3',
    };

    this.client = axios.create({
      timeout: 120000,
    });
  }

  /**
   * Make a request to iTop API
   */
  private async makeRequest(query: ITopQuery): Promise<ITopResponse> {
    try {
      const response = await this.client.get(this.config.baseUrl, {
        auth: {
          username: this.config.username,
          password: this.config.password,
        },
        params: {
          version: this.config.apiVersion,
          json_data: JSON.stringify(query),
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('iTop API Error:', error.response?.data || error.message);
      throw new Error(`iTop API request failed: ${error.message}`);
    }
  }

  /**
   * Transform iTop asset data to ISMS Manager format
   */
  private transformAsset(itopAsset: any, assetClass: string): any {
    const fields = itopAsset.fields;
    const assetValue = fields.score ? Number(fields.score) : 0;

    // Base transformation
    const transformed: any = {
      id: itopAsset.key,
      name: fields.name || '',
      description: fields.description || '',
      assetType: this.mapAssetClass(assetClass),
      classification: fields.business_criticity || 'MEDIUM',
      owner: fields.owner_friendlyname || fields.owner || '',
      location: fields.location_name || fields.location_id || '',
      confidentiality: fields.confidentiality || 0,
      integrity: fields.integrity || 0,
      availability: fields.availability || 0,
      assetValue: assetValue,
      status: fields.status || 'active',
      itopId: itopAsset.key,
      itopClass: assetClass,
      // Additional fields as JSON
      metadata: {
        asset_number: fields.asset_number,
        serial_number: fields.serialnumber,
        brand: fields.brand_name,
        model: fields.model_name,
        contingency: fields.contingency_friendlyname,
        custodian: fields.custodian_list?.map((c: any) => c.team_name).join(', '),
      },
    };

    // Class-specific fields
    switch (assetClass.toLowerCase()) {
      case 'pc':
      case 'server':
        transformed.metadata.os_family = fields.osfamily_name;
        transformed.metadata.os_version = fields.osversion_name;
        transformed.metadata.cpu = fields.cpu;
        transformed.metadata.ram = fields.ram;
        break;
      case 'phone':
      case 'tablet':
        transformed.metadata.phone_number = fields.phonenumber;
        transformed.metadata.user = fields.user_friendlyname;
        break;
      case 'applicationsolution':
        transformed.assetType = 'SOFTWARE';
        transformed.metadata.deployment = fields.deployment;
        break;
      case 'networkdevice':
      case 'nas':
        transformed.metadata.management_ip = fields.managementip;
        transformed.metadata.network_device_type = fields.networkdevicetype_name;
        break;
    }

    return transformed;
  }

  /**
   * Map iTop asset class to ISMS Manager asset type
   */
  private mapAssetClass(assetClass: string): string {
    const mapping: Record<string, string> = {
      pc: 'HARDWARE',
      server: 'HARDWARE',
      phone: 'HARDWARE',
      tablet: 'HARDWARE',
      networkdevice: 'HARDWARE',
      nas: 'HARDWARE',
      applicationsolution: 'SOFTWARE',
      databaseschema: 'DATA',
      webserver: 'SOFTWARE',
      middlewareinstance: 'SOFTWARE',
      businessprocess: 'SERVICE',
      information: 'DOCUMENT',
    };

    return mapping[assetClass.toLowerCase()] || 'HARDWARE';
  }

  /**
   * Fetch assets from a specific iTop class
   */
  private async fetchAssetClass(className: string, oql: string, outputFields: string): Promise<any[]> {
    const query: ITopQuery = {
      operation: 'core/get',
      class: className,
      key: oql,
      output_fields: outputFields,
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0) {
      console.error(`Error fetching ${className}:`, response.message);
      return [];
    }

    if (!response.objects) {
      return [];
    }

    return Object.values(response.objects).map((obj) => this.transformAsset(obj, className));
  }

  /**
   * Get all assets from iTop
   */
  async getAllAssets(): Promise<any[]> {
    const assetClasses = [
      {
        class: 'PC',
        oql: 'SELECT PC WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, owner, owner_friendlyname, user_friendlyname, confidentiality, integrity, availability, score, business_criticity, asset_number, serialnumber, brand_name, model_name, osfamily_name, osversion_name, cpu, ram, status, description',
      },
      {
        class: 'Server',
        oql: 'SELECT Server WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, team_friendlyname, custodian_list, contingency, contingency_friendlyname, confidentiality, integrity, availability, score, business_criticity, asset_number, brand_name, model_name, osfamily_name, osversion_name, cpu, ram, status, description',
      },
      {
        class: 'Phone',
        oql: 'SELECT Phone WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, phonenumber, asset_number, owner, owner_friendlyname, user, user_friendlyname, contingency, contingency_friendlyname, confidentiality, integrity, availability, score, business_criticity, status, description',
      },
      {
        class: 'Tablet',
        oql: 'SELECT Tablet WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, asset_number, owner, owner_friendlyname, user, user_friendlyname, confidentiality, integrity, availability, score, business_criticity, status, description',
      },
      {
        class: 'NetworkDevice',
        oql: 'SELECT NetworkDevice WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, owner, custodian_list, contingency, contingency_friendlyname, confidentiality, integrity, availability, score, business_criticity, networkdevicetype_id, networkdevicetype_name, managementip, asset_number, brand_name, serialnumber, status, description',
      },
      {
        class: 'NAS',
        oql: 'SELECT NAS WHERE status != "obsolete"',
        fields:
          'name, location_id, location_name, owner, owner_friendlyname, custodian_list, contingency, contingency_friendlyname, confidentiality, integrity, availability, score, business_criticity, networkdevicetype_id, managementip, asset_number, brand_name, serialnumber, status, description',
      },
      {
        class: 'ApplicationSolution',
        oql: 'SELECT ApplicationSolution WHERE status="active"',
        fields:
          'name, owner, owner_friendlyname, custodian_list, confidentiality, integrity, availability, score, business_criticity, description, deployment, status',
      },
    ];

    const assetPromises = assetClasses.map((config) =>
      this.fetchAssetClass(config.class, config.oql, config.fields).catch((err) => {
        console.error(`Failed to fetch ${config.class}:`, err);
        return [];
      })
    );

    const results = await Promise.all(assetPromises);
    return results.flat();
  }

  /**
   * Get a single asset by ID and class
   */
  async getAssetById(id: string, assetClass: string): Promise<any | null> {
    const query: ITopQuery = {
      operation: 'core/get',
      class: assetClass,
      key: `SELECT ${assetClass} WHERE id = ${id}`,
      output_fields: '*',
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0 || !response.objects) {
      return null;
    }

    const assets = Object.values(response.objects);
    if (assets.length === 0) {
      return null;
    }

    return this.transformAsset(assets[0], assetClass);
  }
}

export const itopService = new ITopService();
