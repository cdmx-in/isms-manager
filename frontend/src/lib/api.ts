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

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        const { accessToken } = response.data.data
        useAuthStore.getState().setAccessToken(accessToken)
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return axiosInstance(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(refreshError)
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
  refresh: () => axiosInstance.post('/auth/refresh'),
}

export const organizationApi = {
  list: () => axiosInstance.get('/organizations'),
  get: (id: string) => axiosInstance.get(`/organizations/${id}`),
  create: (data: { name: string; description?: string }) => axiosInstance.post('/organizations', data),
  update: (id: string, data: any) => axiosInstance.patch(`/organizations/${id}`, data),
  delete: (id: string) => axiosInstance.delete(`/organizations/${id}`),
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
  submitForReview: (id: string, changeDescription?: string) =>
    axiosInstance.post(`/risks/${id}/submit-for-review`, { changeDescription }),
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
  list: (params: { organizationId: string; page?: number; limit?: number; search?: string; category?: string; status?: string; approvalStatus?: string }) =>
    axiosInstance.get('/soa', { params }),
  get: (id: string) => axiosInstance.get(`/soa/${id}`),
  update: (id: string, data: any) =>
    axiosInstance.patch(`/soa/${id}`, data),
  bulkUpdate: (organizationId: string, updates: any[]) =>
    axiosInstance.patch('/soa/bulk', { organizationId, updates }),
  initialize: (organizationId: string) => axiosInstance.post('/soa/initialize', { organizationId }),
  export: (organizationId: string, format: string = 'json') =>
    axiosInstance.get('/soa/export', { params: { organizationId, format } }),
  getVersions: (id: string) => axiosInstance.get(`/soa/${id}/versions`),
  submitForReview: (id: string, changeDescription?: string) =>
    axiosInstance.post(`/soa/${id}/submit-for-review`, { changeDescription }),
  firstApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/soa/${id}/first-approval`, { comments }),
  secondApproval: (id: string, comments?: string) =>
    axiosInstance.post(`/soa/${id}/second-approval`, { comments }),
  reject: (id: string, reason: string) =>
    axiosInstance.post(`/soa/${id}/reject`, { reason }),
  pendingApprovals: (organizationId: string) =>
    axiosInstance.get('/soa/pending-approvals', { params: { organizationId } }),
  bulkSubmit: (organizationId: string) =>
    axiosInstance.post('/soa/bulk-submit', { organizationId }),
}

export const incidentApi = {
  list: (params: { organizationId: string; page?: number; limit?: number; status?: string }) =>
    axiosInstance.get('/incidents', { params }),
  get: (id: string) => axiosInstance.get(`/incidents/${id}`),
  create: (data: any) => axiosInstance.post('/incidents', data),
  update: (id: string, data: any) => axiosInstance.patch(`/incidents/${id}`, data),
  delete: (id: string) => axiosInstance.delete(`/incidents/${id}`),
  stats: (organizationId: string) => axiosInstance.get('/incidents/stats', { params: { organizationId } }),
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
    list: async (organizationId: string, params?: { search?: string; category?: string; status?: string; approvalStatus?: string }) => {
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
    getVersions: async (id: string) => {
      const response = await soaApi.getVersions(id)
      return response.data?.data || []
    },
    submitForReview: async (id: string, changeDescription?: string) => {
      const response = await soaApi.submitForReview(id, changeDescription)
      return response.data
    },
    firstApproval: async (id: string, comments?: string) => {
      const response = await soaApi.firstApproval(id, comments)
      return response.data
    },
    secondApproval: async (id: string, comments?: string) => {
      const response = await soaApi.secondApproval(id, comments)
      return response.data
    },
    reject: async (id: string, reason: string) => {
      const response = await soaApi.reject(id, reason)
      return response.data
    },
    pendingApprovals: async (organizationId: string) => {
      const response = await soaApi.pendingApprovals(organizationId)
      return response.data?.data || []
    },
    bulkSubmit: async (organizationId: string) => {
      const response = await soaApi.bulkSubmit(organizationId)
      return response.data
    },
    initialize: async (organizationId: string) => {
      const response = await soaApi.initialize(organizationId)
      return response.data?.data
    },
    export: async (organizationId: string, format: string = 'csv') => {
      const response = await soaApi.export(organizationId, format)
      return response.data
    },
  },
  incidents: {
    list: async (organizationId: string, params?: { search?: string; status?: string; severity?: string }) => {
      const response = await incidentApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
    get: async (id: string) => {
      const response = await incidentApi.get(id)
      return response.data?.data
    },
    create: async (organizationId: string, data: any) => {
      const response = await incidentApi.create({ ...data, organizationId })
      return response.data?.data
    },
    update: async (id: string, data: any) => {
      const response = await incidentApi.update(id, data)
      return response.data?.data
    },
    delete: async (id: string) => {
      const response = await incidentApi.delete(id)
      return response.data
    },
  },
  audit: {
    list: async (organizationId: string, params?: { search?: string; entityType?: string; action?: string }) => {
      const response = await auditApi.list({ organizationId, ...params })
      return response.data?.data || []
    },
  },
  dashboard: dashboardApi,
  reports: reportApi,
  users: userApi,
}
