import { type ReactNode } from 'react'
import { AlertCircle, WifiOff } from 'lucide-react'
import { Spinner } from './Spinner'
import { Button } from './Button'
import { errorMessage, isNetworkError } from '../../lib/errors'

interface DataStateProps {
  isLoading: boolean
  error?: unknown
  isEmpty?: boolean
  empty?: ReactNode
  onRetry?: () => void
  children: ReactNode
}

/** Standard loading / error / empty wrapper for query-backed views. */
export function DataState({ isLoading, error, isEmpty, empty, onRetry, children }: DataStateProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  if (error) {
    const network = isNetworkError(error)
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-danger-50 text-danger-600">
          {network ? <WifiOff className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
        </div>
        <h3 className="text-base font-bold text-slate-700">{network ? 'Cannot reach the server' : 'Failed to load'}</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{network ? 'Check that the backend API is running and reachable.' : errorMessage(error)}</p>
        {onRetry && (
          <Button variant="outline" className="mt-5" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  if (isEmpty) return <>{empty}</>

  return <>{children}</>
}
