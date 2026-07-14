import { api } from './client'
import type { Project } from './types'

export interface ProjectListParams {
  page?: number
  limit?: number
  status?: string
}

export interface ProjectPayload {
  name: string
  description?: string
  status?: 'active' | 'completed' | 'archived'
}

export const projectsApi = {
  list: (params: ProjectListParams = {}) => api.list<Project>('/v1/org/projects', { params }),
  get: (id: string) => api.get<Project>(`/v1/org/projects/${id}`),
  create: (payload: ProjectPayload) => api.post<Project>('/v1/org/projects', payload),
  update: (id: string, payload: Partial<ProjectPayload>) => api.patch<Project>(`/v1/org/projects/${id}`, payload),
  remove: (id: string) => api.del<null>(`/v1/org/projects/${id}`),
}
