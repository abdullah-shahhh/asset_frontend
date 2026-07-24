import { api } from './client'
import type { EquipmentPort, FiberSplice, FiberStrand, FiberTraceResult, PortStatus, SpliceEndpointRef, StrandRole, StrandStatus } from './types'

export const strandsApi = {
  generate: (assetId: string, strandCount: number) =>
    api.post<FiberStrand[]>(`/v1/org/network-assets/${assetId}/strands/generate`, { strandCount }),
  list: (assetId: string) => api.get<FiberStrand[]>(`/v1/org/network-assets/${assetId}/strands`),
  update: (assetId: string, strandId: string, payload: { status?: StrandStatus; role?: StrandRole | null; assignedCustomerId?: string | null; notes?: string | null }) =>
    api.patch<FiberStrand>(`/v1/org/network-assets/${assetId}/strands/${strandId}`, payload),
}

export const portsApi = {
  generate: (assetId: string, portCount: number) =>
    api.post<EquipmentPort[]>(`/v1/org/network-assets/${assetId}/ports/generate`, { portCount }),
  list: (assetId: string) => api.get<EquipmentPort[]>(`/v1/org/network-assets/${assetId}/ports`),
  update: (assetId: string, portId: string, payload: { status?: PortStatus; notes?: string | null }) =>
    api.patch<EquipmentPort>(`/v1/org/network-assets/${assetId}/ports/${portId}`, payload),
}

export const fiberSplicesApi = {
  listForProject: (projectId: string) => api.get<FiberSplice[]>('/v1/org/fiber-splices', { params: { projectId } }),
  create: (payload: { projectId: string; spliceAssetId?: string | null; endA: SpliceEndpointRef; endB: SpliceEndpointRef; notes?: string }) =>
    api.post<FiberSplice>('/v1/org/fiber-splices', payload),
  remove: (id: string) => api.del<null>(`/v1/org/fiber-splices/${id}`),
  trace: (params: { strandId?: string; portId?: string }) => api.get<FiberTraceResult>('/v1/org/fiber-splices/trace', { params }),
}
