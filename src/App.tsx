import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { SharedMapPage } from './pages/SharedMapPage'
import { SubmissionsPage } from './pages/SubmissionsPage'
import { AlarmsPage } from './pages/AlarmsPage'
import { CustomersPage } from './pages/CustomersPage'
import { TicketsPage } from './pages/TicketsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDashboardPage } from './pages/ProjectDashboardPage'
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
      <Route path="/share/:token" element={<SharedMapPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* MapDashboardPage is rendered persistently inside AppShell (outside
            this Outlet) so navigating away doesn't unmount the maplibregl
            instance and re-fetch every tile. This route entry just needs to
            exist so the path resolves; AppShell shows/hides the persistent
            instance itself via isMapRoute. */}
        <Route path={ROUTES.dashboard} element={null} />
        <Route
          path={ROUTES.submissions}
          element={
            <RequirePermission permission="assets.approve">
              <SubmissionsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.alarms}
          element={
            <RequirePermission permission="assets.view">
              <AlarmsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.projects}
          element={
            <RequirePermission permission="projects.view">
              <ProjectsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.projectDashboard}
          element={
            <RequirePermission permission="projects.view">
              <ProjectDashboardPage />
            </RequirePermission>
          }
        />
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
