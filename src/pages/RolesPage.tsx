import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { rolesApi, ApiError, type OrgRole } from '../lib/api'
import { Badge, Button, Card, Checkbox, DataState, EmptyState, Input, Modal, PageHeader, Table, TBody, TD, TH, THead, TR, useToast } from '../components/ui'

export function RolesPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<OrgRole | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const rolesQuery = useQuery({ queryKey: ['org-roles'], queryFn: () => rolesApi.list({ limit: 50 }) })
  const permissionsQuery = useQuery({ queryKey: ['org-role-permissions'], queryFn: rolesApi.listPermissions })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org-roles'] })
    queryClient.invalidateQueries({ queryKey: ['org-role-permissions'] })
  }

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(role: OrgRole) {
    setEditing(role)
    setModalOpen(true)
  }

  const roles = rolesQuery.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Define exactly what a Manager (or any custom role) can see and do — e.g. approve submissions without managing billing or other staff."
        action={
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            New Role
          </Button>
        }
      />

      <Card>
        <DataState
          isLoading={rolesQuery.isLoading}
          error={rolesQuery.error}
          onRetry={() => rolesQuery.refetch()}
          isEmpty={!roles.length}
          empty={<EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No custom roles yet" description="Org Admin and Surveyor are built in — add a role like Manager for finer control." />}
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Permissions</TH>
                <TH>Type</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {roles.map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold text-ink">{r.name}</TD>
                  <TD>{r.isSuperAdmin ? 'All (Org Admin)' : `${r.permissions?.length ?? 0} granted`}</TD>
                  <TD>{r.isSystem ? <Badge tone="neutral">System</Badge> : <Badge tone="success">Custom</Badge>}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" disabled={r.isSuperAdmin} onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <RoleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        permissionGroups={permissionsQuery.data ?? {}}
        onDone={() => {
          setModalOpen(false)
          invalidate()
        }}
        pushToast={push}
      />
    </div>
  )
}

function RoleModal({
  open,
  onClose,
  editing,
  permissionGroups,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  editing: OrgRole | null
  permissionGroups: Record<string, { key: string; group: string; label: string }[]>
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(editing?.permissions?.map((p) => p.key) ?? []))

  // Reset local form state whenever a different role (or "new role") opens.
  const editingId = editing?.id ?? null
  const [lastEditingId, setLastEditingId] = useState<string | null>(editingId)
  if (editingId !== lastEditingId) {
    setLastEditingId(editingId)
    setName(editing?.name ?? '')
    setSelected(new Set(editing?.permissions?.map((p) => p.key) ?? []))
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, permissionKeys: Array.from(selected) }
      return editing ? rolesApi.update(editing.id, payload) : rolesApi.create(payload)
    },
    onSuccess: () => {
      pushToast(editing ? 'Role updated' : 'Role created', 'success')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to save role', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${editing.name}` : 'New Role'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {editing ? 'Save Changes' : 'Create Role'}
          </Button>
        </>
      }
    >
      <Input label="Role Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manager" containerClassName="mb-4 max-w-sm" />
      <div className="mb-2 text-sm font-semibold text-slate-700">Permissions</div>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(permissionGroups).map(([group, perms]) => (
          <div key={group} className="rounded-lg border border-slate-100 p-3">
            <div className="mb-1.5 text-xs font-bold uppercase text-muted">{group}</div>
            {perms.map((p) => (
              <div key={p.key} className="py-0.5">
                <Checkbox label={p.label} checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
