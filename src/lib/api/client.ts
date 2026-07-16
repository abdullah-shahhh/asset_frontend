/**
 * Core API client.
 * - Prefixes requests with VITE_API_BASE_URL (e.g. http://localhost:5000/api).
 * - Injects the Bearer access token.
 * - Unwraps the backend envelope ({ success, message, data, meta }).
 * - On 401, transparently refreshes the token once and retries; if refresh
 *   fails it clears the session (AuthContext reacts → redirect to login).
 */
import { tokenStore } from './tokenStore'

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:5000/api'

export class ApiError extends Error {
  status: number
  errors?: Array<{ field?: string; message: string }> | string[] | null

  constructor(status: number, message: string, errors?: ApiError['errors']) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>

export interface RequestOptions {
  params?: object
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

interface Envelope<T> {
  success: boolean
  message: string
  data: T
  meta?: { pagination?: PaginationMeta }
  errors?: ApiError['errors']
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasPrevPage: boolean
  hasNextPage: boolean
}

function buildUrl(path: string, params?: object): string {
  const url = new URL(BASE_URL + path)
  if (params) {
    for (const [key, value] of Object.entries(params as QueryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(buildUrl('/v1/org/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        })
        if (!res.ok) return false
        const json = (await res.json()) as Envelope<{ tokens: { access: string; refresh: string } }>
        if (!json.success || !json.data?.tokens) return false
        tokenStore.setTokens(json.data.tokens.access, json.data.tokens.refresh)
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

async function doFetch(path: string, method: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  const auth = opts.auth !== false
  if (auth) {
    const token = tokenStore.getAccess()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  let body: string | FormData | undefined
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }
  }
  return fetch(buildUrl(path, opts.params), { method, headers, body, signal: opts.signal })
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
  let res = await doFetch(path, method, opts)

  if (res.status === 401 && opts.auth !== false && tokenStore.getRefresh()) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await doFetch(path, method, opts)
    } else {
      tokenStore.clear()
      throw new ApiError(401, 'Your session has expired. Please sign in again.')
    }
  }

  if (res.status === 204) {
    return { success: true, message: '', data: null as T }
  }

  let json: Envelope<T>
  try {
    json = (await res.json()) as Envelope<T>
  } catch {
    throw new ApiError(res.status, res.statusText || 'Unexpected server response')
  }

  if (!res.ok || json.success === false) {
    if (res.status === 401 && opts.auth !== false) tokenStore.clear()
    throw new ApiError(res.status, json.message || 'Request failed', json.errors)
  }

  return json
}

export const api = {
  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return (await request<T>('GET', path, opts)).data
  },
  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return (await request<T>('POST', path, { ...opts, body })).data
  },
  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return (await request<T>('PATCH', path, { ...opts, body })).data
  },
  async put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return (await request<T>('PUT', path, { ...opts, body })).data
  },
  async del<T>(path: string, opts?: RequestOptions): Promise<T> {
    return (await request<T>('DELETE', path, opts)).data
  },
  async list<T>(path: string, opts?: RequestOptions): Promise<{ items: T[]; pagination?: PaginationMeta }> {
    const env = await request<T[]>('GET', path, opts)
    return { items: env.data ?? [], pagination: env.meta?.pagination }
  },
  /** Returns the raw envelope (used for GeoJSON endpoints where `data` is a FeatureCollection, not an array). */
  async raw<T>(path: string, opts?: RequestOptions): Promise<Envelope<T>> {
    return request<T>('GET', path, opts)
  },
}
