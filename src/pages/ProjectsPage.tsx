import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, LayoutDashboard, MapPin, Palette, Plus, Share2, Spline, Square, Users } from 'lucide-react'
import { fieldTeamApi, projectsApi, symbologiesApi, ApiError, type GeometryType, type Project, type Surveyor, type Symbology } from '../lib/api'
import { Badge, Button, Card, Checkbox, DataState, EmptyState, Input, Modal, PageHeader, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from '../components/ui'
import { ShareModal } from '../components/ShareModal'
import { useAuth } from '../auth/AuthContext'
import { projectDashboardPath } from '../lib/routes'

const GEOMETRY_ICON: Record<GeometryType, typeof MapPin> = { Point: MapPin, LineString: Spline, Polygon: Square }

const SURVEY_TYPE_SUGGESTIONS = ['Custom', 'OFC Survey', 'Road Survey']

export function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [assigningProject, setAssigningProject] = useState<Project | null>(null)
  const [assigningSurveyors, setAssigningSurveyors] = useState<Project | null>(null)
  const [sharingProject, setSharingProject] = useState<Project | null>(null)
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('projects.create')
  const canManageSymbologies = hasPermission('symbologies.manage')
  const canManageSurveyors = hasPermission('projects.update')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list({ limit: 50 }) })

  const projects = query.data?.items ?? []
  const existingSurveyTypes = Array.from(new Set(projects.map((p) => p.surveyType).filter(Boolean)))

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
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.id}>
                  <TD className="max-w-[260px]">
                    <div className="truncate font-semibold text-ink" title={p.name}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="truncate text-xs text-muted" title={p.description}>
                        {p.description}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <Badge tone="neutral">{p.surveyType || 'Custom'}</Badge>
                    {p.photosRequired && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Photos required</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                  </TD>
                  <TD className="text-muted">{new Date(p.createdAt).toLocaleDateString()}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="icon" variant="outline" title="Dashboard" onClick={() => navigate(projectDashboardPath(p.id))}>
                        <LayoutDashboard size={15} />
                      </Button>
                      <Button size="icon" variant="outline" title="Share" onClick={() => setSharingProject(p)}>
                        <Share2 size={15} />
                      </Button>
                      {canManageSurveyors && (
                        <Button size="icon" variant="outline" title="Surveyors" onClick={() => setAssigningSurveyors(p)}>
                          <Users size={15} />
                        </Button>
                      )}
                      {canManageSymbologies && (
                        <Button size="icon" variant="outline" title="Symbologies" onClick={() => setAssigningProject(p)}>
                          <Palette size={15} />
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

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onDone={() => { setModalOpen(false); queryClient.invalidateQueries({ queryKey: ['projects'] }) }}
        pushToast={push}
        existingSurveyTypes={existingSurveyTypes}
      />

      <AssignSymbologiesModal project={assigningProject} onClose={() => setAssigningProject(null)} pushToast={push} />
      <AssignSurveyorsModal project={assigningSurveyors} onClose={() => setAssigningSurveyors(null)} pushToast={push} />
      {sharingProject && <ShareModal open onClose={() => setSharingProject(null)} projectId={sharingProject.id} projectName={sharingProject.name} />}
    </div>
  )
}

function CreateProjectModal({
  open,
  onClose,
  onDone,
  pushToast,
  existingSurveyTypes,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
  existingSurveyTypes: string[]
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [surveyType, setSurveyType] = useState('')
  const [selectedSurveyorIds, setSelectedSurveyorIds] = useState<Set<string>>(new Set())

  const surveyorsQuery = useQuery({ queryKey: ['field-team', 'active'], queryFn: () => fieldTeamApi.list({ status: 'active', limit: 100 }), enabled: open })
  const surveyors: Surveyor[] = surveyorsQuery.data?.items ?? []
  const allSelected = surveyors.length > 0 && selectedSurveyorIds.size === surveyors.length

  function toggleSurveyor(id: string) {
    setSelectedSurveyorIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedSurveyorIds(allSelected ? new Set() : new Set(surveyors.map((s) => s.id)))
  }

  function reset() {
    setName('')
    setDescription('')
    setSurveyType('')
    setSelectedSurveyorIds(new Set())
  }

  const create = useMutation({
    mutationFn: async () => {
      const project = await projectsApi.create({ name, description: description || undefined, surveyType: surveyType.trim() || undefined })
      if (selectedSurveyorIds.size > 0) await projectsApi.setSurveyors(project.id, Array.from(selectedSurveyorIds))
      return project
    },
    onSuccess: () => {
      pushToast('Project created', 'success')
      reset()
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to create project', 'error'),
  })

  const typeOptions = Array.from(new Set([...SURVEY_TYPE_SUGGESTIONS, ...existingSurveyTypes]))

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
        <Input
          label="Type"
          list="survey-type-options"
          value={surveyType}
          onChange={(e) => setSurveyType(e.target.value)}
          placeholder="e.g. OFC Survey"
          hint="Pick an existing type or type a new one."
        />
        <datalist id="survey-type-options">
          {typeOptions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700">Surveyors</label>
            {surveyors.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>
          {!surveyors.length ? (
            <p className="text-sm text-muted">No active field surveyors yet — add some under Field Team first.</p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-100 p-3">
              {surveyors.map((s) => (
                <Checkbox
                  key={s.id}
                  checked={selectedSurveyorIds.has(s.id)}
                  onChange={() => toggleSurveyor(s.id)}
                  label={`${s.firstName} ${s.lastName ?? ''}`.trim() + ` — ${s.email}`}
                />
              ))}
            </div>
          )}
        </div>
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

function AssignSurveyorsModal({ project, onClose, pushToast }: { project: Project | null; onClose: () => void; pushToast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadedForProjectId, setLoadedForProjectId] = useState<string | null>(null)

  const allQuery = useQuery({ queryKey: ['field-team', 'active'], queryFn: () => fieldTeamApi.list({ status: 'active', limit: 100 }), enabled: !!project })
  const assignedQuery = useQuery({
    queryKey: ['projects', project?.id, 'surveyors'],
    queryFn: () => projectsApi.getSurveyors(project!.id),
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
    mutationFn: () => projectsApi.setSurveyors(project!.id, Array.from(selected)),
    onSuccess: () => {
      pushToast('Project surveyors updated', 'success')
      queryClient.invalidateQueries({ queryKey: ['projects', project?.id, 'surveyors'] })
      onClose()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to update surveyors', 'error'),
  })

  const surveyors: Surveyor[] = allQuery.data?.items ?? []

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={`Surveyors — ${project?.name ?? ''}`}
      subtitle="Only checked surveyors may submit assets into this project. Org Admins can always submit to any project."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
        </>
      }
    >
      {!surveyors.length ? (
        <p className="text-sm text-muted">No active field surveyors yet — add some under Field Team first.</p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-100 p-3">
          {surveyors.map((s) => (
            <Checkbox key={s.id} checked={selected.has(s.id)} onChange={() => toggle(s.id)} label={`${s.firstName} ${s.lastName ?? ''}`.trim() + ` — ${s.email}`} />
          ))}
        </div>
      )}
    </Modal>
  )
}
