import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, MapPin, Radio, Zap } from 'lucide-react'
import { networkAssetsApi, type NetworkAssetFeature } from '../lib/api'
import { Badge, Card, DataState, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '../components/ui'
import { ROUTES } from '../lib/routes'

function titleize(key: string): string {
  return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AlarmsPage() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['network-assets', 'alarms'], queryFn: networkAssetsApi.alarms })

  const equipment = query.data?.equipment ?? []
  const faults = query.data?.faults ?? []
  const totalCount = equipment.length + faults.length

  function viewOnMap(feature: NetworkAssetFeature) {
    navigate(`${ROUTES.dashboard}?project=${feature.properties.projectId}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Alarms"
        subtitle="Everything currently unhealthy across every project — degraded/offline equipment and active cable faults."
      />

      <DataState isLoading={query.isLoading} error={query.error} onRetry={() => query.refetch()}>
        {totalCount === 0 ? (
          <Card>
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="All clear" description="No equipment alarms or active cable faults right now." />
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <Card>
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3 text-sm font-bold text-ink">
                <Radio size={15} className="text-danger-600" />
                Equipment Alarms
                <Badge tone="neutral" className="ml-1">{equipment.length}</Badge>
              </div>
              {!equipment.length ? (
                <p className="px-4 py-4 text-sm text-muted">No equipment currently degraded or offline.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Asset</TH>
                      <TH>Project</TH>
                      <TH>Status</TH>
                      <TH>Updated</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {equipment.map((f) => (
                      <TR key={f.id}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.properties.color ?? '#64748b' }} />
                            <span className="font-semibold text-ink">{f.properties.symbology?.name ?? titleize(f.properties.assetType)}</span>
                          </div>
                        </TD>
                        <TD className="text-muted">{f.properties.project?.name ?? '—'}</TD>
                        <TD>
                          <Badge tone={f.properties.operationalStatus === 'offline' ? 'danger' : 'warning'}>
                            {f.properties.operationalStatus}
                          </Badge>
                        </TD>
                        <TD className="text-muted">{timeAgo(f.properties.updatedAt)}</TD>
                        <TD className="text-right">
                          <button type="button" onClick={() => viewOnMap(f)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                            <MapPin size={14} />
                            View on Map
                          </button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3 text-sm font-bold text-ink">
                <Zap size={15} className="text-danger-600" />
                Cable Faults
                <Badge tone="neutral" className="ml-1">{faults.length}</Badge>
              </div>
              {!faults.length ? (
                <p className="px-4 py-4 text-sm text-muted">No active cable faults.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Cable</TH>
                      <TH>Project</TH>
                      <TH>Reason</TH>
                      <TH>Reported</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {faults.map((f) => (
                      <TR key={f.id}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={14} className="text-danger-600" />
                            <span className="font-semibold text-ink">{f.properties.symbology?.name ?? titleize(f.properties.assetType)}</span>
                          </div>
                        </TD>
                        <TD className="text-muted">{f.properties.project?.name ?? '—'}</TD>
                        <TD className="text-muted">{String(f.properties.attributes?.faultReason ?? '—')}</TD>
                        <TD className="text-muted">{timeAgo(f.properties.updatedAt)}</TD>
                        <TD className="text-right">
                          <button type="button" onClick={() => viewOnMap(f)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                            <MapPin size={14} />
                            View on Map
                          </button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </DataState>
    </div>
  )
}
