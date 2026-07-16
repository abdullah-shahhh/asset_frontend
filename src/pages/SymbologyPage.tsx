import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Palette, Pencil, Plus, Spline, Square, Trash2 } from 'lucide-react'
import { symbologiesApi, ApiError, type GeometryType, type Symbology } from '../lib/api'
import { Badge, Button, Card, ConfirmDialog, DataState, EmptyState, Input, Modal, PageHeader, Select, Table, TBody, TD, TH, THead, TR, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const GEOMETRY_ICON: Record<GeometryType, typeof MapPin> = { Point: MapPin, LineString: Spline, Polygon: Square }
const GEOMETRY_LABEL: Record<GeometryType, string> = { Point: 'Point', LineString: 'Line', Polygon: 'Polygon' }

export function SymbologyPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('symbologies.manage')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Symbology | null>(null)
  const [deleting, setDeleting] = useState<Symbology | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({ queryKey: ['symbologies'], queryFn: symbologiesApi.list })
  const symbologies = query.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['symbologies'] })

  const remove = useMutation({
    mutationFn: (id: string) => symbologiesApi.remove(id),
    onSuccess: () => {
      push('Symbology deleted', 'success')
      setDeleting(null)
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to delete symbology', 'error'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(s: Symbology) {
    setEditing(s)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Symbology"
        subtitle="Named point, line, and polygon drawing tools with a color. Assign them to a project — surveys can only draw with what's assigned."
        action={
          canManage && (
            <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
              New Symbology
            </Button>
          )
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!symbologies.length}
          empty={
            <EmptyState
              icon={<Palette className="h-6 w-6" />}
              title="No symbologies yet"
              description="Create one, then assign it to a project from the Projects page."
              action={canManage && <Button leftIcon={<Plus size={16} />} onClick={openCreate}>New Symbology</Button>}
            />
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Symbology</TH>
                <TH>Geometry</TH>
                <TH>Key</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {symbologies.map((s) => {
                const Icon = GEOMETRY_ICON[s.geometryType]
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: s.color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }} />
                        <span className="font-semibold text-ink">{s.name}</span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone="neutral">
                        <Icon size={12} />
                        {GEOMETRY_LABEL[s.geometryType]}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{s.key}</TD>
                    {canManage && (
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => openEdit(s)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" leftIcon={<Trash2 size={14} />} onClick={() => setDeleting(s)}>
                            Delete
                          </Button>
                        </div>
                      </TD>
                    )}
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <SymbologyModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onDone={() => { setModalOpen(false); invalidate() }} pushToast={push} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete symbology"
        message={`"${deleting?.name}" will no longer be usable in new submissions. Existing assets created with it are kept.`}
        danger
        loading={remove.isPending}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  )
}

function SymbologyModal({
  open,
  onClose,
  editing,
  onDone,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  editing: Symbology | null
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [geometryType, setGeometryType] = useState<GeometryType>(editing?.geometryType ?? 'Point')
  const [color, setColor] = useState(editing?.color ?? '#2f4fb4')

  const editingId = editing?.id ?? null
  const [lastEditingId, setLastEditingId] = useState<string | null>(editingId)
  if (editingId !== lastEditingId) {
    setLastEditingId(editingId)
    setName(editing?.name ?? '')
    setGeometryType(editing?.geometryType ?? 'Point')
    setColor(editing?.color ?? '#2f4fb4')
  }

  const save = useMutation({
    mutationFn: () => (editing ? symbologiesApi.update(editing.id, { name, color }) : symbologiesApi.create({ name, geometryType, color })),
    onSuccess: () => {
      pushToast(editing ? 'Symbology updated' : 'Symbology created', 'success')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to save symbology', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'New Symbology'}
      subtitle={editing ? undefined : 'Pick a geometry type and color — surveys will draw with exactly this once you assign it to a project.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {editing ? 'Save Changes' : 'Create Symbology'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fire Hydrant" required />
        <Select
          label="Geometry Type"
          value={geometryType}
          onChange={(e) => setGeometryType(e.target.value as GeometryType)}
          options={[
            { value: 'Point', label: 'Point' },
            { value: 'LineString', label: 'Line' },
            { value: 'Polygon', label: 'Polygon' },
          ]}
          disabled={!!editing}
          hint={editing ? 'Geometry type cannot be changed after creation.' : undefined}
        />
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} containerClassName="flex-1" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
