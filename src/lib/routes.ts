export const ROUTES = {
  login: '/login',
  dashboard: '/',
  submissions: '/submissions',
  alarms: '/alarms',
  projects: '/projects',
  projectDashboard: '/projects/:id/dashboard',
  customers: '/customers',
  tickets: '/tickets',
  fieldTeam: '/field-team',
  team: '/team',
  roles: '/settings/roles',
  symbologies: '/settings/symbologies',
  branding: '/settings/branding',
} as const

export function projectDashboardPath(id: string) {
  return `/projects/${id}/dashboard`
}
