import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'

// Create axios instance
const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor — redirect to login on 401 (session expired)
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      // Don't redirect on auth check or logout — these are expected to 401 when not logged in
      if (!url.includes('/auth/me') && !url.includes('/auth/logout')) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Export axios instance as default
export default axiosInstance

// API helper functions using axiosInstance
export const authApi = {
  login: (email: string, password: string) =>
    axiosInstance.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    axiosInstance.post('/auth/register', data),
  logout: () => axiosInstance.post('/auth/logout'),
  me: () => axiosInstance.get('/auth/me'),
}

export const organizationApi = {
  list: () => axiosInstance.get('/organizations'),
  get: (id: string) => axiosInstance.get(`/organizations/${id}`),
  create: (data: { name: string; description?: string }) => axiosInstance.post('/organizations', data),
  update: (id: string, data: any) => axiosInstance.patch(`/organizations/${id}`, data),
  delete: (id: string) => axiosInstance.delete(`/organizations/${id}`),
  addMember: (orgId: string, data: { email: string; role: string }) =>
    axiosInstance.post(`/organizations/${orgId}/members`, data),
  updateMemberRole: (orgId: string, memberId: string, role: string) =>
    axiosInstance.patch(`/organizations/${orgId}/members/${memberId}`, { role }),
  removeMember: (orgId: string, memberId: string) =>
    axiosInstance.delete(`/organizations/${orgId}/members/${memberId}`),
  updateMemberOrgRole: (orgId: string, memberId: string, orgRoleId: string | null) =>
    axiosInstance.patch(`/organizations/${orgId}/members/${memberId}`, { orgRoleId }),
}

export const roleApi = {
  list: (orgId: string) => axiosInstance.get(`/organizations/${orgId}/roles`),
  create: (orgId: string, data: { name: string; description?: string; permissions: string[] }) =>
    axiosInstance.post(`/organizations/${orgId}/roles`, data),
  update: (orgId: string, roleId: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    axiosInstance.patch(`/organizations/${orgId}/roles/${roleId}`, data),
  delete: (orgId: string, roleId: string) =>
    axiosInstance.delete(`/organizations/${orgId}/roles/${roleId}`),
  seed: (orgId: string, linkMembers?: boolean) =>
    axiosInstance.post(`/organizations/${orgId}/roles/seed`, { linkMembers }),
  modules: () => axiosInstance.get('/permissions/modules'),
}

export const assetApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; search?: string }) =>
    axiosInstance.get('/assets', { params }),
  get: (id: string) => axiosInstance.get(`/assets/${id}`),
  create: (data: any) => axiosInstance.post('/assets', data),
  update: (id: string, data: any) => axiosInstance.patch(`/assets/${id}`, data),
  delete: (id: string) => axiosInstance.delete(`/assets/${id}`),
  import: (formData: FormData) => 
    axiosInstance.post('/assets/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

export const riskApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; status?: string }) =>
    axiosInstance.get('/risks', { params }),
  get: (id: string) => axiosInstance.get(`/risks/${id}`),
  create: (data: any) => axiosInstance.post('/risks', data),
  update: (id: string, data: any) => axiosInstance.patch(`/risks/${id}`, data),
  delete: (id: string) => axiosInstance.delete(`/risks/${id}`),
  heatmap: (organizationId: string) => axiosInstance.get('/risks/heatmap', { params: { organizationId } }),
  linkControls: (id: string, controlIds: string[]) => axiosInstance.post(`/risks/${id}/controls`, { controlIds }),
  submitForReview: (id: string, changeDescription?: string, versionBump?: string) =>
    axiosInstance.post(`/risks/${id}/submit-for-review`, { changeDescription, versionBump }),
  firstApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/risks/${id}/first-approval`, { comments }),
  secondApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/risks/${id}/second-approval`, { comments }),
  reject: (id: string, reason: string) =>
    axiosInstance.post(`/risks/${id}/reject`, { reason }),
  retire: (id: string, reason: string) =>
    axiosInstance.post(`/risks/${id}/retire`, { reason }),
  getTreatment: (id: string) => axiosInstance.get(`/risks/${id}/treatment`),
  createTreatment: (id: string, data: any) => axiosInstance.post(`/risks/${id}/treatment`, data),
  getVersions: (id: string) => axiosInstance.get(`/risks/${id}/versions`),
  pendingApprovals: (organizationId: string) =>
    axiosInstance.get('/risks/pending-approvals/list', { params: { organizationId } }),
  retiredList: (organizationId: string) =>
    axiosInstance.get('/risks/retired/list', { params: { organizationId } }),
}

export const controlApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; category?: string; frameworkSlug?: string }) =>
    axiosInstance.get('/controls', { params }),
  get: (id: string) => axiosInstance.get(`/controls/${id}`),
  create: (data: any) => axiosInstance.post('/controls', data),
  update: (id: string, data: any) => axiosInstance.patch(`/controls/${id}`, data),
  categories: (organizationId: string) => axiosInstance.get('/controls/categories', { params: { organizationId } }),
}

export const driveApi = {
  listFolders: (organizationId: string) =>
    axiosInstance.get('/drive/folders', { params: { organizationId } }),
  addFolder: (data: { organizationId: string; driveId: string; name: string; folderType?: string }) =>
    axiosInstance.post('/drive/folders', data),
  updateFolder: (id: string, data: { name?: string; folderType?: string }) =>
    axiosInstance.patch(`/drive/folders/${id}`, data),
  removeFolder: (id: string) => axiosInstance.delete(`/drive/folders/${id}`),
  listFolderContents: (folderId: string, pageToken?: string) =>
    axiosInstance.get(`/drive/folders/${folderId}/contents`, { params: { pageToken } }),
  getFile: (fileId: string) => axiosInstance.get(`/drive/files/${fileId}`),
  search: (organizationId: string, q: string) =>
    axiosInstance.get('/drive/search', { params: { organizationId, q } }),
  sync: (organizationId: string) =>
    axiosInstance.post('/drive/sync', { organizationId }),
  syncFolder: (folderId: string) =>
    axiosInstance.post(`/drive/sync/${folderId}`),
  listDocuments: (organizationId: string, params?: { folderId?: string; search?: string }) =>
    axiosInstance.get('/drive/documents', { params: { organizationId, ...params } }),
}

export const ragApi = {
  indexDocument: (documentId: string) =>
    axiosInstance.post(`/rag/index/${documentId}`),
  indexAll: (organizationId: string) =>
    axiosInstance.post('/rag/index-all', { organizationId }),
  search: (organizationId: string, q: string, options?: { limit?: number; folderId?: string }) =>
    axiosInstance.get('/rag/search', { params: { organizationId, q, ...options } }),
  ask: (organizationId: string, question: string) =>
    axiosInstance.post('/rag/ask', { organizationId, question }),
  status: (organizationId: string) =>
    axiosInstance.get('/rag/status', { params: { organizationId } }),
}

export const soaApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; search?: string; category?: string; status?: string }) =>
    axiosInstance.get('/soa', { params }),
  get: (id: string) => axiosInstance.get(`/soa/${id}`),
  update: (id: string, data: any) =>
    axiosInstance.patch(`/soa/${id}`, data),
  bulkUpdate: (organizationId: string, updates: any[]) =>
    axiosInstance.patch('/soa/bulk', { organizationId, updates }),
  initialize: (organizationId: string) => axiosInstance.post('/soa/initialize', { organizationId }),
  export: (organizationId: string, format: string = 'json') =>
    axiosInstance.get('/soa/export', { params: { organizationId, format } }),
  // Document-level endpoints
  getDocument: (organizationId: string) =>
    axiosInstance.get('/soa/document', { params: { organizationId } }),
  updateDocument: (organizationId: string, data: any) =>
    axiosInstance.patch('/soa/document', { organizationId, ...data }),
  getDocumentVersions: (organizationId: string) =>
    axiosInstance.get('/soa/document/versions', { params: { organizationId } }),
  submitForReview: (organizationId: string, changeDescription?: string, versionBump?: string) =>
    axiosInstance.post('/soa/document/submit-for-review', { organizationId, changeDescription, versionBump }),
  firstApproval: (organizationId: string, comments?: string) =>
    axiosInstance.post('/soa/document/first-approval', { organizationId, comments }),
  secondApproval: (organizationId: string, comments?: string) =>
    axiosInstance.post('/soa/document/second-approval', { organizationId, comments }),
  reject: (organizationId: string, reason: string) =>
    axiosInstance.post('/soa/document/reject', { organizationId, reason }),
  newRevision: (organizationId: string, changeDescription?: string, versionBump?: string) =>
    axiosInstance.post('/soa/document/new-revision', { organizationId, changeDescription, versionBump }),
  updateVersionDescription: (versionId: string, changeDescription: string) =>
    axiosInstance.patch(`/soa/document/versions/${versionId}`, { changeDescription }),
  discardRevision: (organizationId: string) =>
    axiosInstance.post('/soa/document/discard-revision', { organizationId }),
}

export const incidentApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; status?: string; severity?: string; search?: string; team?: string; origin?: string }) =>
    axiosInstance.get('/incidents', { params }),
  stats: (organizationId: string) => axiosInstance.get('/incidents/stats', { params: { organizationId } }),
}

export const incidentKnowledgeApi = {
  sync: (organizationId: string, mode: string = 'incremental') =>
    axiosInstance.post('/incident-knowledge/sync', { organizationId, mode }),
  syncStatus: (jobId: string) =>
    axiosInstance.get(`/incident-knowledge/sync/${jobId}`),
  status: (organizationId: string) =>
    axiosInstance.get('/incident-knowledge/status', { params: { organizationId } }),
  search: (organizationId: string, q: string, limit?: number) =>
    axiosInstance.get('/incident-knowledge/search', { params: { organizationId, q, limit } }),
  similar: (organizationId: string, itopId: string, limit?: number) =>
    axiosInstance.get(`/incident-knowledge/similar/${itopId}`, { params: { organizationId, limit } }),
  ask: (organizationId: string, question: string) =>
    axiosInstance.post('/incident-knowledge/ask', { organizationId, question }),
}

export const changeApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; status?: string; search?: string; team?: string; changeType?: string }) =>
    axiosInstance.get('/changes', { params }),
  stats: (organizationId: string) => axiosInstance.get('/changes/stats', { params: { organizationId } }),
}

export const changeKnowledgeApi = {
  sync: (organizationId: string, mode: string = 'incremental') =>
    axiosInstance.post('/change-knowledge/sync', { organizationId, mode }),
  syncStatus: (jobId: string) =>
    axiosInstance.get(`/change-knowledge/sync/${jobId}`),
  status: (organizationId: string) =>
    axiosInstance.get('/change-knowledge/status', { params: { organizationId } }),
  search: (organizationId: string, q: string, limit?: number) =>
    axiosInstance.get('/change-knowledge/search', { params: { organizationId, q, limit } }),
  similar: (organizationId: string, itopId: string, limit?: number) =>
    axiosInstance.get(`/change-knowledge/similar/${itopId}`, { params: { organizationId, limit } }),
  ask: (organizationId: string, question: string) =>
    axiosInstance.post('/change-knowledge/ask', { organizationId, question }),
}

export const exemptionApi = {
  list: (params: {
    organizationId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    approvalStatus?: string;
    frameworkId?: string;
    exemptionType?: string;
    controlId?: string;
  }) => axiosInstance.get('/exemptions', { params }),
  stats: (organizationId: string) =>
    axiosInstance.get('/exemptions/stats', { params: { organizationId } }),
  get: (id: string) => axiosInstance.get(`/exemptions/${id}`),
  create: (data: any) => axiosInstance.post('/exemptions', data),
  update: (id: string, data: any) => axiosInstance.patch(`/exemptions/${id}`, data),
  submitForReview: (id: string, changeDescription?: string) =>
    axiosInstance.post(`/exemptions/${id}/submit-for-review`, { changeDescription }),
  firstApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/exemptions/${id}/first-approval`, { comments }),
  secondApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/exemptions/${id}/second-approval`, { comments }),
  reject: (id: string, reason: string) =>
    axiosInstance.post(`/exemptions/${id}/reject`, { reason }),
  revoke: (id: string, reason: string) =>
    axiosInstance.post(`/exemptions/${id}/revoke`, { reason }),
  renew: (id: string, data: any) =>
    axiosInstance.post(`/exemptions/${id}/renew`, data),
  getVersions: (id: string) => axiosInstance.get(`/exemptions/${id}/versions`),
}

export const assessmentApi = {
  list: (organizationId: string) =>
    axiosInstance.get('/assessments', { params: { organizationId } }),
  frameworks: () =>
    axiosInstance.get('/assessments/frameworks'),
  get: (id: string) =>
    axiosInstance.get(`/assessments/${id}`),
  create: (data: any) =>
    axiosInstance.post('/assessments', data),
  update: (id: string, data: any) =>
    axiosInstance.patch(`/assessments/${id}`, data),
  delete: (id: string) =>
    axiosInstance.delete(`/assessments/${id}`),
  getRequirements: (id: string, params?: { frameworkSlug?: string; domainCode?: string; status?: string }) =>
    axiosInstance.get(`/assessments/${id}/requirements`, { params }),
  updateRequirement: (id: string, reqId: string, data: any) =>
    axiosInstance.patch(`/assessments/${id}/requirements/${reqId}`, data),
  addEvidence: (id: string, reqId: string, formData: FormData) =>
    axiosInstance.post(`/assessments/${id}/requirements/${reqId}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addEvidenceLink: (id: string, reqId: string, data: { title: string; description?: string; evidenceType: string; link?: string }) =>
    axiosInstance.post(`/assessments/${id}/requirements/${reqId}/evidence`, data),
  removeEvidence: (id: string, evidenceId: string) =>
    axiosInstance.delete(`/assessments/${id}/evidence/${evidenceId}`),
  getFindings: (id: string, params?: { frameworkSlug?: string; severity?: string; status?: string }) =>
    axiosInstance.get(`/assessments/${id}/findings`, { params }),
  createFinding: (id: string, data: any) =>
    axiosInstance.post(`/assessments/${id}/findings`, data),
  updateFinding: (id: string, findingId: string, data: any) =>
    axiosInstance.patch(`/assessments/${id}/findings/${findingId}`, data),
  deleteFinding: (id: string, findingId: string) =>
    axiosInstance.delete(`/assessments/${id}/findings/${findingId}`),
  getProgress: (id: string) =>
    axiosInstance.get(`/assessments/${id}/progress`),
  getReport: (id: string) =>
    axiosInstance.get(`/assessments/${id}/report`, { responseType: 'blob' }),
  aiAnalyze: (id: string) =>
    axiosInstance.post(`/assessments/${id}/ai-analyze`),
  aiAssistRequirement: (id: string, reqId: string, question?: string) =>
    axiosInstance.post(`/assessments/${id}/requirements/${reqId}/ai-assist`, { question }),
}

export const auditApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; action?: string; entityType?: string }) =>
    axiosInstance.get('/audits', { params }),
  stats: (organizationId: string, days?: number) =>
    axiosInstance.get('/audits/stats', { params: { organizationId, days } }),
  export: (organizationId: string, format?: string) =>
    axiosInstance.get('/audits/export', { params: { organizationId, format } }),
}

export const dashboardApi = {
  overview: (organizationId: string) => axiosInstance.get('/dashboard', { params: { organizationId } }),
  complianceTrend: (organizationId: string, days?: number) =>
    axiosInstance.get('/dashboard/compliance-trend', { params: { organizationId, days } }),
  riskDistribution: (organizationId: string) =>
    axiosInstance.get('/dashboard/risk-distribution', { params: { organizationId } }),
  getStats: (organizationId: string) => 
    axiosInstance.get('/dashboard', { params: { organizationId } }).then(r => r.data?.data),
  getComplianceOverview: (organizationId: string) =>
    axiosInstance.get('/dashboard/compliance-overview', { params: { organizationId } }).then(r => r.data?.data),
  getRiskTrend: (organizationId: string) =>
    axiosInstance.get('/dashboard/risk-trend', { params: { organizationId } }).then(r => r.data?.data),
  getRecentActivity: (organizationId: string) =>
    axiosInstance.get('/dashboard/recent-activity', { params: { organizationId } }).then(r => r.data?.data),
}

export const fileApi = {
  upload: (formData: FormData) =>
    axiosInstance.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  list: (params: { organizationId: string; entityType?: string; entityId?: string }) =>
    axiosInstance.get('/files', { params }),
  download: (id: string) => axiosInstance.get(`/files/${id}/download`),
  delete: (id: string) => axiosInstance.delete(`/files/${id}`),
}

export const reportApi = {
  soa: (organizationId: string, format: string = 'pdf') =>
    axiosInstance.get('/reports/soa', { params: { organizationId, format }, responseType: 'blob' }).then(r => r.data),
  risks: (organizationId: string, format: string = 'pdf') =>
    axiosInstance.get('/reports/risks', { params: { organizationId, format }, responseType: 'blob' }).then(r => r.data),
  riskRegister: (organizationId: string) =>
    axiosInstance.get('/reports/risk-register', { params: { organizationId }, responseType: 'blob' }).then(r => r.data),
  compliance: (organizationId: string, format: string = 'json') =>
    axiosInstance.get('/reports/compliance', { params: { organizationId, format }, responseType: format === 'pdf' ? 'blob' : 'json' }),
}

export const frameworkApi = {
  list: (organizationId?: string) => axiosInstance.get('/frameworks', { params: organizationId ? { organizationId } : {} }),
  get: (slug: string) => axiosInstance.get(`/frameworks/${slug}`),
  getProgress: (slug: string, organizationId: string) =>
    axiosInstance.get(`/frameworks/${slug}/progress`, { params: { organizationId } }),
}

export const checklistApi = {
  getForControl: (controlId: string, organizationId: string) =>
    axiosInstance.get(`/checklist/controls/${controlId}/checklist`, { params: { organizationId } }),
  initialize: (controlId: string, organizationId: string) =>
    axiosInstance.post(`/checklist/controls/${controlId}/checklist/initialize`, { organizationId }),
  updateItem: (itemId: string, data: { isCompleted?: boolean; notes?: string }) =>
    axiosInstance.patch(`/checklist/${itemId}`, data),
  getFrameworkProgress: (slug: string, organizationId: string) =>
    axiosInstance.get(`/checklist/frameworks/${slug}/checklist-progress`, { params: { organizationId } }),
}

export const userApi = {
  updateProfile: (data: any) => axiosInstance.patch('/users/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    axiosInstance.post('/auth/change-password', data),
}

export const notificationApi = {
  list: (organizationId: string, params?: { unreadOnly?: boolean; limit?: number }) =>
    axiosInstance.get('/notifications', { params: { organizationId, ...params } }),
  unreadCount: (organizationId: string) =>
    axiosInstance.get('/notifications/count', { params: { organizationId } }),
  markRead: (id: string) =>
    axiosInstance.patch(`/notifications/${id}/read`),
  markAllRead: (organizationId: string) =>
    axiosInstance.post('/notifications/mark-all-read', { organizationId }),
}

// Unified API object for components - wraps raw API calls with response extraction
export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const response = await authApi.login(email, password)
      return response.data
    },
    register: async (data: any) => {
      const response = await authApi.register(data)
      return response.data
    },
    logout: async () => {
      const response = await authApi.logout()
      return response.data
    },
    me: async () => {
      const response = await authApi.me()
      return response.data
    },
    changePassword: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await userApi.changePassword(data)
      return response.data
    },
  },
  assets: {
    list: async (organizationId: string, params?: { search?: string; type?: string }) => {
      const response = await assetApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
    get: async (id: string) => {
      const response = await assetApi.get(id)
      return response.data?.data
    },
    create: async (organizationId: string, data: any) => {
      const response = await assetApi.create({ ...data, organizationId })
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await assetApi.update(id, data)
      return response.data?.data
    },
    delete: async (id: string) => {
      const response = await assetApi.delete(id)
      return response.data
    },
  },
  risks: {
    list: async (organizationId: string, params?: { search?: string; status?: string }) => {
      const response = await riskApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
    get: async (id: string) => {
      const response = await riskApi.get(id)
      return response.data?.data
    },
    create: async (organizationId: string, data: any) => {
      const response = await riskApi.create({ ...data, organizationId })
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await riskApi.update(id, data)
      return response.data?.data
    },
    delete: async (id: string) => {
      const response = await riskApi.delete(id)
      return response.data
    },
  },
  controls: {
    list: async (organizationId: string, params?: { search?: string; category?: string; status?: string; frameworkSlug?: string; limit?: number }) => {
      const response = await controlApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
    get: async (id: string) => {
      const response = await controlApi.get(id)
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await controlApi.update(id, data)
      return response.data?.data
    },
  },
  frameworks: {
    list: async (organizationId?: string) => {
      const response = await frameworkApi.list(organizationId)
      return response.data?.data || []
    },
    get: async (slug: string) => {
      const response = await frameworkApi.get(slug)
      return response.data?.data
    },
    getProgress: async (slug: string, organizationId: string) => {
      const response = await frameworkApi.getProgress(slug, organizationId)
      return response.data?.data
    },
  },
  checklist: {
    getForControl: async (controlId: string, organizationId: string) => {
      const response = await checklistApi.getForControl(controlId, organizationId)
      return response.data?.data || []
    },
    initialize: async (controlId: string, organizationId: string) => {
      const response = await checklistApi.initialize(controlId, organizationId)
      return response.data?.data || []
    },
    updateItem: async (itemId: string, data: { isCompleted?: boolean; notes?: string }) => {
      const response = await checklistApi.updateItem(itemId, data)
      return response.data?.data
    },
    getFrameworkProgress: async (slug: string, organizationId: string) => {
      const response = await checklistApi.getFrameworkProgress(slug, organizationId)
      return response.data?.data
    },
  },
  drive: {
    listFolders: async (organizationId: string) => {
      const response = await driveApi.listFolders(organizationId)
      return response.data
    },
    addFolder: async (data: { organizationId: string; driveId: string; name: string; folderType?: string }) => {
      const response = await driveApi.addFolder(data)
      return response.data?.data
    },
    removeFolder: async (id: string) => {
      const response = await driveApi.removeFolder(id)
      return response.data
    },
    listFolderContents: async (folderId: string, pageToken?: string) => {
      const response = await driveApi.listFolderContents(folderId, pageToken)
      return response.data
    },
    search: async (organizationId: string, q: string) => {
      const response = await driveApi.search(organizationId, q)
      return response.data?.data || []
    },
    sync: async (organizationId: string) => {
      const response = await driveApi.sync(organizationId)
      return response.data
    },
    syncFolder: async (folderId: string) => {
      const response = await driveApi.syncFolder(folderId)
      return response.data
    },
    listDocuments: async (organizationId: string, params?: { folderId?: string; search?: string }) => {
      const response = await driveApi.listDocuments(organizationId, params)
      return response.data?.data || []
    },
  },
  rag: {
    search: async (organizationId: string, q: string) => {
      const response = await ragApi.search(organizationId, q)
      return response.data?.data || []
    },
    ask: async (organizationId: string, question: string) => {
      const response = await ragApi.ask(organizationId, question)
      return response.data?.data
    },
    status: async (organizationId: string) => {
      const response = await ragApi.status(organizationId)
      return response.data?.data
    },
    indexAll: async (organizationId: string) => {
      const response = await ragApi.indexAll(organizationId)
      return response.data
    },
    indexDocument: async (documentId: string) => {
      const response = await ragApi.indexDocument(documentId)
      return response.data
    },
  },
  soa: {
    list: async (organizationId: string, params?: { search?: string; category?: string; status?: string }) => {
      const response = await soaApi.list({ organizationId, ...params })
      return response.data
    },
    get: async (id: string) => {
      const response = await soaApi.get(id)
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await soaApi.update(id, data)
      return response.data?.data
    },
    initialize: async (organizationId: string) => {
      const response = await soaApi.initialize(organizationId)
      return response.data?.data
    },
    export: async (organizationId: string, format: string = 'csv') => {
      const response = await soaApi.export(organizationId, format)
      return response.data
    },
    // Document-level
    getDocument: async (organizationId: string) => {
      const response = await soaApi.getDocument(organizationId)
      return response.data?.data
    },
    updateDocument: async (organizationId: string, data: any) => {
      const response = await soaApi.updateDocument(organizationId, data)
      return response.data?.data
    },
    getDocumentVersions: async (organizationId: string) => {
      const response = await soaApi.getDocumentVersions(organizationId)
      return response.data?.data || []
    },
    submitForReview: async (organizationId: string, changeDescription?: string, versionBump?: string) => {
      const response = await soaApi.submitForReview(organizationId, changeDescription, versionBump)
      return response.data
    },
    firstApproval: async (organizationId: string, comments?: string) => {
      const response = await soaApi.firstApproval(organizationId, comments)
      return response.data
    },
    secondApproval: async (organizationId: string, comments?: string) => {
      const response = await soaApi.secondApproval(organizationId, comments)
      return response.data
    },
    reject: async (organizationId: string, reason: string) => {
      const response = await soaApi.reject(organizationId, reason)
      return response.data
    },
    newRevision: async (organizationId: string, changeDescription?: string, versionBump?: string) => {
      const response = await soaApi.newRevision(organizationId, changeDescription, versionBump)
      return response.data
    },
    updateVersionDescription: async (versionId: string, changeDescription: string) => {
      const response = await soaApi.updateVersionDescription(versionId, changeDescription)
      return response.data
    },
    discardRevision: async (organizationId: string) => {
      const response = await soaApi.discardRevision(organizationId)
      return response.data
    },
  },
  incidents: {
    list: async (organizationId: string, params?: { search?: string; status?: string; severity?: string; team?: string; origin?: string; page?: number; limit?: number }) => {
      const response = await incidentApi.list({ organizationId, ...params })
      return response.data
    },
    stats: async (organizationId: string) => {
      const response = await incidentApi.stats(organizationId)
      return response.data?.data
    },
  },
  incidentKnowledge: {
    sync: async (organizationId: string, mode?: string) => {
      const response = await incidentKnowledgeApi.sync(organizationId, mode)
      return response.data?.data
    },
    syncStatus: async (jobId: string) => {
      const response = await incidentKnowledgeApi.syncStatus(jobId)
      return response.data?.data
    },
    status: async (organizationId: string) => {
      const response = await incidentKnowledgeApi.status(organizationId)
      return response.data?.data
    },
    search: async (organizationId: string, q: string, limit?: number) => {
      const response = await incidentKnowledgeApi.search(organizationId, q, limit)
      return response.data?.data || []
    },
    similar: async (organizationId: string, itopId: string, limit?: number) => {
      const response = await incidentKnowledgeApi.similar(organizationId, itopId, limit)
      return response.data?.data || []
    },
    ask: async (organizationId: string, question: string) => {
      const response = await incidentKnowledgeApi.ask(organizationId, question)
      return response.data?.data
    },
  },
  changes: {
    list: async (organizationId: string, params?: { search?: string; status?: string; team?: string; changeType?: string; page?: number; limit?: number }) => {
      const response = await changeApi.list({ organizationId, ...params })
      return response.data
    },
    stats: async (organizationId: string) => {
      const response = await changeApi.stats(organizationId)
      return response.data?.data
    },
  },
  changeKnowledge: {
    sync: async (organizationId: string, mode?: string) => {
      const response = await changeKnowledgeApi.sync(organizationId, mode)
      return response.data?.data
    },
    syncStatus: async (jobId: string) => {
      const response = await changeKnowledgeApi.syncStatus(jobId)
      return response.data?.data
    },
    status: async (organizationId: string) => {
      const response = await changeKnowledgeApi.status(organizationId)
      return response.data?.data
    },
    search: async (organizationId: string, q: string, limit?: number) => {
      const response = await changeKnowledgeApi.search(organizationId, q, limit)
      return response.data?.data || []
    },
    similar: async (organizationId: string, itopId: string, limit?: number) => {
      const response = await changeKnowledgeApi.similar(organizationId, itopId, limit)
      return response.data?.data || []
    },
    ask: async (organizationId: string, question: string) => {
      const response = await changeKnowledgeApi.ask(organizationId, question)
      return response.data?.data
    },
  },
  exemptions: {
    list: async (organizationId: string, params?: {
      search?: string;
      status?: string;
      approvalStatus?: string;
      frameworkId?: string;
      exemptionType?: string;
      page?: number;
      limit?: number;
    }) => {
      const response = await exemptionApi.list({ organizationId, ...params })
      return response.data
    },
    stats: async (organizationId: string) => {
      const response = await exemptionApi.stats(organizationId)
      return response.data?.data
    },
    get: async (id: string) => {
      const response = await exemptionApi.get(id)
      return response.data?.data
    },
    create: async (data: any) => {
      const response = await exemptionApi.create(data)
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await exemptionApi.update(id, data)
      return response.data?.data
    },
    submitForReview: async (id: string, changeDescription?: string) => {
      const response = await exemptionApi.submitForReview(id, changeDescription)
      return response.data
    },
    firstApproval: async (id: string, comments?: string) => {
      const response = await exemptionApi.firstApproval(id, comments)
      return response.data
    },
    secondApproval: async (id: string, comments?: string) => {
      const response = await exemptionApi.secondApproval(id, comments)
      return response.data
    },
    reject: async (id: string, reason: string) => {
      const response = await exemptionApi.reject(id, reason)
      return response.data
    },
    revoke: async (id: string, reason: string) => {
      const response = await exemptionApi.revoke(id, reason)
      return response.data
    },
    renew: async (id: string, data: any) => {
      const response = await exemptionApi.renew(id, data)
      return response.data
    },
    getVersions: async (id: string) => {
      const response = await exemptionApi.getVersions(id)
      return response.data?.data || []
    },
  },
  assessments: {
    list: async (organizationId: string) => {
      const response = await assessmentApi.list(organizationId)
      return response.data?.data || []
    },
    frameworks: async () => {
      const response = await assessmentApi.frameworks()
      return response.data?.data || []
    },
    get: async (id: string) => {
      const response = await assessmentApi.get(id)
      return response.data?.data
    },
    create: async (data: any) => {
      const response = await assessmentApi.create(data)
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await assessmentApi.update(id, data)
      return response.data?.data
    },
    delete: async (id: string) => {
      const response = await assessmentApi.delete(id)
      return response.data
    },
    getRequirements: async (id: string, params?: { frameworkSlug?: string; domainCode?: string; status?: string }) => {
      const response = await assessmentApi.getRequirements(id, params)
      return response.data?.data || []
    },
    updateRequirement: async (id: string, reqId: string, data: any) => {
      const response = await assessmentApi.updateRequirement(id, reqId, data)
      return response.data?.data
    },
    addEvidence: async (id: string, reqId: string, formData: FormData) => {
      const response = await assessmentApi.addEvidence(id, reqId, formData)
      return response.data?.data
    },
    addEvidenceLink: async (id: string, reqId: string, data: { title: string; description?: string; evidenceType: string; link?: string }) => {
      const response = await assessmentApi.addEvidenceLink(id, reqId, data)
      return response.data?.data
    },
    removeEvidence: async (id: string, evidenceId: string) => {
      const response = await assessmentApi.removeEvidence(id, evidenceId)
      return response.data
    },
    getFindings: async (id: string, params?: any) => {
      const response = await assessmentApi.getFindings(id, params)
      return response.data?.data || []
    },
    createFinding: async (id: string, data: any) => {
      const response = await assessmentApi.createFinding(id, data)
      return response.data?.data
    },
    updateFinding: async (id: string, findingId: string, data: any) => {
      const response = await assessmentApi.updateFinding(id, findingId, data)
      return response.data?.data
    },
    deleteFinding: async (id: string, findingId: string) => {
      const response = await assessmentApi.deleteFinding(id, findingId)
      return response.data
    },
    getProgress: async (id: string) => {
      const response = await assessmentApi.getProgress(id)
      return response.data?.data
    },
    getReport: async (id: string) => {
      const response = await assessmentApi.getReport(id)
      return response.data
    },
    aiAnalyze: async (id: string) => {
      const response = await assessmentApi.aiAnalyze(id)
      return response.data?.data
    },
    aiAssistRequirement: async (id: string, reqId: string, question?: string) => {
      const response = await assessmentApi.aiAssistRequirement(id, reqId, question)
      return response.data?.data
    },
  },
  audit: {
    list: async (organizationId: string, params?: { search?: string; entityType?: string; action?: string }) => {
      const response = await auditApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
  },
  notifications: {
    list: async (organizationId: string, params?: { unreadOnly?: boolean; limit?: number }) => {
      const response = await notificationApi.list(organizationId, params)
      return response.data?.data || []
    },
    unreadCount: async (organizationId: string) => {
      const response = await notificationApi.unreadCount(organizationId)
      return response.data?.data?.count || 0
    },
    markRead: async (id: string) => {
      const response = await notificationApi.markRead(id)
      return response.data?.data
    },
    markAllRead: async (organizationId: string) => {
      const response = await notificationApi.markAllRead(organizationId)
      return response.data
    },
  },
  dashboard: dashboardApi,
  reports: reportApi,
  users: userApi,
}
