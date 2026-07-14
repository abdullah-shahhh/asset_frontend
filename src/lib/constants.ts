export const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  active: 'success',
  approved: 'success',
  completed: 'success',
  suspended: 'danger',
  rejected: 'danger',
  deleted: 'neutral',
  archived: 'neutral',
}
