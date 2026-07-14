import { api } from './client'
import type { Branding } from '../../theme/branding'

export interface BrandingPayload {
  primaryColor?: string | null
  secondaryColor?: string | null
  textPrimaryColor?: string | null
  textSecondaryColor?: string | null
}

export const brandingApi = {
  get: () => api.get<Branding>('/v1/org/branding'),
  update: (payload: BrandingPayload) => api.patch<Branding>('/v1/org/branding', payload),
  async uploadLogo(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<Branding>('/v1/org/branding/logo', form)
  },
}
