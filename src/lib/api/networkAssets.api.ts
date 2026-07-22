import { api } from './client'
import type { FeatureCollection, GeoJsonGeometry, NetworkAssetFeature, OperationalStatus } from './types'

export interface NetworkAssetListParams {
  page?: number
  limit?: number
  projectId?: string
  symbologyId?: string
  assetType?: string
  status?: string
  ipAddress?: string
}

export interface CreateNetworkAssetPayload {
  projectId: string
  symbologyId: string
  geometry: GeoJsonGeometry
  attributes?: Record<string, unknown>
}

export interface ImportSummary {
  total: number
  created: number
  failed: number
  errors: { index: number; message: string }[]
}

export interface AlarmsSummary {
  equipment: NetworkAssetFeature[]
  faults: NetworkAssetFeature[]
}

export const networkAssetsApi = {
  async list(params: NetworkAssetListParams = {}) {
    const env = await api.raw<FeatureCollection>('/v1/org/network-assets', { params })
    return { featureCollection: env.data, pagination: env.meta?.pagination }
  },
  alarms: () => api.get<AlarmsSummary>('/v1/org/network-assets/alarms'),
  get: (id: string) => api.get<NetworkAssetFeature>(`/v1/org/network-assets/${id}`),
  create: (payload: CreateNetworkAssetPayload) => api.post<NetworkAssetFeature>('/v1/org/network-assets', payload),
  update: (id: string, payload: Partial<CreateNetworkAssetPayload> & { operationalStatus?: OperationalStatus | null; ipAddress?: string | null }) =>
    api.patch<NetworkAssetFeature>(`/v1/org/network-assets/${id}`, payload),
  remove: (id: string) => api.del<null>(`/v1/org/network-assets/${id}`),
  approve: (id: string) => api.post<NetworkAssetFeature>(`/v1/org/network-assets/${id}/approve`),
  reject: (id: string, reason?: string) =>
    api.post<NetworkAssetFeature>(`/v1/org/network-assets/${id}/reject`, { reason }),
  import: (payload: { projectId: string; featureCollection: FeatureCollection }) =>
    api.post<ImportSummary>('/v1/org/network-assets/import', payload),
}
