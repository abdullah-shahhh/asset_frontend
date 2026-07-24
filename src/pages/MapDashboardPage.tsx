import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as shpwrite from '@mapbox/shp-write'
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
  Crosshair,
  Layers,
  Layers3,
  FolderKanban,
  PenLine,
  Save,
  Ruler,
  Pentagon,
  Moon,
  Sun,
  Trash2,
  LogOut,
  AlertTriangle,
  Zap,
  Wrench,
  Radio,
  Camera,
  Image as ImageIcon,
  Link,
  Search,
  Contact,
  Cable,
  Waypoints,
  Route,
  Hand,
  Keyboard,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  networkAssetsApi,
  projectsApi,
  exportApi,
  downloadGeoJSON,
  mediaApi,
  connectionsApi,
  customersApi,
  strandsApi,
  portsApi,
  fiberSplicesApi,
  ApiError,
  type AssetTypeField,
  type GeoJsonGeometry,
  type GeometryType,
  type NetworkAssetFeature,
  type NetworkConnectionFeature,
  type OperationalStatus,
  type FiberStrand,
  type EquipmentPort,
  type StrandStatus,
  type StrandRole,
  type FiberTraceResult,
  type SpliceEndpointRef,
  type Customer,
} from '../lib/api'
import { TILES_BASE, mapifyitTransformRequest } from '../lib/maps'
import { ROUTES } from '../lib/routes'
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dropdown, Input, Modal, NotificationBell, Select, Spinner, Textarea, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { resolveSymbologyIcon } from '../lib/symbologyIcons'
import { mediaUrl } from '../theme/branding'

const FALLBACK_COLOR = '#64748b'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Paint a point marker's content element: colored badge (with a soft glow
 * in the symbology's color) holding either the symbology's chosen icon or,
 * if the org uploaded one, their own custom image. A small status badge —
 * amber dot for pending, red warning triangle for rejected — overlays the
 * corner so problem submissions read at a glance without opening anything. */
const OPERATIONAL_STATUS_COLOR: Record<OperationalStatus, string> = {
  online: '#22c55e',
  degraded: '#f59e0b',
  offline: '#ef4444',
  maintenance: '#64748b',
}
const OPERATIONAL_STATUS_LABEL: Record<OperationalStatus, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
  maintenance: 'Maintenance',
}

const STRAND_STATUS_TONE: Record<StrandStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'primary' | 'info'> = {
  available: 'neutral',
  reserved: 'info',
  in_service: 'success',
  dark: 'neutral',
  faulty: 'danger',
  under_test: 'warning',
  under_repair: 'warning',
  retired: 'neutral',
}
const STRAND_STATUS_LABEL: Record<StrandStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  in_service: 'In Service',
  dark: 'Dark',
  faulty: 'Faulty',
  under_test: 'Under Test',
  under_repair: 'Under Repair',
  retired: 'Retired',
}
const STRAND_ROLE_LABEL: Record<StrandRole, string> = {
  feeder: 'Feeder',
  distribution: 'Distribution',
  drop: 'Drop',
}

function paintPointMarker(el: HTMLDivElement, color: string, iconKey: string | null, iconUrl: string | null, status: string, operationalStatus: OperationalStatus | null) {
  el.style.cssText = [
    'width:30px',
    'height:30px',
    'border-radius:9999px',
    `background:${color}`,
    'border:2.5px solid #ffffff',
    `box-shadow:0 0 0 4px ${hexToRgba(color, 0.2)}, 0 2px 6px rgba(0,0,0,.45)`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:visible',
    'cursor:pointer',
    'position:relative',
    `opacity:${status === 'rejected' ? 0.65 : 1}`,
  ].join(';')
  const customSrc = mediaUrl(iconUrl)
  const Icon = resolveSymbologyIcon(iconKey)
  const iconHtml = customSrc
    ? `<img src="${customSrc}" alt="" style="width:100%;height:100%;border-radius:9999px;object-fit:cover;pointer-events:none" />`
    : renderToStaticMarkup(<Icon size={14} color="#ffffff" strokeWidth={2.5} />)
  const badge =
    status === 'rejected'
      ? `<span style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:9999px;background:#ef4444;border:2px solid #0a0e1f;display:flex;align-items:center;justify-content:center;">${renderToStaticMarkup(<AlertTriangle size={9} color="#ffffff" strokeWidth={3} />)}</span>`
      : status === 'pending'
        ? '<span style="position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:9999px;background:#f59e0b;border:2px solid #0a0e1f;"></span>'
        : ''
  // Operational (equipment health) status gets its own dot, opposite corner
  // from the review-status badge above so the two never collide.
  const statusDot = operationalStatus
    ? `<span style="position:absolute;bottom:-2px;right:-2px;width:11px;height:11px;border-radius:9999px;background:${OPERATIONAL_STATUS_COLOR[operationalStatus]};border:2px solid #0a0e1f;"></span>`
    : ''
  el.innerHTML = iconHtml + badge + statusDot
}
/** Paint a draggable vertex handle used while editing an existing shape's
 * geometry. Carries its own delete badge (as a child element with its own
 * click handler) rather than relying on click-vs-drag disambiguation on the
 * marker itself. */
function paintVertexMarker(el: HTMLDivElement, canDelete: boolean) {
  el.style.cssText = ['width:16px', 'height:16px', 'border-radius:9999px', 'background:#2f4fb4', 'border:2px solid #ffffff', 'box-shadow:0 1px 3px rgba(15,23,42,.4)', 'cursor:grab', 'position:relative'].join(';')
  el.innerHTML = canDelete
    ? '<button type="button" data-role="delete-vertex" style="position:absolute;top:-8px;right:-8px;width:14px;height:14px;border-radius:9999px;background:#ef4444;border:1.5px solid #fff;color:#fff;font-size:9px;line-height:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;">×</button>'
    : ''
}

/** Paint the smaller "add a vertex here" handle shown at the midpoint of
 * each edge while editing a line/polygon. */
function paintMidpointMarker(el: HTMLDivElement) {
  el.style.cssText = ['width:10px', 'height:10px', 'border-radius:9999px', 'background:rgba(47,79,180,0.55)', 'border:1.5px solid rgba(255,255,255,0.85)', 'cursor:copy'].join(';')
}

const GEOMETRY_LABEL: Record<GeometryType, string> = { Point: 'Point', LineString: 'Line', Polygon: 'Polygon' }

// Hub-type structures worth naming directly on the map, like a real fiber
// network diagram — everything else (handholes, poles, ONTs...) is numerous
// enough that always-on labels would just be clutter.
const LABELED_SYMBOLOGY_NAMES = new Set(['Fiber Distribution Hub', 'Manhole'])

// Live, public, no-key cellular tower dataset (FCC ASR data via HIFLD) —
// real US cell tower locations, queried per-viewport for the heatmap layer.
const CELL_TOWERS_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/ArcGIS/rest/services/Cellular_Towers_in_the_United_States/FeatureServer/0/query'

async function fetchCellTowers(bounds: maplibregl.LngLatBounds): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ xmin: bounds.getWest(), ymin: bounds.getSouth(), xmax: bounds.getEast(), ymax: bounds.getNorth(), spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Licensee,StrucType',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: '2000',
  })
  const res = await fetch(`${CELL_TOWERS_URL}?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to load cell tower data')
  return res.json()
}

// Demo fault simulator — picks a random reason from a realistic OFC fault pool.
const FAULT_REASONS = [
  'Fiber cut detected — signal loss reported by NOC monitoring',
  'Vehicle strike on aerial cable near utility pole',
  'Rodent damage suspected at mid-span',
  'Cable severed during third-party excavation nearby',
  'Water ingress at splice enclosure — signal degradation',
  'Storm damage — downed line reported',
  'Connector failure at termination point',
]

type Tool = 'point' | 'line' | 'polygon' | 'connect' | 'splice' | 'measure-distance' | 'measure-area' | null
type BasemapStyle = 'dark' | 'bright'

const METERS_PER_MILE = 1609.344
const SQMETERS_PER_ACRE = 4046.8564224

/** Bounding box covering every coordinate in a set of features — used to
 * frame the map on a project's data once it loads. */
function featureCollectionBounds(features: NetworkAssetFeature[]): [[number, number], [number, number]] {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const [lng, lat] = coords as [number, number]
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    } else if (Array.isArray(coords)) {
      coords.forEach(visit)
    }
  }
  features.forEach((f) => visit(f.geometry.coordinates))
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

/** Sum of great-circle distances between consecutive points, in meters. */
function pathDistanceMeters(points: [number, number][]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i])
  return total
}
function haversineMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
/** Planar shoelace area over a local equirectangular projection — accurate
 * enough at survey/city scale without pulling in a full geodesy library. */
function ringAreaSqMeters(points: [number, number][]): number {
  if (points.length < 3) return 0
  const lat0 = (points.reduce((s, p) => s + p[1], 0) / points.length) * (Math.PI / 180)
  const projected = points.map(([lng, lat]) => [lng * 111320 * Math.cos(lat0), lat * 110540] as [number, number])
  let sum = 0
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i]
    const [x2, y2] = projected[(i + 1) % projected.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}
function formatDistance(meters: number): string {
  const feet = meters * 3.28084
  return feet < 1000 ? `${feet.toFixed(0)} ft` : `${(meters / METERS_PER_MILE).toFixed(2)} mi`
}
function formatArea(sqMeters: number): string {
  const acres = sqMeters / SQMETERS_PER_ACRE
  return acres < 1 ? `${(sqMeters * 10.7639).toFixed(0)} sq ft` : `${acres.toFixed(2)} ac`
}

export function MapDashboardPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  // Tracks whether the map's ONE-TIME 'load' event has already fired.
  // isStyleLoaded() is unreliable as a re-check later on — it can report
  // false whenever background tiles are still streaming in, long after
  // custom sources/layers are actually safe to add — so effects that add
  // sources/layers on data changes must consult this flag instead of
  // isStyleLoaded()/'style.load' (which, once fired, never fires again).
  const styleReadyRef = useRef(false)
  const runWhenStyleReady = (fn: () => void) => {
    const map = mapRef.current
    if (!map) return
    if (styleReadyRef.current) fn()
    else map.once('load', fn)
  }
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { user, logout, hasPermission } = useAuth()
  const canApprove = hasPermission('assets.approve')
  const canEditGeometry = hasPermission('assets.update')
  const canDelete = hasPermission('assets.delete')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Which project's symbologies the draw tools currently offer.
  const [activeProjectId, setActiveProjectId] = useState('')

  // Set once a specific asset should be flown to + selected as soon as its
  // project's assets have finished loading (used by both the ?asset= URL
  // param below and the IP search box further down).
  const [pendingFocusAssetId, setPendingFocusAssetId] = useState<string | null>(null)

  // Arriving from Alarms'/Customers' "View on Map" carries ?project= (and
  // optionally ?asset=). This page is now mounted permanently for the whole
  // session (see AppShell — kept alive across navigation so the map doesn't
  // reload on every tab switch), so this can no longer be a mount-once
  // effect: it has to react to the URL actually landing on the dashboard
  // route with these params, then consume (delete) them so it doesn't
  // re-fire. Gated on pathname so a stray `project`/`asset` query param on
  // some other page can't be picked up while this component sits hidden.
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (location.pathname !== ROUTES.dashboard) return
    const projectParam = searchParams.get('project')
    const assetParam = searchParams.get('asset')
    if (projectParam) {
      setActiveProjectId(projectParam)
      if (assetParam) setPendingFocusAssetId(assetParam)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('project')
        next.delete('asset')
        return next
      }, { replace: true })
    }
  }, [location.pathname, searchParams, setSearchParams])

  // Drawing state.
  const [tool, setTool] = useState<Tool>(null)
  const [linePoints, setLinePoints] = useState<[number, number][]>([])
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonGeometry | null>(null)

  // Submission form state.
  const [symbologyId, setSymbologyId] = useState('')
  const [notes, setNotes] = useState('')
  const [templateValues, setTemplateValues] = useState<Record<string, string | number | boolean>>({})
  // Ad-hoc attributes a surveyor adds beyond the symbology's fixed field
  // schema — stored under attributes._custom so the review panel can render
  // them distinctly rather than guessing at arbitrary labels via titleize().
  const [customFields, setCustomFields] = useState<{ label: string; value: string }[]>([])
  const [photos, setPhotos] = useState<File[]>([])

  // Selected existing feature (review panel).
  const [selectedFeature, setSelectedFeature] = useState<NetworkAssetFeature | null>(null)

  // Network topology: connect-mode holds the "from" asset id while waiting
  // for a second click to complete the pair; selectedConnection drives its
  // own small review panel, mutually exclusive with selectedFeature.
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [selectedConnection, setSelectedConnection] = useState<NetworkConnectionFeature | null>(null)

  // Fiber splice tool: same two-click pattern as Connect above — the first
  // click stashes the asset (must be a cable or equipment) and waits for a
  // second click, then opens the endpoint picker modal for both sides.
  const [spliceFromAsset, setSpliceFromAsset] = useState<NetworkAssetFeature | null>(null)
  const [splicePair, setSplicePair] = useState<[NetworkAssetFeature, NetworkAssetFeature] | null>(null)

  // Geometry editing (drag vertices / add / remove points on an existing asset).
  const [editingFeature, setEditingFeature] = useState<NetworkAssetFeature | null>(null)
  const [editVertices, setEditVertices] = useState<[number, number][]>([])

  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [coordinateEntryOpen, setCoordinateEntryOpen] = useState(false)

  // Measurement tool (distance / area) — deliberately kept independent of the
  // asset-drawing draft pipeline above so it can't get tangled with the
  // submission-form flow.
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([])

  // Basemap switcher + per-symbology layer visibility.
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>('dark')
  const [layersOpen, setLayersOpen] = useState(false)
  const [hiddenSymbologyIds, setHiddenSymbologyIds] = useState<Set<string>>(new Set())

  // Cell tower heatmap (real FCC/HIFLD data, fetched per-viewport).
  const [showCellTowers, setShowCellTowers] = useState(false)
  const [cellTowersLoading, setCellTowersLoading] = useState(false)

  // Status-bar telemetry.
  const [cursorLngLat, setCursorLngLat] = useState<{ lng: number; lat: number } | null>(null)
  const [zoom, setZoom] = useState(13)

  const assetsQuery = useQuery({
    queryKey: ['network-assets', 'map', activeProjectId],
    queryFn: () => networkAssetsApi.list({ projectId: activeProjectId, limit: 500 }),
    enabled: !!activeProjectId,
  })
  const projectsQuery = useQuery({ queryKey: ['projects', 'all'], queryFn: () => projectsApi.list({ limit: 100 }) })
  const projectSymbologiesQuery = useQuery({
    queryKey: ['projects', activeProjectId, 'symbologies'],
    queryFn: () => projectsApi.getSymbologies(activeProjectId),
    enabled: !!activeProjectId,
  })
  const connectionsQuery = useQuery({
    queryKey: ['network-connections', activeProjectId],
    queryFn: () => connectionsApi.listForProject(activeProjectId),
    enabled: !!activeProjectId,
  })
  // Which customer (if any) this selected asset serves — shown in its review panel.
  const assetCustomerQuery = useQuery({
    queryKey: ['customers', 'by-asset', selectedFeature?.id],
    queryFn: () => customersApi.list({ networkAssetId: selectedFeature!.id, limit: 1 }),
    enabled: !!selectedFeature,
  })
  const assetCustomer = assetCustomerQuery.data?.items[0] ?? null

  // Fiber strand / equipment port management — only meaningful when the
  // selected asset's symbology is flagged isCable / isEquipment respectively.
  // Fetched on demand per selected asset (like connections/customers above),
  // not embedded on every map asset — a cable can carry up to 288 strands,
  // which would bloat the main map list fetch if eager-loaded.
  const strandsQuery = useQuery({
    queryKey: ['fiber-strands', selectedFeature?.id],
    queryFn: () => strandsApi.list(selectedFeature!.id),
    enabled: !!selectedFeature?.properties.symbology?.isCable,
  })
  const portsQuery = useQuery({
    queryKey: ['equipment-ports', selectedFeature?.id],
    queryFn: () => portsApi.list(selectedFeature!.id),
    enabled: !!selectedFeature?.properties.symbology?.isEquipment,
  })

  const [showGenerateStrands, setShowGenerateStrands] = useState(false)
  const [strandCountChoice, setStrandCountChoice] = useState('96')
  const [showGeneratePorts, setShowGeneratePorts] = useState(false)
  const [portCountChoice, setPortCountChoice] = useState('4')
  const [selectedStrandForEdit, setSelectedStrandForEdit] = useState<FiberStrand | null>(null)
  const [traceResult, setTraceResult] = useState<FiberTraceResult | null>(null)
  // Strand/port lists can run into the hundreds — collapsed by default so the
  // review panel opens short, expand on demand instead of always paying for
  // the full list's height.
  const [portsExpanded, setPortsExpanded] = useState(false)
  const [strandsExpanded, setStrandsExpanded] = useState(false)
  useEffect(() => {
    setPortsExpanded(false)
    setStrandsExpanded(false)
  }, [selectedFeature?.id])

  const projectCustomersQuery = useQuery({
    queryKey: ['customers', 'for-project', activeProjectId],
    queryFn: () => customersApi.list({ limit: 200 }),
    enabled: !!selectedStrandForEdit,
  })

  const invalidateStrands = () => queryClient.invalidateQueries({ queryKey: ['fiber-strands', selectedFeature?.id] })
  const invalidatePorts = () => queryClient.invalidateQueries({ queryKey: ['equipment-ports', selectedFeature?.id] })

  const generateStrands = useMutation({
    mutationFn: () => strandsApi.generate(selectedFeature!.id, Number(strandCountChoice)),
    onSuccess: (strands) => {
      push(`Generated ${strands.length} strands`, 'success')
      setShowGenerateStrands(false)
      invalidateStrands()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to generate strands', 'error'),
  })

  const updateStrand = useMutation({
    mutationFn: ({ strandId, patch }: { strandId: string; patch: { status?: StrandStatus; role?: StrandRole | null; assignedCustomerId?: string | null; notes?: string | null } }) =>
      strandsApi.update(selectedFeature!.id, strandId, patch),
    onSuccess: (strand) => {
      push('Strand updated', 'success')
      setSelectedStrandForEdit(strand)
      invalidateStrands()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update strand', 'error'),
  })

  const generatePorts = useMutation({
    mutationFn: () => portsApi.generate(selectedFeature!.id, Number(portCountChoice)),
    onSuccess: (ports) => {
      push(`Generated ${ports.length} ports`, 'success')
      setShowGeneratePorts(false)
      invalidatePorts()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to generate ports', 'error'),
  })

  const updatePortStatus = useMutation({
    mutationFn: ({ portId, status }: { portId: string; status: EquipmentPort['status'] }) => portsApi.update(selectedFeature!.id, portId, { status }),
    onSuccess: () => {
      push('Port updated', 'success')
      invalidatePorts()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update port', 'error'),
  })

  const runTrace = useMutation({
    mutationFn: (params: { strandId?: string; portId?: string }) => fiberSplicesApi.trace(params),
    onSuccess: (result) => setTraceResult(result),
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to trace', 'error'),
  })

  const activeProject = (projectsQuery.data?.items ?? []).find((p) => p.id === activeProjectId)
  const projectSymbologies = activeProjectId ? projectSymbologiesQuery.data ?? [] : []
  const pointSymbologies = projectSymbologies.filter((s) => s.geometryType === 'Point')
  const lineSymbologies = projectSymbologies.filter((s) => s.geometryType === 'LineString')
  const polygonSymbologies = projectSymbologies.filter((s) => s.geometryType === 'Polygon')
  const eligibleSymbologies = draftGeometry?.type === 'LineString' ? lineSymbologies : draftGeometry?.type === 'Polygon' ? polygonSymbologies : pointSymbologies
  const selectedDraftSymbology = eligibleSymbologies.find((s) => s.id === symbologyId)
  // A symbology's own field schema takes precedence when it has one; falls
  // back to the project's (older, flat, shared-across-types) fields so
  // existing projects that haven't set up per-symbology fields yet keep working.
  const effectiveFields = selectedDraftSymbology?.fields.length ? selectedDraftSymbology.fields : activeProject?.templateFields ?? []

  // Distinct symbologies actually present on the map right now — drives the layers panel.
  const symbologyLayers = (() => {
    const seen = new Map<string, { id: string; name: string; color: string; icon: string | null; iconUrl: string | null; geometryType: GeometryType; count: number }>()
    for (const f of assetsQuery.data?.featureCollection.features ?? []) {
      const sym = f.properties.symbology
      if (!sym) continue
      const existing = seen.get(sym.id)
      if (existing) existing.count += 1
      else seen.set(sym.id, { id: sym.id, name: sym.name, color: sym.color, icon: sym.icon, iconUrl: sym.iconUrl, geometryType: f.properties.geometryType, count: 1 })
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()
  const legendGroups: { label: string; type: GeometryType }[] = [
    { label: 'Facilities', type: 'Point' },
    { label: 'Cables', type: 'LineString' },
    { label: 'Areas', type: 'Polygon' },
  ]
  const activeFaults = (assetsQuery.data?.featureCollection.features ?? []).filter((f) => f.properties.attributes?.faultActive)

  const invalidateAssets = () => queryClient.invalidateQueries({ queryKey: ['network-assets'] })

  const createAsset = useMutation({
    mutationFn: async () => {
      if (!draftGeometry || !symbologyId || !activeProjectId) throw new Error('Missing fields')
      const cleanCustom = customFields.filter((c) => c.label.trim())
      const attributes: Record<string, unknown> = effectiveFields.length ? { ...templateValues } : notes ? { notes } : {}
      if (cleanCustom.length) attributes._custom = cleanCustom
      const created = await networkAssetsApi.create({ projectId: activeProjectId, symbologyId, geometry: draftGeometry, attributes })
      if (photos.length) await Promise.all(photos.map((file) => mediaApi.upload(created.id, file)))
      return created
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

  const removeAsset = useMutation({
    mutationFn: (id: string) => networkAssetsApi.remove(id),
    onSuccess: () => {
      push('Asset removed from the map', 'success')
      setSelectedFeature(null)
      setConfirmDeleteId(null)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to remove asset', 'error'),
  })

  const setOperationalStatus = useMutation({
    mutationFn: ({ id, operationalStatus }: { id: string; operationalStatus: OperationalStatus }) => networkAssetsApi.update(id, { operationalStatus }),
    onSuccess: (updated) => {
      push('Status updated', 'success')
      setSelectedFeature(updated)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update status', 'error'),
  })

  const setIpAddress = useMutation({
    mutationFn: ({ id, ipAddress }: { id: string; ipAddress: string }) => networkAssetsApi.update(id, { ipAddress: ipAddress || null }),
    onSuccess: (updated) => {
      push('IP address saved', 'success')
      setSelectedFeature(updated)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to save IP address', 'error'),
  })

  const updateAttributes = useMutation({
    mutationFn: ({ id, attributes }: { id: string; attributes: Record<string, unknown> }) => networkAssetsApi.update(id, { attributes }),
    onSuccess: (updated) => {
      push('Attributes updated', 'success')
      setSelectedFeature(updated)
      setEditingAttributes(false)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update attributes', 'error'),
  })

  // IP search from the toolbar: find equipment by IP anywhere in the org,
  // switch to its project, then fly to + select it once that project's
  // assets have loaded (can't select before the feature is actually fetched).
  // Also drives the ?asset= URL param handled above, and the Customer
  // panel's "View on Map" navigation.
  const [ipSearchValue, setIpSearchValue] = useState('')
  useEffect(() => {
    if (!pendingFocusAssetId) return
    const feature = assetsQuery.data?.featureCollection.features.find((f) => f.id === pendingFocusAssetId)
    if (!feature) return
    setPendingFocusAssetId(null)
    setSelectedFeature(feature)
    setSelectedConnection(null)
    if (feature.geometry.type === 'Point' && mapRef.current) {
      mapRef.current.flyTo({ center: feature.geometry.coordinates as [number, number], zoom: 17, duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsQuery.data, pendingFocusAssetId])

  const ipSearch = useMutation({
    mutationFn: (query: string) => networkAssetsApi.list({ ipAddress: query, limit: 5 }),
    onSuccess: (result, query) => {
      const feature = result.featureCollection.features[0]
      if (!feature) {
        push(`No equipment found with an IP matching "${query}"`, 'info')
        return
      }
      setIpSearchValue('')
      setActiveProjectId(feature.properties.projectId)
      setPendingFocusAssetId(feature.id)
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Search failed', 'error'),
  })

  const invalidateConnections = () => queryClient.invalidateQueries({ queryKey: ['network-connections', activeProjectId] })

  const createConnection = useMutation({
    mutationFn: ({ fromAssetId, toAssetId }: { fromAssetId: string; toAssetId: string }) =>
      connectionsApi.create({ projectId: activeProjectId, fromAssetId, toAssetId }),
    onSuccess: () => {
      push('Connection created', 'success')
      invalidateConnections()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to create connection', 'error'),
    onSettled: () => setConnectFromId(null),
  })

  const removeConnection = useMutation({
    mutationFn: (id: string) => connectionsApi.remove(id),
    onSuccess: () => {
      push('Connection removed', 'success')
      setSelectedConnection(null)
      invalidateConnections()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to remove connection', 'error'),
  })

  // Click-to-connect: the first asset click stashes its id and waits for a
  // second click to complete the pair. Reads the pending id through a ref
  // (mirrors editingFeatureRef/toolRef) rather than a functional setState
  // updater — StrictMode double-invokes updater functions in dev, and the
  // mutate() call is a side effect that must only ever run once per click.
  const connectFromIdRef = useRef<string | null>(null)
  useEffect(() => {
    connectFromIdRef.current = connectFromId
  }, [connectFromId])

  function handleConnectClick(feature: NetworkAssetFeature) {
    const prev = connectFromIdRef.current
    if (!prev) {
      setConnectFromId(feature.id)
      return
    }
    if (prev === feature.id) {
      push('Pick a different asset to finish the connection', 'info')
      return
    }
    createConnection.mutate({ fromAssetId: prev, toAssetId: feature.id })
  }

  // Click-to-splice: same ref-based two-click pattern as Connect above, but
  // each side needs a specific strand/port picked afterward, so the second
  // click opens a modal instead of firing a mutation directly.
  const spliceFromAssetRef = useRef<NetworkAssetFeature | null>(null)
  useEffect(() => {
    spliceFromAssetRef.current = spliceFromAsset
  }, [spliceFromAsset])

  function handleSpliceClick(feature: NetworkAssetFeature) {
    if (!feature.properties.symbology?.isCable && !feature.properties.symbology?.isEquipment) {
      push('Only cables and equipment carry strands or ports to splice', 'info')
      return
    }
    const prev = spliceFromAssetRef.current
    if (!prev) {
      setSpliceFromAsset(feature)
      return
    }
    if (prev.id === feature.id) {
      push('Pick a different asset to finish the splice', 'info')
      return
    }
    setSplicePair([prev, feature])
    setSpliceFromAsset(null)
  }

  // Demo fault simulator — flags a random healthy cable as faulted, right on
  // the live map, so a review-and-fix workflow can be demonstrated end to end.
  const [resolvingFault, setResolvingFault] = useState(false)
  const [fixReason, setFixReason] = useState('')
  useEffect(() => {
    setResolvingFault(false)
    setFixReason('')
  }, [selectedFeature?.id])

  // IPAM-lite: local draft of the equipment IP field, reset whenever the
  // selected asset changes so an unsaved edit doesn't leak onto the next one.
  const [ipDraft, setIpDraft] = useState('')
  useEffect(() => {
    setIpDraft(selectedFeature?.properties.ipAddress ?? '')
  }, [selectedFeature?.id, selectedFeature?.properties.ipAddress])

  // Manager attribute editing — schema-field values plus the custom-field
  // list, both prefilled from the asset's current attributes and reset
  // whenever a different asset is selected.
  const [editingAttributes, setEditingAttributes] = useState(false)
  const [attrDraft, setAttrDraft] = useState<Record<string, string | number | boolean>>({})
  const [attrCustomDraft, setAttrCustomDraft] = useState<{ label: string; value: string }[]>([])
  useEffect(() => {
    setEditingAttributes(false)
    const attrs = selectedFeature?.properties.attributes ?? {}
    const { _custom, ...rest } = attrs as Record<string, unknown> & { _custom?: { label: string; value: string }[] }
    setAttrDraft(rest as Record<string, string | number | boolean>)
    setAttrCustomDraft(Array.isArray(_custom) ? _custom : [])
  }, [selectedFeature?.id])

  const simulateFault = useMutation({
    mutationFn: async () => {
      const candidates = (assetsQuery.data?.featureCollection.features ?? []).filter(
        (f) => f.geometry.type === 'LineString' && f.properties.status === 'approved' && !f.properties.attributes?.faultActive,
      )
      if (!candidates.length) throw new Error('No healthy cable segments available to simulate a fault on')
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      const reason = FAULT_REASONS[Math.floor(Math.random() * FAULT_REASONS.length)]
      await networkAssetsApi.update(target.id, { attributes: { faultActive: true, faultReason: reason, faultReportedAt: new Date().toISOString() } })
      return { target, reason }
    },
    onSuccess: ({ target, reason }) => {
      push(`Fault reported: ${target.properties.symbology?.name ?? 'Cable'} — ${reason}`, 'error')
      invalidateAssets()
    },
    onError: (err) => push(err instanceof Error ? err.message : 'Failed to simulate a fault', 'error'),
  })

  const resolveFault = useMutation({
    mutationFn: () => {
      if (!selectedFeature) throw new Error('No asset selected')
      return networkAssetsApi.update(selectedFeature.id, { attributes: { faultActive: false, faultResolvedReason: fixReason, faultResolvedAt: new Date().toISOString() } })
    },
    onSuccess: () => {
      push('Fault marked as fixed', 'success')
      setResolvingFault(false)
      setFixReason('')
      setSelectedFeature(null)
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update fault', 'error'),
  })

  const saveGeometry = useMutation({
    mutationFn: () => {
      if (!editingFeature) throw new Error('No feature being edited')
      const type = editingFeature.geometry.type
      const geometry: GeoJsonGeometry =
        type === 'Point'
          ? { type: 'Point', coordinates: editVertices[0] }
          : type === 'LineString'
            ? { type: 'LineString', coordinates: editVertices }
            : { type: 'Polygon', coordinates: [[...editVertices, editVertices[0]]] }
      return networkAssetsApi.update(editingFeature.id, { geometry })
    },
    onSuccess: () => {
      push('Geometry updated', 'success')
      cancelEditGeometry()
      invalidateAssets()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update geometry', 'error'),
  })

  function startEditGeometry(feature: NetworkAssetFeature) {
    const geom = feature.geometry
    const vertices: [number, number][] =
      geom.type === 'Point' ? [geom.coordinates as [number, number]] : geom.type === 'LineString' ? (geom.coordinates as [number, number][]) : (geom.coordinates[0] as [number, number][]).slice(0, -1)
    resetDrawing()
    setSelectedFeature(null)
    setEditingFeature(feature)
    setEditVertices(vertices)
  }

  function cancelEditGeometry() {
    setEditingFeature(null)
    setEditVertices([])
  }

  function resetDrawing() {
    setTool(null)
    setLinePoints([])
    setDraftGeometry(null)
    setSymbologyId('')
    setNotes('')
    setTemplateValues({})
    setCustomFields([])
    setPhotos([])
    setMeasurePoints([])
    setConnectFromId(null)
    setSpliceFromAsset(null)
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
  function undoMeasurePoint() {
    setMeasurePoints((pts) => pts.slice(0, -1))
  }
  function toggleTool(next: Exclude<Tool, null>) {
    const wasActive = tool === next
    resetDrawing()
    setSelectedFeature(null)
    setSelectedConnection(null)
    if (!wasActive) setTool(next)
  }

  function switchBasemap(style: BasemapStyle) {
    if (style === basemapStyle) return
    mapRef.current?.setStyle(`${TILES_BASE}/${style}`)
    setBasemapStyle(style)
  }

  function toggleSymbologyVisibility(id: string) {
    setHiddenSymbologyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: `${TILES_BASE}/dark`,
      // Default view: the whole continental US, not zoomed into any one city.
      bounds: [
        [-125, 24.5],
        [-66.9, 49.5],
      ],
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      transformRequest: (url) => mapifyitTransformRequest(url),
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-left')
    map.on('mousemove', (e) => setCursorLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    map.on('mouseout', () => setCursorLngLat(null))
    map.on('zoom', () => setZoom(map.getZoom()))
    // The initial bounds-fit sets the camera synchronously during
    // construction, before this listener existed to catch its 'zoom' event.
    setZoom(map.getZoom())
    mapRef.current = map
    map.once('load', () => {
      styleReadyRef.current = true
    })

    // The map container's width changes when the sidebar's collapse
    // animation runs (AppShell's icon-rail transition) — that's a layout
    // resize MapLibre's own window-resize listener never sees, and without
    // an explicit resize() the canvas backing store stays mismatched with
    // its CSS size, which renders as a blurry, stretched map. Debounced so
    // it fires once after the CSS transition settles rather than on every
    // intermediate frame — calling resize() mid-transition was aborting the
    // style's initial sprite/tile requests.
    let resizeTimer: ReturnType<typeof setTimeout>
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => map.resize(), 250)
    })
    resizeObserver.observe(mapContainer.current)

    return () => {
      clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      pointMarkersRef.current.clear()
      editVertexMarkersRef.current = []
      editMidpointMarkersRef.current = []
    }
  }, [])

  // Drops whatever tool/edit/selection is active and returns to plain
  // pan-and-zoom — used by both Escape and the explicit Hand/Pan toolbar
  // button, so there's always a visible, discoverable way out of a tool.
  function exitToNormalMode() {
    if (editingFeature) cancelEditGeometry()
    else if (tool || draftGeometry) resetDrawing()
    else if (selectedFeature) setSelectedFeature(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') exitToNormalMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draftGeometry, selectedFeature, editingFeature])

  // Map click behaviour depends on the active tool.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvasContainer()
    canvas.style.cursor = tool ? 'crosshair' : ''

    function onClick(e: maplibregl.MapMouseEvent) {
      if (editingFeature) return
      if (tool === 'point' && !draftGeometry) {
        setDraftGeometry({ type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] })
      } else if ((tool === 'line' || tool === 'polygon') && !draftGeometry) {
        setLinePoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]])
      } else if (tool === 'measure-distance' || tool === 'measure-area') {
        setMeasurePoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]])
      }
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draftGeometry, editingFeature])

  // Feature-click handlers below are registered once and persist across
  // re-renders, so they read editing state through a ref rather than a
  // stale closure value.
  const editingFeatureRef = useRef<NetworkAssetFeature | null>(null)
  useEffect(() => {
    editingFeatureRef.current = editingFeature
  }, [editingFeature])

  const toolRef = useRef<Tool>(null)
  useEffect(() => {
    toolRef.current = tool
  }, [tool])

  // Mirrors draftGeometry into a ref for the same reason toolRef exists: the
  // point-marker click handlers below live inside an effect that doesn't
  // re-run on every draftGeometry change, so reading draftGeometry directly
  // in those closures would see a stale value.
  const draftGeometryRef = useRef<GeoJsonGeometry | null>(null)
  useEffect(() => {
    draftGeometryRef.current = draftGeometry
  }, [draftGeometry])

  // Fly to a project's data the first time it loads after being selected —
  // once per selection, not on every background refetch (e.g. after an
  // approve/reject invalidates the query while the same project is active).
  const lastFitProjectRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    const features = assetsQuery.data?.featureCollection.features
    if (!map || !activeProjectId || !features?.length) return
    if (lastFitProjectRef.current === activeProjectId) return
    lastFitProjectRef.current = activeProjectId
    map.fitBounds(featureCollectionBounds(features), { padding: 80, maxZoom: 17, duration: 800 })
  }, [assetsQuery.data, activeProjectId])

  // Cell tower heatmap — real, live FCC/HIFLD cell tower locations for
  // whatever's in view, layered under everything else on the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const ensureLayer = () => {
      if (map.getSource('cell-towers')) return
      map.addSource('cell-towers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Insert beneath the org's own network layers (if already added) so the
      // heatmap reads as background context, not a layer sitting on top.
      const beforeId = map.getLayer('assets-polygons') ? 'assets-polygons' : undefined
      map.addLayer(
        {
          id: 'cell-towers-heat',
          type: 'heatmap',
          source: 'cell-towers',
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.2,
              'rgba(56,189,248,0.5)',
              0.4,
              'rgba(56,189,248,0.9)',
              0.6,
              'rgba(250,204,21,0.9)',
              0.8,
              'rgba(249,115,22,0.95)',
              1,
              'rgba(220,38,38,1)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 14, 34],
            'heatmap-opacity': 0.7,
          },
        },
        beforeId,
      )
      map.addLayer(
        {
          id: 'cell-towers-points',
          type: 'circle',
          source: 'cell-towers',
          minzoom: 12,
          paint: {
            'circle-radius': 3,
            'circle-color': '#fbbf24',
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(10,14,31,0.6)',
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.9],
          },
        },
        beforeId,
      )
    }

    const refresh = async () => {
      if (!showCellTowers) return
      setCellTowersLoading(true)
      try {
        const data = await fetchCellTowers(map.getBounds())
        const source = map.getSource('cell-towers') as maplibregl.GeoJSONSource | undefined
        source?.setData(data)
      } catch {
        // Best-effort demo layer — a transient failure just leaves the
        // previous data in place, no need to surface an error toast.
      } finally {
        setCellTowersLoading(false)
      }
    }

    if (showCellTowers) {
      // Triggered long after initial load (a user toggle), not during the
      // initial style bootstrap — isStyleLoaded() can spuriously report
      // false for a while at low zoom while basemap tiles keep streaming in,
      // and waiting on 'style.load' here would wait forever (it already
      // fired once, at true startup). addSource/addLayer only need the
      // style object to exist, which it does by now — call directly.
      ensureLayer()
      refresh()
      map.on('moveend', refresh)
    } else {
      if (map.getLayer('cell-towers-heat')) map.removeLayer('cell-towers-heat')
      if (map.getLayer('cell-towers-points')) map.removeLayer('cell-towers-points')
      if (map.getSource('cell-towers')) map.removeSource('cell-towers')
    }

    return () => {
      map.off('moveend', refresh)
    }
  }, [showCellTowers, basemapStyle])

  // Network topology overlay — dashed edges between connected assets.
  // Declared (and thus mounted) before the assets effect below so its layer
  // is added to the style first, painting underneath the real asset layers.
  const connectionsClickHandlerRef = useRef<((e: maplibregl.MapLayerMouseEvent) => void) | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const rawFeatures = connectionsQuery.data?.features ?? []
    const fc = { type: 'FeatureCollection', features: rawFeatures.filter((f) => f.geometry) } as unknown as GeoJSON.FeatureCollection

    const applyData = () => {
      const source = map.getSource('connections') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc)
        return
      }
      map.addSource('connections', { type: 'geojson', data: fc })
      map.addLayer({
        id: 'connections-line',
        type: 'line',
        source: 'connections',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#94a3b8', 'line-width': 2, 'line-dasharray': [1.4, 1.4], 'line-opacity': 0.8 },
      })

      const onConnectionClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (toolRef.current === 'connect' || toolRef.current === 'splice' || editingFeatureRef.current) return
        const f = e.features?.[0]
        if (!f?.properties) return
        const full = rawFeatures.find((x) => x.properties.id === f.properties!.id)
        if (full) {
          setSelectedFeature(null)
          setSelectedConnection(full)
        }
      }
      if (connectionsClickHandlerRef.current) map.off('click', 'connections-line', connectionsClickHandlerRef.current)
      connectionsClickHandlerRef.current = onConnectionClick
      map.on('click', 'connections-line', onConnectionClick)
      map.on('mouseenter', 'connections-line', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'connections-line', () => (map.getCanvas().style.cursor = ''))
    }

    runWhenStyleReady(applyData)
  }, [connectionsQuery.data, basemapStyle])

  // Existing (submitted) assets layer — clicking one opens the review panel.
  // Re-runs on basemapStyle change too, since setStyle() wipes custom
  // sources/layers and this re-adds them once the new style has loaded.
  const assetsClickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null)
  // The click handler is bound once (when the 'assets' source/layers are
  // first created) and never rebound after — later effect runs just call
  // source.setData(). It reads the latest feature collection from this ref
  // rather than closing over the fc built during binding, which would
  // otherwise go stale after the first data refresh.
  const assetsFcRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const rawFc = assetsQuery.data?.featureCollection
    if (!rawFc) {
      // No project selected (or its data hasn't loaded yet) — keep the map
      // clean rather than showing stale assets from a previously selected project.
      const source = map.getSource('assets') as maplibregl.GeoJSONSource | undefined
      source?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const fc: GeoJSON.FeatureCollection = {
      ...rawFc,
      features: rawFc.features
        .filter((f) => !hiddenSymbologyIds.has(f.properties.symbologyId ?? ''))
        // A simulated fault overrides the symbology color with red and marks
        // the feature so the line-width expression below can thicken it.
        .map((f) => (f.properties.attributes?.faultActive ? { ...f, properties: { ...f.properties, color: '#ef4444', faulted: true } } : f)),
    } as GeoJSON.FeatureCollection
    assetsFcRef.current = fc

    const symbologyColor = ['coalesce', ['get', 'color'], FALLBACK_COLOR] as unknown as maplibregl.ExpressionSpecification
    const statusOpacity = ['match', ['get', 'status'], 'rejected', 0.3, 'pending', 0.65, 1] as unknown as maplibregl.ExpressionSpecification
    const lineWidth = ['case', ['==', ['get', 'faulted'], true], 7, 5] as unknown as maplibregl.ExpressionSpecification

    const applyData = () => {
      const source = map.getSource('assets') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc)
        return
      }
      map.addSource('assets', { type: 'geojson', data: fc })
      map.addLayer({
        id: 'assets-polygons',
        type: 'fill',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': symbologyColor, 'fill-opacity': ['*', 0.35, statusOpacity], 'fill-outline-color': symbologyColor },
      })
      map.addLayer({
        id: 'assets-polygons-outline',
        type: 'line',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': symbologyColor, 'line-width': 2, 'line-opacity': statusOpacity },
      })
      // A soft halo beneath the main cable line gives routes the glowing,
      // "highlighted circuit" look of a real fiber network map.
      map.addLayer({
        id: 'assets-lines-halo',
        type: 'line',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': symbologyColor, 'line-width': 11, 'line-blur': 1.5, 'line-opacity': ['*', 0.22, statusOpacity] },
      })
      map.addLayer({
        id: 'assets-lines',
        type: 'line',
        source: 'assets',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': symbologyColor, 'line-width': lineWidth, 'line-opacity': statusOpacity },
      })
      const layers = ['assets-lines', 'assets-polygons']
      if (assetsClickHandlerRef.current) map.off('click', assetsClickHandlerRef.current)
      // A single map-level handler (instead of one per-layer listener each)
      // so a click landing on both a cable and a large background polygon
      // (survey area, project boundary) it happens to cross always picks the
      // cable — lines and points take priority over polygons, never the
      // reverse, regardless of which layer maplibre happens to hit-test first.
      const onFeatureClick = (e: maplibregl.MapMouseEvent) => {
        if (editingFeatureRef.current) return
        const hits = map.queryRenderedFeatures(e.point, { layers })
        const f = hits.find((h) => h.geometry.type === 'LineString') ?? hits[0]
        if (!f?.properties) return
        const full = (assetsFcRef.current as unknown as { features: NetworkAssetFeature[] }).features.find((x) => x.id === f.properties!.id)
        if (!full) return
        if (toolRef.current === 'connect') {
          handleConnectClick(full)
          return
        }
        if (toolRef.current === 'splice') {
          handleSpliceClick(full)
          return
        }
        setSelectedConnection(null)
        setSelectedFeature(full)
      }
      assetsClickHandlerRef.current = onFeatureClick
      map.on('click', onFeatureClick)
      layers.forEach((id) => {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
      })
    }

    // isStyleLoaded() reports false whenever background tiles are still
    // streaming in (unrelated to whether OUR sources/layers are safe to
    // add), which made this intermittently never create the asset
    // lines/polygons layers — runWhenStyleReady tracks the map's real
    // one-time 'load' event instead.
    runWhenStyleReady(applyData)
  }, [assetsQuery.data, hiddenSymbologyIds, basemapStyle])

  // Point assets render as icon markers (not a GPU circle layer) so each one
  // can show the symbology's chosen icon, not just a plain dot.
  const pointMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; content: HTMLDivElement }>>(new Map())
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const features = assetsQuery.data?.featureCollection.features
    if (!features) {
      for (const entry of pointMarkersRef.current.values()) entry.marker.remove()
      pointMarkersRef.current.clear()
      return
    }

    const apply = () => {
      const seen = new Set<string>()
      for (const feature of features) {
        if (feature.geometry.type !== 'Point') continue
        if (feature.id === editingFeature?.id) continue
        if (hiddenSymbologyIds.has(feature.properties.symbologyId ?? '')) continue
        seen.add(feature.id)
        const [lng, lat] = feature.geometry.coordinates as [number, number]
        const color = feature.properties.color || FALLBACK_COLOR
        const equipmentStatus = feature.properties.symbology?.isEquipment ? feature.properties.operationalStatus : null
        const existing = pointMarkersRef.current.get(feature.id)
        if (existing) {
          existing.marker.setLngLat([lng, lat])
          paintPointMarker(existing.content, color, feature.properties.icon, feature.properties.iconUrl, feature.properties.status, equipmentStatus)
          existing.content.onclick = (e) => {
            e.stopPropagation()
            if (editingFeatureRef.current) return
            if (toolRef.current === 'connect') handleConnectClick(feature)
            else if (toolRef.current === 'splice') handleSpliceClick(feature)
            else if ((toolRef.current === 'line' || toolRef.current === 'polygon') && !draftGeometryRef.current) {
              // Drawing a line/polygon: clicking an existing point snaps that
              // exact coordinate in as the next vertex instead of opening its
              // review panel — this is how you connect a wire to real assets
              // rather than an approximate nearby spot.
              setLinePoints((pts) => [...pts, feature.geometry.coordinates as [number, number]])
            } else if (toolRef.current === 'line' || toolRef.current === 'polygon') {
              // Shape already finished (draftGeometry set) — fall through to normal select.
              setSelectedConnection(null)
              setSelectedFeature(feature)
            } else {
              setSelectedConnection(null)
              setSelectedFeature(feature)
            }
          }
        } else {
          const wrapper = document.createElement('div')
          wrapper.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:3px;line-height:0'
          const content = document.createElement('div')
          paintPointMarker(content, color, feature.properties.icon, feature.properties.iconUrl, feature.properties.status, equipmentStatus)
          content.onclick = (e) => {
            e.stopPropagation()
            if (editingFeatureRef.current) return
            if (toolRef.current === 'connect') handleConnectClick(feature)
            else if (toolRef.current === 'splice') handleSpliceClick(feature)
            else if ((toolRef.current === 'line' || toolRef.current === 'polygon') && !draftGeometryRef.current) {
              // Drawing a line/polygon: clicking an existing point snaps that
              // exact coordinate in as the next vertex instead of opening its
              // review panel — this is how you connect a wire to real assets
              // rather than an approximate nearby spot.
              setLinePoints((pts) => [...pts, feature.geometry.coordinates as [number, number]])
            } else if (toolRef.current === 'line' || toolRef.current === 'polygon') {
              // Shape already finished (draftGeometry set) — fall through to normal select.
              setSelectedConnection(null)
              setSelectedFeature(feature)
            } else {
              setSelectedConnection(null)
              setSelectedFeature(feature)
            }
          }
          wrapper.appendChild(content)
          if (feature.properties.symbology && LABELED_SYMBOLOGY_NAMES.has(feature.properties.symbology.name)) {
            const label = document.createElement('div')
            label.textContent = feature.properties.symbology.name
            label.style.cssText =
              'pointer-events:none;white-space:nowrap;font-size:10px;font-weight:700;color:#e2e8f0;background:rgba(10,14,31,.85);padding:1px 6px;border-radius:4px;letter-spacing:.02em;line-height:1.5'
            wrapper.appendChild(label)
          }
          const marker = new maplibregl.Marker({ element: wrapper }).setLngLat([lng, lat]).addTo(map)
          pointMarkersRef.current.set(feature.id, { marker, content })
        }
      }
      for (const [id, entry] of pointMarkersRef.current) {
        if (!seen.has(id)) {
          entry.marker.remove()
          pointMarkersRef.current.delete(id)
        }
      }
    }

    // Unlike the GL sources/layers above, DOM markers don't depend on the
    // style being loaded — call directly rather than gating on an event that
    // may already have fired (which left markers permanently un-rendered).
    apply()
  }, [assetsQuery.data, editingFeature?.id, hiddenSymbologyIds])

  // Pulsing alert marker at the midpoint of every actively-faulted cable —
  // the dramatic "something's wrong here" cue for the demo fault simulator.
  const faultMarkersRef = useRef<maplibregl.Marker[]>([])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    faultMarkersRef.current.forEach((m) => m.remove())
    faultMarkersRef.current = []

    for (const f of activeFaults) {
      if (f.geometry.type !== 'LineString') continue
      const coords = f.geometry.coordinates as [number, number][]
      const mid = coords[Math.floor(coords.length / 2)]
      const el = document.createElement('div')
      el.className = 'fault-marker'
      el.style.cssText = [
        'width:24px',
        'height:24px',
        'border-radius:9999px',
        'background:#ef4444',
        'border:2.5px solid #ffffff',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
      ].join(';')
      el.innerHTML = renderToStaticMarkup(<AlertTriangle size={13} color="#ffffff" strokeWidth={2.75} />)
      el.onclick = (e) => {
        e.stopPropagation()
        setSelectedFeature(f)
      }
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map)
      faultMarkersRef.current.push(marker)
    }

    return () => {
      faultMarkersRef.current.forEach((m) => m.remove())
      faultMarkersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsQuery.data])

  // Geometry-editing handles — a draggable marker per vertex (with a delete
  // badge once above the minimum vertex count) plus a smaller midpoint
  // marker per edge for inserting new vertices. Torn down and rebuilt on
  // every change rather than incrementally reconciled — simpler and safe at
  // the vertex counts this app deals with.
  const editVertexMarkersRef = useRef<maplibregl.Marker[]>([])
  const editMidpointMarkersRef = useRef<maplibregl.Marker[]>([])

  // Vertex (drag-handle) markers. Deliberately keyed on editVertices.length,
  // not the full array: each marker.on('drag', ...) below calls
  // setEditVertices on every mousemove tick, and maplibregl.Marker.remove()
  // unbinds the map-level mousemove/mouseup listeners it uses to track an
  // in-progress drag — so rebuilding on every coordinate change tore down
  // the very marker being dragged mid-gesture (it would move one pixel and
  // then stop following the cursor). Markers only need to be (re)created
  // when entering/leaving edit mode or when the vertex COUNT changes (add
  // via midpoint click, delete via the per-vertex button); a marker already
  // tracks and renders its own drag position natively in between.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    editVertexMarkersRef.current.forEach((m) => m.remove())
    editVertexMarkersRef.current = []

    if (!editingFeature) return
    const geomType = editingFeature.geometry.type
    const minVertices = geomType === 'Polygon' ? 3 : geomType === 'LineString' ? 2 : 1
    const canDelete = editVertices.length > minVertices && geomType !== 'Point'

    editVertices.forEach((coord, index) => {
      const el = document.createElement('div')
      paintVertexMarker(el, canDelete)
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' }).setLngLat(coord).addTo(map)
      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat()
        setEditVertices((prev) => {
          const next = [...prev]
          next[index] = [lng, lat]
          return next
        })
      })
      const deleteBtn = el.querySelector('[data-role="delete-vertex"]') as HTMLButtonElement | null
      if (deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation()
          setEditVertices((prev) => prev.filter((_, i) => i !== index))
        }
      }
      editVertexMarkersRef.current.push(marker)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFeature, editVertices.length])

  // Midpoint ("insert vertex here") markers. These have no drag state to
  // preserve, so rebuilding them on every coordinate change (to stay
  // positioned at the true segment midpoints while a vertex is dragged) is
  // cheap and correct — unlike the vertex markers above.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    editMidpointMarkersRef.current.forEach((m) => m.remove())
    editMidpointMarkersRef.current = []

    if (!editingFeature) return
    const geomType = editingFeature.geometry.type
    if (geomType === 'Point') return

    const segments: { a: [number, number]; b: [number, number]; insertAt: number }[] = []
    for (let i = 0; i < editVertices.length - 1; i++) segments.push({ a: editVertices[i], b: editVertices[i + 1], insertAt: i + 1 })
    if (geomType === 'Polygon' && editVertices.length >= 2) segments.push({ a: editVertices[editVertices.length - 1], b: editVertices[0], insertAt: editVertices.length })

    segments.forEach(({ a, b, insertAt }) => {
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const el = document.createElement('div')
      paintMidpointMarker(el)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map)
      el.onclick = (e) => {
        e.stopPropagation()
        setEditVertices((prev) => {
          const next = [...prev]
          next.splice(insertAt, 0, mid)
          return next
        })
      }
      editMidpointMarkersRef.current.push(marker)
    })
  }, [editingFeature, editVertices])

  // Draft (in-progress) drawing layer.
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    pendingMarkerRef.current?.remove()
    pendingMarkerRef.current = null
    // Points being edited get their own draggable handle from the vertex-editing
    // effect, so only draw the plain pending marker for the create flow.
    if (!editingFeature && draftGeometry?.type === 'Point') {
      pendingMarkerRef.current = new maplibregl.Marker({ color: '#2f4fb4' }).setLngLat(draftGeometry.coordinates as [number, number]).addTo(map)
    }

    let pathCoords: [number, number][] = linePoints
    let polygonRing: [number, number][] | null = null
    if (editingFeature && editingFeature.geometry.type === 'Polygon') {
      polygonRing = [...editVertices, editVertices[0]]
      pathCoords = editVertices
    } else if (editingFeature && editingFeature.geometry.type === 'LineString') {
      pathCoords = editVertices
    } else {
      if (draftGeometry?.type === 'LineString') pathCoords = draftGeometry.coordinates as [number, number][]
      if (draftGeometry?.type === 'Polygon') {
        polygonRing = draftGeometry.coordinates[0] as [number, number][]
        pathCoords = polygonRing.slice(0, -1)
      }
    }

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(polygonRing ? [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [polygonRing] }, properties: {} }] : []),
        ...(!polygonRing && pathCoords.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: pathCoords }, properties: {} }] : []),
        // Edit mode already shows draggable vertex handles for every point —
        // the generic dots here would just duplicate them.
        ...(editingFeature ? [] : pathCoords.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} }))),
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

    runWhenStyleReady(applyDraft)
  }, [draftGeometry, linePoints, editingFeature, editVertices, basemapStyle])

  // Measurement layer — a distinct amber dashed style so it reads as a
  // temporary annotation rather than a draft asset.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const isArea = tool === 'measure-area'
    const ring = isArea && measurePoints.length >= 3 ? [...measurePoints, measurePoints[0]] : null

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(ring ? [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [ring] }, properties: {} }] : []),
        ...(measurePoints.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: ring ?? measurePoints }, properties: {} }] : []),
        ...measurePoints.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} })),
      ],
    }

    const applyMeasure = () => {
      const source = map.getSource('measure') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(fc)
        return
      }
      map.addSource('measure', { type: 'geojson', data: fc })
      map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } })
      map.addLayer({ id: 'measure-vertices', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
    }

    runWhenStyleReady(applyMeasure)
  }, [measurePoints, tool, basemapStyle])

  const showForm = Boolean(draftGeometry)
  const missingRequiredField = effectiveFields.some((f) => f.required && !templateValues[f.key])
  const needsPhoto = !!activeProject?.photosRequired && photos.length === 0
  const submitDisabled = !symbologyId || missingRequiredField || needsPhoto
  const canFinishShape = (tool === 'line' && linePoints.length >= 2) || (tool === 'polygon' && linePoints.length >= 3)
  const measureDistance = tool === 'measure-distance' || tool === 'measure-area' ? pathDistanceMeters(tool === 'measure-area' && measurePoints.length >= 3 ? [...measurePoints, measurePoints[0]] : measurePoints) : 0
  const measureArea = tool === 'measure-area' && measurePoints.length >= 3 ? ringAreaSqMeters(measurePoints) : 0
  const featureCount = assetsQuery.data?.featureCollection.features.length ?? 0
  const connectionCount = connectionsQuery.data?.features.length ?? 0
  const hasEquipmentAssets = (assetsQuery.data?.featureCollection.features ?? []).some((f) => f.properties.symbology?.isEquipment)

  function connectionAssetLabel(assetId: string): string {
    const asset = assetsQuery.data?.featureCollection.features.find((f) => f.id === assetId)
    if (!asset) return 'Unknown asset'
    return asset.properties.symbology?.name ?? asset.properties.assetType.replace(/_/g, ' ')
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-black/30 bg-primary-950 px-2.5">
          <select
            value={activeProjectId}
            onChange={(e) => {
              setActiveProjectId(e.target.value)
              resetDrawing()
            }}
            className="h-7 max-w-[10rem] rounded-md border border-white/10 bg-white/[0.06] px-2 text-xs font-semibold text-slate-100 outline-none focus:ring-2 focus:ring-primary-400/40"
          >
            <option value="" className="text-ink">
              Select project…
            </option>
            {(projectsQuery.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id} className="text-ink">
                {p.name}
              </option>
            ))}
          </select>
          <div className="mx-1.5 h-5 w-px bg-white/10" />
          <ToolbarButton
            active={!tool && !editingFeature && !selectedFeature}
            disabled={!tool && !editingFeature && !selectedFeature}
            onClick={exitToNormalMode}
            icon={<Hand size={15} />}
            label="Pan"
          />
          <ToolbarButton active={tool === 'point'} disabled={!pointSymbologies.length || !!editingFeature} onClick={() => toggleTool('point')} icon={<MapPin size={15} />} label={tool === 'point' ? 'Cancel' : 'Point'} />
          <ToolbarButton active={tool === 'line'} disabled={!lineSymbologies.length || !!editingFeature} onClick={() => toggleTool('line')} icon={<Spline size={15} />} label={tool === 'line' ? 'Cancel' : 'Line'} />
          <ToolbarButton active={tool === 'polygon'} disabled={!polygonSymbologies.length || !!editingFeature} onClick={() => toggleTool('polygon')} icon={<Square size={15} />} label={tool === 'polygon' ? 'Cancel' : 'Polygon'} />
          {canEditGeometry && (
            <ToolbarButton active={tool === 'connect'} disabled={featureCount < 2 || !!editingFeature} onClick={() => toggleTool('connect')} icon={<Link size={15} />} label={tool === 'connect' ? 'Cancel' : 'Connect'} />
          )}
          {canEditGeometry && (
            <ToolbarButton active={tool === 'splice'} disabled={featureCount < 2 || !!editingFeature} onClick={() => toggleTool('splice')} icon={<Cable size={15} />} label={tool === 'splice' ? 'Cancel' : 'Splice'} />
          )}
          <div className="mx-1.5 h-5 w-px bg-white/10" />
          <ToolbarButton active={tool === 'measure-distance'} disabled={!!editingFeature} onClick={() => toggleTool('measure-distance')} icon={<Ruler size={15} />} label={tool === 'measure-distance' ? 'Cancel' : 'Distance'} />
          <ToolbarButton active={tool === 'measure-area'} disabled={!!editingFeature} onClick={() => toggleTool('measure-area')} icon={<Pentagon size={15} />} label={tool === 'measure-area' ? 'Cancel' : 'Area'} />
          <div className="mx-1.5 h-5 w-px bg-white/10" />
          <ToolbarButton disabled={!!editingFeature} onClick={() => setImportOpen(true)} icon={<Upload size={15} />} label="Import" />
          <ToolbarButton disabled={!!editingFeature} onClick={() => setExportOpen(true)} icon={<Download size={15} />} label="Export" />
          <div className="mx-1.5 h-5 w-px bg-white/10" />
          <div className="relative flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-slate-400" />
            <input
              value={ipSearchValue}
              onChange={(e) => setIpSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ipSearchValue.trim()) ipSearch.mutate(ipSearchValue.trim())
              }}
              placeholder="Search IP…"
              className="h-7 w-32 rounded-md border border-white/10 bg-white/[0.06] pl-7 pr-2 text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-primary-400/40"
            />
          </div>

          {canApprove && (
            <>
              <div className="mx-1.5 h-5 w-px bg-white/10" />
              <ToolbarButton disabled={!!editingFeature || simulateFault.isPending || !activeProjectId} onClick={() => simulateFault.mutate()} icon={<Zap size={15} />} label="Simulate Fault" />
            </>
          )}

          {activeFaults.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const fault = activeFaults[0]
                setSelectedFeature(fault)
                const coords = fault.geometry.type === 'LineString' ? (fault.geometry.coordinates as [number, number][])[Math.floor((fault.geometry.coordinates as [number, number][]).length / 2)] : undefined
                if (coords && mapRef.current) mapRef.current.flyTo({ center: coords, zoom: 17, duration: 600 })
              }}
              className="ml-1.5 flex items-center gap-1.5 rounded-md bg-danger-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-danger-700"
            >
              <AlertTriangle size={13} />
              {activeFaults.length} Active Fault{activeFaults.length === 1 ? '' : 's'}
            </button>
          )}

          <div className="flex-1" />
          <NotificationBell dark />
          <div className="mx-1 h-5 w-px bg-white/10" />
          <Dropdown
            align="right"
            trigger={
              <span className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/10">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-600 text-[11px] font-bold text-white">{initials(user?.name)}</span>
                <span className="hidden text-left lg:block">
                  <span className="block text-xs font-semibold leading-tight text-white">{user?.name}</span>
                  <span className="block text-[10px] text-slate-400">{user?.role}</span>
                </span>
              </span>
            }
            items={[{ label: 'Sign out', icon: <LogOut className="h-4 w-4" />, danger: true, onClick: logout }]}
          />
        </div>

        <div className="relative min-h-0 flex-1">
          {/* MapLibre owns this container exclusively — it appends its own
              canvas/controls into it imperatively, outside React's control.
              It must never also receive React-rendered children, or React's
              reconciliation and MapLibre's direct DOM writes fight each other. */}
          <div ref={mapContainer} className="h-full w-full" />

          {/* Basemap switcher + layers panel toggle */}
          <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/10 bg-primary-950/95 shadow-[var(--shadow-card-hover)] backdrop-blur">
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

            <div className="relative">
              <button
                type="button"
                onClick={() => setLayersOpen((v) => !v)}
                title="Layers"
                className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 shadow-[var(--shadow-card-hover)] backdrop-blur transition-colors ${
                  layersOpen ? 'bg-primary-600 text-white' : 'bg-primary-950/95 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Layers3 size={15} />
              </button>
              {layersOpen && (
                <Card className="absolute left-0 top-10 z-20 w-56 overflow-hidden !rounded-lg shadow-[var(--shadow-card-hover)]">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Layers</div>
                  {symbologyLayers.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto p-2">
                      {symbologyLayers.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <Checkbox checked={!hiddenSymbologyIds.has(s.id)} onChange={() => toggleSymbologyVisibility(s.id)} />
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: s.color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }} />
                          <span className="truncate">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-xs text-muted">No assets loaded yet.</p>
                  )}
                </Card>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCellTowers((v) => !v)}
              title="Cell tower heatmap (live FCC/HIFLD data)"
              className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 shadow-[var(--shadow-card-hover)] backdrop-blur transition-colors ${
                showCellTowers ? 'bg-primary-600 text-white' : 'bg-primary-950/95 text-slate-300 hover:bg-white/10'
              }`}
            >
              {cellTowersLoading ? <Spinner className="h-3.5 w-3.5 border-white/30 border-t-white" /> : <Radio size={15} />}
            </button>

            {showCellTowers && (
              <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-primary-950/95 px-2.5 py-2 shadow-[var(--shadow-card-hover)] backdrop-blur">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cell Density</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-medium text-slate-400">Low</span>
                  <div className="h-2 w-20 rounded-full" style={{ background: 'linear-gradient(to right, rgba(56,189,248,0.35), rgba(56,189,248,.9), rgba(250,204,21,.9), rgba(249,115,22,.95), rgba(220,38,38,1))' }} />
                  <span className="text-[9px] font-medium text-slate-400">High</span>
                </div>
              </div>
            )}
          </div>

          {/* Symbology legend for the active project — grouped by kind, with a
              live count of how many of each are on the map right now. Hidden
              while a side panel is open so the two can't collide on shorter
              viewports. */}
          {activeProjectId && !!symbologyLayers.length && !selectedFeature && !editingFeature && !showForm && !selectedConnection && (
            <Card className="absolute bottom-4 right-4 z-20 w-64 overflow-hidden !rounded-lg shadow-[var(--shadow-card-hover)]">
              <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Layers size={12} />
                  Legend
                </span>
                <span className="text-[11px] font-semibold text-slate-400">{featureCount} total</span>
              </div>
              <div className="max-h-72 overflow-y-auto px-3 py-2.5">
                {legendGroups.map(({ label, type }) => {
                  const items = symbologyLayers.filter((s) => s.geometryType === type)
                  if (!items.length) return null
                  return (
                    <div key={type} className="mb-2.5 last:mb-0">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                      <div className="space-y-1">
                        {items.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            {type === 'LineString' ? (
                              <span className="h-1 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                            ) : type === 'Polygon' ? (
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color, opacity: 0.5, boxShadow: `inset 0 0 0 1.5px ${s.color}` }} />
                            ) : (
                              <LegendPointSwatch color={s.color} icon={s.icon} iconUrl={s.iconUrl} />
                            )}
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="tabular-nums text-slate-400">{s.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {connectionCount > 0 && (
                  <div className="mb-2.5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Network</p>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <span className="h-0 w-3.5 shrink-0 border-t-2 border-dashed border-slate-400" />
                      <span className="min-w-0 flex-1 truncate">Connections</span>
                      <span className="tabular-nums text-slate-400">{connectionCount}</span>
                    </div>
                  </div>
                )}
                {hasEquipmentAssets && (
                  <div className="mb-0">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Equipment Status</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {(Object.keys(OPERATIONAL_STATUS_COLOR) as OperationalStatus[]).map((s) => (
                        <div key={s} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OPERATIONAL_STATUS_COLOR[s] }} />
                          {OPERATIONAL_STATUS_LABEL[s]}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {assetsQuery.isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <Spinner />
            </div>
          )}

          {!activeProjectId && tool === null && !selectedFeature && !editingFeature && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">Select a project in the toolbar to start drawing</div>
          )}

          {tool === 'point' && !draftGeometry && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <span>Click the map to place a point</span>
              <span className="h-3.5 w-px bg-white/20" />
              <button onClick={() => setCoordinateEntryOpen(true)} className="flex items-center gap-1 rounded p-1 text-white/80 hover:bg-white/20 hover:text-white">
                <Keyboard size={13} />
                Enter coordinates
              </button>
            </div>
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
              <span className="h-3.5 w-px bg-white/20" />
              <button onClick={() => setCoordinateEntryOpen(true)} className="flex items-center gap-1 rounded p-1 text-white/80 hover:bg-white/20 hover:text-white">
                <Keyboard size={13} />
                Enter coordinates
              </button>
            </div>
          )}

          {tool === 'connect' && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <Link size={13} />
              <span>{connectFromId ? 'Click the asset to connect it to' : 'Click an asset to start a connection'}</span>
              {connectFromId && (
                <button onClick={() => setConnectFromId(null)} className="ml-1 rounded p-1 hover:bg-white/20" title="Start over">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {tool === 'splice' && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <Cable size={13} />
              <span>{spliceFromAsset ? 'Click the cable or equipment to splice it to' : 'Click a cable or equipment asset to start a splice'}</span>
              {spliceFromAsset && (
                <button onClick={() => setSpliceFromAsset(null)} className="ml-1 rounded p-1 hover:bg-white/20" title="Start over">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {(tool === 'measure-distance' || tool === 'measure-area') && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {measurePoints.length === 0 ? (
                <span>Click to start measuring {tool === 'measure-area' ? 'an area' : 'a distance'}</span>
              ) : (
                <span className="tabular-nums">
                  {formatDistance(measureDistance)}
                  {tool === 'measure-area' && measurePoints.length >= 3 && <> · {formatArea(measureArea)}</>}
                  {tool === 'measure-area' && measurePoints.length < 3 && <> · add {3 - measurePoints.length} more point{3 - measurePoints.length === 1 ? '' : 's'} for area</>}
                </span>
              )}
              <button onClick={undoMeasurePoint} disabled={!measurePoints.length} className="ml-1 rounded p-1 hover:bg-white/20 disabled:opacity-40">
                <Undo2 size={14} />
              </button>
              <button onClick={() => setMeasurePoints([])} disabled={!measurePoints.length} className="rounded p-1 hover:bg-white/20 disabled:opacity-40" title="Clear">
                <Trash2 size={14} />
              </button>
              <button onClick={resetDrawing} className="rounded p-1 hover:bg-white/20" title="Exit measure mode">
                <X size={14} />
              </button>
            </div>
          )}

          {/* New-asset submission panel */}
          {showForm && (
            <div className="absolute right-4 top-4 z-20 w-80">
              <Card className="overflow-hidden !rounded-lg shadow-xl">
                <PanelHeader icon={<MapPin size={14} />} title={`New ${draftGeometry && GEOMETRY_LABEL[draftGeometry.type]} Asset`} right={<Badge tone="neutral">{draftGeometry?.type}</Badge>} />
                <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
                  <Select
                    label="Symbology"
                    value={symbologyId}
                    onChange={(e) => setSymbologyId(e.target.value)}
                    placeholder="Select symbology"
                    options={eligibleSymbologies.map((s) => ({ value: s.id, label: s.name }))}
                    containerClassName="mb-3"
                  />

                  {effectiveFields.length > 0 ? (
                    effectiveFields.map((f) => (
                      <TemplateFieldInput
                        key={f.key}
                        field={f}
                        value={templateValues[f.key]}
                        onChange={(v) => setTemplateValues((prev) => ({ ...prev, [f.key]: v }))}
                      />
                    ))
                  ) : (
                    <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} containerClassName="mb-3" />
                  )}

                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Custom Fields</span>
                    </div>
                    {customFields.map((c, i) => (
                      <div key={i} className="mb-1.5 flex items-center gap-1.5">
                        <Input
                          value={c.label}
                          onChange={(e) => setCustomFields((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, label: e.target.value } : cf)))}
                          placeholder="Label, e.g. Jober"
                          containerClassName="flex-1"
                        />
                        <Input
                          value={c.value}
                          onChange={(e) => setCustomFields((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, value: e.target.value } : cf)))}
                          placeholder="Value"
                          containerClassName="flex-1"
                        />
                        <button type="button" onClick={() => setCustomFields((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-danger-600">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => setCustomFields((prev) => [...prev, { label: '', value: '' }])}>
                      + Add custom field
                    </Button>
                  </div>

                  <div className="mb-3">
                    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <Camera size={14} />
                      Photos {activeProject?.photosRequired && <span className="text-danger-500">*</span>}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                    />
                    {photos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {photos.map((f, i) => (
                          <span key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {f.name}
                            <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-slate-700">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {needsPhoto && <p className="mt-1 text-xs font-medium text-danger-600">At least one photo is required for this project.</p>}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetDrawing} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={() => createAsset.mutate()} loading={createAsset.isPending} disabled={submitDisabled} className="flex-1">
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
              <Card className="overflow-hidden !rounded-lg shadow-xl">
                <PanelHeader
                  icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedFeature.properties.symbology?.color ?? FALLBACK_COLOR }} />}
                  title={selectedFeature.properties.symbology?.name ?? selectedFeature.properties.assetType.replace(/_/g, ' ')}
                  subtitle={selectedFeature.properties.geometryType}
                  onClose={() => setSelectedFeature(null)}
                />
                <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
                  <Badge tone={selectedFeature.properties.status === 'approved' ? 'success' : selectedFeature.properties.status === 'rejected' ? 'danger' : 'warning'} className="mb-3">
                    {selectedFeature.properties.status}
                  </Badge>
                  {assetCustomer && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary-50 px-2.5 py-2 text-xs">
                      <Contact size={14} className="shrink-0 text-primary-600" />
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">{assetCustomer.name}</div>
                        <div className="truncate text-primary-700">{assetCustomer.email || assetCustomer.phone || 'Customer on this asset'}</div>
                      </div>
                    </div>
                  )}
                  {selectedFeature.properties.symbology?.isEquipment && (
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <Radio size={12} />
                        Equipment Status
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(OPERATIONAL_STATUS_COLOR) as OperationalStatus[]).map((s) => {
                          const active = selectedFeature.properties.operationalStatus === s
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setOperationalStatus.mutate({ id: selectedFeature.id, operationalStatus: s })}
                              disabled={setOperationalStatus.isPending}
                              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              style={
                                active
                                  ? { backgroundColor: OPERATIONAL_STATUS_COLOR[s], borderColor: OPERATIONAL_STATUS_COLOR[s], color: '#ffffff' }
                                  : { borderColor: '#e2e8f0', color: '#475569' }
                              }
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active ? '#ffffff' : OPERATIONAL_STATUS_COLOR[s] }} />
                              {OPERATIONAL_STATUS_LABEL[s]}
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex items-end gap-1.5">
                        <Input
                          label="IP Address"
                          value={ipDraft}
                          onChange={(e) => setIpDraft(e.target.value)}
                          placeholder="e.g. 10.20.30.5"
                          containerClassName="flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIpAddress.mutate({ id: selectedFeature.id, ipAddress: ipDraft.trim() })}
                          loading={setIpAddress.isPending}
                          disabled={ipDraft.trim() === (selectedFeature.properties.ipAddress ?? '')}
                        >
                          Save
                        </Button>
                      </div>

                      <div className="mt-3">
                        {portsQuery.data && portsQuery.data.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setPortsExpanded((v) => !v)}
                            className="mb-1.5 flex w-full items-center justify-between gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
                          >
                            <span className="flex items-center gap-1.5">
                              <Waypoints size={12} />
                              Ports ({portsQuery.data.length})
                            </span>
                            {portsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        ) : (
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            <Waypoints size={12} />
                            Ports
                          </div>
                        )}
                        {portsQuery.data && portsQuery.data.length > 0 && !portsExpanded && (
                          <div className="flex flex-wrap gap-1">
                            {portsQuery.data.slice(0, 8).map((port) => (
                              <span key={port.id} className={`h-2 w-2 rounded-full ${port.status === 'connected' ? 'bg-success-500' : 'bg-slate-300'}`} title={`Port ${port.portNumber}: ${port.status}`} />
                            ))}
                            {portsQuery.data.length > 8 && <span className="text-[10px] text-slate-400">+{portsQuery.data.length - 8}</span>}
                          </div>
                        )}
                        {portsQuery.data && portsQuery.data.length > 0 && portsExpanded ? (
                          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
                            {portsQuery.data.map((port) => (
                              <div key={port.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-100">
                                <span className="font-semibold text-ink">Port {port.portNumber}</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => updatePortStatus.mutate({ portId: port.id, status: port.status === 'free' ? 'connected' : 'free' })}
                                    disabled={updatePortStatus.isPending}
                                    className="disabled:opacity-50"
                                  >
                                    <Badge tone={port.status === 'connected' ? 'success' : 'neutral'}>{port.status === 'connected' ? 'Connected' : 'Free'}</Badge>
                                  </button>
                                  <button
                                    type="button"
                                    title="Trace impact from this port"
                                    onClick={() => runTrace.mutate({ portId: port.id })}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary-600"
                                  >
                                    <Route size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : portsQuery.data && portsQuery.data.length > 0 ? null : showGeneratePorts ? (
                          <div className="flex items-end gap-1.5">
                            <Input
                              label="Port count"
                              type="number"
                              min={1}
                              max={1000}
                              value={portCountChoice}
                              onChange={(e) => setPortCountChoice(e.target.value)}
                              containerClassName="flex-1"
                            />
                            <Button size="sm" onClick={() => generatePorts.mutate()} loading={generatePorts.isPending}>
                              Generate
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => setShowGeneratePorts(true)}>
                            Generate Ports
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedFeature.properties.symbology?.isCable && (
                    <div className="mb-3">
                      {strandsQuery.data && strandsQuery.data.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setStrandsExpanded((v) => !v)}
                          className="mb-1.5 flex w-full items-center justify-between gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
                        >
                          <span className="flex items-center gap-1.5">
                            <Cable size={12} />
                            Strands ({strandsQuery.data.length})
                          </span>
                          {strandsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      ) : (
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          <Cable size={12} />
                          Strands
                        </div>
                      )}
                      {strandsQuery.data && strandsQuery.data.length > 0 && !strandsExpanded && (
                        <div className="flex flex-wrap gap-1">
                          {strandsQuery.data.slice(0, 12).map((strand) => (
                            <span
                              key={strand.id}
                              className="h-2.5 w-2.5 rounded-full ring-1 ring-slate-200"
                              style={{ backgroundColor: strand.color.toLowerCase() }}
                              title={`Strand #${strand.strandNumber}: ${STRAND_STATUS_LABEL[strand.status]}`}
                            />
                          ))}
                          {strandsQuery.data.length > 12 && <span className="text-[10px] text-slate-400">+{strandsQuery.data.length - 12}</span>}
                        </div>
                      )}
                      {strandsQuery.data && strandsQuery.data.length > 0 && strandsExpanded ? (
                        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
                          {strandsQuery.data.map((strand) => (
                            <button
                              key={strand.id}
                              type="button"
                              onClick={() => setSelectedStrandForEdit(strand)}
                              className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-left text-xs ring-1 ring-slate-100 hover:ring-primary-200"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: strand.color.toLowerCase() }} />
                                <span className="font-semibold text-ink">#{strand.strandNumber}</span>
                                <span className="text-muted">Tube {strand.tubeNumber}</span>
                                {strand.assignedCustomer && <span className="truncate text-primary-600">· {strand.assignedCustomer.name}</span>}
                              </div>
                              <Badge tone={STRAND_STATUS_TONE[strand.status]}>{STRAND_STATUS_LABEL[strand.status]}</Badge>
                            </button>
                          ))}
                        </div>
                      ) : strandsQuery.data && strandsQuery.data.length > 0 ? null : showGenerateStrands ? (
                        <div className="flex items-end gap-1.5">
                          <Select
                            label="Strand count"
                            value={strandCountChoice}
                            onChange={(e) => setStrandCountChoice(e.target.value)}
                            options={[12, 24, 48, 96, 144, 288].map((n) => ({ value: String(n), label: `${n}F` }))}
                            containerClassName="flex-1"
                          />
                          <Button size="sm" onClick={() => generateStrands.mutate()} loading={generateStrands.isPending}>
                            Generate
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => setShowGenerateStrands(true)}>
                          Generate Strands
                        </Button>
                      )}
                    </div>
                  )}
                  {Boolean(selectedFeature.properties.attributes?.faultActive) && (
                    <div className="mb-3 rounded-lg border border-danger-200 bg-danger-50 p-2.5">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-danger-700">
                        <AlertTriangle size={13} />
                        Active Fault
                      </div>
                      <p className="mb-2 text-xs text-danger-700">{String(selectedFeature.properties.attributes.faultReason)}</p>
                      {!resolvingFault ? (
                        <Button size="sm" variant="danger" leftIcon={<Wrench size={13} />} onClick={() => setResolvingFault(true)} className="w-full">
                          Mark as Fixed
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <Textarea placeholder="What fixed it? (required)" value={fixReason} onChange={(e) => setFixReason(e.target.value)} rows={2} />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setResolvingFault(false)} className="flex-1">
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => resolveFault.mutate()} loading={resolveFault.isPending} disabled={!fixReason.trim()} className="flex-1">
                              Confirm Fix
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {(() => {
                    const rawAttrs = Object.entries(selectedFeature.properties.attributes || {}).filter(([k]) => !k.startsWith('fault') && k !== '_custom')
                    const customList = ((selectedFeature.properties.attributes as Record<string, unknown> | undefined)?._custom as { label: string; value: string }[] | undefined) ?? []
                    const schemaFields = selectedFeature.properties.symbology?.fields ?? []
                    if (!rawAttrs.length && !customList.length && !schemaFields.length) return null
                    return (
                      <div className="mb-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Attributes</span>
                          {canEditGeometry && !editingAttributes && (
                            <button type="button" onClick={() => setEditingAttributes(true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary-600" title="Edit attributes">
                              <PenLine size={13} />
                            </button>
                          )}
                        </div>
                        {editingAttributes ? (
                          <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                            {schemaFields.map((f) => (
                              <TemplateFieldInput key={f.key} field={f} value={attrDraft[f.key]} onChange={(v) => setAttrDraft((prev) => ({ ...prev, [f.key]: v }))} />
                            ))}
                            <div>
                              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Custom Fields</span>
                              {attrCustomDraft.map((c, i) => (
                                <div key={i} className="mb-1.5 flex items-center gap-1.5">
                                  <Input
                                    value={c.label}
                                    onChange={(e) => setAttrCustomDraft((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, label: e.target.value } : cf)))}
                                    placeholder="Label"
                                    containerClassName="flex-1"
                                  />
                                  <Input
                                    value={c.value}
                                    onChange={(e) => setAttrCustomDraft((prev) => prev.map((cf, idx) => (idx === i ? { ...cf, value: e.target.value } : cf)))}
                                    placeholder="Value"
                                    containerClassName="flex-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setAttrCustomDraft((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-danger-600"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              <Button type="button" size="sm" variant="outline" onClick={() => setAttrCustomDraft((prev) => [...prev, { label: '', value: '' }])}>
                                + Add custom field
                              </Button>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingAttributes(false)}>
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1"
                                loading={updateAttributes.isPending}
                                onClick={() => {
                                  const cleanCustom = attrCustomDraft.filter((c) => c.label.trim())
                                  const nextAttrs: Record<string, unknown> = { ...attrDraft }
                                  if (cleanCustom.length) nextAttrs._custom = cleanCustom
                                  updateAttributes.mutate({ id: selectedFeature.id, attributes: nextAttrs })
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs">
                            {rawAttrs.map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <span className="text-muted">{titleize(k)}</span>
                                <span className="font-medium text-ink">{String(v)}</span>
                              </div>
                            ))}
                            {customList.map((c, i) => (
                              <div key={`custom-${i}`} className="flex justify-between gap-2">
                                <span className="text-muted">{c.label}</span>
                                <span className="font-medium text-ink">{c.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {selectedFeature.properties.status === 'rejected' && selectedFeature.properties.rejectionReason && (
                    <div className="mb-3 rounded-lg border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                      <span className="font-semibold">Reason: </span>
                      {selectedFeature.properties.rejectionReason}
                    </div>
                  )}
                  {selectedFeature.properties.media.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <ImageIcon size={12} />
                        Photos ({selectedFeature.properties.media.length})
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {selectedFeature.properties.media.map((m) => (
                          <a key={m.id} href={mediaUrl(m.url) ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
                            <img src={mediaUrl(m.url) ?? ''} alt="" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Status can always be changed, regardless of its current
                      state — approve something previously rejected, or pull
                      back an approval that turned out to be wrong. */}
                  {canApprove && (
                    <div className="mb-2 flex gap-2">
                      <Button
                        variant="outline"
                        leftIcon={<ThumbsDown size={14} />}
                        onClick={() => reject.mutate(selectedFeature.id)}
                        loading={reject.isPending}
                        disabled={selectedFeature.properties.status === 'rejected'}
                        className="flex-1"
                      >
                        Reject
                      </Button>
                      <Button
                        leftIcon={<ThumbsUp size={14} />}
                        onClick={() => approve.mutate(selectedFeature.id)}
                        loading={approve.isPending}
                        disabled={selectedFeature.properties.status === 'approved'}
                        className="flex-1"
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                  {canEditGeometry && (
                    <Button variant="outline" leftIcon={<PenLine size={14} />} onClick={() => startEditGeometry(selectedFeature)} className="mb-2 w-full">
                      Edit Geometry
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => setConfirmDeleteId(selectedFeature.id)} className="w-full">
                      Remove from Map
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Connection review panel — which two assets this edge links, and a way to remove it. */}
          {selectedConnection && (
            <div className="absolute right-4 top-4 z-20 w-80">
              <Card className="overflow-hidden !rounded-lg shadow-xl">
                <PanelHeader icon={<Link size={14} />} title="Connection" subtitle={selectedConnection.properties.label || 'Network link'} onClose={() => setSelectedConnection(null)} />
                <div className="p-4">
                  <div className="mb-3 space-y-1.5 rounded-lg bg-slate-50 p-2.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted">From</span>
                      <span className="font-medium text-ink">{connectionAssetLabel(selectedConnection.properties.fromAssetId)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted">To</span>
                      <span className="font-medium text-ink">{connectionAssetLabel(selectedConnection.properties.toAssetId)}</span>
                    </div>
                  </div>
                  {canEditGeometry && (
                    <Button
                      variant="danger"
                      leftIcon={<Trash2 size={14} />}
                      onClick={() => removeConnection.mutate(selectedConnection.properties.id)}
                      loading={removeConnection.isPending}
                      className="w-full"
                    >
                      Remove Connection
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Geometry-editing panel — drag vertices, add/remove points, save or cancel. */}
          {editingFeature && (
            <div className="absolute right-4 top-4 z-20 w-80">
              <Card className="overflow-hidden !rounded-lg shadow-xl">
                <PanelHeader
                  icon={<PenLine size={14} />}
                  title={`Editing ${editingFeature.properties.symbology?.name ?? editingFeature.properties.assetType.replace(/_/g, ' ')}`}
                  subtitle={GEOMETRY_LABEL[editingFeature.geometry.type]}
                  onClose={cancelEditGeometry}
                />
                <div className="p-4">
                  <p className="mb-3 text-xs text-muted">
                    Drag a point to move it.
                    {editingFeature.geometry.type !== 'Point' && ' Click a vertex’s × to remove it, or click a midpoint to add one.'}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEditGeometry} className="flex-1">
                      Cancel
                    </Button>
                    <Button leftIcon={<Save size={14} />} onClick={() => saveGeometry.mutate()} loading={saveGeometry.isPending} disabled={editVertices.length === 0} className="flex-1">
                      Save
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="flex h-6 shrink-0 items-center gap-4 border-t border-black/30 bg-primary-950 px-3.5 text-[11px] font-medium text-slate-400">
          <span className="flex items-center gap-1">
            <FolderKanban size={11} />
            {activeProject?.name ?? 'No project selected'}
          </span>
          <span className="flex items-center gap-1">
            <Layers size={11} />
            {featureCount} asset{featureCount === 1 ? '' : 's'}
          </span>
          <div className="flex-1" />
          <span className="flex items-center gap-1 font-mono tabular-nums text-slate-300">
            <Crosshair size={11} />
            {cursorLngLat ? `${cursorLngLat.lat.toFixed(5)}, ${cursorLngLat.lng.toFixed(5)}` : '—'}
          </span>
          <span className="font-mono tabular-nums text-slate-300">Zoom {zoom.toFixed(1)}</span>
        </div>
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} projects={projectsQuery.data?.items ?? []} onDone={invalidateAssets} pushToast={push} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} projects={projectsQuery.data?.items ?? []} pushToast={push} />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remove this asset?"
        message="This removes it from the map entirely — not the same as rejecting it. This can't be undone from here."
        confirmLabel="Remove"
        danger
        loading={removeAsset.isPending}
        onConfirm={() => confirmDeleteId && removeAsset.mutate(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
      />

      <StrandEditorModal
        strand={selectedStrandForEdit}
        customers={projectCustomersQuery.data?.items ?? []}
        saving={updateStrand.isPending}
        onClose={() => setSelectedStrandForEdit(null)}
        onSave={(patch) => selectedStrandForEdit && updateStrand.mutate({ strandId: selectedStrandForEdit.id, patch })}
        onTrace={() => selectedStrandForEdit && runTrace.mutate({ strandId: selectedStrandForEdit.id })}
        tracing={runTrace.isPending}
      />

      <TraceResultModal result={traceResult} onClose={() => setTraceResult(null)} />

      <CoordinateEntryModal
        open={coordinateEntryOpen}
        tool={tool}
        existingLinePoints={linePoints}
        onClose={() => setCoordinateEntryOpen(false)}
        onSubmitPoint={(lngVal, latVal) => {
          setDraftGeometry({ type: 'Point', coordinates: [lngVal, latVal] })
          setCoordinateEntryOpen(false)
        }}
        onSubmitShape={(points) => {
          setLinePoints(points)
          if (tool === 'polygon') setDraftGeometry({ type: 'Polygon', coordinates: [[...points, points[0]]] })
          else setDraftGeometry({ type: 'LineString', coordinates: points })
          setCoordinateEntryOpen(false)
        }}
      />

      <CreateSpliceModal
        pair={splicePair}
        projectId={activeProjectId}
        onClose={() => setSplicePair(null)}
        onCreated={() => {
          setSplicePair(null)
          push('Splice created', 'success')
          if (splicePair) {
            queryClient.invalidateQueries({ queryKey: ['fiber-strands', splicePair[0].id] })
            queryClient.invalidateQueries({ queryKey: ['fiber-strands', splicePair[1].id] })
            queryClient.invalidateQueries({ queryKey: ['equipment-ports', splicePair[0].id] })
            queryClient.invalidateQueries({ queryKey: ['equipment-ports', splicePair[1].id] })
          }
        }}
        pushToast={push}
      />
    </div>
  )
}

function titleize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/** Parses one "lat, lng" pair per line. Returns [lng, lat] tuples (GeoJSON
 * order) plus any row-level error messages, so the caller can show exactly
 * what's wrong instead of a single generic failure. */
function parseCoordinateRows(text: string): { points: [number, number][]; errors: string[] } {
  const points: [number, number][] = []
  const errors: string[] = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  lines.forEach((line, i) => {
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length !== 2) {
      errors.push(`Line ${i + 1}: expected "latitude, longitude"`)
      return
    }
    const lat = Number(parts[0])
    const lng = Number(parts[1])
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push(`Line ${i + 1}: latitude must be between -90 and 90`)
      return
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push(`Line ${i + 1}: longitude must be between -180 and 180`)
      return
    }
    points.push([lng, lat])
  })
  return { points, errors }
}

function CoordinateEntryModal({
  open,
  tool,
  existingLinePoints,
  onClose,
  onSubmitPoint,
  onSubmitShape,
}: {
  open: boolean
  tool: Tool
  existingLinePoints: [number, number][]
  onClose: () => void
  onSubmitPoint: (lng: number, lat: number) => void
  onSubmitShape: (points: [number, number][]) => void
}) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [rows, setRows] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLat('')
    setLng('')
    // Prefill with any points already placed by clicking, so coordinate entry
    // can finish a shape that was started on the map instead of only
    // replacing it — displayed as "lat, lng" (human order), stored as [lng, lat].
    setRows(existingLinePoints.map(([plng, plat]) => `${plat}, ${plng}`).join('\n'))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const isPoint = tool === 'point'
  const minPoints = tool === 'polygon' ? 3 : 2

  function submit() {
    if (isPoint) {
      const latNum = Number(lat)
      const lngNum = Number(lng)
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) return setError('Latitude must be between -90 and 90')
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) return setError('Longitude must be between -180 and 180')
      onSubmitPoint(lngNum, latNum)
      return
    }
    const { points, errors } = parseCoordinateRows(rows)
    if (errors.length) return setError(errors[0])
    if (points.length < minPoints) return setError(`Enter at least ${minPoints} points`)
    onSubmitShape(points)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Enter Coordinates — ${isPoint ? 'Point' : tool === 'polygon' ? 'Polygon' : 'Line'}`}
      subtitle={isPoint ? 'Exact latitude and longitude for this asset' : `One "latitude, longitude" pair per line, at least ${minPoints}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Use These Coordinates</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</div>}
        {isPoint ? (
          <div className="flex gap-2">
            <Input label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 32.7767" containerClassName="flex-1" />
            <Input label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. -96.7970" containerClassName="flex-1" />
          </div>
        ) : (
          <Textarea
            label="Coordinates"
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            rows={8}
            placeholder={'32.7767, -96.7970\n32.7801, -96.8012\n32.7790, -96.7955'}
          />
        )}
      </div>
    </Modal>
  )
}

function StrandEditorModal({
  strand,
  customers,
  saving,
  tracing,
  onClose,
  onSave,
  onTrace,
}: {
  strand: FiberStrand | null
  customers: Customer[]
  saving: boolean
  tracing: boolean
  onClose: () => void
  onSave: (patch: { status?: StrandStatus; role?: StrandRole | null; assignedCustomerId?: string | null; notes?: string | null }) => void
  onTrace: () => void
}) {
  const [status, setStatus] = useState<StrandStatus>(strand?.status ?? 'available')
  const [role, setRole] = useState<StrandRole | ''>(strand?.role ?? '')
  const [assignedCustomerId, setAssignedCustomerId] = useState(strand?.assignedCustomerId ?? '')
  const [notes, setNotes] = useState(strand?.notes ?? '')

  const strandId = strand?.id ?? null
  const [lastStrandId, setLastStrandId] = useState<string | null>(strandId)
  if (strandId !== lastStrandId) {
    setLastStrandId(strandId)
    setStatus(strand?.status ?? 'available')
    setRole(strand?.role ?? '')
    setAssignedCustomerId(strand?.assignedCustomerId ?? '')
    setNotes(strand?.notes ?? '')
  }

  if (!strand) return null

  return (
    <Modal
      open={!!strand}
      onClose={onClose}
      title={`Strand #${strand.strandNumber}`}
      subtitle={`Tube ${strand.tubeNumber} · ${strand.color}`}
      footer={
        <>
          <Button variant="outline" leftIcon={<Route size={14} />} onClick={onTrace} loading={tracing}>
            Trace Impact
          </Button>
          <Button
            onClick={() =>
              onSave({
                status,
                role: role || null,
                assignedCustomerId: assignedCustomerId || null,
                notes: notes || null,
              })
            }
            loading={saving}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StrandStatus)}
          options={(Object.keys(STRAND_STATUS_LABEL) as StrandStatus[]).map((s) => ({ value: s, label: STRAND_STATUS_LABEL[s] }))}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as StrandRole | '')}
          placeholder="Not set"
          options={(Object.keys(STRAND_ROLE_LABEL) as StrandRole[]).map((r) => ({ value: r, label: STRAND_ROLE_LABEL[r] }))}
        />
        <Select
          label="Assigned Customer / Home"
          value={assignedCustomerId}
          onChange={(e) => setAssignedCustomerId(e.target.value)}
          placeholder="None"
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Splice details, test results, anything else worth recording." />
      </div>
    </Modal>
  )
}

/** Picks a specific strand+side (cable) or port (equipment) on one asset —
 * the sub-record selection a plain two-asset Connect click can't express. */
function SpliceEndpointPicker({
  asset,
  value,
  onChange,
}: {
  asset: NetworkAssetFeature
  value: SpliceEndpointRef | null
  onChange: (ref: SpliceEndpointRef | null) => void
}) {
  const isCable = !!asset.properties.symbology?.isCable
  const strandsQuery = useQuery({ queryKey: ['fiber-strands', asset.id], queryFn: () => strandsApi.list(asset.id), enabled: isCable })
  const portsQuery = useQuery({ queryKey: ['equipment-ports', asset.id], queryFn: () => portsApi.list(asset.id), enabled: !isCable })

  if (isCable) {
    const strands = strandsQuery.data ?? []
    return (
      <div className="flex gap-1.5">
        <Select
          label={`${asset.properties.symbology?.name ?? 'Cable'} — Strand`}
          value={value?.strandId ?? ''}
          onChange={(e) => onChange(e.target.value ? { type: 'strand', strandId: e.target.value, side: value?.side ?? 'A' } : null)}
          placeholder={strands.length ? 'Choose a strand' : 'No strands generated yet'}
          options={strands.map((s) => ({ value: s.id, label: `#${s.strandNumber} (Tube ${s.tubeNumber})` }))}
          containerClassName="flex-1"
        />
        <Select
          label="Side"
          value={value?.side ?? 'A'}
          onChange={(e) => value?.strandId && onChange({ type: 'strand', strandId: value.strandId, side: e.target.value as 'A' | 'Z' })}
          options={[{ value: 'A', label: 'A' }, { value: 'Z', label: 'Z' }]}
          disabled={!value?.strandId}
        />
      </div>
    )
  }

  const ports = portsQuery.data ?? []
  return (
    <Select
      label={`${asset.properties.symbology?.name ?? 'Equipment'} — Port`}
      value={value?.portId ?? ''}
      onChange={(e) => onChange(e.target.value ? { type: 'port', portId: e.target.value } : null)}
      placeholder={ports.length ? 'Choose a port' : 'No ports generated yet'}
      options={ports.map((p) => ({ value: p.id, label: `Port ${p.portNumber} (${p.status})` }))}
    />
  )
}

function CreateSpliceModal({
  pair,
  projectId,
  onClose,
  onCreated,
  pushToast,
}: {
  pair: [NetworkAssetFeature, NetworkAssetFeature] | null
  projectId: string
  onClose: () => void
  onCreated: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [endA, setEndA] = useState<SpliceEndpointRef | null>(null)
  const [endB, setEndB] = useState<SpliceEndpointRef | null>(null)
  const [notes, setNotes] = useState('')

  const pairId = pair ? `${pair[0].id}-${pair[1].id}` : null
  const [lastPairId, setLastPairId] = useState<string | null>(pairId)
  if (pairId !== lastPairId) {
    setLastPairId(pairId)
    setEndA(null)
    setEndB(null)
    setNotes('')
  }

  const create = useMutation({
    mutationFn: () => {
      if (!endA || !endB) throw new Error('Pick both endpoints first')
      return fiberSplicesApi.create({ projectId, endA, endB, notes: notes || undefined })
    },
    onSuccess: onCreated,
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to create splice', 'error'),
  })

  if (!pair) return null

  return (
    <Modal
      open={!!pair}
      onClose={onClose}
      title="Create Splice"
      subtitle="Connect a specific strand or port on each side"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!endA || !endB}>
            Create Splice
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SpliceEndpointPicker asset={pair[0]} value={endA} onChange={setEndA} />
        <SpliceEndpointPicker asset={pair[1]} value={endB} onChange={setEndB} />
        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
    </Modal>
  )
}

function TraceResultModal({ result, onClose }: { result: FiberTraceResult | null; onClose: () => void }) {
  if (!result) return null
  return (
    <Modal open={!!result} onClose={onClose} title="Trace Impact" subtitle="Everything reachable through the splice graph from this point" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Strands ({result.strands.length})</p>
          {result.strands.length ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
              {result.strands.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-100">
                  <span className="font-semibold text-ink">Strand #{s.strandNumber}</span>
                  <Badge tone={STRAND_STATUS_TONE[s.status]}>{STRAND_STATUS_LABEL[s.status]}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">None reached.</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Ports ({result.ports.length})</p>
          {result.ports.length ? (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5">
              {result.ports.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-100">
                  <span className="font-semibold text-ink">Port {p.portNumber}</span>
                  <Badge tone={p.status === 'connected' ? 'success' : 'neutral'}>{p.status === 'connected' ? 'Connected' : 'Free'}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">None reached.</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Contact size={12} />
            Customers Affected ({result.customers.length})
          </p>
          {result.customers.length ? (
            <div className="space-y-1">
              {result.customers.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-danger-50 px-2.5 py-2 text-xs">
                  <span className="font-semibold text-danger-700">{c.name}</span>
                  <span className="text-danger-600">{c.email || c.phone || ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No customer directly attributed to anything reached.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function initials(name?: string): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}

function ToolbarButton({ icon, label, active, disabled, onClick }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
    </button>
  )
}

/** Legend swatch for a Point symbology — a small preview of the actual
 * marker (its real icon, or custom image) rather than a plain color dot. */
function LegendPointSwatch({ color, icon, iconUrl }: { color: string; icon: string | null; iconUrl: string | null }) {
  const customSrc = mediaUrl(iconUrl)
  const Icon = resolveSymbologyIcon(icon)
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white" style={{ backgroundColor: color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }}>
      {customSrc ? <img src={customSrc} alt="" className="h-full w-full object-cover" /> : <Icon size={9} color="#ffffff" strokeWidth={2.5} />}
    </span>
  )
}

/** One typed input for a project's survey template field — the field's
 * `type` picks which control renders, mirroring how AssetTypeField is
 * defined and validated on the backend. */
function TemplateFieldInput({ field, value, onChange }: { field: AssetTypeField; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void }) {
  const label = field.label + (field.required ? ' *' : '')
  if (field.type === 'select') {
    return (
      <Select
        label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select…"
        options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        containerClassName="mb-3"
      />
    )
  }
  if (field.type === 'boolean') {
    return (
      <div className="mb-3">
        <Checkbox label={label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      </div>
    )
  }
  if (field.type === 'textarea') {
    return <Textarea label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} rows={2} containerClassName="mb-3" />
  }
  return (
    <Input
      label={label}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(field.type === 'number' ? e.target.valueAsNumber : e.target.value)}
      containerClassName="mb-3"
    />
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

const EXPORT_FORMAT_OPTIONS = [
  { value: 'geojson', label: 'GeoJSON (.geojson)' },
  { value: 'shapefile', label: 'Shapefile (.zip)' },
]

function ExportModal({ open, onClose, projects, pushToast }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[]; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [projectId, setProjectId] = useState('')
  const [format, setFormat] = useState<'geojson' | 'shapefile'>('geojson')

  const exportMutation = useMutation({
    mutationFn: () => exportApi.projectGeoJSON(projectId),
    onSuccess: (data) => {
      const project = projects.find((p) => p.id === projectId)
      const filename = `${project?.name ?? 'export'}-approved-assets`
      if (format === 'shapefile') {
        if (data.features.length === 0) {
          pushToast('No approved assets to export', 'info')
          return
        }
        shpwrite.download(data as unknown as GeoJSON.FeatureCollection, {
          outputType: 'blob',
          compression: 'DEFLATE',
          folder: filename,
          filename,
          // @mapbox/shp-write keys its `types` option by the layer's internal shapefile
          // type name lowercased (POLYLINE -> "polyline"), not by the GeoJSON geometry
          // name — its shipped .d.ts labels this key "line", which doesn't match at runtime.
          types: { point: 'points', polyline: 'lines', polygon: 'polygons' } as unknown as NonNullable<Parameters<typeof shpwrite.download>[1]>['types'],
        })
      } else {
        downloadGeoJSON(data, filename)
      }
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
      subtitle="Downloads every approved asset in the selected project, in the format chosen below."
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
      <div className="space-y-4">
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Select project" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <Select
          label="Format"
          value={format}
          onChange={(e) => setFormat(e.target.value as 'geojson' | 'shapefile')}
          options={EXPORT_FORMAT_OPTIONS}
        />
        {format === 'shapefile' && (
          <p className="text-xs text-slate-500">Points, lines, and polygons are written as separate layers inside the .zip, matching the ArcGIS/QGIS shapefile convention.</p>
        )}
      </div>
    </Modal>
  )
}
