import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { useQuery } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AlertTriangle, Cable, ChevronDown, ChevronRight, Clock, Eye, Layers, Moon, Radio, Sun, Waypoints, X } from 'lucide-react'
import { publicShareApi, type NetworkAssetFeature } from '../lib/api'
import { resolveSymbologyIcon } from '../lib/symbologyIcons'
import { TILES_BASE, mapifyitTransformRequest } from '../lib/maps'
import { Badge, Card, Spinner } from '../components/ui'

const FALLBACK_COLOR = '#64748b'

type BasemapStyle = 'dark' | 'bright'

const STRAND_STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  reserved: 'Reserved',
  in_service: 'In Service',
  dark: 'Dark',
  faulty: 'Faulty',
  under_test: 'Under Test',
  under_repair: 'Under Repair',
  retired: 'Retired',
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function paintMarker(el: HTMLDivElement, color: string, iconKey: string | null) {
  el.style.cssText = [
    'width:28px',
    'height:28px',
    'border-radius:9999px',
    `background:${color}`,
    'border:2.5px solid #ffffff',
    `box-shadow:0 0 0 4px ${hexToRgba(color, 0.2)}, 0 2px 6px rgba(0,0,0,.45)`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
  ].join(';')
  const Icon = resolveSymbologyIcon(iconKey)
  el.innerHTML = renderToStaticMarkup(<Icon size={13} color="#ffffff" strokeWidth={2.5} />)
}

function titleize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function timeLeft(iso: string | null): string {
  if (!iso) return 'never expires'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m left`
  if (hours < 24) return `${hours}h left`
  return `${Math.round(hours / 24)}d left`
}

export function SharedMapPage() {
  const { token } = useParams<{ token: string }>()
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const hasFitRef = useRef(false)
  // isStyleLoaded() flickers false while basemap tiles stream in — same
  // issue fixed in MapDashboardPage. Gate layer creation on the map's real
  // one-time 'load' event instead, tracked via this ref.
  const styleReadyRef = useRef(false)
  const runWhenStyleReady = (fn: () => void) => {
    const map = mapRef.current
    if (!map) return
    if (styleReadyRef.current) fn()
    else map.once('load', fn)
  }
  const [selected, setSelected] = useState<NetworkAssetFeature | null>(null)
  const [portsOpen, setPortsOpen] = useState(false)
  const [strandsOpen, setStrandsOpen] = useState(false)
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>('dark')

  function switchBasemap(style: BasemapStyle) {
    if (style === basemapStyle || !mapRef.current) return
    // setStyle() wipes every custom source/layer we've added — the render
    // effect below re-adds them once the new style is actually ready, gated
    // the same way as the very first load (isStyleLoaded() is unreliable
    // mid-tile-load, so wait for the real 'style.load' event instead).
    styleReadyRef.current = false
    mapRef.current.once('style.load', () => {
      styleReadyRef.current = true
    })
    mapRef.current.setStyle(`${TILES_BASE}/${style}`)
    setBasemapStyle(style)
  }

  const projectQuery = useQuery({ queryKey: ['share', token, 'project'], queryFn: () => publicShareApi.getProject(token!), enabled: !!token, retry: false })
  const assetsQuery = useQuery({ queryKey: ['share', token, 'assets'], queryFn: () => publicShareApi.listAssets(token!), enabled: !!token, retry: false })
  const strandsQuery = useQuery({
    queryKey: ['share', token, 'strands', selected?.id],
    queryFn: () => publicShareApi.listStrands(token!, selected!.id),
    enabled: !!token && !!selected && !!selected.properties.symbology?.isCable,
  })
  const portsQuery = useQuery({
    queryKey: ['share', token, 'ports', selected?.id],
    queryFn: () => publicShareApi.listPorts(token!, selected!.id),
    enabled: !!token && !!selected && !!selected.properties.symbology?.isEquipment,
  })

  const features = useMemo(() => assetsQuery.data?.features ?? [], [assetsQuery.data])

  const legend = useMemo(() => {
    const byName = new Map<string, { color: string; count: number }>()
    for (const f of features) {
      const name = f.properties.symbology?.name ?? f.properties.assetType.replace(/_/g, ' ')
      const entry = byName.get(name)
      if (entry) entry.count += 1
      else byName.set(name, { color: f.properties.color ?? FALLBACK_COLOR, count: 1 })
    }
    return Array.from(byName.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [features])

  useEffect(() => {
    setPortsOpen(false)
    setStrandsOpen(false)
  }, [selected?.id])

  // Map init — once.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: `${TILES_BASE}/dark`,
      bounds: [
        [-125, 24.5],
        [-66.9, 49.5],
      ],
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      transformRequest: (url) => mapifyitTransformRequest(url),
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    map.once('load', () => {
      styleReadyRef.current = true
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Render assets — polygons/lines as GL layers, points as icon markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !features.length) return

    const symbologyColor = ['coalesce', ['get', 'color'], FALLBACK_COLOR] as unknown as maplibregl.ExpressionSpecification
    const fc = { type: 'FeatureCollection', features } as unknown as GeoJSON.FeatureCollection

    const apply = () => {
      const existing = map.getSource('assets') as maplibregl.GeoJSONSource | undefined
      if (existing) {
        existing.setData(fc)
      } else {
        map.addSource('assets', { type: 'geojson', data: fc })
        map.addLayer({ id: 'assets-polygons', type: 'fill', source: 'assets', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': symbologyColor, 'fill-opacity': 0.3 } })
        map.addLayer({ id: 'assets-polygons-outline', type: 'line', source: 'assets', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': symbologyColor, 'line-width': 2 } })
        map.addLayer({ id: 'assets-lines-halo', type: 'line', source: 'assets', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': symbologyColor, 'line-width': 11, 'line-blur': 1.5, 'line-opacity': 0.22 } })
        map.addLayer({ id: 'assets-lines', type: 'line', source: 'assets', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': symbologyColor, 'line-width': 5 } })
        const layers = ['assets-lines', 'assets-polygons']
        map.on('click', (e) => {
          const hits = map.queryRenderedFeatures(e.point, { layers })
          const hit = hits.find((h) => h.geometry.type === 'LineString') ?? hits[0]
          if (!hit?.properties) return
          const full = features.find((f) => f.id === hit.properties!.id)
          if (full) setSelected(full)
        })
        layers.forEach((id) => {
          map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
          map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
        })
      }

      // Point markers.
      const seen = new Set<string>()
      for (const f of features) {
        if (f.geometry.type !== 'Point') continue
        seen.add(f.id)
        const [lng, lat] = f.geometry.coordinates as [number, number]
        const color = f.properties.color || FALLBACK_COLOR
        const existingMarker = markersRef.current.get(f.id)
        if (existingMarker) {
          existingMarker.setLngLat([lng, lat])
        } else {
          const el = document.createElement('div')
          paintMarker(el, color, f.properties.icon)
          el.onclick = (e) => {
            e.stopPropagation()
            setSelected(f)
          }
          const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
          markersRef.current.set(f.id, marker)
        }
      }
      for (const [id, marker] of markersRef.current.entries()) {
        if (!seen.has(id)) {
          marker.remove()
          markersRef.current.delete(id)
        }
      }

      // Fit to bounds once.
      const bounds = new maplibregl.LngLatBounds()
      let any = false
      for (const f of features) {
        const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates as [number, number]] : f.geometry.type === 'LineString' ? (f.geometry.coordinates as [number, number][]) : (f.geometry.coordinates as [number, number][][])[0]
        for (const c of coords) {
          bounds.extend(c)
          any = true
        }
      }
      if (any && !hasFitRef.current) {
        hasFitRef.current = true
        map.fitBounds(bounds, { padding: 80, duration: 0, maxZoom: 17 })
      }
    }

    runWhenStyleReady(apply)
  }, [features, basemapStyle])

  const attrs = (selected?.properties.attributes ?? {}) as Record<string, unknown>
  const customList = (attrs._custom as { label: string; value: string }[] | undefined) ?? []
  const rawAttrs = Object.entries(attrs).filter(([k]) => k !== '_custom' && !k.startsWith('fault'))

  if (projectQuery.isError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-slate-100 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-danger-600">
          <AlertTriangle size={24} />
        </span>
        <h1 className="text-lg font-bold text-ink">This link is invalid or has expired</h1>
        <p className="max-w-sm text-sm text-muted">Ask whoever shared it with you to generate a new one.</p>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white">
      <div ref={mapContainer} className="h-full w-full" />

      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-xl bg-ink/90 px-3.5 py-2 text-white shadow-lg backdrop-blur">
        <Eye size={15} className="text-primary-300" />
        <div>
          <div className="text-sm font-bold leading-tight">{projectQuery.data?.name ?? 'Loading…'}</div>
          <div className="text-[11px] leading-tight text-slate-300">{projectQuery.data?.organizationName} · read-only shared view</div>
        </div>
        {projectQuery.data && (
          <span className="ml-2 flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-200">
            <Clock size={11} />
            {timeLeft(projectQuery.data.expiresAt)}
          </span>
        )}
      </div>

      <div className="absolute left-4 top-16 z-20 flex overflow-hidden rounded-lg border border-white/10 bg-primary-950/95 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => switchBasemap('dark')}
          title="Dark basemap"
          className={`grid h-8 w-8 place-items-center transition-colors ${basemapStyle === 'dark' ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
        >
          <Moon size={14} />
        </button>
        <div className="w-px bg-white/10" />
        <button
          type="button"
          onClick={() => switchBasemap('bright')}
          title="Bright basemap"
          className={`grid h-8 w-8 place-items-center transition-colors ${basemapStyle === 'bright' ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
        >
          <Sun size={14} />
        </button>
      </div>

      {legend.length > 0 && !selected && (
        <Card className="absolute bottom-4 right-4 z-20 w-60 overflow-hidden !rounded-lg shadow-xl">
          <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Layers size={12} />
              Legend
            </span>
            <span className="text-[11px] font-semibold text-slate-400">{features.length} total</span>
          </div>
          <div className="max-h-72 overflow-y-auto px-3 py-2.5">
            <div className="space-y-1">
              {legend.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="tabular-nums text-slate-400">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {(projectQuery.isLoading || assetsQuery.isLoading) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
          <Spinner />
        </div>
      )}

      {selected && (
        <div className="absolute right-4 top-4 z-20 w-80">
          <Card className="overflow-hidden !rounded-lg shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.properties.color ?? FALLBACK_COLOR }} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold capitalize text-ink">{selected.properties.symbology?.name ?? selected.properties.assetType.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-muted">{selected.properties.geometryType}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/60" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
              <Badge tone={selected.properties.status === 'approved' ? 'success' : selected.properties.status === 'rejected' ? 'danger' : 'warning'} className="mb-3">
                {selected.properties.status}
              </Badge>

              {selected.properties.symbology?.isEquipment && (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Radio size={12} />
                    Equipment
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selected.properties.operationalStatus && <Badge tone="neutral">{selected.properties.operationalStatus}</Badge>}
                    {selected.properties.ipAddress && <span className="text-muted">IP {selected.properties.ipAddress}</span>}
                  </div>
                  {portsQuery.data && portsQuery.data.length > 0 && (
                    <div className="mt-2">
                      <button type="button" onClick={() => setPortsOpen((v) => !v)} className="flex w-full items-center justify-between gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Waypoints size={12} />
                          Ports ({portsQuery.data.length})
                        </span>
                        {portsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      {portsOpen && (
                        <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
                          {portsQuery.data.map((p) => (
                            <div key={p.id} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-100">
                              <span className="font-semibold text-ink">Port {p.portNumber}</span>
                              <Badge tone={p.status === 'connected' ? 'success' : 'neutral'}>{p.status === 'connected' ? 'Connected' : 'Free'}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selected.properties.symbology?.isCable && strandsQuery.data && strandsQuery.data.length > 0 && (
                <div className="mb-3">
                  <button type="button" onClick={() => setStrandsOpen((v) => !v)} className="flex w-full items-center justify-between gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Cable size={12} />
                      Strands ({strandsQuery.data.length})
                    </span>
                    {strandsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {strandsOpen && (
                    <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
                      {strandsQuery.data.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: s.color.toLowerCase() }} />
                            <span className="font-semibold text-ink">#{s.strandNumber}</span>
                            <span className="text-muted">Tube {s.tubeNumber}</span>
                          </div>
                          <Badge tone="neutral">{STRAND_STATUS_LABEL[s.status] ?? s.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(rawAttrs.length > 0 || customList.length > 0) && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Attributes</div>
                  <div className="space-y-1 text-xs">
                    {rawAttrs.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-muted">{titleize(k)}</span>
                        <span className="text-right font-medium text-ink">{String(v)}</span>
                      </div>
                    ))}
                    {customList.map((c, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="text-muted">{c.label}</span>
                        <span className="text-right font-medium text-ink">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
