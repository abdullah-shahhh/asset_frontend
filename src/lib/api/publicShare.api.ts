import { api } from './client'
import type { FeatureCollection, FiberStrand, EquipmentPort } from './types'
import type { NetworkConnectionFeatureCollection } from './connections.api'

export interface SharedProjectInfo {
  id: string
  name: string
  description: string | null
  organizationName: string
  expiresAt: string | null
}

const base = (token: string) => `/v1/public/share/${token}`

/** No auth at all — every call here is deliberately anonymous (see
 * shareToken.middleware.js on the backend), so `auth: false` skips both the
 * Authorization header and the 401-triggered token-refresh/logout flow. */
export const publicShareApi = {
  getProject: (token: string) => api.get<SharedProjectInfo>(base(token), { auth: false }),
  listAssets: (token: string) => api.get<FeatureCollection>(`${base(token)}/network-assets`, { auth: false }),
  listConnections: (token: string) => api.get<NetworkConnectionFeatureCollection>(`${base(token)}/network-connections`, { auth: false }),
  listStrands: (token: string, assetId: string) => api.get<FiberStrand[]>(`${base(token)}/network-assets/${assetId}/strands`, { auth: false }),
  listPorts: (token: string, assetId: string) => api.get<EquipmentPort[]>(`${base(token)}/network-assets/${assetId}/ports`, { auth: false }),
}
