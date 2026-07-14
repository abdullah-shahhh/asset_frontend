import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'primary' | 'success' | 'amber' | 'blue' | 'violet' | 'danger'

const iconTones: Record<Tone, string> = {
  primary: 'bg-primary-100 text-primary-600',
  success: 'bg-success-100 text-success-600',
  amber: 'bg-warning-100 text-warning-600',
  blue: 'bg-info-100 text-info-600',
  violet: 'bg-violet-100 text-violet-600',
  danger: 'bg-danger-100 text-danger-600',
}

const cardTones: Record<Tone, string> = {
  primary: 'bg-primary-50/70',
  success: 'bg-success-50',
  amber: 'bg-warning-50',
  blue: 'bg-info-50',
  violet: 'bg-violet-50',
  danger: 'bg-danger-50',
}

export interface StatCardProps {
  title: string
  value: ReactNode
  icon: ReactNode
  tone?: Tone
  hint?: string
}

export function StatCard({ title, value, icon, tone = 'primary', hint }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl p-5 transition-shadow hover:shadow-[var(--shadow-card-hover)]', cardTones[tone])}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold text-slate-600">{title}</span>
        <span className={cn('grid h-10 w-10 place-items-center rounded-xl', iconTones[tone])}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-800">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}
