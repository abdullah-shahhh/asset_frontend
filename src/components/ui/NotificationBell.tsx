import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNotifications } from '../../lib/notifications'

const PANEL_WIDTH = 320
const ICONS = { success: CheckCircle2, error: XCircle, info: Info }
const DOT_COLOR = { success: 'bg-success-500', error: 'bg-danger-500', info: 'bg-slate-400' }

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Bell icon + unread badge; opens a feed of everything Demo Mode (or any
 * other future producer) has reported, newest first. Used in both the light
 * AppShell header and the dark map toolbar via the `dark` prop. */
export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { notifications, unreadCount, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = r.bottom + 6
    const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8))
    setPos({ top, left })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  function toggle() {
    // markAllRead() belongs to a different component's state (the
    // provider) — calling it from inside setOpen's functional updater
    // would run it during React's render phase, which is exactly the
    // "Cannot update a component while rendering a different component"
    // class of bug. Read `open` directly instead; this is a plain click
    // handler, not a rapid-fire updater, so the closure value is safe.
    if (!open) markAllRead()
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Notifications"
        onClick={toggle}
        className={cn(
          'relative grid place-items-center rounded-lg transition-colors',
          dark ? 'h-7 w-7 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white' : 'h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        )}
      >
        <Bell size={dark ? 15 : 18} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--shadow-pop)] animate-pop-in"
          >
            <div className="border-b border-slate-100 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">Notifications</div>
            <div className="max-h-96 overflow-y-auto">
              {!notifications.length ? (
                <p className="px-3.5 py-6 text-center text-xs text-muted">
                  Nothing yet — turn on <span className="font-semibold text-ink">Demo Mode</span> to see live activity here.
                </p>
              ) : (
                notifications.map((n) => {
                  const Icon = ICONS[n.tone]
                  return (
                    <div key={n.id} className="flex items-start gap-2.5 border-b border-slate-50 px-3.5 py-2.5 text-sm last:border-0">
                      <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', DOT_COLOR[n.tone])} />
                      <Icon size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink">{n.message}</p>
                        <p className="mt-0.5 text-xs text-muted">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
