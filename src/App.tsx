import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { MapDashboardPage } from './pages/MapDashboardPage'
import { SubmissionsPage } from './pages/SubmissionsPage'
import { AlarmsPage } from './pages/AlarmsPage'
import { CustomersPage } from './pages/CustomersPage'
import { TicketsPage } from './pages/TicketsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { FieldTeamPage } from './pages/FieldTeamPage'
import { TeamPage } from './pages/TeamPage'
import { RolesPage } from './pages/RolesPage'
import { SymbologyPage } from './pages/SymbologyPage'
import { BrandingSettingsPage } from './pages/BrandingSettingsPage'
import { ROUTES } from './lib/routes'

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path={ROUTES.dashboard} element={<MapDashboardPage />} />
        <Route path={ROUTES.submissions} element={<SubmissionsPage />} />
        <Route
          path={ROUTES.alarms}
          element={
            <RequirePermission permission="assets.view">
              <AlarmsPage />
            </RequirePermission>
          }
        />
        <Route path={ROUTES.projects} element={<ProjectsPage />} />
        <Route
          path={ROUTES.customers}
          element={
            <RequirePermission permission="customers.view">
              <CustomersPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.tickets}
          element={
            <RequirePermission permission="tickets.view">
              <TicketsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.fieldTeam}
          element={
            <RequirePermission permission="field_team.view">
              <FieldTeamPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.team}
          element={
            <RequirePermission permission="users.view">
              <TeamPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.roles}
          element={
            <RequirePermission permission="roles.view">
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.symbologies}
          element={
            <RequirePermission permission="symbologies.view">
              <SymbologyPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.branding}
          element={
            <RequirePermission permission="branding.manage">
              <BrandingSettingsPage />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  )
}
