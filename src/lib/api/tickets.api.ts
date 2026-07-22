import { api } from './client'

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Ticket {
  id: string
  customerId: string
  customer: { id: string; name: string; email: string | null; networkAssetId: string | null } | null
  subject: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  updatedAt: string
}

export interface TicketPayload {
  customerId: string
  subject: string
  description?: string | null
  status?: TicketStatus
  priority?: TicketPriority
}

export const ticketsApi = {
  list: (params: { page?: number; limit?: number; customerId?: string; status?: TicketStatus } = {}) => api.list<Ticket>('/v1/org/tickets', { params }),
  get: (id: string) => api.get<Ticket>(`/v1/org/tickets/${id}`),
  create: (payload: TicketPayload) => api.post<Ticket>('/v1/org/tickets', payload),
  update: (id: string, payload: Partial<Omit<TicketPayload, 'customerId'>>) => api.patch<Ticket>(`/v1/org/tickets/${id}`, payload),
  remove: (id: string) => api.del<null>(`/v1/org/tickets/${id}`),
}
