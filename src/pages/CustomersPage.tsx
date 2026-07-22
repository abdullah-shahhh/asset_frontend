import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Contact, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { customersApi, projectsApi, networkAssetsApi, ApiError, type Customer } from '../lib/api'
import { Button, Card, ConfirmDialog, DataState, EmptyState, Input, Modal, PageHeader, Select, Table, TBody, TD, TH, THead, TR, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { ROUTES } from '../lib/routes'

export function CustomersPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('customers.manage')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list({ limit: 100 }) })
  const customers = query.data?.items ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] })

  const remove = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      push('Customer deleted', 'success')
      setDeleting(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to delete customer', 'error'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(c: Customer) {
    setEditing(c)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Customers"
        subtitle="Customer records, optionally linked to the service asset (e.g. an ONT) that serves them."
        action={
          canManage && (
            <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
              New Customer
            </Button>
          )
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!customers.length}
          empty={
            <EmptyState
              icon={<Contact className="h-6 w-6" />}
              title="No customers yet"
              description="Add a customer and optionally link them to their service asset."
              action={canManage && <Button leftIcon={<Plus size={16} />} onClick={openCreate}>New Customer</Button>}
            />
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Linked Asset</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <div className="font-semibold text-ink">{c.name}</div>
                    {c.address && <div className="text-xs text-muted">{c.address}</div>}
                  </TD>
                  <TD className="text-muted">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                    {!c.email && !c.phone && '—'}
                  </TD>
                  <TD>
                    {c.asset ? (
                      <div className="flex items-center gap-2">
                        {c.asset.symbology && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.asset.symbology.color }} />}
                        <span className="font-medium text-ink">{c.asset.symbology?.name ?? c.asset.assetType}</span>
                        <span className="text-xs text-muted">({c.asset.project?.name})</span>
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.dashboard}?project=${c.asset!.projectId}&asset=${c.networkAssetId}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                        >
                          <MapPin size={12} />
                          View on Map
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" leftIcon={<Trash2 size={14} />} onClick={() => setDeleting(c)}>
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

      <CustomerModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onDone={() => { setModalOpen(false); invalidate() }} pushToast={push} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete customer"
        message={`"${deleting?.name}" and all of their tickets will be removed.`}
        danger
        loading={remove.isPending}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  )
}

function CustomerModal({
  open,
  onClose,
  editing,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  editing: Customer | null
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [projectId, setProjectId] = useState(editing?.asset?.projectId ?? '')
  const [networkAssetId, setNetworkAssetId] = useState(editing?.networkAssetId ?? '')

  // Reset on every fresh open, not just when switching between different
  // "editing" records — otherwise two consecutive "New Customer" opens (both
  // editing === null) never re-trigger the guard and the second open starts
  // from whatever was left in the form after the first create.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(editing?.name ?? '')
      setEmail(editing?.email ?? '')
      setPhone(editing?.phone ?? '')
      setAddress(editing?.address ?? '')
      setProjectId(editing?.asset?.projectId ?? '')
      setNetworkAssetId(editing?.networkAssetId ?? '')
    }
  }

  const projectsQuery = useQuery({ queryKey: ['projects', 'all'], queryFn: () => projectsApi.list({ limit: 100 }), enabled: open })
  const projectAssetsQuery = useQuery({
    queryKey: ['network-assets', 'map', projectId],
    queryFn: () => networkAssetsApi.list({ projectId, limit: 500 }),
    enabled: open && !!projectId,
  })
  const assetOptions = (projectAssetsQuery.data?.featureCollection.features ?? []).map((f) => ({
    value: f.id,
    label: f.properties.symbology?.name ? `${f.properties.symbology.name} — ${f.properties.assetType}` : f.properties.assetType,
  }))

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, email: email || null, phone: phone || null, address: address || null, networkAssetId: networkAssetId || null }
      return editing ? customersApi.update(editing.id, payload) : customersApi.create(payload)
    },
    onSuccess: () => {
      pushToast(editing ? 'Customer updated' : 'Customer created', 'success')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to save customer', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'New Customer'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {editing ? 'Save Changes' : 'Create Customer'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />

        <div className="border-t border-slate-100 pt-3">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Linked Service Asset</label>
          <p className="mb-2 text-xs text-muted">Optional — pick the project, then the specific asset (e.g. their ONT) this customer is served by.</p>
          <div className="flex flex-col gap-2">
            <Select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setNetworkAssetId('')
              }}
              placeholder="Select project"
              options={(projectsQuery.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select
              value={networkAssetId}
              onChange={(e) => setNetworkAssetId(e.target.value)}
              placeholder={projectId ? 'Select asset' : 'Select a project first'}
              disabled={!projectId}
              options={assetOptions}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
