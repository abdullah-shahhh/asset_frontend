import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users2 } from 'lucide-react'
import { teamApi, rolesApi, ApiError, type TeamMember } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataState,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export function TeamPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('users.manage') || hasPermission('users.create')
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ type: 'suspend' | 'activate' | 'delete'; member: TeamMember } | null>(null)
  const queryClient = useQueryClient()
  const { push } = useToast()

  const query = useQuery({ queryKey: ['team'], queryFn: () => teamApi.list({ limit: 100 }) })
  const rolesQuery = useQuery({ queryKey: ['org-roles'], queryFn: () => rolesApi.list({ limit: 50 }) })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team'] })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => teamApi.setStatus(id, status),
    onSuccess: () => {
      push('Status updated', 'success')
      invalidate()
      setConfirm(null)
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to update status', 'error'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => {
      push('Team member removed', 'success')
      invalidate()
      setConfirm(null)
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to remove member', 'error'),
  })

  const members = query.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Team"
        subtitle="Admins and managers who can log into the client panel — review submissions, manage projects, and configure your organization."
        action={
          canManage && (
            <Button leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              Add Manager
            </Button>
          )
        }
      />

      <Card>
        <DataState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={!members.length}
          empty={
            <EmptyState
              icon={<Users2 className="h-6 w-6" />}
              title="No team members yet"
              description="Add a manager so someone besides you can review submissions and run the day-to-day."
              action={
                canManage && (
                  <Button leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                    Add Manager
                  </Button>
                )
              }
            />
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD className="font-semibold text-ink">
                    {m.firstName} {m.lastName}
                  </TD>
                  <TD>{m.email}</TD>
                  <TD>
                    <Badge tone={m.role?.isSuperAdmin ? 'primary' : 'neutral'}>{m.role?.name}</Badge>
                  </TD>
                  <TD>
                    <StatusBadge status={m.status} />
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        {m.status === 'active' && (
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ type: 'suspend', member: m })}>
                            Suspend
                          </Button>
                        )}
                        {m.status === 'suspended' && (
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ type: 'activate', member: m })}>
                            Reactivate
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => setConfirm({ type: 'delete', member: m })}>
                          Remove
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

      <CreateManagerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        roles={rolesQuery.data?.items ?? []}
        onDone={() => {
          setCreateOpen(false)
          invalidate()
        }}
        pushToast={push}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === 'delete' ? 'Remove team member' : confirm?.type === 'suspend' ? 'Suspend team member' : 'Reactivate team member'}
        message={
          confirm?.type === 'delete'
            ? `Remove ${confirm.member.firstName} ${confirm.member.lastName ?? ''}? This cannot be undone.`
            : confirm?.type === 'suspend'
              ? `${confirm.member.firstName} will no longer be able to sign in.`
              : `${confirm?.member.firstName} will be able to sign in again.`
        }
        danger={confirm?.type !== 'activate'}
        loading={setStatus.isPending || remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.type === 'delete') remove.mutate(confirm.member.id)
          else setStatus.mutate({ id: confirm.member.id, status: confirm.type === 'suspend' ? 'suspended' : 'active' })
        }}
      />
    </div>
  )
}

function CreateManagerModal({
  open,
  onClose,
  onDone,
  roles,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  roles: { id: string; name: string; slug: string }[]
  pushToast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')

  const nonSurveyorRoles = roles.filter((r) => r.slug !== 'surveyor')

  const create = useMutation({
    mutationFn: () => teamApi.create({ firstName, lastName: lastName || undefined, email, password, roleId }),
    onSuccess: () => {
      pushToast('Manager added', 'success')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPassword('')
      setRoleId('')
      onDone()
    },
    onError: (err) => pushToast(err instanceof ApiError ? err.message : 'Failed to add manager', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Manager"
      subtitle="They'll be able to sign in to the client panel with the role you choose below."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="create-manager-form" type="submit" loading={create.isPending}>
            Add Manager
          </Button>
        </>
      }
    >
      <form id="create-manager-form" onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <Input label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required containerClassName="col-span-2" />
        <Input label="Temporary Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required containerClassName="col-span-2" />
        <Select
          label="Role"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          required
          placeholder="Select a role"
          options={nonSurveyorRoles.map((r) => ({ value: r.id, label: r.name }))}
          containerClassName="col-span-2"
        />
      </form>
    </Modal>
  )
}
