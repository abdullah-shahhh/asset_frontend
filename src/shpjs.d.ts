// shpjs ships no TypeScript declarations of its own (no "types" field in its
// package.json). This covers only the subset of its API this app actually
// uses — see https://github.com/calvinmetcalf/shapefile-js#api for the rest.
declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'

  export default function shp(base: string | ArrayBuffer | ArrayBufferView, whiteList?: string[]): Promise<(FeatureCollection & { fileName?: string }) | (FeatureCollection & { fileName: string })[]>
}
