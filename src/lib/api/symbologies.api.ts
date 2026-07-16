import { api } from './client'
import type { GeometryType, Symbology } from './types'

export interface SymbologyPayload {
  name: string
  geometryType: GeometryType
  color: string
}

const BASE = '/v1/org/symbologies'

export const symbologiesApi = {
  list: () => api.get<Symbology[]>(BASE),
  create: (payload: SymbologyPayload) => api.post<Symbology>(BASE, payload),
  update: (id: string, payload: Partial<Pick<SymbologyPayload, 'name' | 'color'>>) => api.patch<Symbology>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.del<null>(`${BASE}/${id}`),
}
