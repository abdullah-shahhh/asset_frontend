import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
  count?: number
}

export interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-2xl bg-primary-600 p-1 shadow-[var(--shadow-card)]', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors',
              isActive ? 'bg-white text-primary-700 shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-bold', isActive ? 'bg-primary-50 text-primary-700' : 'bg-white/15 text-white')}>{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
