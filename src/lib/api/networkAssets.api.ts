import { api } from './client'
import type { FeatureCollection, GeoJsonGeometry, NetworkAssetFeature } from './types'

export interface NetworkAssetListParams {
  page?: number
  limit?: number
  projectId?: string
  symbologyId?: string
  assetType?: string
  status?: string
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

export const networkAssetsApi = {
  async list(params: NetworkAssetListParams = {}) {
    const env = await api.raw<FeatureCollection>('/v1/org/network-assets', { params })
    return { featureCollection: env.data, pagination: env.meta?.pagination }
  },
  get: (id: string) => api.get<NetworkAssetFeature>(`/v1/org/network-assets/${id}`),
  create: (payload: CreateNetworkAssetPayload) => api.post<NetworkAssetFeature>('/v1/org/network-assets', payload),
  update: (id: string, payload: Partial<CreateNetworkAssetPayload>) =>
    api.patch<NetworkAssetFeature>(`/v1/org/network-assets/${id}`, payload),
  approve: (id: string) => api.post<NetworkAssetFeature>(`/v1/org/network-assets/${id}/approve`),
  reject: (id: string, reason?: string) =>
    api.post<NetworkAssetFeature>(`/v1/org/network-assets/${id}/reject`, { reason }),
  import: (payload: { projectId: string; featureCollection: FeatureCollection }) =>
    api.post<ImportSummary>('/v1/org/network-assets/import', payload),
}
