import { api } from './client'
import type { AssetTypeField, Project, ProjectSurveyType, Symbology } from './types'
import type { Surveyor } from './fieldTeam.api'

export interface ProjectListParams {
  page?: number
  limit?: number
  status?: string
}

export interface ProjectPayload {
  name: string
  description?: string
  status?: 'active' | 'completed' | 'archived'
  surveyType?: ProjectSurveyType
  templateFields?: AssetTypeField[]
  photosRequired?: boolean
}

export const projectsApi = {
  list: (params: ProjectListParams = {}) => api.list<Project>('/v1/org/projects', { params }),
  get: (id: string) => api.get<Project>(`/v1/org/projects/${id}`),
  create: (payload: ProjectPayload) => api.post<Project>('/v1/org/projects', payload),
  update: (id: string, payload: Partial<ProjectPayload>) => api.patch<Project>(`/v1/org/projects/${id}`, payload),
  remove: (id: string) => api.del<null>(`/v1/org/projects/${id}`),
  getSymbologies: (id: string) => api.get<Symbology[]>(`/v1/org/projects/${id}/symbologies`),
  setSymbologies: (id: string, symbologyIds: string[]) => api.put<Symbology[]>(`/v1/org/projects/${id}/symbologies`, { symbologyIds }),
  getSurveyors: (id: string) => api.get<Surveyor[]>(`/v1/org/projects/${id}/surveyors`),
  setSurveyors: (id: string, surveyorIds: string[]) => api.put<Surveyor[]>(`/v1/org/projects/${id}/surveyors`, { surveyorIds }),
}
