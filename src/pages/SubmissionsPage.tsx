import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { networkAssetsApi, ApiError, type AssetStatus } from '../lib/api'
import { Button, Card, DataState, EmptyState, PageHeader, Select, StatusBadge, Table, TBody, TD, TH, THead, TR, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export function SubmissionsPage() {
  const [status, setStatus] = useState<AssetStatus | ''>('pending')
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { hasPermission } = useAuth()
  const canApprove = hasPermission('assets.approve')

  const query = useQuery({
    queryKey: ['network-assets', 'list', status],
    queryFn: () => networkAssetsApi.list({ status: status || undefined, limit: 100 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['network-assets'] })

  const approve = useMutation({
    mutationFn: (id: string) => networkAssetsApi.approve(id),
    onSuccess: () => {
      push('Asset approved', 'success')
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to approve asset', 'error'),
  })

  const reject = useMutation({
    mutationFn: (id: string) => networkAssetsApi.reject(id, 'Rejected from client panel'),
    onSuccess: () => {
      push('Asset rejected', 'success')
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to reject asset', 'error'),
  })

  const features = query.data?.featureCollection.features ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Submissions"
        subtitle="Review field survey submissions and approve or reject them. You can also do this directly from the Map."
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
                <TH>Geometry</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                {canApprove && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {features.map((f) => (
                <TR key={f.id}>
                  <TD className="font-semibold capitalize text-ink">{f.properties.assetType.replace(/_/g, ' ')}</TD>
                  <TD className="text-muted">{f.properties.geometryType}</TD>
                  <TD>
                    <StatusBadge status={f.properties.status} />
                  </TD>
                  <TD className="text-muted">{new Date(f.properties.createdAt).toLocaleString()}</TD>
                  {canApprove && (
                    <TD className="text-right">
                      {f.properties.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" leftIcon={<ThumbsDown size={14} />} onClick={() => reject.mutate(f.id)} disabled={reject.isPending}>
                            Reject
                          </Button>
                          <Button size="sm" leftIcon={<ThumbsUp size={14} />} onClick={() => approve.mutate(f.id)} disabled={approve.isPending}>
                            Approve
                          </Button>
                        </div>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>
    </div>
  )
}
