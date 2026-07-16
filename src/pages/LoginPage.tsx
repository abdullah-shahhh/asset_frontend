import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROUTES } from '../lib/routes'
import { ApiError } from '../lib/api'
import { Button, Input } from '../components/ui'
import mapifyitMark from '../assets/mapifyit-mark.png'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? ROUTES.dashboard
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(ROUTES.dashboard, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-surface p-8 shadow-[var(--shadow-pop)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-950">
            <img src={mapifyitMark} alt="MapifyIT" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-ink">Asset Management</h1>
            <p className="text-xs font-medium text-muted">Sign in to your workspace</p>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700 ring-1 ring-inset ring-danger-100">{error}</div>}

        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} containerClassName="mb-4" />
        <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} containerClassName="mb-6" />

        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  )
}
