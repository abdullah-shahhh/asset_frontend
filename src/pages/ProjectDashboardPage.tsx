import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Cable,
  Waypoints,
  Wrench,
  AlertTriangle,
  ClipboardList,
  Users,
  Ruler,
  Gauge,
  LayoutGrid,
  List,
  Share2,
  Palette,
  HardHat,
} from 'lucide-react'
import { projectsApi, networkAssetsApi, connectionsApi } from '../lib/api'
import { Badge, Button, Card, DataState, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, Tabs, TR } from '../components/ui'
import { ShareModal } from '../components/ShareModal'

const FALLBACK_COLOR = '#64748b'

export function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'overview' | 'assets' | 'connections' | 'symbology' | 'surveyors'>('overview')
  const [shareOpen, setShareOpen] = useState(false)

  const projectQuery = useQuery({ queryKey: ['projects', id], queryFn: () => projectsApi.get(id!), enabled: !!id })
  const statsQuery = useQuery({ queryKey: ['projects', id, 'stats'], queryFn: () => projectsApi.getStats(id!), enabled: !!id })
  const assetsQuery = useQuery({ queryKey: ['projects', id, 'dashboard-assets'], queryFn: () => networkAssetsApi.list({ projectId: id!, limit: 500 }), enabled: !!id })
  const connectionsQuery = useQuery({ queryKey: ['projects', id, 'dashboard-connections'], queryFn: () => connectionsApi.listForProject(id!), enabled: !!id })
  const symbologiesQuery = useQuery({ queryKey: ['projects', id, 'dashboard-symbologies'], queryFn: () => projectsApi.getSymbologies(id!), enabled: !!id })
  const surveyorsQuery = useQuery({ queryKey: ['projects', id, 'dashboard-surveyors'], queryFn: () => projectsApi.getSurveyors(id!), enabled: !!id })

  const stats = statsQuery.data
  const maxTypeCount = stats ? Math.max(1, ...stats.byType.map((t) => t.count)) : 1
  const assets = assetsQuery.data?.featureCollection.features ?? []
  const connections = connectionsQuery.data?.features ?? []
  const symbologies = symbologiesQuery.data ?? []
  const surveyors = surveyorsQuery.data ?? []

  function assetLabel(assetId: string): { name: string; geometryType: string } {
    const asset = assets.find((f) => f.id === assetId)
    if (!asset) return { name: 'Unknown asset', geometryType: '' }
    return { name: asset.properties.symbology?.name ?? asset.properties.assetType.replace(/_/g, ' '), geometryType: asset.properties.geometryType }
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => navigate('/projects')}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={13} />
        Back to Projects
      </button>

      <PageHeader
        title={projectQuery.data?.name ?? 'Project Dashboard'}
        subtitle="Everything happening in this project — live, not a snapshot."
        action={
          <Button variant="outline" leftIcon={<Share2 size={14} />} onClick={() => setShareOpen(true)}>
            Share
          </Button>
        }
      />

      {id && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} projectId={id} projectName={projectQuery.data?.name ?? 'this project'} />}

      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview', icon: <Gauge size={14} /> },
          { key: 'assets', label: 'Assets', icon: <LayoutGrid size={14} />, count: assets.length },
          { key: 'connections', label: 'Connections', icon: <Share2 size={14} />, count: connections.length },
          { key: 'symbology', label: 'Symbology', icon: <Palette size={14} />, count: symbologies.length },
          { key: 'surveyors', label: 'Surveyors', icon: <HardHat size={14} />, count: surveyors.length },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === 'overview' && (
        <DataState isLoading={statsQuery.isLoading} error={statsQuery.error} onRetry={() => statsQuery.refetch()} isEmpty={false}>
          {stats && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                <StatCard title="Total Assets" value={stats.totalAssets} icon={<Boxes size={18} />} tone="primary" />
                <StatCard
                  title="Survey Progress"
                  value={`${stats.surveyProgressPct}%`}
                  icon={<CheckCircle2 size={18} />}
                  tone="success"
                  hint={`${stats.statusCounts.approved} approved of ${stats.totalAssets}`}
                />
                <StatCard title="Pending Approvals" value={stats.statusCounts.pending} icon={<ClipboardList size={18} />} tone="amber" />
                <StatCard title="Total OFC Length" value={`${stats.totalOfcLengthFeet.toLocaleString()} ft`} icon={<Ruler size={18} />} tone="blue" />
                <StatCard
                  title="Fiber Utilization"
                  value={`${stats.strands.utilizationPct}%`}
                  icon={<Cable size={18} />}
                  tone="violet"
                  hint={`${stats.strands.inService} of ${stats.strands.total} strands in service`}
                />
                <StatCard title="Ports Connected" value={`${stats.ports.connected} / ${stats.ports.total}`} icon={<Waypoints size={18} />} tone="blue" />
                <StatCard title="Damaged Assets" value={stats.damagedAssets} icon={<AlertTriangle size={18} />} tone="danger" />
                <StatCard title="Active Faults" value={stats.activeFaults} icon={<AlertTriangle size={18} />} tone={stats.activeFaults > 0 ? 'danger' : 'success'} />
                <StatCard title="In Maintenance" value={stats.assetsInMaintenance} icon={<Wrench size={18} />} tone="amber" />
                <StatCard title="Active Surveyors" value={stats.activeSurveyors} icon={<Users size={18} />} tone="primary" />
              </div>

              <Card className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Gauge size={16} className="text-primary-600" />
                  <h2 className="text-sm font-bold text-ink">Assets by Type</h2>
                </div>
                <div className="flex flex-col gap-2.5">
                  {stats.byType.map((t) => (
                    <div key={t.label} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs font-medium text-slate-600">{t.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${(t.count / maxTypeCount) * 100}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{t.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <p className="text-xs text-muted">
                Not shown: field-sync status and maintenance due-dates — neither has a real data source yet (no mobile app, no maintenance scheduling), so they're left
                out rather than faked.
              </p>
            </div>
          )}
        </DataState>
      )}

      {tab === 'assets' && (
        <Card>
          <DataState
            isLoading={assetsQuery.isLoading}
            error={assetsQuery.error}
            onRetry={() => assetsQuery.refetch()}
            isEmpty={!assets.length}
            empty={<EmptyState icon={<LayoutGrid className="h-6 w-6" />} title="No assets yet" description="Nothing has been submitted to this project." />}
          >
            <Table maxHeight={640}>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Created By</TH>
                  <TH>Reviewed By</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {assets.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.properties.color ?? FALLBACK_COLOR }} />
                        <span className="font-semibold text-ink">{a.properties.symbology?.name ?? a.properties.assetType.replace(/_/g, ' ')}</span>
                      </div>
                    </TD>
                    <TD className="text-muted">{a.properties.geometryType}</TD>
                    <TD>
                      <Badge tone={a.properties.status === 'approved' ? 'success' : a.properties.status === 'rejected' ? 'danger' : 'warning'}>{a.properties.status}</Badge>
                    </TD>
                    <TD className="text-muted">{a.properties.createdBy?.name ?? '—'}</TD>
                    <TD className="text-muted">{a.properties.reviewedBy?.name ?? '—'}</TD>
                    <TD className="text-muted">{new Date(a.properties.createdAt).toLocaleDateString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </DataState>
        </Card>
      )}

      {tab === 'connections' && (
        <Card>
          <DataState
            isLoading={connectionsQuery.isLoading}
            error={connectionsQuery.error}
            onRetry={() => connectionsQuery.refetch()}
            isEmpty={!connections.length}
            empty={<EmptyState icon={<List className="h-6 w-6" />} title="No connections yet" description="Connect assets on the map to build out the network topology." />}
          >
            <Table maxHeight={640}>
              <THead>
                <TR>
                  <TH>From</TH>
                  <TH></TH>
                  <TH>To</TH>
                  <TH>Label</TH>
                </TR>
              </THead>
              <TBody>
                {connections.map((c) => {
                  const from = assetLabel(c.properties.fromAssetId)
                  const to = assetLabel(c.properties.toAssetId)
                  return (
                    <TR key={c.id}>
                      <TD>
                        <div className="font-semibold text-ink">{from.name}</div>
                        <div className="text-xs text-muted">{from.geometryType}</div>
                      </TD>
                      <TD className="text-muted">→</TD>
                      <TD>
                        <div className="font-semibold text-ink">{to.name}</div>
                        <div className="text-xs text-muted">{to.geometryType}</div>
                      </TD>
                      <TD className="text-muted">{c.properties.label || '—'}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </DataState>
        </Card>
      )}

      {tab === 'symbology' && (
        <Card>
          <DataState
            isLoading={symbologiesQuery.isLoading}
            error={symbologiesQuery.error}
            onRetry={() => symbologiesQuery.refetch()}
            isEmpty={!symbologies.length}
            empty={<EmptyState icon={<Palette className="h-6 w-6" />} title="No symbologies assigned" description="Assign symbologies to this project from the Projects list." />}
          >
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Geometry</TH>
                  <TH>Flags</TH>
                  <TH>Fields</TH>
                </TR>
              </THead>
              <TBody>
                {symbologies.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-semibold text-ink">{s.name}</span>
                      </div>
                    </TD>
                    <TD className="text-muted">{s.geometryType}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {s.isEquipment && <Badge tone="success">Equipment</Badge>}
                        {s.isCable && <Badge tone="info">Cable</Badge>}
                        {s.isRfSite && <Badge tone="primary">RF Site</Badge>}
                        {!s.isEquipment && !s.isCable && !s.isRfSite && <span className="text-xs text-muted">—</span>}
                      </div>
                    </TD>
                    <TD className="text-muted">{s.fields.length ? `${s.fields.length} field${s.fields.length === 1 ? '' : 's'}` : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </DataState>
        </Card>
      )}

      {tab === 'surveyors' && (
        <Card>
          <DataState
            isLoading={surveyorsQuery.isLoading}
            error={surveyorsQuery.error}
            onRetry={() => surveyorsQuery.refetch()}
            isEmpty={!surveyors.length}
            empty={<EmptyState icon={<HardHat className="h-6 w-6" />} title="No surveyors assigned" description="Assign field crew to this project from the Projects list." />}
          >
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {surveyors.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold text-ink">{[s.firstName, s.lastName].filter(Boolean).join(' ')}</TD>
                    <TD className="text-muted">{s.email}</TD>
                    <TD className="text-muted">{s.phone ?? '—'}</TD>
                    <TD>
                      <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </DataState>
        </Card>
      )}
    </div>
  )
}
