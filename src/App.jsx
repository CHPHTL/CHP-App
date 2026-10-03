import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import RoleRoute from './components/RoleRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ForcePasswordChange from './pages/ForcePasswordChange'
import RoomBoard from './pages/RoomBoard'
import RoomDetail from './pages/RoomDetail'
import MyRooms from './pages/MyRooms'
import InspectionQueue from './pages/InspectionQueue'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import LostFound from './pages/LostFound'
import SupplyRequests from './pages/SupplyRequests'
import ZoneManagement from './pages/ZoneManagement'
import StaffManagement from './pages/StaffManagement'
import StaffShifts from './pages/StaffShifts'
import Dashboard from './pages/Dashboard'

function Gate({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>
  if (!session) return <Login />
  if (profile?.must_change_password) return <ForcePasswordChange />
  if (!profile?.active) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm px-4 text-center">
        Your account is inactive. Contact your General Manager.
      </div>
    )
  }
  return children
}

function AppRoutes() {
  const { role } = useAuth()

  // Everyone's default landing route differs by role — housekeeping staff go straight
  // to their own queue rather than a board view they can't act on much.
  const homeElement = role === 'housekeeping_staff' ? <Navigate to="/my-rooms" replace /> : <RoomBoard />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={homeElement} />
        <Route path="/rooms/:id" element={<RoomDetail />} />
        <Route
          path="/my-rooms"
          element={
            <RoleRoute allow={['housekeeping_staff']}>
              <MyRooms />
            </RoleRoute>
          }
        />
        <Route
          path="/inspections"
          element={
            <RoleRoute allow={['housekeeping_supervisor', 'general_manager']}>
              <InspectionQueue />
            </RoleRoute>
          }
        />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/lost-found" element={<LostFound />} />
        <Route path="/supplies" element={<SupplyRequests />} />
        <Route
          path="/zones"
          element={
            <RoleRoute allow={['general_manager']}>
              <ZoneManagement />
            </RoleRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <RoleRoute allow={['general_manager']}>
              <StaffManagement />
            </RoleRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <RoleRoute allow={['housekeeping_supervisor', 'general_manager']}>
              <StaffShifts />
            </RoleRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RoleRoute allow={['housekeeping_supervisor', 'general_manager']}>
              <Dashboard />
            </RoleRoute>
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate>
          <AppRoutes />
        </Gate>
      </BrowserRouter>
    </AuthProvider>
  )
}
