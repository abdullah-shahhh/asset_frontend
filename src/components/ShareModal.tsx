import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, Share2, Trash2 } from 'lucide-react'
import { shareLinksApi, ApiError, type ShareLink } from '../lib/api'
import { Badge, Button, DataState, EmptyState, Input, Modal, Select, useToast } from './ui'

const EXPIRY_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '1 day' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
  { value: 'forever', label: 'Forever (until I revoke it)' },
]

function timeUntil(iso: string | null): string {
  if (!iso) return 'never expires'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

export function ShareModal({ open, onClose, projectId, projectName }: { open: boolean; onClose: () => void; projectId: string; projectName: string }) {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [expiresInHours, setExpiresInHours] = useState('24')
  const [label, setLabel] = useState('')

  const linksQuery = useQuery({ queryKey: ['share-links', projectId], queryFn: () => shareLinksApi.list(projectId), enabled: open })
  const links = linksQuery.data ?? []

  const create = useMutation({
    mutationFn: () =>
      shareLinksApi.create({
        projectId,
        expiresInHours: expiresInHours === 'forever' ? null : Number(expiresInHours),
        label: label.trim() || undefined,
      }),
    onSuccess: () => {
      setLabel('')
      queryClient.invalidateQueries({ queryKey: ['share-links', projectId] })
      push('Share link created', 'success')
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to create share link', 'error'),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => shareLinksApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-links', projectId] })
      push('Share link revoked', 'success')
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to revoke share link', 'error'),
  })

  function copy(url: string) {
    navigator.clipboard.writeText(url)
    push('Link copied', 'success')
  }

  return (
    <Modal open={open} onClose={onClose} title="Share this project" subtitle={`Anyone with the link can view "${projectName}" read-only — no login required.`} size="lg">
      <div className="mb-5 flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Input label="Label (optional)" placeholder="e.g. Board demo" value={label} onChange={(e) => setLabel(e.target.value)} containerClassName="flex-1" />
        <Select label="Expires" value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)} options={EXPIRY_OPTIONS} containerClassName="w-52" />
        <Button onClick={() => create.mutate()} loading={create.isPending} leftIcon={<Link2 size={14} />}>
          Generate Link
        </Button>
      </div>

      <DataState
        isLoading={linksQuery.isLoading}
        error={linksQuery.error}
        onRetry={() => linksQuery.refetch()}
        isEmpty={!links.length}
        empty={<EmptyState icon={<Share2 className="h-6 w-6" />} title="No share links yet" description="Generate one above to share this project's map with anyone, no account needed." />}
      >
        <div className="flex flex-col gap-2">
          {links.map((link: ShareLink) => (
            <div key={link.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{link.label || 'Untitled link'}</span>
                  {link.isActive ? (
                    <Badge tone="success">Active · {timeUntil(link.expiresAt)}</Badge>
                  ) : link.revokedAt ? (
                    <Badge tone="neutral">Revoked</Badge>
                  ) : (
                    <Badge tone="neutral">Expired</Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">{link.url}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                  {link.lastViewedAt && ` · last viewed ${new Date(link.lastViewedAt).toLocaleString()}`}
                </div>
              </div>
              {link.isActive && (
                <>
                  <Button size="sm" variant="outline" leftIcon={<Copy size={13} />} onClick={() => copy(link.url)}>
                    Copy
                  </Button>
                  <Button size="sm" variant="danger" leftIcon={<Trash2 size={13} />} onClick={() => revoke.mutate(link.id)} loading={revoke.isPending}>
                    Revoke
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DataState>
    </Modal>
  )
}
