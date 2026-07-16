import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  MapPin,
  Spline,
  Square,
  Undo2,
  Check,
  X,
  Upload,
  Download,
  ThumbsUp,
  ThumbsDown,
  Map as MapIcon,
  Minimize2,
  Crosshair,
  Layers,
  FolderKanban,
  WifiOff,
  RotateCw,
} from 'lucide-react'
import {
  networkAssetsApi,
  projectsApi,
  exportApi,
  downloadGeoJSON,
  ApiError,
  type GeoJsonGeometry,
  type GeometryType,
  type NetworkAssetFeature,
} from '../lib/api'
import { BASEMAP_STYLE, mapifyitTransformRequest } from '../lib/maps'
import { Badge, Button, Card, Modal, Select, Spinner, Textarea, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { cn } from '../lib/cn'

const FALLBACK_COLOR = '#64748b'
const GEOMETRY_LABEL: Record<GeometryType, string> = { Point: 'Point', LineString: 'Line', Polygon: 'Polygon' }

type Tool = 'point' | 'line' | 'polygon' | null

export function MapDashboardPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { hasPermission } = useAuth()
  const canApprove = hasPermission('assets.approve')

  // Landing gate — the workspace only becomes interactive once launched, with
  // a brief "booting up" transition in between (like opening real software).
  const [entered, setEntered] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launchWide, setLaunchWide] = useState(false)

  // Which project's symbologies the draw tools currently offer.
  const [activeProjectId, setActiveProjectId] = useState('')

  // Drawing state.
  const [tool, setTool] = useState<Tool>(null)
  const [linePoints, setLinePoints] = useState<[number, number][]>([])
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonGeometry | null>(null)

  // Submission form state.
  const [symbologyId, setSymbologyId] = useState('')
  const [notes, setNotes] = useState('')

  // Selected existing feature (review panel).
  const [selectedFeature, setSelectedFeature] = useState<NetworkAssetFeature | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  // Status-bar telemetry.
  const [cursorLngLat, setCursorLngLat] = useState<{ lng: number; lat: number } | null>(null)
  const [zoom, setZoom] = useState(13)

  // Set if the basemap fails to load (e.g. a network blip) — MapLibre doesn't
  // retry on its own, so without this the map just stays blank forever.
  const [mapError, setMapError] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  // Bumped whenever a new Map instance is constructed, so effects that add
  // sources/layers (keyed on data, not on map readiness) know to re-run.
  const [mapVersion, setMapVersion] = useState(0)

  const assetsQuery = useQuery({
    queryKey: ['network-assets', 'map'],
    queryFn: () => networkAssetsApi.list({ limit: 500 }),
  })
  const projectsQuery = useQuery({ queryKey: ['projects', 'all'], queryFn: () => projectsApi.list({ limit: 100 }) })
  const projectSymbologiesQuery = useQuery({
    queryKey: ['projects', activeProjectId, 'symbologies'],
    queryFn: () => projectsApi.getSymbologies(activeProjectId),
    enabled: !!activeProjectId,
  })

  const activeProject = (projectsQuery.data?.items ?? []).find((p) => p.id === activeProjectId)
  const projectSymbologies = activeProjectId ? projectSymbologiesQuery.data ?? [] : []
  const pointSymbologies = projectSymbologies.filter((s) => s.geometryType === 'Point')
  const lineSymbologies = projectSymbologies.filter((s) => s.geometryType === 'LineString')
  const polygonSymbologies = projectSymbologies.filter((s) => s.geometryType === 'Polygon')
  const eligibleSymbologies = draftGeometry?.type === 'LineString' ? lineSymbologies : draftGeometry?.type === 'Polygon' ? polygonSymbologies : pointSymbologies

  const invalidateAssets = () => queryClient.invalidateQueries({ queryKey: ['network-assets'] })

  const createAsset = useMutation({
    mutationFn: () => {
      if (!draftGeometry || !symbologyId || !activeProjectId) throw new Error('Missing fields')
      return networkAssetsApi.create({ projectId: activeProjectId, symbologyId, geometry: draftGeometry, attributes: notes ? { notes } : {} })
    },
    onSuccess: () => {
      push('Asset submitted for review', 'success')
      resetDrawing()
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to submit asset', 'error'),
  })

  const approve = useMutation({
    mutationFn: (id: string) => networkAssetsApi.approve(id),
    onSuccess: () => {
      push('Asset approved', 'success')
      setSelectedFeature(null)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to approve', 'error'),
  })
  const reject = useMutation({
    mutationFn: (id: string) => networkAssetsApi.reject(id, 'Rejected from map'),
    onSuccess: () => {
      push('Asset rejected', 'success')
      setSelectedFeature(null)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to reject', 'error'),
  })

  function resetDrawing() {
    setTool(null)
    setLinePoints([])
    setDraftGeometry(null)
    setSymbologyId('')
    setNotes('')
  }

  function launchWorkspace() {
    createMap()
    setLaunching(true)
    setLaunchWide(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setLaunchWide(true)))
    window.setTimeout(() => {
      setLaunching(false)
      setEntered(true)
    }, 750)
  }

  function exitWorkspace() {
    resetDrawing()
    setSelectedFeature(null)
    setEntered(false)
  }

  function finishShape() {
    if (tool === 'line' && linePoints.length >= 2) {
      setDraftGeometry({ type: 'LineString', coordinates: linePoints })
    } else if (tool === 'polygon' && linePoints.length >= 3) {
      setDraftGeometry({ type: 'Polygon', coordinates: [[...linePoints, linePoints[0]]] })
    }
  }
  function undoLinePoint() {
    setLinePoints((pts) => pts.slice(0, -1))
  }
  function toggleTool(next: Exclude<Tool, null>) {
    const wasActive = tool === next
    resetDrawing()
    setSelectedFeature(null)
    if (!wasActive) setTool(next)
  }

  // Fetching a map/style the user hasn't asked for yet is wasted bandwidth —
  // the map is only ever constructed from launchWorkspace()/retryMap(), never
  // eagerly on mount. This effect only tears one down on unmount.
  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  function createMap() {
    if (!mapContainer.current || mapRef.current) return
    setMapError(false)
    setMapLoading(true)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: [-122.4194, 37.7749],
      zoom: 13,
      attributionControl: false,
      transformRequest: (url) => mapifyitTransformRequest(url),
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-left')
    map.on('mousemove', (e) => setCursorLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    map.on('mouseout', () => setCursorLngLat(null))
    map.on('zoom', () => setZoom(map.getZoom()))
    map.on('load', () => {
      setMapError(false)
      setMapLoading(false)
    })
    // A tile-level 404 is normal at the edges of coverage; only surface an
    // error banner when the basemap itself never finished loading.
    map.on('error', () => {
      if (!map.isStyleLoaded()) {
        setMapError(true)
        setMapLoading(false)
      }
    })
    mapRef.current = map
    setMapVersion((v) => v + 1)
    armLoadTimeout()
  }

  // Belt-and-braces: if the style fetch just hangs (no error, no load event —
  // e.g. a stalled connection) rather than failing outright, don't leave the
  // user staring at a blank map forever.
  function armLoadTimeout() {
    window.setTimeout(() => {
      if (!mapRef.current?.isStyleLoaded()) {
        setMapError(true)
        setMapLoading(false)
      }
    }, 12000)
  }

  function retryMap() {
    setMapError(false)
    if (mapRef.current) {
      setMapLoading(true)
      mapRef.current.setStyle(BASEMAP_STYLE)
      armLoadTimeout()
    } else {
      createMap()
    }
  }

  // The toolbar/status bar dock in and out of layout on launch/exit — nudge
  // MapLibre to recompute its canvas size once that settles.
  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.resize(), 60)
    return () => window.clearTimeout(id)
  }, [entered])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (tool || draftGeometry) resetDrawing()
        else if (selectedFeature) setSelectedFeature(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, draftGeometry, selectedFeature])

  // Map click behaviour depends on the active tool.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvasContainer()
    canvas.style.cursor = tool ? 'crosshair' : ''

    function onClick(e: maplibregl.MapMouseEvent) {
      if (tool === 'point' && !draftGeometry) {
        setDraftGeometry({ type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] })
      } else if ((tool === 'line' || tool === 'polygon') && !draftGeometry) {
        setLinePoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]])
      }
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draftGeometry])

  // Existing (submitted) assets layer — clicking one opens the review panel.
  useEffect(() => {
    const map = mapRef.current
    const fc = assetsQuery.data?.featureCollection
    if (!map || !fc) return

    const symbologyColor = ['coalesce', ['get', 'color'], FALLBACK_COLOR] as unknown as maplibregl.ExpressionSpecification
    const statusOpacity = ['match', ['get', 'status'], 'rejected', 0.3, 'pending', 0.65, 1] as unknown as maplibregl.ExpressionSpecification
    const strokeColor = ['match', ['get', 'status'], 'rejected', '#ef4444', '#ffffff'] as unknown as maplibregl.ExpressionSpecification

    const applyData = () => {
      const source = map.getSource('assets') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc as GeoJSON.FeatureCollection)
        return
      }
      map.addSource('assets', { type: 'geojson', data: fc as GeoJSON.FeatureCollection })
      map.addLayer({
        id: 'assets-polygons',
        type: 'fill',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': symbologyColor, 'fill-opacity': ['*', 0.35, statusOpacity], 'fill-outline-color': symbologyColor },
      })
      map.addLayer({
        id: 'assets-lines',
        type: 'line',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': symbologyColor, 'line-width': 4, 'line-opacity': statusOpacity },
      })
      map.addLayer({
        id: 'assets-points',
        type: 'circle',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': symbologyColor,
          'circle-opacity': statusOpacity,
          'circle-stroke-width': 2,
          'circle-stroke-color': strokeColor,
        },
      })

      const onFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f?.properties) return
        const full = (fc as unknown as { features: NetworkAssetFeature[] }).features.find((x) => x.id === f.properties!.id)
        if (full) setSelectedFeature(full)
      }
      const layers = ['assets-points', 'assets-lines', 'assets-polygons']
      layers.forEach((id) => {
        map.on('click', id, onFeatureClick)
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
      })
    }

    if (map.isStyleLoaded()) applyData()
    else map.once('load', applyData)
  }, [assetsQuery.data, mapVersion])

  // Draft (in-progress) drawing layer.
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    pendingMarkerRef.current?.remove()
    pendingMarkerRef.current = null
    if (draftGeometry?.type === 'Point') {
      pendingMarkerRef.current = new maplibregl.Marker({ color: '#2f4fb4' }).setLngLat(draftGeometry.coordinates as [number, number]).addTo(map)
    }

    let pathCoords: [number, number][] = linePoints
    let polygonRing: [number, number][] | null = null
    if (draftGeometry?.type === 'LineString') pathCoords = draftGeometry.coordinates as [number, number][]
    if (draftGeometry?.type === 'Polygon') {
      polygonRing = draftGeometry.coordinates[0] as [number, number][]
      pathCoords = polygonRing.slice(0, -1)
    }

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(polygonRing ? [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [polygonRing] }, properties: {} }] : []),
        ...(!polygonRing && pathCoords.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: pathCoords }, properties: {} }] : []),
        ...pathCoords.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} })),
      ],
    }

    const applyDraft = () => {
      const source = map.getSource('draft') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc)
        return
      }
      map.addSource('draft', { type: 'geojson', data: fc })
      map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#2f4fb4', 'fill-opacity': 0.25, 'fill-outline-color': '#2f4fb4' } })
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2f4fb4', 'line-width': 3, 'line-dasharray': [2, 1] } })
      map.addLayer({ id: 'draft-vertices', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#2f4fb4', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
    }

    if (map.isStyleLoaded()) applyDraft()
    else map.once('load', applyDraft)
  }, [draftGeometry, linePoints, mapVersion])

  const showForm = Boolean(draftGeometry)
  const canFinishShape = (tool === 'line' && linePoints.length >= 2) || (tool === 'polygon' && linePoints.length >= 3)
  const featureCount = assetsQuery.data?.featureCollection.features.length ?? 0

  return (
    <div className="relative h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <div className="flex h-full flex-col">
        {entered && (
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 animate-fade-in">
            <select
              value={activeProjectId}
              onChange={(e) => {
                setActiveProjectId(e.target.value)
                resetDrawing()
              }}
              className="h-9 max-w-[11rem] rounded-lg border-0 bg-slate-50 px-2.5 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              <option value="">Select project…</option>
              {(projectsQuery.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="mx-1.5 h-6 w-px bg-slate-200" />
            <ToolbarButton active={tool === 'point'} disabled={!pointSymbologies.length} onClick={() => toggleTool('point')} icon={<MapPin size={16} />} label={tool === 'point' ? 'Cancel' : 'Point'} />
            <ToolbarButton active={tool === 'line'} disabled={!lineSymbologies.length} onClick={() => toggleTool('line')} icon={<Spline size={16} />} label={tool === 'line' ? 'Cancel' : 'Line'} />
            <ToolbarButton active={tool === 'polygon'} disabled={!polygonSymbologies.length} onClick={() => toggleTool('polygon')} icon={<Square size={16} />} label={tool === 'polygon' ? 'Cancel' : 'Polygon'} />
            <div className="mx-1.5 h-6 w-px bg-slate-200" />
            <ToolbarButton onClick={() => setImportOpen(true)} icon={<Upload size={16} />} label="Import" />
            <ToolbarButton onClick={() => setExportOpen(true)} icon={<Download size={16} />} label="Export" />
            <div className="flex-1" />
            <ToolbarButton onClick={exitWorkspace} icon={<Minimize2 size={16} />} label="Exit Workspace" />
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div ref={mapContainer} className="absolute inset-0" />

          {!entered && !launching && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800">
              <div className="flex flex-col items-center gap-5 px-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
                  <MapIcon className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Survey Map Workspace</h1>
                  <p className="mt-1.5 max-w-sm text-sm text-white/60">Place points, draw routes, and trace polygons against a project's symbology — then review submissions right on the map.</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-white/70">
                  <span className="rounded-full bg-white/10 px-3 py-1">{projectsQuery.data?.pagination?.total ?? projectsQuery.data?.items.length ?? 0} projects</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">{featureCount} assets</span>
                </div>
                <Button size="lg" onClick={launchWorkspace}>
                  Open Map Workspace
                </Button>
              </div>
            </div>
          )}

          {launching && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800">
              <div className="flex flex-col items-center gap-4">
                <Spinner className="h-8 w-8 border-white/20 border-t-white" />
                <p className="text-sm font-semibold text-white/80">Initializing survey workspace…</p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-white/15">
                  <div className={cn('h-full rounded-full bg-white transition-all duration-700 ease-out', launchWide ? 'w-full' : 'w-[6%]')} />
                </div>
              </div>
            </div>
          )}

          {entered && (
            <>
              {/* Symbology legend for the active project */}
              {activeProjectId && !!projectSymbologies.length && (
                <Card className="absolute bottom-4 right-4 z-20 max-w-xs overflow-hidden !rounded-xl shadow-[var(--shadow-card-hover)]">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Layers size={12} />
                    Legend
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-600">
                    {projectSymbologies.map((s) => (
                      <span key={s.id} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: s.color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }} />
                        <span>{s.name}</span>
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              {mapError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-white">
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-danger-50 text-danger-600">
                      <WifiOff className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink">Couldn't load the basemap</div>
                      <p className="mt-1 max-w-xs text-xs text-muted">The map tile service didn't respond. Check your connection and try again.</p>
                    </div>
                    <Button size="sm" leftIcon={<RotateCw size={14} />} onClick={retryMap}>
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {(assetsQuery.isLoading || (mapLoading && !mapError)) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
                  <Spinner />
                </div>
              )}

              {!activeProjectId && tool === null && !selectedFeature && (
                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">Select a project in the toolbar to start drawing</div>
              )}

              {tool === 'point' && !draftGeometry && (
                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">Click the map to place a point</div>
              )}

              {(tool === 'line' || tool === 'polygon') && !draftGeometry && (
                <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                  <span>
                    Click to add {tool === 'polygon' ? 'vertices' : 'points'} ({linePoints.length} placed)
                  </span>
                  <button onClick={undoLinePoint} disabled={!linePoints.length} className="ml-1 rounded p-1 hover:bg-white/20 disabled:opacity-40">
                    <Undo2 size={14} />
                  </button>
                  <button onClick={finishShape} disabled={!canFinishShape} className="rounded p-1 hover:bg-white/20 disabled:opacity-40">
                    <Check size={14} />
                  </button>
                  <button onClick={resetDrawing} className="rounded p-1 hover:bg-white/20">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* New-asset submission panel */}
              {showForm && (
                <div className="absolute right-4 top-4 z-20 w-80">
                  <Card className="overflow-hidden shadow-xl">
                    <PanelHeader icon={<MapPin size={14} />} title={`New ${draftGeometry && GEOMETRY_LABEL[draftGeometry.type]} Asset`} right={<Badge tone="neutral">{draftGeometry?.type}</Badge>} />
                    <div className="p-4">
                      <Select
                        label="Symbology"
                        value={symbologyId}
                        onChange={(e) => setSymbologyId(e.target.value)}
                        placeholder="Select symbology"
                        options={eligibleSymbologies.map((s) => ({ value: s.id, label: s.name }))}
                        containerClassName="mb-3"
                      />
                      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} containerClassName="mb-3" />

                      <div className="flex gap-2">
                        <Button variant="outline" onClick={resetDrawing} className="flex-1">
                          Cancel
                        </Button>
                        <Button onClick={() => createAsset.mutate()} loading={createAsset.isPending} disabled={!symbologyId} className="flex-1">
                          Submit
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* Review panel for an existing asset — approve/reject right from the map. */}
              {selectedFeature && (
                <div className="absolute right-4 top-4 z-20 w-80">
                  <Card className="overflow-hidden shadow-xl">
                    <PanelHeader
                      icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedFeature.properties.symbology?.color ?? FALLBACK_COLOR }} />}
                      title={selectedFeature.properties.symbology?.name ?? selectedFeature.properties.assetType.replace(/_/g, ' ')}
                      subtitle={selectedFeature.properties.geometryType}
                      onClose={() => setSelectedFeature(null)}
                    />
                    <div className="p-4">
                      <Badge tone={selectedFeature.properties.status === 'approved' ? 'success' : selectedFeature.properties.status === 'rejected' ? 'danger' : 'warning'} className="mb-3">
                        {selectedFeature.properties.status}
                      </Badge>
                      {Object.keys(selectedFeature.properties.attributes || {}).length > 0 && (
                        <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs">
                          {Object.entries(selectedFeature.properties.attributes).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <span className="text-muted">{titleize(k)}</span>
                              <span className="font-medium text-ink">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedFeature.properties.status === 'pending' && canApprove && (
                        <div className="flex gap-2">
                          <Button variant="outline" leftIcon={<ThumbsDown size={14} />} onClick={() => reject.mutate(selectedFeature.id)} loading={reject.isPending} className="flex-1">
                            Reject
                          </Button>
                          <Button leftIcon={<ThumbsUp size={14} />} onClick={() => approve.mutate(selectedFeature.id)} loading={approve.isPending} className="flex-1">
                            Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        {entered && (
          <div className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-100 bg-slate-50 px-3.5 text-[11px] font-medium text-slate-500 animate-fade-in">
            <span className="flex items-center gap-1">
              <FolderKanban size={11} />
              {activeProject?.name ?? 'No project selected'}
            </span>
            <span className="flex items-center gap-1">
              <Layers size={11} />
              {featureCount} asset{featureCount === 1 ? '' : 's'}
            </span>
            <div className="flex-1" />
            <span className="flex items-center gap-1 tabular-nums">
              <Crosshair size={11} />
              {cursorLngLat ? `${cursorLngLat.lat.toFixed(5)}, ${cursorLngLat.lng.toFixed(5)}` : '—'}
            </span>
            <span className="tabular-nums">Zoom {zoom.toFixed(1)}</span>
          </div>
        )}
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} projects={projectsQuery.data?.items ?? []} onDone={invalidateAssets} pushToast={push} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} projects={projectsQuery.data?.items ?? []} pushToast={push} />
    </div>
  )
}

function titleize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function ToolbarButton({ icon, label, active, disabled, onClick }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function PanelHeader({ icon, title, subtitle, right, onClose }: { icon: ReactNode; title: string; subtitle?: string; right?: ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">{icon}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold capitalize text-ink">{title}</div>
          {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        </div>
      </div>
      {right}
      {onClose && (
        <button onClick={onClose} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/60">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

function ImportModal({
  open,
  onClose,
  projects,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  projects: { id: string; name: string }[]
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [projectId, setProjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const text = await file.text()
      const featureCollection = JSON.parse(text)
      return networkAssetsApi.import({ projectId, featureCollection })
    },
    onSuccess: (summary) => {
      pushToast(`Imported ${summary.created} of ${summary.total} feature(s)${summary.failed ? ` — ${summary.failed} failed` : ''}`, summary.failed ? 'info' : 'success')
      setFile(null)
      onDone()
      onClose()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Import failed — check the file is valid GeoJSON', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Survey Data"
      subtitle="Upload a GeoJSON file. Each feature needs an assetType property matching the key of a symbology assigned to the project."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => importMutation.mutate()} loading={importMutation.isPending} disabled={!projectId || !file}>
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Select project" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">GeoJSON File</label>
          <input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100" />
        </div>
      </div>
    </Modal>
  )
}

function ExportModal({ open, onClose, projects, pushToast }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[]; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [projectId, setProjectId] = useState('')

  const exportMutation = useMutation({
    mutationFn: () => exportApi.projectGeoJSON(projectId),
    onSuccess: (data) => {
      const project = projects.find((p) => p.id === projectId)
      downloadGeoJSON(data, `${project?.name ?? 'export'}-approved-assets`)
      pushToast('Export downloaded', 'success')
      onClose()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Export failed', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export Approved Assets"
      subtitle="Downloads a GeoJSON file of every approved asset in the selected project."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending} disabled={!projectId}>
            Export
          </Button>
        </>
      }
    >
      <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Select project" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
    </Modal>
  )
}
