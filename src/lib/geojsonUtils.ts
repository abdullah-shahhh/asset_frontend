import { area as turfArea, length as turfLength } from '@turf/turf'
import type { Geometry } from 'geojson'
import type { GeoJsonGeometry } from './api/types'

/**
 * Strip a Z/altitude value from every coordinate, keeping only [lng, lat] —
 * this app's backend geometry schema is strictly 2D
 * (Joi.array().items(Joi.number()).length(2), no Z), so any 3D input
 * (imported files, a turf result) must be flattened before it can be saved.
 */
export function stripZ(geometry: GeoJsonGeometry): GeoJsonGeometry {
  const strip2 = (c: number[]): [number, number] => [c[0], c[1]]
  if (geometry.type === 'Point') {
    return { type: 'Point', coordinates: strip2(geometry.coordinates as number[]) }
  }
  if (geometry.type === 'LineString') {
    return { type: 'LineString', coordinates: (geometry.coordinates as number[][]).map(strip2) }
  }
  return { type: 'Polygon', coordinates: (geometry.coordinates as number[][][]).map((ring) => ring.map(strip2)) }
}

export interface CollapseResult {
  geometry: GeoJsonGeometry
  warning?: string
}

/**
 * Collapse a Multi* result down to its single largest part. Neither this
 * app's GeometryType union nor the backend's Joi schema/PostGIS column
 * support MultiPolygon/MultiLineString/MultiPoint — only single-part
 * Point/LineString/Polygon — so any geometry operation whose natural output
 * could be multi-part (a polygon clip splitting into disjoint pieces) must
 * resolve to one part before it can be submitted as a new asset. Extending
 * the schema to Multi* would cascade into 15+ call sites and the DB column,
 * so keeping the largest part (by area for polygons, by length for lines)
 * is the deliberately simpler choice here.
 */
export function collapseMultiPart(geom: Geometry): CollapseResult {
  if (geom.type === 'Polygon') return { geometry: geom as unknown as GeoJsonGeometry }
  if (geom.type === 'LineString') return { geometry: geom as unknown as GeoJsonGeometry }

  if (geom.type === 'MultiPolygon') {
    let best = geom.coordinates[0]
    let bestArea = -Infinity
    for (const coords of geom.coordinates) {
      const a = turfArea({ type: 'Polygon', coordinates: coords })
      if (a > bestArea) {
        bestArea = a
        best = coords
      }
    }
    const warning = geom.coordinates.length > 1 ? `Result was split into ${geom.coordinates.length} pieces — kept only the largest.` : undefined
    return { geometry: { type: 'Polygon', coordinates: best } as GeoJsonGeometry, warning }
  }

  if (geom.type === 'MultiLineString') {
    let best = geom.coordinates[0]
    let bestLength = -Infinity
    for (const coords of geom.coordinates) {
      const l = turfLength({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
      if (l > bestLength) {
        bestLength = l
        best = coords
      }
    }
    const warning = geom.coordinates.length > 1 ? `Result was split into ${geom.coordinates.length} pieces — kept only the longest.` : undefined
    return { geometry: { type: 'LineString', coordinates: best } as GeoJsonGeometry, warning }
  }

  throw new Error(`Unsupported geometry type: ${geom.type}`)
}
