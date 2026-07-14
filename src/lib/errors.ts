import { ApiError } from './api'

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.message === 'Failed to fetch')
}
