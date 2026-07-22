import { api } from './client'

export interface CustomerAsset {
  id: string
  assetType: string
  projectId: string
  project: { id: string; name: string } | null
  symbology: { id: string; name: string; color: string } | null
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  networkAssetId: string | null
  asset: CustomerAsset | null
  createdAt: string
  updatedAt: string
}

export interface CustomerPayload {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  networkAssetId?: string | null
}

export const customersApi = {
  list: (params: { page?: number; limit?: number; networkAssetId?: string } = {}) => api.list<Customer>('/v1/org/customers', { params }),
  get: (id: string) => api.get<Customer>(`/v1/org/customers/${id}`),
  create: (payload: CustomerPayload) => api.post<Customer>('/v1/org/customers', payload),
  update: (id: string, payload: Partial<CustomerPayload>) => api.patch<Customer>(`/v1/org/customers/${id}`, payload),
  remove: (id: string) => api.del<null>(`/v1/org/customers/${id}`),
}
