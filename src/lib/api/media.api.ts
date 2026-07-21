import { api } from './client'

export interface MediaAttachment {
  id: string
  networkAssetId: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export const mediaApi = {
  upload: (networkAssetId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('networkAssetId', networkAssetId)
    return api.post<MediaAttachment>('/v1/org/media', form)
  },
  listForAsset: (networkAssetId: string) => api.get<MediaAttachment[]>(`/v1/org/media/asset/${networkAssetId}`),
}
