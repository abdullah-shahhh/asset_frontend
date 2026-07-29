import {
  buffer as turfBuffer,
  lineOffset as turfLineOffset,
  difference as turfDifference,
  intersect as turfIntersect,
  kinks as turfKinks,
  featureCollection,
  transformRotate,
  transformScale,
  centroid as turfCentroid,
} from '@turf/turf'
import type { Feature, LineString, Point, Polygon } from 'geojson'
import type { GeoJsonGeometry } from './api/types'
import { collapseMultiPart, stripZ, type CollapseResult } from './geojsonUtils'

export type LengthUnit = 'feet' | 'meters'

function toKm(distance: number, unit: LengthUnit): number {
  const meters = unit === 'feet' ? distance / 3.28084 : distance
  return meters / 1000
}

/** Buffer any geometry by a distance, producing a Polygon — right-of-way
 * corridors, proximity halos around equipment, etc. */
export function bufferGeometry(geometry: GeoJsonGeometry, distance: number, unit: LengthUnit): CollapseResult {
  if (distance <= 0) throw new Error('Buffer distance must be greater than zero')
  const km = toKm(distance, unit)
  const result = turfBuffer(geometry as unknown as Point | LineString | Polygon, km, { units: 'kilometers' })
  if (!result) throw new Error('Buffer produced no geometry')
  const collapsed = collapseMultiPart(result.geometry)
  return { geometry: stripZ(collapsed.geometry), warning: collapsed.warning }
}

/** Offset a line by a distance — parallel duct routes run alongside an
 * existing cable without redrawing it from scratch. Positive distance
 * offsets to the left of the line's direction, negative to the right. */
export function offsetLine(geometry: GeoJsonGeometry, distance: number, unit: LengthUnit): CollapseResult {
  if (geometry.type !== 'LineString') throw new Error('Offset requires a line')
  if (distance === 0) throw new Error('Offset distance must not be zero')
  const km = toKm(distance, unit)
  const result = turfLineOffset(geometry as unknown as LineString, km, { units: 'kilometers' })
  const collapsed = collapseMultiPart(result.geometry)
  return { geometry: stripZ(collapsed.geometry), warning: collapsed.warning }
}

export type ClipMode = 'intersect' | 'difference'

/** Clip one polygon against another — trims a survey area to a right-of-way
 * boundary, or carves a boundary out of an existing area. `subject` is the
 * shape being kept/trimmed; `clipWith` is the boundary applied to it. */
export function clipPolygon(subject: GeoJsonGeometry, clipWith: GeoJsonGeometry, mode: ClipMode): CollapseResult {
  if (subject.type !== 'Polygon' || clipWith.type !== 'Polygon') throw new Error('Clip requires two polygons')

  const subjectFeature: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: subject as unknown as Polygon }
  const clipFeature: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: clipWith as unknown as Polygon }

  // Nothing in this app validates drawn/imported polygon geometry today, so
  // a self-intersecting ("bowtie") ring would otherwise surface as a raw
  // turf exception or a silently wrong result.
  if (turfKinks(subjectFeature).features.length || turfKinks(clipFeature).features.length) {
    throw new Error('One of the polygons is self-intersecting — fix its vertices before clipping.')
  }

  const fc = featureCollection([subjectFeature, clipFeature])
  const result = mode === 'intersect' ? turfIntersect(fc) : turfDifference(fc)
  if (!result) throw new Error(mode === 'intersect' ? 'The two polygons do not overlap' : 'Clipping left nothing behind')

  const collapsed = collapseMultiPart(result.geometry)
  return { geometry: stripZ(collapsed.geometry), warning: collapsed.warning }
}

/** Rotate any geometry around its own centroid. Positive angle is clockwise. */
export function rotateGeometry(geometry: GeoJsonGeometry, angleDeg: number): CollapseResult {
  if (!angleDeg) throw new Error('Rotation angle must not be zero')
  // Omitting `pivot` defaults to the geometry's own centroid.
  const rotated = transformRotate(geometry as unknown as Point | LineString | Polygon, angleDeg)
  const collapsed = collapseMultiPart(rotated as unknown as Parameters<typeof collapseMultiPart>[0])
  return { geometry: stripZ(collapsed.geometry), warning: collapsed.warning }
}

/** Scale any geometry from its own centroid. factor > 1 grows it, < 1 shrinks it. */
export function scaleGeometry(geometry: GeoJsonGeometry, factor: number): CollapseResult {
  if (factor <= 0) throw new Error('Scale factor must be greater than zero')
  const scaled = transformScale(geometry as unknown as Point | LineString | Polygon, factor, { origin: 'centroid' })
  const collapsed = collapseMultiPart(scaled as unknown as Parameters<typeof collapseMultiPart>[0])
  return { geometry: stripZ(collapsed.geometry), warning: collapsed.warning }
}

export type MirrorAxis = 'horizontal' | 'vertical'

/** Mirror any geometry across a horizontal or vertical line through its own
 * centroid — a "flip", not a reflection across an arbitrary user-drawn
 * line, so it's a single-click operation like Buffer/Rotate/Scale rather
 * than a two-step draw-a-mirror-line flow like Clip. */
export function mirrorGeometry(geometry: GeoJsonGeometry, axis: MirrorAxis): CollapseResult {
  if (geometry.type === 'Point') throw new Error('A single point has nothing to mirror across')
  const [cLng, cLat] = turfCentroid(geometry as unknown as Point | LineString | Polygon).geometry.coordinates
  const reflect = ([lng, lat]: number[]): [number, number] => (axis === 'vertical' ? [2 * cLng - lng, lat] : [lng, 2 * cLat - lat])

  const mirrored: GeoJsonGeometry =
    geometry.type === 'LineString'
      ? { type: 'LineString', coordinates: (geometry.coordinates as number[][]).map(reflect) }
      : { type: 'Polygon', coordinates: (geometry.coordinates as number[][][]).map((ring) => ring.map(reflect)) }

  return { geometry: stripZ(mirrored) }
}
