import shp from 'shpjs'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import DxfParser, { type IPointEntity, type ILineEntity, type ILwpolylineEntity, type IPolylineEntity } from 'dxf-parser'
import type { FeatureCollection, Geometry } from 'geojson'
import { stripZ, collapseMultiPart } from './geojsonUtils'
import type { GeoJsonGeometry, GeometryType } from './api/types'

export interface ParsedFeature {
  geometry: GeoJsonGeometry
}

export interface ParseResult {
  features: ParsedFeature[]
  /** Features dropped for not matching the target geometry type, or too
   * degenerate to use (e.g. a 1-point line). */
  skipped: number
  /** Set when a Multi* geometry had to be collapsed to its largest part —
   * see geojsonUtils.collapseMultiPart; this app's GeometryType union and
   * backend schema only support single-part geometry. */
  warning?: string
}

function flattenCoords(coords: unknown): [number, number][] {
  if (Array.isArray(coords) && typeof coords[0] === 'number') return [coords as [number, number]]
  return (coords as unknown[]).flatMap(flattenCoords)
}

/** A shapefile with a missing/unresolvable .prj can produce huge-magnitude
 * un-reprojected coordinates instead of throwing — this catches that before
 * the import is offered up for review, rather than silently importing
 * garbage. */
function assertPlausibleCoordinates(features: ParsedFeature[]) {
  for (const { geometry } of features) {
    for (const [lng, lat] of flattenCoords(geometry.coordinates)) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new Error('Coordinate system could not be determined — the file may be missing a valid .prj, or use a projection this importer cannot resolve.')
      }
    }
  }
}

function normalizeFeatureCollection(fc: FeatureCollection, targetType: GeometryType): ParseResult {
  let skipped = 0
  let warning: string | undefined
  const features: ParsedFeature[] = []
  for (const f of fc.features) {
    if (!f.geometry) {
      skipped++
      continue
    }
    let geom: Geometry = f.geometry
    if (geom.type.startsWith('Multi')) {
      const collapsed = collapseMultiPart(geom)
      geom = collapsed.geometry as unknown as Geometry
      warning = collapsed.warning ?? warning
    }
    if (geom.type !== targetType) {
      skipped++
      continue
    }
    features.push({ geometry: stripZ(geom as unknown as GeoJsonGeometry) })
  }
  return { features, skipped, warning }
}

/** Shapefiles arrive as a .zip (shp+dbf+prj+cpg) or a raw buffer; shpjs
 * unzips and reprojects to WGS84 via the .prj in-browser. A zip containing
 * multiple shapefiles (e.g. points.shp + lines.shp) resolves to an array —
 * every layer is merged and filtered down to the target geometry type. */
export async function parseShapefile(file: File, targetType: GeometryType): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const parsed = await shp(buffer)
  const collections = Array.isArray(parsed) ? parsed : [parsed]

  let skipped = 0
  let warning: string | undefined
  const features: ParsedFeature[] = []
  for (const fc of collections) {
    const result = normalizeFeatureCollection(fc, targetType)
    features.push(...result.features)
    skipped += result.skipped
    warning = result.warning ?? warning
  }
  assertPlausibleCoordinates(features)
  return { features, skipped, warning }
}

export async function parseKML(file: File, targetType: GeometryType): Promise<ParseResult> {
  const text = await file.text()
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const fc = kmlToGeoJSON(doc) as unknown as FeatureCollection
  const result = normalizeFeatureCollection(fc, targetType)
  assertPlausibleCoordinates(result.features)
  return result
}

export interface DxfGeoreference {
  originLng: number
  originLat: number
  rotationDeg: number
  /** Scale factor converting DXF drawing units to meters. */
  scaleToMeters: number
}

/** DXF has no CRS at all — coordinates are arbitrary local drawing units,
 * not lng/lat — so every point is rotated and scaled from the drawing's own
 * (0,0) origin, then offset to the real-world origin the user supplies. This
 * is a planning-grade placement, not a survey-grade georeference. */
function projectDxfPoint(x: number, y: number, geo: DxfGeoreference): [number, number] {
  const rad = (geo.rotationDeg * Math.PI) / 180
  const rx = x * Math.cos(rad) - y * Math.sin(rad)
  const ry = x * Math.sin(rad) + y * Math.cos(rad)
  const metersX = rx * geo.scaleToMeters
  const metersY = ry * geo.scaleToMeters
  const latRad = (geo.originLat * Math.PI) / 180
  const dLng = metersX / (111320 * Math.cos(latRad))
  const dLat = metersY / 110540
  return [geo.originLng + dLng, geo.originLat + dLat]
}

/** Tessellates DXF POINT/LINE/LWPOLYLINE/POLYLINE entities into this app's
 * three supported geometry types. Arcs, splines, and other curve entities
 * aren't handled — they'd need their own tessellation into line segments,
 * out of scope for a first pass. */
export async function parseDXF(file: File, targetType: GeometryType, geo: DxfGeoreference): Promise<ParseResult> {
  const text = await file.text()
  const dxf = new DxfParser().parseSync(text)
  if (!dxf) throw new Error('Could not parse this DXF file')

  const features: ParsedFeature[] = []
  let skipped = 0

  for (const entity of dxf.entities ?? []) {
    if (entity.type === 'POINT' && targetType === 'Point') {
      const e = entity as IPointEntity
      features.push({ geometry: { type: 'Point', coordinates: projectDxfPoint(e.position.x, e.position.y, geo) } })
    } else if (entity.type === 'LINE' && targetType === 'LineString') {
      const e = entity as ILineEntity
      if (e.vertices.length < 2) {
        skipped++
        continue
      }
      features.push({ geometry: { type: 'LineString', coordinates: e.vertices.map((v) => projectDxfPoint(v.x, v.y, geo)) } })
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const e = entity as ILwpolylineEntity | IPolylineEntity
      const points = e.vertices.map((v) => projectDxfPoint(v.x, v.y, geo))
      if (e.shape && targetType === 'Polygon' && points.length >= 3) {
        const ring = [...points, points[0]]
        features.push({ geometry: { type: 'Polygon', coordinates: [ring] } })
      } else if (!e.shape && targetType === 'LineString' && points.length >= 2) {
        features.push({ geometry: { type: 'LineString', coordinates: points } })
      } else {
        skipped++
      }
    } else {
      skipped++
    }
  }
  assertPlausibleCoordinates(features)
  return { features, skipped }
}
