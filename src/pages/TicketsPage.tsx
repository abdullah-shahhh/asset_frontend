import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Ticket as TicketIcon, Trash2 } from 'lucide-react'
import { customersApi, ticketsApi, ApiError, type Ticket, type TicketStatus, type TicketPriority } from '../lib/api'
import { Badge, Button, Card, ConfirmDialog, DataState, EmptyState, Input, Modal, PageHeader, Select, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]
const STATUS_TONE: Record<TicketStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
}

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]
const PRIORITY_TONE: Record<TicketPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
}

export function TicketsPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('tickets.manage')
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Ticket | null>(null)
  const [deleting, setDeleting] = useState<Ticket | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: () => ticketsApi.list({ status: statusFilter || undefined, limit: 100 }),
  })
  const tickets = query.data?.items ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tickets'] })

  const remove = useMutation({
    mutationFn: (id: string) => ticketsApi.remove(id),
    onSuccess: () => {
      push('Ticket deleted', 'success')
      setDeleting(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to delete ticket', 'error'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(t: Ticket) {
    setEditing(t)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tickets"
        subtitle="Support tickets against a customer — the issue, its status, and priority."
        action={
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
              options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
              containerClassName="w-40"
            />
            {canManage && (
              <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
                New Ticket
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!tickets.length}
          empty={
            <EmptyState
              icon={<TicketIcon className="h-6 w-6" />}
              title="No tickets yet"
              description="Open a ticket against a customer to track a support issue."
              action={canManage && <Button leftIcon={<Plus size={16} />} onClick={openCreate}>New Ticket</Button>}
            />
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Updated</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {tickets.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="font-semibold text-ink">{t.subject}</div>
                    {t.description && <div className="max-w-md truncate text-xs text-muted">{t.description}</div>}
                  </TD>
                  <TD className="text-muted">{t.customer?.name ?? '—'}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_OPTIONS.find((o) => o.value === t.status)?.label ?? t.status}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_OPTIONS.find((o) => o.value === t.priority)?.label ?? t.priority}</Badge>
                  </TD>
                  <TD className="text-muted">{new Date(t.updatedAt).toLocaleDateString()}</TD>
                  {canManage && (
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => openEdit(t)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" leftIcon={<Trash2 size={14} />} onClick={() => setDeleting(t)}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <TicketModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onDone={() => { setModalOpen(false); invalidate() }} pushToast={push} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete ticket"
        message={`"${deleting?.subject}" will be permanently removed.`}
        danger
        loading={remove.isPending}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  )
}

function TicketModal({
  open,
  onClose,
  editing,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  editing: Ticket | null
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [customerId, setCustomerId] = useState(editing?.customerId ?? '')
  const [subject, setSubject] = useState(editing?.subject ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [status, setStatus] = useState<TicketStatus>(editing?.status ?? 'open')
  const [priority, setPriority] = useState<TicketPriority>(editing?.priority ?? 'medium')

  // Reset on every fresh open (not just when switching between different
  // "editing" records) — two consecutive "New Ticket" opens both have
  // editing === null, so an editingId-only guard would never re-fire and
  // the second ticket would inherit whatever was left over from the first.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCustomerId(editing?.customerId ?? '')
      setSubject(editing?.subject ?? '')
      setDescription(editing?.description ?? '')
      setStatus(editing?.status ?? 'open')
      setPriority(editing?.priority ?? 'medium')
    }
  }

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list({ limit: 200 }), enabled: open })
  const selectedCustomer = customersQuery.data?.items.find((c) => c.id === customerId)

  const save = useMutation({
    mutationFn: () => {
      if (editing) return ticketsApi.update(editing.id, { subject, description: description || null, status, priority })
      return ticketsApi.create({ customerId, subject, description: description || undefined, status, priority })
    },
    onSuccess: () => {
      pushToast(editing ? 'Ticket updated' : 'Ticket created', 'success')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to save ticket', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Ticket' : 'New Ticket'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!subject.trim() || !customerId}>
            {editing ? 'Save Changes' : 'Create Ticket'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="Select customer"
          disabled={!!editing}
          hint={editing ? "Ticket's customer can't be changed after creation." : undefined}
          options={(customersQuery.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        {selectedCustomer?.asset && (
          <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-muted">
            Linked service: <span className="font-medium text-ink">{selectedCustomer.asset.symbology?.name ?? selectedCustomer.asset.assetType}</span> ({selectedCustomer.asset.project?.name})
          </div>
        )}
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <Textarea label="Description" value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="flex gap-3">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} options={STATUS_OPTIONS} containerClassName="flex-1" />
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} options={PRIORITY_OPTIONS} containerClassName="flex-1" />
        </div>
      </div>
    </Modal>
  )
}
