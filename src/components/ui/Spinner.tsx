import { cn } from '../../lib/cn'

export function Spinner({ className }: { className?: string }) {
  return <div className={cn('h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600', className)} />
}
