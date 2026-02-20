import axios, { AxiosInstance } from 'axios';

interface ITopConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiVersion: string;
  orgId: string;
}

interface ITopQuery {
  operation: string;
  class: string;
  key: string;
  output_fields?: string;
  limit?: number;
  page?: number;
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
      orgId: process.env.ITOP_ORG_ID || '',
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
      const formData = new URLSearchParams();
      formData.append('version', this.config.apiVersion);
      formData.append('auth_user', this.config.username);
      formData.append('auth_pwd', this.config.password);
      formData.append('json_data', JSON.stringify(query));

      const response = await this.client.post(this.config.baseUrl, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return response.data;
    } catch (error: any) {
      console.error('iTop API Error:', error.response?.data || error.message);
      throw new Error(`iTop API request failed: ${error.message}`);
    }
  }

  /**
   * Build a sync OQL for a class (Incident or Change) with optional afterDate.
   * Applies org filter if ITOP_ORG_ID is configured.
   */
  buildSyncOql(className: string, afterDate?: string): string {
    const orgCond = this.getOrgCondition();
    const conditions: string[] = [];
    if (orgCond) conditions.push(orgCond);
    if (afterDate) conditions.push(`last_update > "${afterDate}"`);
    return conditions.length > 0
      ? `SELECT ${className} WHERE ${conditions.join(' AND ')}`
      : `SELECT ${className}`;
  }

  /**
   * Returns the base OQL condition for org filtering.
   * If ITOP_ORG_ID is set, restricts to that org; otherwise no org filter.
   */
  private getOrgCondition(): string | null {
    return this.config.orgId ? `org_id=${this.config.orgId}` : null;
  }

  /**
   * Build a base OQL for a class with optional org filter.
   */
  private baseOql(className: string): string {
    const orgCond = this.getOrgCondition();
    return orgCond ? `SELECT ${className} WHERE ${orgCond}` : `SELECT ${className}`;
  }

  /**
   * Parse total count from iTop response message (e.g., "Found: 45425")
   */
  private parseTotalFromMessage(message?: string): number {
    if (!message) return 0;
    const match = message.match(/Found:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
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
   * Transform iTop incident data to ISMS Manager format
   */
  private transformIncident(itopIncident: any): any {
    const fields = itopIncident.fields;

    // Map iTop priority (1=highest, 4=lowest) to severity
    const priorityToSeverity: Record<string, string> = {
      '1': 'CRITICAL',
      '2': 'HIGH',
      '3': 'MEDIUM',
      '4': 'LOW',
    };

    // Map iTop status to ISMS status
    const statusMap: Record<string, string> = {
      'new': 'REPORTED',
      'escalated_tto': 'REPORTED',
      'assigned': 'INVESTIGATING',
      'pending': 'INVESTIGATING',
      'resolved': 'RESOLVED',
      'closed': 'CLOSED',
    };

    return {
      id: itopIncident.key,
      itopId: itopIncident.key,
      ref: fields.ref || '',
      title: fields.title || '',
      description: fields.description || '',
      status: statusMap[fields.status] || 'REPORTED',
      itopStatus: fields.status || '',
      severity: priorityToSeverity[fields.priority] || 'MEDIUM',
      priority: fields.priority || '3',
      urgency: fields.urgency || '3',
      impact: fields.impact || '2',
      origin: fields.origin || '',
      caller: fields.caller_id_friendlyname || '',
      agent: fields.agent_id_friendlyname || '',
      team: fields.team_id_friendlyname || '',
      service: fields.service_id_friendlyname || '',
      serviceSubcategory: fields.servicesubcategory_id_friendlyname || '',
      startDate: fields.start_date || null,
      endDate: fields.end_date || null,
      closeDate: fields.close_date || null,
      resolutionDate: fields.resolution_date || null,
      lastUpdate: fields.last_update || null,
      assignmentDate: fields.assignment_date || null,
    };
  }

  /**
   * Get a count from iTop by running a query with limit=1 and parsing the "Found: N" message
   */
  private async getCount(oql: string): Promise<number> {
    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Incident',
      key: oql,
      output_fields: 'ref',
      limit: 1,
    };
    const response = await this.makeRequest(query);
    return this.parseTotalFromMessage(response.message);
  }

  /**
   * Get incidents from iTop with optional filters and server-side limit
   */
  async getIncidents(options?: {
    status?: string;
    search?: string;
    team?: string;
    origin?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: any[]; total: number }> {
    const limit = options?.limit || 50;
    const page = options?.page || 1;

    // Build OQL filter
    const orgCond = this.getOrgCondition();
    const oqlConditions: string[] = orgCond ? [orgCond] : [];

    if (options?.status) {
      const statusMap: Record<string, string> = {
        'REPORTED': 'new',
        'INVESTIGATING': 'pending',
        'RESOLVED': 'resolved',
        'CLOSED': 'closed',
      };
      const itopStatus = statusMap[options.status] || options.status.toLowerCase();
      oqlConditions.push(`status = "${itopStatus}"`);
    }

    if (options?.search) {
      const searchTerm = options.search.replace(/"/g, '\\"');
      oqlConditions.push(`(title LIKE "%${searchTerm}%" OR ref LIKE "%${searchTerm}%")`);
    }

    if (options?.team) {
      const teamName = options.team.replace(/"/g, '\\"');
      oqlConditions.push(`team_id_friendlyname = "${teamName}"`);
    }

    if (options?.origin) {
      const originVal = options.origin.replace(/"/g, '\\"');
      oqlConditions.push(`origin = "${originVal}"`);
    }

    const oql = oqlConditions.length > 0
      ? `SELECT Incident WHERE ${oqlConditions.join(' AND ')}`
      : 'SELECT Incident';

    // First get total count with a lightweight query (limit=1)
    const total = await this.getCount(oql);

    if (total === 0) {
      return { data: [], total: 0 };
    }

    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Incident',
      key: oql,
      output_fields: 'ref,title,description,status,priority,urgency,impact,start_date,end_date,close_date,caller_id_friendlyname,agent_id_friendlyname,team_id_friendlyname,service_id_friendlyname,servicesubcategory_id_friendlyname,resolution_date,last_update,assignment_date,origin',
      limit,
      page,
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0) {
      console.error('Error fetching incidents:', response.message);
      return { data: [], total };
    }

    if (!response.objects) {
      return { data: [], total };
    }

    const incidents = Object.values(response.objects).map((obj) => this.transformIncident(obj));

    return { data: incidents, total };
  }

  /**
   * Get incident statistics from iTop using lightweight count queries
   */
  async getIncidentStats(): Promise<any> {
    const baseOql = this.baseOql('Incident');

    // Run count queries in parallel for each status and priority combo
    const [
      totalCount,
      newCount,
      pendingCount,
      resolvedCount,
      closedCount,
      criticalOpenCount,
    ] = await Promise.all([
      this.getCount(baseOql),
      this.getCount(`${baseOql} AND status = "new"`),
      this.getCount(`${baseOql} AND status = "pending"`),
      this.getCount(`${baseOql} AND status = "resolved"`),
      this.getCount(`${baseOql} AND status = "closed"`),
      this.getCount(`${baseOql} AND status NOT IN ("resolved","closed") AND priority = "1"`),
    ]);

    const open = newCount + pendingCount;

    return {
      total: totalCount,
      byStatus: {
        REPORTED: newCount,
        INVESTIGATING: pendingCount,
        RESOLVED: resolvedCount,
        CLOSED: closedCount,
      },
      bySeverity: {},
      open,
      critical: criticalOpenCount,
    };
  }

  /**
   * Get incidents with full log data for knowledge base indexing.
   * Fetches a batch using OQL with limit.
   */
  async getIncidentsBatch(options: {
    oql?: string;
    limit?: number;
    page?: number;
    afterDate?: string;
  }): Promise<{ data: any[]; total: number }> {
    const limit = options.limit || 500;
    const orgCond = this.getOrgCondition();
    const oqlConditions: string[] = orgCond ? [orgCond] : [];

    if (options.afterDate) {
      oqlConditions.push(`last_update > "${options.afterDate}"`);
    }

    const oql = options.oql || (oqlConditions.length > 0 ? `SELECT Incident WHERE ${oqlConditions.join(' AND ')}` : 'SELECT Incident');

    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Incident',
      key: oql,
      output_fields: 'ref,title,description,status,priority,urgency,impact,start_date,end_date,close_date,caller_id_friendlyname,agent_id_friendlyname,team_id_friendlyname,service_id_friendlyname,servicesubcategory_id_friendlyname,resolution_date,last_update,assignment_date,origin,public_log',
      limit,
      page: options.page || 1,
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0 || !response.objects) {
      return { data: [], total: this.parseTotalFromMessage(response.message) };
    }

    const total = this.parseTotalFromMessage(response.message);

    const incidents = Object.values(response.objects).map((obj: any) => {
      const transformed = this.transformIncident(obj);
      // Add public_log entries
      const fields = obj.fields;
      transformed.publicLog = fields.public_log?.entries || [];
      return transformed;
    });

    return { data: incidents, total };
  }

  /**
   * Get total incident count for a given OQL
   */
  async getIncidentCount(oql?: string): Promise<number> {
    return this.getCount(oql || this.baseOql('Incident'));
  }

  // ============================================
  // CHANGE MANAGEMENT
  // ============================================

  /**
   * Transform iTop change data to ISMS Manager format
   */
  private transformChange(itopChange: any): any {
    const fields = itopChange.fields;

    const statusMap: Record<string, string> = {
      'new': 'NEW',
      'planned': 'PLANNED',
      'approved': 'APPROVED',
      'rejected': 'REJECTED',
      'implemented': 'IMPLEMENTED',
      'monitored': 'MONITORED',
      'closed': 'CLOSED',
    };

    return {
      id: itopChange.key,
      itopId: itopChange.key,
      ref: fields.ref || '',
      title: fields.title || '',
      description: fields.description || '',
      status: statusMap[fields.status] || fields.status?.toUpperCase() || 'NEW',
      itopStatus: fields.status || '',
      operationalStatus: fields.operational_status || '',
      impact: fields.impact || '',
      outage: fields.outage || 'no',
      fallback: fields.fallback || '',
      reason: fields.reason || '',
      changeType: itopChange.class || fields.finalclass || 'NormalChange',
      caller: fields.caller_name || '',
      agent: fields.agent_name || '',
      team: fields.team_name || '',
      supervisor: fields.supervisor_id_friendlyname || '',
      manager: fields.manager_id_friendlyname || '',
      startDate: fields.start_date || null,
      endDate: fields.end_date || null,
      closeDate: fields.close_date || null,
      creationDate: fields.creation_date || null,
      lastUpdate: fields.last_update || null,
    };
  }

  /**
   * Get changes from iTop with optional filters and server-side pagination
   */
  async getChanges(options?: {
    status?: string;
    search?: string;
    team?: string;
    changeType?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: any[]; total: number }> {
    const limit = options?.limit || 50;
    const page = options?.page || 1;

    const orgCond = this.getOrgCondition();
    const oqlConditions: string[] = orgCond ? [orgCond] : [];

    if (options?.status) {
      const statusMap: Record<string, string> = {
        'NEW': 'new',
        'PLANNED': 'planned',
        'APPROVED': 'approved',
        'REJECTED': 'rejected',
        'IMPLEMENTED': 'implemented',
        'MONITORED': 'monitored',
        'CLOSED': 'closed',
      };
      const itopStatus = statusMap[options.status] || options.status.toLowerCase();
      oqlConditions.push(`status = "${itopStatus}"`);
    }

    if (options?.search) {
      const searchTerm = options.search.replace(/"/g, '\\"');
      oqlConditions.push(`(title LIKE "%${searchTerm}%" OR ref LIKE "%${searchTerm}%")`);
    }

    if (options?.team) {
      const teamName = options.team.replace(/"/g, '\\"');
      oqlConditions.push(`team_name = "${teamName}"`);
    }

    const oql = oqlConditions.length > 0
      ? `SELECT Change WHERE ${oqlConditions.join(' AND ')}`
      : 'SELECT Change';

    const total = await this.getChangeCount(oql);

    if (total === 0) {
      return { data: [], total: 0 };
    }

    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Change',
      key: oql,
      output_fields: 'ref,title,description,status,operational_status,impact,outage,fallback,reason,start_date,end_date,close_date,creation_date,last_update,caller_name,agent_name,team_name,supervisor_id_friendlyname,manager_id_friendlyname,finalclass',
      limit,
      page,
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0) {
      console.error('Error fetching changes:', response.message);
      return { data: [], total };
    }

    if (!response.objects) {
      return { data: [], total };
    }

    const changes = Object.values(response.objects).map((obj) => this.transformChange(obj));

    return { data: changes, total };
  }

  /**
   * Get change count from iTop
   */
  private async getChangeCount(oql: string): Promise<number> {
    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Change',
      key: oql,
      output_fields: 'ref',
      limit: 1,
    };
    const response = await this.makeRequest(query);
    return this.parseTotalFromMessage(response.message);
  }

  /**
   * Get change statistics from iTop
   */
  async getChangeStats(): Promise<any> {
    const baseOql = this.baseOql('Change');

    const [
      totalCount,
      newCount,
      plannedCount,
      approvedCount,
      implementedCount,
      monitoredCount,
      closedCount,
      rejectedCount,
    ] = await Promise.all([
      this.getChangeCount(baseOql),
      this.getChangeCount(`${baseOql} AND status = "new"`),
      this.getChangeCount(`${baseOql} AND status = "planned"`),
      this.getChangeCount(`${baseOql} AND status = "approved"`),
      this.getChangeCount(`${baseOql} AND status = "implemented"`),
      this.getChangeCount(`${baseOql} AND status = "monitored"`),
      this.getChangeCount(`${baseOql} AND status = "closed"`),
      this.getChangeCount(`${baseOql} AND status = "rejected"`),
    ]);

    const open = newCount + plannedCount + approvedCount + implementedCount + monitoredCount;

    return {
      total: totalCount,
      byStatus: {
        NEW: newCount,
        PLANNED: plannedCount,
        APPROVED: approvedCount,
        IMPLEMENTED: implementedCount,
        MONITORED: monitoredCount,
        CLOSED: closedCount,
        REJECTED: rejectedCount,
      },
      open,
    };
  }

  /**
   * Get changes with full log data for knowledge base indexing
   */
  async getChangesBatch(options: {
    oql?: string;
    limit?: number;
    page?: number;
    afterDate?: string;
  }): Promise<{ data: any[]; total: number }> {
    const limit = options.limit || 500;
    const orgCond = this.getOrgCondition();
    const oqlConditions: string[] = orgCond ? [orgCond] : [];

    if (options.afterDate) {
      oqlConditions.push(`last_update > "${options.afterDate}"`);
    }

    const oql = options.oql || (oqlConditions.length > 0 ? `SELECT Change WHERE ${oqlConditions.join(' AND ')}` : 'SELECT Change');

    const query: ITopQuery = {
      operation: 'core/get',
      class: 'Change',
      key: oql,
      output_fields: 'ref,title,description,status,operational_status,impact,outage,fallback,reason,start_date,end_date,close_date,creation_date,last_update,caller_name,agent_name,team_name,supervisor_id_friendlyname,manager_id_friendlyname,finalclass,private_log',
      limit,
      page: options.page || 1,
    };

    const response = await this.makeRequest(query);

    if (response.code !== 0 || !response.objects) {
      return { data: [], total: this.parseTotalFromMessage(response.message) };
    }

    const total = this.parseTotalFromMessage(response.message);

    const changes = Object.values(response.objects).map((obj: any) => {
      const transformed = this.transformChange(obj);
      transformed.privateLog = obj.fields.private_log?.entries || [];
      return transformed;
    });

    return { data: changes, total };
  }

  /**
   * Get total change count for a given OQL
   */
  async getChangeCountPublic(oql?: string): Promise<number> {
    return this.getChangeCount(oql || this.baseOql('Change'));
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
