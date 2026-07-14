import { Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { ROUTES } from '../lib/routes'

/** Route guard for a specific permission. Org Admins bypass all checks. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { hasPermission } = useAuth()
  if (!hasPermission(permission)) return <Navigate to={ROUTES.dashboard} replace />
  return <>{children}</>
}
