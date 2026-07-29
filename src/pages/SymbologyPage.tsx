import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Palette, Pencil, Plus, Spline, Square, Trash2, Upload, X } from 'lucide-react'
import { symbologiesApi, ApiError, type AssetTypeField, type GeometryType, type Symbology } from '../lib/api'
import { Badge, Button, Card, Checkbox, ConfirmDialog, DataState, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table, TBody, TD, TH, THead, TR, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { SYMBOLOGY_ICONS, resolveSymbologyIcon } from '../lib/symbologyIcons'
import { mediaUrl } from '../theme/branding'

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
        subtitle="Named point, line, and polygon drawing tools with a color and — for points — an icon of your choice. Assign them to a project — surveys can only draw with what's assigned."
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
                const GeometryIcon = GEOMETRY_ICON[s.geometryType]
                const PointIcon = resolveSymbologyIcon(s.icon)
                const customIconSrc = mediaUrl(s.iconUrl)
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        {s.geometryType === 'Point' ? (
                          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full text-white" style={{ backgroundColor: s.color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }}>
                            {customIconSrc ? <img src={customIconSrc} alt="" className="h-full w-full object-cover" /> : <PointIcon size={13} strokeWidth={2.25} />}
                          </span>
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: s.color, boxShadow: '0 0 0 1px rgba(30,36,49,0.12)' }} />
                        )}
                        <span className="font-semibold text-ink">{s.name}</span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone="neutral">
                        <GeometryIcon size={12} />
                        {GEOMETRY_LABEL[s.geometryType]}
                      </Badge>
                      {s.isEquipment && (
                        <Badge tone="success" className="ml-1.5">
                          Equipment
                        </Badge>
                      )}
                      {s.isCable && (
                        <Badge tone="info" className="ml-1.5">
                          Cable
                        </Badge>
                      )}
                      {s.isRfSite && (
                        <Badge tone="primary" className="ml-1.5">
                          RF Site
                        </Badge>
                      )}
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
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(editing?.name ?? '')
  const [geometryType, setGeometryType] = useState<GeometryType>(editing?.geometryType ?? 'Point')
  const [color, setColor] = useState(editing?.color ?? '#2f4fb4')
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null)
  const [iconUrl, setIconUrl] = useState<string | null>(editing?.iconUrl ?? null)
  const [isEquipment, setIsEquipment] = useState(editing?.isEquipment ?? false)
  const [isCable, setIsCable] = useState(editing?.isCable ?? false)
  const [isRfSite, setIsRfSite] = useState(editing?.isRfSite ?? false)
  const [lineWidth, setLineWidth] = useState(editing?.lineWidth ?? 5)
  const [dashArray, setDashArray] = useState<number[]>(editing?.dashArray ?? [])
  const [fields, setFields] = useState<AssetTypeField[]>(editing?.fields ?? [])
  // A file picked before the symbology exists yet (creation flow) — held
  // locally and uploaded right after the create call succeeds.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)

  const editingId = editing?.id ?? null
  const [lastEditingId, setLastEditingId] = useState<string | null>(editingId)
  if (editingId !== lastEditingId) {
    setLastEditingId(editingId)
    setName(editing?.name ?? '')
    setGeometryType(editing?.geometryType ?? 'Point')
    setColor(editing?.color ?? '#2f4fb4')
    setIcon(editing?.icon ?? null)
    setIconUrl(editing?.iconUrl ?? null)
    setIsEquipment(editing?.isEquipment ?? false)
    setIsCable(editing?.isCable ?? false)
    setIsRfSite(editing?.isRfSite ?? false)
    setLineWidth(editing?.lineWidth ?? 5)
    setDashArray(editing?.dashArray ?? [])
    setFields(editing?.fields ?? [])
    setPendingFile(null)
    setPendingPreview(null)
  }

  function slugifyKey(label: string): string {
    const words = label
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('') || 'field'
  }

  function addField() {
    setFields((prev) => [...prev, { key: '', label: '', type: 'text', required: false }])
  }
  function updateField(index: number, patch: Partial<AssetTypeField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch, ...(patch.label !== undefined ? { key: slugifyKey(patch.label) } : {}) } : f)))
  }
  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  // Drop rows the user started but never labeled, and de-dupe keys that
  // collided after slugifying (e.g. two fields both labeled "Notes").
  function cleanFields(): AssetTypeField[] {
    const seen = new Map<string, number>()
    return fields
      .filter((f) => f.label.trim())
      .map((f) => {
        const count = seen.get(f.key) ?? 0
        seen.set(f.key, count + 1)
        return count === 0 ? f : { ...f, key: `${f.key}${count + 1}` }
      })
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return symbologiesApi.update(editing.id, {
          name,
          color,
          icon: geometryType === 'Point' ? icon : null,
          isEquipment: geometryType === 'Point' && isEquipment,
          isCable: geometryType === 'LineString' && isCable,
          isRfSite: geometryType === 'Point' && isRfSite,
          lineWidth,
          dashArray: geometryType === 'LineString' ? dashArray : [],
          fields: cleanFields(),
        })
      }
      const created = await symbologiesApi.create({
        name,
        geometryType,
        color,
        icon: geometryType === 'Point' ? icon : null,
        isEquipment: geometryType === 'Point' && isEquipment,
        isCable: geometryType === 'LineString' && isCable,
        isRfSite: geometryType === 'Point' && isRfSite,
        lineWidth,
        dashArray: geometryType === 'LineString' ? dashArray : [],
        fields: cleanFields(),
      })
      if (pendingFile) await symbologiesApi.uploadIcon(created.id, pendingFile)
      return created
    },
    onSuccess: () => {
      pushToast(editing ? 'Symbology updated' : 'Symbology created', 'success')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to save symbology', 'error'),
  })

  const uploadIcon = useMutation({
    mutationFn: (file: File) => symbologiesApi.uploadIcon(editing!.id, file),
    onSuccess: (updated) => {
      setIconUrl(updated.iconUrl)
      setIcon(null)
      pushToast('Custom icon uploaded', 'success')
      queryClient.invalidateQueries({ queryKey: ['symbologies'] })
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to upload icon', 'error'),
  })

  const removeCustomIcon = useMutation({
    mutationFn: () => symbologiesApi.removeIcon(editing!.id),
    onSuccess: () => {
      setIconUrl(null)
      pushToast('Custom icon removed', 'success')
      queryClient.invalidateQueries({ queryKey: ['symbologies'] })
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to remove icon', 'error'),
  })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (editing) {
      uploadIcon.mutate(file)
      return
    }
    // Not saved yet — hold the file and preview it locally; it uploads once
    // the symbology itself is created.
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    setIcon(null)
  }

  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
  }

  const customIconPreview = iconUrl ? mediaUrl(iconUrl) : pendingPreview

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${editing.name}` : 'New Symbology'}
      subtitle={editing ? undefined : 'Pick a geometry type, a color, and — for points — an icon. Surveys will draw with exactly this once you assign it to a project.'}
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

        {geometryType === 'Point' && (
          <Checkbox
            label="Equipment (tracks online/offline status)"
            checked={isEquipment}
            onChange={(e) => setIsEquipment(e.target.checked)}
          />
        )}

        {geometryType === 'Point' && (
          <Checkbox
            label="RF Site (estimates radio coverage from frequency/power/height)"
            checked={isRfSite}
            onChange={(e) => setIsRfSite(e.target.checked)}
          />
        )}

        {geometryType === 'LineString' && (
          <Checkbox
            label="Cable (carries fiber strands)"
            checked={isCable}
            onChange={(e) => setIsCable(e.target.checked)}
          />
        )}

        {geometryType === 'LineString' && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Line Style</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value) || 2)}
                containerClassName="w-24"
                label="Width (px)"
              />
              <Select
                label="Pattern"
                value={JSON.stringify(dashArray)}
                onChange={(e) => setDashArray(JSON.parse(e.target.value))}
                options={[
                  { value: '[]', label: 'Solid' },
                  { value: '[4,2]', label: 'Dashed' },
                  { value: '[1,2]', label: 'Dotted' },
                ]}
                containerClassName="flex-1"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fields</label>
          <p className="mb-2 text-xs text-muted">
            What data does an asset of this type collect? Each field can be required. Field values are entered when a surveyor submits, and can be edited by a manager afterward.
          </p>
          <div className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                <div className="mb-2 flex items-start gap-2">
                  <Input
                    value={f.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    placeholder="Field label, e.g. Owner Name"
                    containerClassName="flex-1"
                  />
                  <button type="button" onClick={() => removeField(i)} className="mt-2 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-danger-600" title="Remove field">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as AssetTypeField['type'] })}
                    options={[
                      { value: 'text', label: 'Text' },
                      { value: 'number', label: 'Number' },
                      { value: 'select', label: 'Select' },
                      { value: 'boolean', label: 'Yes / No' },
                      { value: 'date', label: 'Date' },
                      { value: 'textarea', label: 'Long Text' },
                    ]}
                    containerClassName="w-36"
                  />
                  <Checkbox label="Required" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                  {f.type === 'select' && (
                    <Input
                      value={(f.options ?? []).join(', ')}
                      onChange={(e) => updateField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                      placeholder="Options, comma separated"
                      containerClassName="min-w-[12rem] flex-1"
                    />
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus size={14} />} onClick={addField}>
              Add Field
            </Button>
          </div>
        </div>

        {geometryType === 'Point' && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Icon</label>
            <p className="mb-2 text-xs text-muted">Your choice — pick whatever best represents this asset on the map, or upload your own.</p>
            <div className="grid grid-cols-8 gap-1.5 rounded-lg border border-slate-200 p-2 sm:grid-cols-10">
              {SYMBOLOGY_ICONS.map(({ key, label, icon: IconOption }) => {
                const active = !iconUrl && icon === key
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    onClick={() => {
                      setIcon(active ? null : key)
                      setIconUrl(null)
                    }}
                    className={`grid aspect-square place-items-center rounded-lg border transition-colors ${
                      active ? 'border-primary-600 bg-primary-600 text-white' : 'border-transparent text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <IconOption size={16} />
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              {customIconPreview ? (
                <>
                  <img src={customIconPreview} alt="Custom icon" className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
                  <span className="text-xs font-medium text-ink">{pendingFile ? 'Custom icon ready to upload' : 'Using a custom uploaded icon'}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={removeCustomIcon.isPending ? <Spinner className="h-3.5 w-3.5" /> : <X size={14} />}
                    onClick={() => (pendingFile ? clearPendingFile() : removeCustomIcon.mutate())}
                    disabled={removeCustomIcon.isPending}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" leftIcon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()} loading={uploadIcon.isPending}>
                  Upload Custom Icon
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
