import { api } from './client'

export interface Surveyor {
  id: string
  firstName: string
  lastName: string | null
  email: string
  phone: string | null
  status: 'pending' | 'active' | 'suspended' | 'deleted'
  isSelfRegistered: boolean
  createdAt: string
}

export interface CreateSurveyorPayload {
  firstName: string
  lastName?: string
  email: string
  password: string
  phone?: string
}

export const fieldTeamApi = {
  list: (params: { status?: string; page?: number; limit?: number } = {}) =>
    api.list<Surveyor>('/v1/org/field-team', { params }),
  create: (payload: CreateSurveyorPayload) => api.post<Surveyor>('/v1/org/field-team', payload),
  approve: (id: string) => api.post<Surveyor>(`/v1/org/field-team/${id}/approve`),
  reject: (id: string) => api.post<null>(`/v1/org/field-team/${id}/reject`),
  setStatus: (id: string, status: 'active' | 'suspended') =>
    api.patch<Surveyor>(`/v1/org/field-team/${id}/status`, { status }),
  remove: (id: string) => api.del<null>(`/v1/org/field-team/${id}`),
  getJoinCode: () => api.get<{ joinCode: string }>('/v1/org/field-team/join-code'),
  regenerateJoinCode: () => api.post<{ joinCode: string }>('/v1/org/field-team/join-code/regenerate'),
}
