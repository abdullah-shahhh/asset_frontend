import { type HTMLAttributes, type ReactNode, type ThHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Table({ className, children, maxHeight }: { className?: string; children: ReactNode; maxHeight?: number | string }) {
  const scrollY = maxHeight != null
  return (
    <div
      className={cn('w-full', scrollY ? 'overflow-auto' : 'overflow-x-auto overflow-y-hidden')}
      style={scrollY ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } : undefined}
    >
      <table className={cn('w-full border-collapse text-left text-sm', className)}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-white">{children}</thead>
}

export function TH({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('whitespace-nowrap border-b border-slate-100 px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400', className)} {...props}>
      {children}
    </th>
  )
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>
}

export function TR({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-primary-50/40', className)} {...props}>
      {children}
    </tr>
  )
}

export function TD({ className, children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('whitespace-nowrap px-4 py-3.5 text-slate-700', className)} {...props}>
      {children}
    </td>
  )
}
