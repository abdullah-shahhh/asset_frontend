import { api } from './client'
import type { GeoJsonGeometry } from './types'

export interface NetworkConnectionProperties {
  id: string
  projectId: string
  fromAssetId: string
  toAssetId: string
  label: string | null
}

export interface NetworkConnectionFeature {
  type: 'Feature'
  id: string
  geometry: GeoJsonGeometry | null
  properties: NetworkConnectionProperties
}

export interface NetworkConnectionFeatureCollection {
  type: 'FeatureCollection'
  features: NetworkConnectionFeature[]
}

export const connectionsApi = {
  listForProject: (projectId: string) => api.get<NetworkConnectionFeatureCollection>('/v1/org/network-connections', { params: { projectId } }),
  create: (payload: { projectId: string; fromAssetId: string; toAssetId: string; label?: string }) =>
    api.post<NetworkConnectionFeature>('/v1/org/network-connections', payload),
  remove: (id: string) => api.del<null>(`/v1/org/network-connections/${id}`),
}
