import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ClipboardCheck, Eye, FolderKanban, ThumbsDown, ThumbsUp, Trash2, User } from 'lucide-react'
import { networkAssetsApi, ApiError, type AssetStatus, type GeoJsonGeometry, type NetworkAssetFeature } from '../lib/api'
import { TILES_BASE, mapifyitTransformRequest } from '../lib/maps'
import { Button, Card, ConfirmDialog, DataState, EmptyState, Modal, PageHeader, Select, StatusBadge, Table, TBody, TD, Textarea, TH, THead, TR, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const FALLBACK_COLOR = '#64748b'

/** Bounding box of a geometry's coordinates, used to frame the preview map. */
function geometryBounds(geometry: GeoJsonGeometry): [[number, number], [number, number]] {
  const points: [number, number][] = []
  const collect = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      points.push(coords as [number, number])
    } else if (Array.isArray(coords)) {
      coords.forEach(collect)
    }
  }
  collect(geometry.coordinates)
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

function titleize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/** Small non-interactive-feeling preview map, framed on the submission's geometry. */
function SubmissionPreviewMap({ feature }: { feature: NetworkAssetFeature }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!container.current) return
    const color = feature.properties.symbology?.color ?? FALLBACK_COLOR
    const map = new maplibregl.Map({
      container: container.current,
      style: `${TILES_BASE}/dark`,
      attributionControl: false,
      transformRequest: (url) => mapifyitTransformRequest(url),
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const [[minLng, minLat], [maxLng, maxLat]] = geometryBounds(feature.geometry)
    const isPoint = feature.geometry.type === 'Point'

    map.on('load', () => {
      map.addSource('preview', { type: 'geojson', data: feature as unknown as GeoJSON.Feature })
      map.addLayer({ id: 'preview-fill', type: 'fill', source: 'preview', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.25, 'fill-outline-color': color } })
      map.addLayer({ id: 'preview-line', type: 'line', source: 'preview', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 3 } })
      map.addLayer({ id: 'preview-point', type: 'circle', source: 'preview', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': color, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })

      if (isPoint) {
        map.setCenter([minLng, minLat])
        map.setZoom(15)
      } else {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 36, maxZoom: 17, duration: 0 })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id])

  return <div ref={container} className="h-48 w-full overflow-hidden rounded-xl border border-slate-200" />
}

function ReviewModal({
  feature,
  canApprove,
  canDelete,
  onClose,
  onApprove,
  onReject,
  onDelete,
  approving,
  rejecting,
}: {
  feature: NetworkAssetFeature
  canApprove: boolean
  canDelete: boolean
  onClose: () => void
  onApprove: () => void
  onReject: (reason: string) => void
  onDelete: () => void
  approving: boolean
  rejecting: boolean
}) {
  const [reason, setReason] = useState('')
  const p = feature.properties

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.symbology?.color ?? FALLBACK_COLOR }} />
          {p.symbology?.name ?? p.assetType.replace(/_/g, ' ')}
        </span>
      }
      subtitle={p.geometryType}
      footer={
        <>
          {canDelete && (
            <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={onDelete}>
              Remove
            </Button>
          )}
          <div className="flex-1" />
          {canApprove && (
            <>
              <Button variant="outline" leftIcon={<ThumbsDown size={14} />} onClick={() => onReject(reason)} loading={rejecting} disabled={p.status === 'rejected'}>
                Send Back for Edit
              </Button>
              <Button leftIcon={<ThumbsUp size={14} />} onClick={onApprove} loading={approving} disabled={p.status === 'approved'}>
                Approve
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SubmissionPreviewMap feature={feature} />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <FolderKanban size={12} />
              Project
            </div>
            <div className="font-semibold text-ink">{p.project?.name ?? '—'}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <User size={12} />
              Submitted by
            </div>
            <div className="font-semibold text-ink">{p.createdBy?.name || '—'}</div>
            {p.createdBy?.email && <div className="text-xs text-muted">{p.createdBy.email}</div>}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>Submitted {new Date(p.createdAt).toLocaleString()}</span>
          <StatusBadge status={p.status} />
        </div>

        {Object.keys(p.attributes || {}).length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Attributes</div>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              {Object.entries(p.attributes).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-muted">{titleize(k)}</span>
                  <span className="font-medium text-ink">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {p.status === 'rejected' && p.rejectionReason && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            <span className="font-semibold">Sent back for edit: </span>
            {p.rejectionReason}
          </div>
        )}

        {canApprove && p.status !== 'rejected' && (
          <Textarea label="Notes for the field crew (optional)" placeholder="What needs fixing before this can be approved?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        )}
      </div>
    </Modal>
  )
}

export function SubmissionsPage() {
  const [status, setStatus] = useState<AssetStatus | ''>('pending')
  const [reviewing, setReviewing] = useState<NetworkAssetFeature | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { hasPermission } = useAuth()
  const canApprove = hasPermission('assets.approve')
  const canDelete = hasPermission('assets.delete')

  const query = useQuery({
    queryKey: ['network-assets', 'list', status],
    queryFn: () => networkAssetsApi.list({ status: status || undefined, limit: 100 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['network-assets'] })

  const approve = useMutation({
    mutationFn: (id: string) => networkAssetsApi.approve(id),
    onSuccess: () => {
      push('Asset approved', 'success')
      setReviewing(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to approve asset', 'error'),
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => networkAssetsApi.reject(id, reason || 'Sent back for edit'),
    onSuccess: () => {
      push('Sent back to the field crew', 'success')
      setReviewing(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to reject asset', 'error'),
  })

  const removeAsset = useMutation({
    mutationFn: (id: string) => networkAssetsApi.remove(id),
    onSuccess: () => {
      push('Asset removed', 'success')
      setReviewing(null)
      setConfirmDeleteId(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to remove asset', 'error'),
  })

  const features = query.data?.featureCollection.features ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Submissions"
        subtitle="Review field survey submissions and approve or send them back for edits. You can also do this directly from the Map."
        action={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as AssetStatus | '')}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            containerClassName="w-44"
          />
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!features.length}
          empty={<EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No submissions" description="Nothing matches this filter yet." />}
        >
          <Table>
            <THead>
              <TR>
                <TH>Asset Type</TH>
                <TH>Project</TH>
                <TH>Submitted By</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {features.map((f) => (
                <TR key={f.id}>
                  <TD className="font-semibold capitalize text-ink">{f.properties.symbology?.name ?? f.properties.assetType.replace(/_/g, ' ')}</TD>
                  <TD className="text-muted">{f.properties.project?.name ?? '—'}</TD>
                  <TD className="text-muted">{f.properties.createdBy?.name || '—'}</TD>
                  <TD>
                    <StatusBadge status={f.properties.status} />
                  </TD>
                  <TD className="text-muted">{new Date(f.properties.createdAt).toLocaleString()}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" leftIcon={<Eye size={14} />} onClick={() => setReviewing(f)}>
                      Review
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      {reviewing && (
        <ReviewModal
          feature={reviewing}
          canApprove={canApprove}
          canDelete={canDelete}
          onClose={() => setReviewing(null)}
          onApprove={() => approve.mutate(reviewing.id)}
          onReject={(reason) => reject.mutate({ id: reviewing.id, reason })}
          onDelete={() => setConfirmDeleteId(reviewing.id)}
          approving={approve.isPending}
          rejecting={reject.isPending}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remove this asset?"
        message="This removes it from the map entirely — not the same as sending it back for edits. This can't be undone from here."
        confirmLabel="Remove"
        danger
        loading={removeAsset.isPending}
        onConfirm={() => confirmDeleteId && removeAsset.mutate(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
