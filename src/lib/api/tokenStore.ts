/**
 * Token + session storage. Single source of truth for auth state shared
 * between the API client (which injects/refreshes tokens) and AuthContext.
 * Persisted to localStorage so sessions survive reloads.
 */
const ACCESS_KEY = 'uamp_client_access'
const REFRESH_KEY = 'uamp_client_refresh'
const USER_KEY = 'uamp_client_user'
const ORG_KEY = 'uamp_client_org'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  isSuperAdmin: boolean
  permissions: string[]
}

export interface SessionOrganization {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  textPrimaryColor?: string | null
  textSecondaryColor?: string | null
}

let accessToken: string | null = localStorage.getItem(ACCESS_KEY)
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY)

type Listener = () => void
const listeners = new Set<Listener>()
function emit() {
  listeners.forEach((l) => l())
}

export const tokenStore = {
  getAccess: () => accessToken,
  getRefresh: () => refreshToken,

  setTokens(access: string, refresh: string) {
    accessToken = access
    refreshToken = refresh
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
    emit()
  },

  getUser(): SessionUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as SessionUser) : null
    } catch {
      return null
    }
  },
  setUser(user: SessionUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    emit()
  },

  getOrganization(): SessionOrganization | null {
    try {
      const raw = localStorage.getItem(ORG_KEY)
      return raw ? (JSON.parse(raw) as SessionOrganization) : null
    } catch {
      return null
    }
  },
  setOrganization(org: SessionOrganization) {
    localStorage.setItem(ORG_KEY, JSON.stringify(org))
    emit()
  },

  clear() {
    accessToken = null
    refreshToken = null
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ORG_KEY)
    emit()
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
