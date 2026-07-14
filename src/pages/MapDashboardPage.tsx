import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin, Spline, Undo2, Check, X, Upload, Download, ThumbsUp, ThumbsDown, Map as MapIcon } from 'lucide-react'
import {
  networkAssetsApi,
  projectsApi,
  surveyTemplatesApi,
  exportApi,
  downloadGeoJSON,
  ApiError,
  type AssetTypeDef,
  type GeoJsonGeometry,
  type NetworkAssetFeature,
} from '../lib/api'
import { BASEMAP_STYLE, mapifyitTransformRequest } from '../lib/maps'
import { Badge, Button, Card, Modal, Select, Spinner, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
}

type Tool = 'point' | 'line' | null

export function MapDashboardPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { hasPermission } = useAuth()
  const canApprove = hasPermission('assets.approve')

  // Landing gate — the map only becomes interactive once the user chooses to enter it.
  const [entered, setEntered] = useState(false)

  // Drawing state.
  const [tool, setTool] = useState<Tool>(null)
  const [linePoints, setLinePoints] = useState<[number, number][]>([])
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonGeometry | null>(null)

  // Submission form state.
  const [projectId, setProjectId] = useState('')
  const [assetTypeKey, setAssetTypeKey] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

  // Selected existing feature (review panel).
  const [selectedFeature, setSelectedFeature] = useState<NetworkAssetFeature | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const assetsQuery = useQuery({
    queryKey: ['network-assets', 'map'],
    queryFn: () => networkAssetsApi.list({ limit: 500 }),
  })
  const templatesQuery = useQuery({ queryKey: ['survey-templates'], queryFn: surveyTemplatesApi.list })
  const projectsQuery = useQuery({ queryKey: ['projects', 'all'], queryFn: () => projectsApi.list({ limit: 100 }) })

  const allAssetTypes = templatesQuery.data?.flatMap((t) => t.schemaJson.assetTypes.map((a) => ({ ...a, moduleId: t.moduleId }))) ?? []
  const pointAssetTypes = allAssetTypes.filter((a) => a.geometryType === 'Point')
  const lineAssetTypes = allAssetTypes.filter((a) => a.geometryType === 'LineString')
  const eligibleTypes = draftGeometry?.type === 'LineString' ? lineAssetTypes : pointAssetTypes
  const selectedType = eligibleTypes.find((a) => a.key === assetTypeKey) as (AssetTypeDef & { moduleId: string }) | undefined

  const modules = (templatesQuery.data ?? []).map((t) => ({ id: t.moduleId, name: t.module?.name ?? t.name }));

  const invalidateAssets = () => queryClient.invalidateQueries({ queryKey: ['network-assets'] })

  const createAsset = useMutation({
    mutationFn: () => {
      if (!draftGeometry || !selectedType || !projectId) throw new Error('Missing fields')
      return networkAssetsApi.create({ projectId, moduleId: selectedType.moduleId, assetType: selectedType.key, geometry: draftGeometry, attributes: fieldValues })
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
    setAssetTypeKey('')
    setFieldValues({})
  }

  function finishLine() {
    if (linePoints.length < 2) return
    setDraftGeometry({ type: 'LineString', coordinates: linePoints })
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

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
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
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

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
      } else if (tool === 'line' && !draftGeometry) {
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

    const applyData = () => {
      const source = map.getSource('assets') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc as GeoJSON.FeatureCollection)
        return
      }
      map.addSource('assets', { type: 'geojson', data: fc as GeoJSON.FeatureCollection })
      map.addLayer({
        id: 'assets-lines',
        type: 'line',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['match', ['get', 'status'], 'approved', STATUS_COLOR.approved, 'rejected', STATUS_COLOR.rejected, STATUS_COLOR.pending], 'line-width': 4 },
      })
      map.addLayer({
        id: 'assets-points',
        type: 'circle',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'status'], 'approved', STATUS_COLOR.approved, 'rejected', STATUS_COLOR.rejected, STATUS_COLOR.pending],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      const onFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f?.properties) return
        const full = (fc as unknown as { features: NetworkAssetFeature[] }).features.find((x) => x.id === f.properties!.id)
        if (full) setSelectedFeature(full)
      }
      map.on('click', 'assets-points', onFeatureClick)
      map.on('click', 'assets-lines', onFeatureClick)
      map.on('mouseenter', 'assets-points', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'assets-points', () => (map.getCanvas().style.cursor = ''))
      map.on('mouseenter', 'assets-lines', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'assets-lines', () => (map.getCanvas().style.cursor = ''))
    }

    if (map.isStyleLoaded()) applyData()
    else map.once('load', applyData)
  }, [assetsQuery.data])

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

    const coords: [number, number][] = draftGeometry?.type === 'LineString' ? (draftGeometry.coordinates as [number, number][]) : linePoints
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(coords.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} }] : []),
        ...coords.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} })),
      ],
    }

    const applyDraft = () => {
      const source = map.getSource('draft') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc)
        return
      }
      map.addSource('draft', { type: 'geojson', data: fc })
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2f4fb4', 'line-width': 3, 'line-dasharray': [2, 1] } })
      map.addLayer({ id: 'draft-vertices', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#2f4fb4', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
    }

    if (map.isStyleLoaded()) applyDraft()
    else map.once('load', applyDraft)
  }, [draftGeometry, linePoints])

  const showForm = Boolean(draftGeometry)
  const canFinishLine = tool === 'line' && !draftGeometry && linePoints.length >= 2

  return (
    <div className="relative -m-6 h-full overflow-hidden">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Landing gate — opacity overlay until the user explicitly enters the map. */}
      {!entered && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm transition-opacity duration-300">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white">
              <MapIcon className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Survey Map</h1>
              <p className="mt-1 max-w-sm text-sm text-white/70">Live view of every network asset your team has submitted — place points, draw routes, and review submissions right on the map.</p>
            </div>
            <Button size="lg" onClick={() => setEntered(true)}>
              Go to Map
            </Button>
          </div>
        </div>
      )}

      {entered && (
        <>
          {/* Floating toolbar */}
          <Card className="absolute left-4 top-4 z-20 flex items-center gap-1 !rounded-xl p-1.5 shadow-[var(--shadow-card-hover)]">
            <ToolbarButton active={tool === 'point'} disabled={!pointAssetTypes.length} onClick={() => toggleTool('point')} icon={<MapPin size={16} />} label={tool === 'point' ? 'Cancel' : 'Add Point'} />
            <ToolbarButton active={tool === 'line'} disabled={!lineAssetTypes.length} onClick={() => toggleTool('line')} icon={<Spline size={16} />} label={tool === 'line' ? 'Cancel' : 'Draw Line'} />
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <ToolbarButton onClick={() => setImportOpen(true)} icon={<Upload size={16} />} label="Import" />
            <ToolbarButton onClick={() => setExportOpen(true)} icon={<Download size={16} />} label="Export" />
          </Card>

          {/* Status legend */}
          <Card className="absolute bottom-6 right-4 z-20 flex items-center gap-4 !rounded-xl px-3.5 py-2 text-xs font-medium text-slate-600 shadow-[var(--shadow-card-hover)]">
            {(['pending', 'approved', 'rejected'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: STATUS_COLOR[s], boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }} />
                <span className="capitalize">{s}</span>
              </span>
            ))}
          </Card>

          {assetsQuery.isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <Spinner />
            </div>
          )}

          {tool === 'point' && !draftGeometry && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">Click the map to place a point</div>
          )}

          {tool === 'line' && !draftGeometry && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <span>Click to add points to the route ({linePoints.length} placed)</span>
              <button onClick={undoLinePoint} disabled={!linePoints.length} className="ml-1 rounded p-1 hover:bg-white/20 disabled:opacity-40">
                <Undo2 size={14} />
              </button>
              <button onClick={finishLine} disabled={!canFinishLine} className="rounded p-1 hover:bg-white/20 disabled:opacity-40">
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
              <Card className="p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-bold text-ink">New {draftGeometry?.type === 'LineString' ? 'Line' : 'Point'} Asset</div>
                  <Badge tone="neutral">{draftGeometry?.type}</Badge>
                </div>

                <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Select project" options={(projectsQuery.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))} containerClassName="mb-3" />
                <Select
                  label="Asset Type"
                  value={assetTypeKey}
                  onChange={(e) => {
                    setAssetTypeKey(e.target.value)
                    setFieldValues({})
                  }}
                  placeholder="Select asset type"
                  options={eligibleTypes.map((t) => ({ value: t.key, label: t.label }))}
                  containerClassName="mb-3"
                />

                {selectedType?.fields.map((f) => (
                  <div key={f.key} className="mb-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {f.label} {f.required && <span className="text-danger-700">*</span>}
                    </label>
                    {f.type === 'select' ? (
                      <select value={fieldValues[f.key] ?? ''} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-primary-500">
                        <option value="">Select…</option>
                        {f.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={fieldValues[f.key] ?? ''}
                        onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-primary-500"
                      />
                    )}
                  </div>
                ))}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetDrawing} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={() => createAsset.mutate()} loading={createAsset.isPending} disabled={!projectId || !assetTypeKey} className="flex-1">
                    Submit
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Review panel for an existing asset — approve/reject right from the map. */}
          {selectedFeature && (
            <div className="absolute right-4 top-4 z-20 w-80">
              <Card className="p-4 shadow-xl">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-bold capitalize text-ink">{selectedFeature.properties.assetType.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted">{selectedFeature.properties.geometryType}</div>
                  </div>
                  <button onClick={() => setSelectedFeature(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                    <X size={16} />
                  </button>
                </div>
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
              </Card>
            </div>
          )}
        </>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} projects={projectsQuery.data?.items ?? []} modules={modules} onDone={invalidateAssets} pushToast={push} />
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
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function ImportModal({
  open,
  onClose,
  projects,
  modules,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  projects: { id: string; name: string }[]
  modules: { id: string; name: string }[]
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [projectId, setProjectId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const text = await file.text()
      const featureCollection = JSON.parse(text)
      return networkAssetsApi.import({ projectId, moduleId, featureCollection })
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
      subtitle="Upload a GeoJSON file. Each feature needs an assetType property matching one of your module's asset types."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => importMutation.mutate()} loading={importMutation.isPending} disabled={!projectId || !moduleId || !file}>
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Select project" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="Module" value={moduleId} onChange={(e) => setModuleId(e.target.value)} placeholder="Select module" options={modules.map((m) => ({ value: m.id, label: m.name }))} />
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
