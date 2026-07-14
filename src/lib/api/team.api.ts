import { api } from './client'

export interface TeamMember {
  id: string
  roleId: string
  firstName: string
  lastName: string | null
  email: string
  phone: string | null
  status: 'pending' | 'active' | 'suspended' | 'deleted'
  role?: { id: string; name: string; slug: string; isSuperAdmin: boolean }
  createdAt: string
}

export interface CreateTeamMemberPayload {
  firstName: string
  lastName?: string
  email: string
  password: string
  phone?: string
  roleId: string
}

const BASE = '/v1/org/users'

export const teamApi = {
  async list(params: { status?: string; roleId?: string; page?: number; limit?: number } = {}) {
    const { items, pagination } = await api.list<TeamMember>(BASE, { params })
    // The Team page manages org staff (admins/managers) — surveyors have
    // their own Field Team page even though both live in the same table.
    return { items: items.filter((u) => u.role?.slug !== 'surveyor'), pagination }
  },
  create: (payload: CreateTeamMemberPayload) => api.post<TeamMember>(BASE, payload),
  update: (id: string, payload: Partial<Omit<CreateTeamMemberPayload, 'password'>>) => api.patch<TeamMember>(`${BASE}/${id}`, payload),
  setStatus: (id: string, status: 'active' | 'suspended') => api.patch<TeamMember>(`${BASE}/${id}/status`, { status }),
  remove: (id: string) => api.del<null>(`${BASE}/${id}`),
}
