/**
 * Demo Mode — simulates live network/support activity so the platform looks
 * "alive" during a demo without any real IoT/mobile-app data source feeding
 * it yet. Purely additive on top of already-existing endpoints (equipment
 * status, cable faults, tickets) — no new backend routes, no migration.
 * Persisted in localStorage so a page refresh mid-demo doesn't kill it.
 */
import { useEffect, useRef, useState } from 'react'
import { networkAssetsApi, projectsApi, customersApi, ticketsApi, type OperationalStatus } from './api'

const STORAGE_KEY = 'uamp.demoMode'
const TICK_MIN_MS = 7000
const TICK_MAX_MS = 15000

const DEMO_FAULT_REASONS = [
  'Fiber cut detected — signal loss reported by NOC monitoring',
  'Water ingress at splice enclosure — signal degradation',
  'Storm damage — downed line reported',
  'Connector failure at termination point',
  'Rodent damage suspected at mid-span',
]

const DEMO_TICKET_SUBJECTS = [
  'No internet since this morning',
  'Intermittent connection drops',
  'Slow speeds during peak hours',
  'Billing question about last invoice',
  'Requesting a service upgrade',
  'ONT lights showing red',
  'WiFi not reaching upstairs',
]

type Push = (message: string, tone?: 'success' | 'error' | 'info') => void

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined
}

function weightedPick<T extends { weight: number }>(items: T[]): T | undefined {
  const total = items.reduce((s, i) => s + i.weight, 0)
  if (total <= 0) return undefined
  let r = Math.random() * total
  for (const item of items) {
    if (r < item.weight) return item
    r -= item.weight
  }
  return items[items.length - 1]
}

async function runDemoTick(push: Push) {
  try {
    const projectsRes = await projectsApi.list({ limit: 100 })
    const project = pick(projectsRes.items)
    if (!project) return

    const { featureCollection } = await networkAssetsApi.list({ projectId: project.id, limit: 500 })
    const features = featureCollection.features
    const equipment = features.filter((f) => f.properties.symbology?.isEquipment)
    const struggling = equipment.filter((f) => f.properties.operationalStatus === 'degraded' || f.properties.operationalStatus === 'offline')
    const healthyCables = features.filter((f) => f.geometry.type === 'LineString' && f.properties.status === 'approved' && !f.properties.attributes?.faultActive)

    const customersRes = await customersApi.list({ limit: 100 })
    const ticketsRes = await ticketsApi.list({ limit: 100 })
    const openTickets = ticketsRes.items.filter((t) => t.status === 'open' || t.status === 'in_progress')

    const actions: { weight: number; run: () => Promise<{ message: string; tone: 'success' | 'error' | 'info' } | null> }[] = [
      {
        weight: equipment.length ? 3 : 0,
        run: async () => {
          const asset = pick(equipment)
          if (!asset) return null
          const next: OperationalStatus = Math.random() < 0.6 ? 'degraded' : 'offline'
          if (asset.properties.operationalStatus === next) return null
          await networkAssetsApi.update(asset.id, { operationalStatus: next })
          return { message: `${asset.properties.symbology?.name ?? 'Equipment'} went ${next}`, tone: 'error' }
        },
      },
      {
        weight: struggling.length ? 2 : 0,
        run: async () => {
          const asset = pick(struggling)
          if (!asset) return null
          await networkAssetsApi.update(asset.id, { operationalStatus: 'online' })
          return { message: `${asset.properties.symbology?.name ?? 'Equipment'} back online`, tone: 'success' }
        },
      },
      {
        weight: healthyCables.length ? 2 : 0,
        run: async () => {
          const cable = pick(healthyCables)
          const reason = pick(DEMO_FAULT_REASONS)
          if (!cable || !reason) return null
          await networkAssetsApi.update(cable.id, { attributes: { faultActive: true, faultReason: reason, faultReportedAt: new Date().toISOString() } })
          return { message: `Fault reported: ${cable.properties.symbology?.name ?? 'Cable'}`, tone: 'error' }
        },
      },
      {
        weight: customersRes.items.length ? 1 : 0,
        run: async () => {
          const customer = pick(customersRes.items)
          const subject = pick(DEMO_TICKET_SUBJECTS)
          if (!customer || !subject) return null
          await ticketsApi.create({ customerId: customer.id, subject, priority: Math.random() < 0.3 ? 'high' : 'medium' })
          return { message: `New ticket: ${subject}`, tone: 'info' }
        },
      },
      {
        weight: openTickets.length ? 1 : 0,
        run: async () => {
          const ticket = pick(openTickets)
          if (!ticket) return null
          await ticketsApi.update(ticket.id, { status: 'resolved' })
          return { message: `Ticket resolved: ${ticket.subject}`, tone: 'success' }
        },
      },
    ]

    const chosen = weightedPick(actions)
    const result = await chosen?.run()
    if (result) push(result.message, result.tone)
  } catch {
    // A flaky tick shouldn't interrupt a live demo — just skip it.
  }
}

export function useDemoMode(push: Push) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'on')
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS)
      timer = setTimeout(async () => {
        if (cancelled || !enabledRef.current) return
        await runDemoTick(push)
        if (!cancelled && enabledRef.current) schedule()
      }, delay)
    }
    schedule()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { enabled, toggle: () => setEnabled((v) => !v) }
}
