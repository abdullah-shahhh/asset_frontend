/**
 * A persistent (not auto-vanishing) notification feed — separate from the
 * 4-second toast popups. Fed today by Demo Mode's simulated activity so a
 * client watching a demo can open the bell and see everything that's
 * happened, not just whatever toast was on screen when they glanced over.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface NotificationItem {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
  createdAt: number
}

interface NotificationsContextValue {
  notifications: NotificationItem[]
  unreadCount: number
  addNotification: (message: string, tone?: NotificationItem['tone']) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)
const MAX_ITEMS = 30

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const addNotification = useCallback((message: string, tone: NotificationItem['tone'] = 'info') => {
    setNotifications((prev) => [{ id: Date.now() + Math.random(), message, tone, createdAt: Date.now() }, ...prev].slice(0, MAX_ITEMS))
    setUnreadCount((n) => n + 1)
  }, [])

  const markAllRead = useCallback(() => setUnreadCount(0), [])

  const value = useMemo(() => ({ notifications, unreadCount, addNotification, markAllRead }), [notifications, unreadCount, addNotification, markAllRead])

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
