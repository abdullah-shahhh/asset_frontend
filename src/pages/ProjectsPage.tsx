import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, MapPin, Palette, Plus, Spline, Square } from 'lucide-react'
import { projectsApi, symbologiesApi, ApiError, type GeometryType, type Project, type Symbology } from '../lib/api'
import { Badge, Button, Card, Checkbox, DataState, EmptyState, Input, Modal, PageHeader, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

const GEOMETRY_ICON: Record<GeometryType, typeof MapPin> = { Point: MapPin, LineString: Spline, Polygon: Square }

export function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [assigningProject, setAssigningProject] = useState<Project | null>(null)
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('projects.create')
  const canManageSymbologies = hasPermission('symbologies.manage')
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list({ limit: 50 }) })

  const projects = query.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projects"
        subtitle="Survey jobs/contracts within your organization — every submitted asset belongs to one."
        action={
          canCreate && (
            <Button leftIcon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
              New Project
            </Button>
          )
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!projects.length}
          empty={
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" />}
              title="No projects yet"
              description="Create a project before survey submissions can be attached to it."
              action={canCreate && <Button leftIcon={<Plus size={16} />} onClick={() => setModalOpen(true)}>New Project</Button>}
            />
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                {canManageSymbologies && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-semibold text-ink">{p.name}</div>
                    {p.description && <div className="text-xs text-muted">{p.description}</div>}
                  </TD>
                  <TD>
                    <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                  </TD>
                  <TD className="text-muted">{new Date(p.createdAt).toLocaleDateString()}</TD>
                  {canManageSymbologies && (
                    <TD className="text-right">
                      <Button size="sm" variant="outline" leftIcon={<Palette size={14} />} onClick={() => setAssigningProject(p)}>
                        Symbologies
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <CreateProjectModal open={modalOpen} onClose={() => setModalOpen(false)} onDone={() => { setModalOpen(false); queryClient.invalidateQueries({ queryKey: ['projects'] }) }} pushToast={push} />

      <AssignSymbologiesModal project={assigningProject} onClose={() => setAssigningProject(null)} pushToast={push} />
    </div>
  )
}

function CreateProjectModal({ open, onClose, onDone, pushToast }: { open: boolean; onClose: () => void; onDone: () => void; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => projectsApi.create({ name, description: description || undefined }),
    onSuccess: () => {
      pushToast('Project created', 'success')
      setName('')
      setDescription('')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to create project', 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Project"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Create Project</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
    </Modal>
  )
}

function AssignSymbologiesModal({ project, onClose, pushToast }: { project: Project | null; onClose: () => void; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadedForProjectId, setLoadedForProjectId] = useState<string | null>(null)

  const allQuery = useQuery({ queryKey: ['symbologies'], queryFn: symbologiesApi.list, enabled: !!project })
  const assignedQuery = useQuery({
    queryKey: ['projects', project?.id, 'symbologies'],
    queryFn: () => projectsApi.getSymbologies(project!.id),
    enabled: !!project,
  })

  if (project && project.id !== loadedForProjectId && assignedQuery.data) {
    setLoadedForProjectId(project.id)
    setSelected(new Set(assignedQuery.data.map((s) => s.id)))
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = useMutation({
    mutationFn: () => projectsApi.setSymbologies(project!.id, Array.from(selected)),
    onSuccess: () => {
      pushToast('Project symbologies updated', 'success')
      queryClient.invalidateQueries({ queryKey: ['projects', project?.id, 'symbologies'] })
      onClose()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to update symbologies', 'error'),
  })

  const byType = (allQuery.data ?? []).reduce<Record<GeometryType, Symbology[]>>(
    (acc, s) => {
      acc[s.geometryType].push(s)
      return acc
    },
    { Point: [], LineString: [], Polygon: [] },
  )

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={`Symbologies — ${project?.name ?? ''}`}
      subtitle="Only checked symbologies can be used to draw new assets in this project's surveys."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
        </>
      }
    >
      {!allQuery.data?.length ? (
        <p className="text-sm text-muted">No symbologies exist yet — create some under Settings → Symbology first.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(['Point', 'LineString', 'Polygon'] as const).map((type) => {
            const items = byType[type]
            if (!items.length) return null
            const Icon = GEOMETRY_ICON[type]
            return (
              <div key={type}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Icon size={13} />
                  {type === 'LineString' ? 'Line' : type}
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-slate-100 p-3">
                  {items.map((s) => (
                    <Checkbox
                      key={s.id}
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      label={s.name}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
