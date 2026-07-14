import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}
interface ToastContextValue {
  push: (message: string, tone?: ToastItem['tone']) => void
}
const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS = { success: CheckCircle2, error: XCircle, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              className={cn(
                'animate-pop-in flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-pop)]',
                t.tone === 'success' && 'bg-success-50 text-success-700 ring-1 ring-success-100',
                t.tone === 'error' && 'bg-danger-50 text-danger-700 ring-1 ring-danger-100',
                t.tone === 'info' && 'bg-white text-slate-700 ring-1 ring-slate-200',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
