import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import NotificationBell from './NotificationBell'

const NAV_BY_ROLE = {
  front_desk: [
    { to: '/', label: 'Room Board' },
    { to: '/tickets', label: 'Issues' },
    { to: '/lost-found', label: 'Lost & Found' },
    { to: '/supplies', label: 'Supply Requests' }
  ],
  housekeeping_staff: [
    { to: '/my-rooms', label: 'My Rooms' },
    { to: '/tickets', label: 'Issues' },
    { to: '/lost-found', label: 'Lost & Found' },
    { to: '/supplies', label: 'Supply Requests' }
  ],
  housekeeping_supervisor: [
    { to: '/', label: 'Room Board' },
    { to: '/inspections', label: 'Inspection Queue' },
    { to: '/shifts', label: 'Shifts' },
    { to: '/tickets', label: 'Issues' },
    { to: '/lost-found', label: 'Lost & Found' },
    { to: '/supplies', label: 'Supply Requests' },
    { to: '/dashboard', label: 'Dashboard' }
  ],
  maintenance_staff: [
    { to: '/tickets', label: 'My Jobs' },
    { to: '/supplies', label: 'Supply Requests' }
  ],
  general_manager: [
    { to: '/', label: 'Room Board' },
    { to: '/inspections', label: 'Inspection Queue' },
    { to: '/shifts', label: 'Shifts' },
    { to: '/tickets', label: 'Issues' },
    { to: '/lost-found', label: 'Lost & Found' },
    { to: '/supplies', label: 'Supply Requests' },
    { to: '/zones', label: 'Zones' },
    { to: '/staff', label: 'Staff' },
    { to: '/dashboard', label: 'Dashboard' }
  ]
}

export default function Layout() {
  const { profile, role, logout } = useAuth()
  const links = NAV_BY_ROLE[role] || []

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink text-white sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-semibold">Hotel Ops</div>
            {profile && <div className="text-xs text-slate-300">{profile.full_name} · {role?.replaceAll('_', ' ')}</div>}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={logout} className="text-xs text-slate-300 hover:text-white px-2 py-1">
              Log out
            </button>
          </div>
        </div>
        <nav className="flex overflow-x-auto gap-1 px-2 pb-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-1.5 rounded-full text-sm ${
                  isActive ? 'bg-white text-ink font-medium' : 'text-slate-300 hover:bg-slate-700'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
