import { api } from './client'

export interface OrgRole {
  id: string
  name: string
  slug: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  isActive: boolean
  permissions?: { id: string; key: string; group: string; label: string | null }[]
}

export interface RolePayload {
  name: string
  description?: string
  permissionKeys?: string[]
}

const BASE = '/v1/org/roles'

export const rolesApi = {
  listPermissions: () => api.get<Record<string, { key: string; group: string; label: string }[]>>(`${BASE}/permissions`),
  list: (params: { page?: number; limit?: number } = {}) => api.list<OrgRole>(BASE, { params }),
  create: (payload: RolePayload) => api.post<OrgRole>(BASE, payload),
  update: (id: string, payload: Partial<RolePayload & { isActive: boolean }>) => api.patch<OrgRole>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.del<null>(`${BASE}/${id}`),
}
