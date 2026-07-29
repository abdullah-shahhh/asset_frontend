import type maplibregl from 'maplibre-gl'
import { lineString, point as turfPoint, nearestPointOnLine } from '@turf/turf'

export interface SnapResult {
  lngLat: [number, number]
}

const SNAP_PIXEL_RADIUS = 12

function pixelDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Nearest point on any rendered line/polygon edge within a fixed pixel
 * radius of a click — this naturally includes vertices, since the
 * mathematically closest point along a line lands exactly on a vertex
 * whenever the click is nearest to one, so no separate vertex-only search
 * is needed. Tolerance is checked in pixel space (not geo distance) so it
 * stays usable at any zoom level, not just whatever zoom it was tuned at.
 */
export function findSnapTarget(map: maplibregl.Map, screenPoint: { x: number; y: number }, layerIds: string[]): SnapResult | null {
  const layers = layerIds.filter((id) => map.getLayer(id))
  if (!layers.length) return null

  const bbox: [[number, number], [number, number]] = [
    [screenPoint.x - SNAP_PIXEL_RADIUS, screenPoint.y - SNAP_PIXEL_RADIUS],
    [screenPoint.x + SNAP_PIXEL_RADIUS, screenPoint.y + SNAP_PIXEL_RADIUS],
  ]
  const candidates = map.queryRenderedFeatures(bbox, { layers })
  if (!candidates.length) return null

  const clickLngLat = map.unproject([screenPoint.x, screenPoint.y])
  const clickPt = turfPoint([clickLngLat.lng, clickLngLat.lat])

  let best: { coords: [number, number]; distKm: number } | null = null
  for (const f of candidates) {
    if (!f.geometry) continue
    const lines: [number, number][][] =
      f.geometry.type === 'LineString'
        ? [f.geometry.coordinates as [number, number][]]
        : f.geometry.type === 'Polygon'
          ? (f.geometry.coordinates as [number, number][][])
          : []
    for (const coords of lines) {
      if (coords.length < 2) continue
      const nearest = nearestPointOnLine(lineString(coords), clickPt)
      const distKm = nearest.properties?.dist ?? Infinity
      if (!best || distKm < best.distKm) {
        best = { coords: nearest.geometry.coordinates as [number, number], distKm }
      }
    }
  }
  if (!best) return null

  const snappedPx = map.project(best.coords)
  if (pixelDistance(snappedPx, screenPoint) > SNAP_PIXEL_RADIUS) return null
  return { lngLat: best.coords }
}

/**
 * Round a lng/lat to the nearest grid intersection, spaced `stepMeters`
 * apart, using the same local equirectangular projection this app's own
 * area/distance math already uses (see MapDashboardPage's ringAreaSqMeters)
 * rather than pulling in a full geodesy library for one calculation.
 */
export function snapToGrid([lng, lat]: [number, number], stepMeters: number): [number, number] {
  if (stepMeters <= 0) return [lng, lat]
  const latRad = (lat * Math.PI) / 180
  const metersPerLngDeg = 111320 * Math.cos(latRad)
  const metersPerLatDeg = 110540
  const stepLng = stepMeters / metersPerLngDeg
  const stepLat = stepMeters / metersPerLatDeg
  return [Math.round(lng / stepLng) * stepLng, Math.round(lat / stepLat) * stepLat]
}
