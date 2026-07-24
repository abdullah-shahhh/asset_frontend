import { api } from './client'
import type { AssetTypeField, GeometryType, Symbology } from './types'

export interface SymbologyPayload {
  name: string
  geometryType: GeometryType
  color: string
  icon?: string | null
  isEquipment?: boolean
  isCable?: boolean
  fields?: AssetTypeField[]
}

const BASE = '/v1/org/symbologies'

export const symbologiesApi = {
  list: () => api.get<Symbology[]>(BASE),
  create: (payload: SymbologyPayload) => api.post<Symbology>(BASE, payload),
  update: (id: string, payload: Partial<Pick<SymbologyPayload, 'name' | 'color' | 'icon' | 'isEquipment' | 'isCable' | 'fields'>>) => api.patch<Symbology>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.del<null>(`${BASE}/${id}`),
  async uploadIcon(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<Symbology>(`${BASE}/${id}/icon`, form)
  },
  removeIcon: (id: string) => api.del<Symbology>(`${BASE}/${id}/icon`),
}
