import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface DropdownItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export interface DropdownProps {
  items: DropdownItem[]
  trigger?: ReactNode
  align?: 'left' | 'right'
}

const MENU_WIDTH = 176

export function Dropdown({ items, trigger, align = 'right' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? items.length * 40 + 8
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < menuH + 12 && r.top > menuH
    const top = openUp ? r.top - menuH - 4 : r.bottom + 4
    let left = align === 'right' ? r.right - MENU_WIDTH : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8))
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
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('rounded-lg text-slate-500 transition-colors', !trigger && 'grid h-9 w-9 place-items-center hover:bg-slate-100 hover:text-slate-700')}
      >
        {trigger ?? <MoreHorizontal className="h-5 w-5" />}
      </button>

      {open &&
        createPortal(
          <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: MENU_WIDTH }} className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-pop)] animate-pop-in">
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick()
                  setOpen(false)
                }}
                className={cn('flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40', item.danger ? 'text-danger-600 hover:bg-danger-50' : 'text-slate-700 hover:bg-slate-50')}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
