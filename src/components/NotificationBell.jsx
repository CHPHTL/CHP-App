import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function NotificationBell() {
  const { session } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  async function loadNotifications() {
    if (!session) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setItems(data || [])
  }

  useEffect(() => {
    loadNotifications()
    if (!session) return
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${session.user.id}` },
        () => loadNotifications()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  const unreadCount = items.filter((n) => !n.read_at).length

  async function openItem(n) {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
      loadNotifications()
    }
    setOpen(false)
    if (n.entity_type === 'room') navigate(`/rooms/${n.entity_id}`)
    if (n.entity_type === 'ticket') navigate(`/tickets/${n.entity_id}`)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-slate-700 text-white"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-lg shadow-xl border border-slate-200 z-50">
          {items.length === 0 && <div className="p-4 text-sm text-slate-500">No notifications yet.</div>}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={`block w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${
                !n.read_at ? 'bg-amber-50' : ''
              }`}
            >
              <div className="text-sm text-slate-800">{n.message}</div>
              <div className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
