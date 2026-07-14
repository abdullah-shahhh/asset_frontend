/**
 * Shared MapifyIT map config — same tile proxy + basemap used across the
 * MapifyIT product family (dispatcher client panel, tracking pages). Tiles
 * are served through the MapifyIT proxy, authenticated with a bearer token
 * via `transformRequest`.
 */
export const MAPIFYIT_TOKEN =
  (import.meta.env.VITE_MAPIFYIT_TOKEN as string | undefined) ??
  'mfy_c7ee82a354e708f29eeb546fc36519b999db8c637d284ebf'

export const TILES_BASE = 'https://client.mapifyit.com/api/v1/proxy/tiles'
export const BASEMAP_STYLE = `${TILES_BASE}/dark`

/** Attach the MapifyIT bearer token to tile/style requests. */
export function mapifyitTransformRequest(url: string): { url: string; headers?: Record<string, string> } | undefined {
  if (url.startsWith(TILES_BASE) || url.includes('mapifyit.com')) {
    return { url, headers: { Authorization: `Bearer ${MAPIFYIT_TOKEN}` } }
  }
  return undefined
}
