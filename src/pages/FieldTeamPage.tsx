import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, HardHat, Plus, RefreshCw } from 'lucide-react'
import { fieldTeamApi, ApiError, type Surveyor } from '../lib/api'
import {
  Button,
  Card,
  ConfirmDialog,
  DataState,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '../components/ui'

export function FieldTeamPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ type: 'reject' | 'remove'; surveyor: Surveyor } | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const joinCodeQuery = useQuery({ queryKey: ['field-team', 'join-code'], queryFn: fieldTeamApi.getJoinCode })
  const listQuery = useQuery({
    queryKey: ['field-team', 'list', statusFilter],
    queryFn: () => fieldTeamApi.list({ status: statusFilter || undefined, limit: 100 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['field-team'] })

  const approve = useMutation({
    mutationFn: (id: string) => fieldTeamApi.approve(id),
    onSuccess: () => {
      push('Surveyor approved', 'success')
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to approve', 'error'),
  })
  const reject = useMutation({
    mutationFn: (id: string) => fieldTeamApi.reject(id),
    onSuccess: () => {
      push('Signup rejected', 'success')
      invalidate()
      setConfirm(null)
    },
  })
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => fieldTeamApi.setStatus(id, status),
    onSuccess: () => {
      push('Status updated', 'success')
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => fieldTeamApi.remove(id),
    onSuccess: () => {
      push('Surveyor removed', 'success')
      invalidate()
      setConfirm(null)
    },
  })
  const regenerate = useMutation({
    mutationFn: fieldTeamApi.regenerateJoinCode,
    onSuccess: () => {
      push('Join code regenerated', 'success')
      queryClient.invalidateQueries({ queryKey: ['field-team', 'join-code'] })
    },
  })

  const surveyors = listQuery.data?.items ?? []
  const counts = {
    active: surveyors.filter((s) => s.status === 'active').length,
    pending: surveyors.filter((s) => s.status === 'pending').length,
    suspended: surveyors.filter((s) => s.status === 'suspended').length,
  }

  function copyCode() {
    if (!joinCodeQuery.data) return
    navigator.clipboard.writeText(joinCodeQuery.data.joinCode).then(() => push('Join code copied', 'success'))
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Field Team"
        subtitle="Surveyors who capture data in the field. Add them directly, or share your join code so they can sign up from the mobile app themselves."
        action={
          <Button leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            Add Surveyor
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="col-span-2 flex flex-col justify-center p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Organization Join Code</div>
          {joinCodeQuery.isLoading ? (
            <div className="h-9 w-32 animate-pulse rounded bg-slate-100" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-widest text-primary-700">{joinCodeQuery.data?.joinCode}</span>
              <button onClick={copyCode} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" title="Copy">
                <Copy size={16} />
              </button>
              <button onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" title="Regenerate">
                <RefreshCw size={16} className={regenerate.isPending ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted">Surveyors enter this code when signing up from the mobile app.</p>
        </Card>
        <StatCard title="Active" value={counts.active} tone="success" icon={<HardHat size={18} />} />
        <StatCard title="Pending" value={counts.pending} tone="amber" icon={<HardHat size={18} />} />
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="text-sm font-semibold text-ink">Team Members</div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending approval' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
            containerClassName="w-48"
          />
        </div>
        <DataState
          isLoading={listQuery.isLoading}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          isEmpty={!surveyors.length}
          empty={<EmptyState icon={<HardHat className="h-6 w-6" />} title="No surveyors yet" description="Add one directly or share your join code." />}
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Source</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {surveyors.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold text-ink">
                    {s.firstName} {s.lastName}
                  </TD>
                  <TD>
                    <div>{s.email}</div>
                    {s.phone && <div className="text-xs text-muted">{s.phone}</div>}
                  </TD>
                  <TD className="text-muted">{s.isSelfRegistered ? 'Self-signup' : 'Added by admin'}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      {s.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ type: 'reject', surveyor: s })}>
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => approve.mutate(s.id)} disabled={approve.isPending}>
                            Approve
                          </Button>
                        </>
                      )}
                      {s.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: s.id, status: 'suspended' })}>
                          Suspend
                        </Button>
                      )}
                      {s.status === 'suspended' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: s.id, status: 'active' })}>
                          Reactivate
                        </Button>
                      )}
                      {s.status !== 'pending' && (
                        <Button size="sm" variant="danger" onClick={() => setConfirm({ type: 'remove', surveyor: s })}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <AddSurveyorModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); invalidate() }} pushToast={push} />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === 'reject' ? 'Reject signup' : 'Remove surveyor'}
        message={confirm?.type === 'reject' ? 'The account will be deleted and the email freed up.' : 'This cannot be undone.'}
        danger
        loading={reject.isPending || remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.type === 'reject') reject.mutate(confirm.surveyor.id)
          else remove.mutate(confirm.surveyor.id)
        }}
      />
    </div>
  )
}

function AddSurveyorModal({ open, onClose, onDone, pushToast }: { open: boolean; onClose: () => void; onDone: () => void; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const create = useMutation({
    mutationFn: () => fieldTeamApi.create({ firstName, lastName: lastName || undefined, email, phone: phone || undefined, password }),
    onSuccess: () => {
      pushToast('Surveyor added', 'success')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setPassword('')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to add surveyor', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Surveyor Directly"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!firstName || !email || !password}>Add Surveyor</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <Input label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required containerClassName="col-span-2" />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} containerClassName="col-span-2" />
        <Input label="Temporary Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required containerClassName="col-span-2" />
      </div>
    </Modal>
  )
}
