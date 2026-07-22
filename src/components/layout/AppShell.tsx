import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Map, ClipboardCheck, FolderKanban, Users, HardHat, ShieldCheck, Palette, LogOut, Bell, LifeBuoy, Paintbrush, Settings, Radio, Contact, Ticket } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../auth/AuthContext'
import { ROUTES } from '../../lib/routes'
import { useApplyBranding } from '../../theme/useApplyBranding'
import { mediaUrl } from '../../theme/branding'
import { Dropdown } from '../ui'
import mapifyitMark from '../../assets/mapifyit-mark.png'

const NAV = [
  { to: ROUTES.dashboard, label: 'Map', icon: Map, end: true, permission: null as string | null },
  { to: ROUTES.submissions, label: 'Submissions', icon: ClipboardCheck, permission: null },
  { to: ROUTES.alarms, label: 'Alarms', icon: Radio, permission: 'assets.view' },
  { to: ROUTES.projects, label: 'Projects', icon: FolderKanban, permission: null },
  { to: ROUTES.customers, label: 'Customers', icon: Contact, permission: 'customers.view' },
  { to: ROUTES.tickets, label: 'Tickets', icon: Ticket, permission: 'tickets.view' },
  { to: ROUTES.fieldTeam, label: 'Field Team', icon: HardHat, permission: 'field_team.view' },
]

const SETTINGS_NAV = [
  { to: ROUTES.team, label: 'Users', icon: Users, permission: 'users.view' },
  { to: ROUTES.roles, label: 'Roles', icon: ShieldCheck, permission: 'roles.view' },
  { to: ROUTES.symbologies, label: 'Symbology', icon: Paintbrush, permission: 'symbologies.view' },
  { to: ROUTES.branding, label: 'Branding', icon: Palette, permission: 'branding.manage' },
]

function initials(name?: string) {
  if (!name) return 'U'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}

export function AppShell() {
  const { user, organization, logout, hasPermission } = useAuth()
  const branding = useApplyBranding()
  const logoSrc = mediaUrl(branding?.logoUrl)
  const visibleNav = NAV.filter((n) => !n.permission || hasPermission(n.permission))
  const visibleSettingsNav = SETTINGS_NAV.filter((n) => !n.permission || hasPermission(n.permission))
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isMapRoute = pathname === ROUTES.dashboard

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'group flex items-center gap-3 rounded-xl text-sm font-semibold transition-colors',
      isMapRoute ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
      isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
    )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      <aside className={clsx('flex shrink-0 flex-col bg-white py-5 transition-[width] duration-200', isMapRoute ? 'w-14 items-center px-1.5' : 'w-64 px-4')}>
        <div className={clsx('mb-6 flex items-center gap-2.5', isMapRoute ? 'px-0' : 'px-1')}>
          {logoSrc ? (
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-50 p-1.5 ring-1 ring-primary-100">
              <img src={logoSrc} alt={organization?.name} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-950">
              <img src={mapifyitMark} alt="MapifyIT" className="h-7 w-7 object-contain" />
            </div>
          )}
          {!isMapRoute && (
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold leading-tight tracking-tight text-ink">{organization?.name ?? 'MapifyIT'}</h2>
              <p className="text-xs font-medium text-muted">Urban Asset Management</p>
            </div>
          )}
        </div>

        <nav className={clsx('flex-1 overflow-y-auto', isMapRoute ? 'w-full space-y-1' : 'space-y-6')}>
          {isMapRoute ? (
            visibleNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} title={label} className={linkClass}>
                <Icon size={18} strokeWidth={2.25} />
              </NavLink>
            ))
          ) : (
            <div>
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Main Menu</p>
              <div className="space-y-1">
                {visibleNav.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={linkClass}>
                    <Icon size={18} strokeWidth={2.25} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {visibleSettingsNav.length > 0 &&
            (isMapRoute ? (
              <Dropdown
                align="left"
                trigger={
                  <span className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800" title="Settings">
                    <Settings size={18} strokeWidth={2.25} />
                  </span>
                }
                items={visibleSettingsNav.map(({ to, label, icon: Icon }) => ({ label, icon: <Icon className="h-4 w-4" />, onClick: () => navigate(to) }))}
              />
            ) : (
              <div>
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Settings</p>
                <div className="space-y-1">
                  {visibleSettingsNav.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} className={linkClass}>
                      <Icon size={18} strokeWidth={2.25} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
        </nav>

        {!isMapRoute && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-primary-50/60 p-4">
            <LifeBuoy size={18} className="mt-0.5 shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-semibold text-ink">Need help?</p>
              <p className="mt-0.5 text-xs text-muted">Reach out to your platform admin for support.</p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On the map route there's no separate header — MapDashboardPage's
            own toolbar carries identity/notifications/user menu, so the map
            gets one slim bar of chrome instead of two stacked ones. */}
        {!isMapRoute && (
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-6 backdrop-blur">
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <Bell size={18} />
              </button>
              <div className="mx-1 h-8 w-px bg-slate-200" />
              <Dropdown
                align="right"
                trigger={
                  <span className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-100">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{initials(user?.name)}</span>
                    <span className="hidden text-left sm:block">
                      <span className="block text-sm font-semibold leading-tight text-ink">{user?.name}</span>
                      <span className="block text-xs text-muted">{user?.role}</span>
                    </span>
                  </span>
                }
                items={[{ label: 'Sign out', icon: <LogOut className="h-4 w-4" />, danger: true, onClick: logout }]}
              />
            </div>
          </header>
        )}
        <main className={isMapRoute ? 'flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto p-6'}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
