import { Badge } from './Badge'
import { STATUS_TONE } from '../../lib/constants'
import { titleCase } from '../../lib/format'

/** Renders a status string as a tone-coloured badge using the shared map. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return (
    <Badge tone={tone} dot className={className}>
      {titleCase(status)}
    </Badge>
  )
}
