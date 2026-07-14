import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, tokenStore, type SessionOrganization, type SessionUser } from '../lib/api'

interface AuthContextValue {
  user: SessionUser | null
  organization: SessionOrganization | null
  isAuthenticated: boolean
  hasPermission: (key: string) => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => tokenStore.getUser())
  const [organization, setOrganization] = useState<SessionOrganization | null>(() => tokenStore.getOrganization())

  useEffect(
    () =>
      tokenStore.subscribe(() => {
        setUser(tokenStore.getUser())
        setOrganization(tokenStore.getOrganization())
      }),
    [],
  )

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password)
  }, [])

  const logout = useCallback(() => {
    authApi.logout().catch(() => {})
  }, [])

  const hasPermission = useCallback(
    (key: string) => !!user && (user.isSuperAdmin || user.permissions.includes(key)),
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ user, organization, isAuthenticated: !!user, hasPermission, login, logout }),
    [user, organization, hasPermission, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
