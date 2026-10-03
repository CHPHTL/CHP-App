import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Wrap a page element: <RoleRoute allow={['general_manager']}><ZoneManagement/></RoleRoute>
// This is a UI convenience only — the real enforcement is the RLS policies in schema.sql.
export default function RoleRoute({ allow, children }) {
  const { role, loading } = useAuth()
  if (loading) return null
  if (!allow.includes(role)) return <Navigate to="/" replace />
  return children
}
