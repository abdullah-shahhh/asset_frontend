import { api } from './client'
import type { FeatureCollection } from './types'

export const exportApi = {
  projectGeoJSON: (projectId: string) => api.get<FeatureCollection>(`/v1/org/export/projects/${projectId}/geojson`),
}

/** Trigger a browser download of a GeoJSON FeatureCollection. */
export function downloadGeoJSON(data: FeatureCollection, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.geojson') ? filename : `${filename}.geojson`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
