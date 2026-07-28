import { api } from './client'

export interface ShareLink {
  id: string
  projectId: string
  label: string | null
  url: string
  expiresAt: string | null
  revokedAt: string | null
  isActive: boolean
  viewCount: number
  lastViewedAt: string | null
  createdAt: string
}

export interface ShareLinkPayload {
  projectId: string
  /** null = never expires ("forever, until I revoke it"). */
  expiresInHours: number | null
  label?: string
}

const BASE = '/v1/org/share-links'

export const shareLinksApi = {
  list: (projectId: string) => api.get<ShareLink[]>(BASE, { params: { projectId } }),
  create: (payload: ShareLinkPayload) => api.post<ShareLink>(BASE, payload),
  revoke: (id: string) => api.del<null>(`${BASE}/${id}`),
}
