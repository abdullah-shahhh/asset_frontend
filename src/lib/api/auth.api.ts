import { api } from './client'
import { tokenStore, type SessionOrganization, type SessionUser } from './tokenStore'

interface RawUser {
  id: string
  firstName: string
  lastName: string | null
  email: string
  permissions: string[]
  role?: { id: string; name: string; slug: string; isSuperAdmin: boolean }
}

interface LoginResponse {
  organization: SessionOrganization
  user: RawUser
  tokens: { access: string; refresh: string }
}

function toSessionUser(user: RawUser): SessionUser {
  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName ?? ''}`.trim(),
    email: user.email,
    role: user.role?.name ?? 'Member',
    isSuperAdmin: user.role?.isSuperAdmin ?? false,
    permissions: user.permissions ?? [],
  }
}

export const authApi = {
  async login(email: string, password: string) {
    const data = await api.post<LoginResponse>('/v1/org/auth/login', { email, password })
    tokenStore.setTokens(data.tokens.access, data.tokens.refresh)
    tokenStore.setOrganization(data.organization)
    tokenStore.setUser(toSessionUser(data.user))
    return data
  },
  async logout() {
    const refreshToken = tokenStore.getRefresh()
    tokenStore.clear()
    if (refreshToken) {
      await api.post('/v1/org/auth/logout', { refreshToken }).catch(() => {})
    }
  },
  async me() {
    const data = await api.get<RawUser>('/v1/org/auth/me')
    tokenStore.setUser(toSessionUser(data))
    return data
  },
}
