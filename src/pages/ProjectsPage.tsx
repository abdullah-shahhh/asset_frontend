import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Plus } from 'lucide-react'
import { projectsApi, ApiError } from '../lib/api'
import { Badge, Button, Card, DataState, EmptyState, Input, Modal, PageHeader, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('projects.create')
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
                </TR>
              ))}
            </TBody>
          </Table>
        </DataState>
      </Card>

      <CreateProjectModal open={modalOpen} onClose={() => setModalOpen(false)} onDone={() => { setModalOpen(false); queryClient.invalidateQueries({ queryKey: ['projects'] }) }} pushToast={push} />
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
