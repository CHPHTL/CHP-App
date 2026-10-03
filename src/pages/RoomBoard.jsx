import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange } from '../lib/audit'

const STATUS_STYLES = {
  checked_out: 'bg-red-100 text-red-800 border-red-300',
  cleaning_in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  pending_inspection: 'bg-amber-100 text-amber-800 border-amber-300',
  clean_ready: 'bg-green-100 text-green-800 border-green-300'
}

const STATUS_LABEL = {
  checked_out: 'Checked Out / Dirty',
  cleaning_in_progress: 'Cleaning',
  pending_inspection: 'Pending Inspection',
  clean_ready: 'Ready'
}

export default function RoomBoard() {
  const { role, session } = useAuth()
  const [rooms, setRooms] = useState([])
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [newRoom, setNewRoom] = useState({ number: '', floor: '' })
  const navigate = useNavigate()

  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('*').order('number')
    setRooms(data || [])
  }

  useEffect(() => {
    loadRooms()
    const channel = supabase
      .channel('rooms-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadRooms)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const canSetPriority = ['front_desk', 'housekeeping_supervisor', 'general_manager'].includes(role)

  async function createRoom(e) {
    e.preventDefault()
    if (!newRoom.number.trim()) return
    const { error } = await supabase.from('rooms').insert({ number: newRoom.number, floor: newRoom.floor || null })
    if (error) return alert(error.message)
    setNewRoom({ number: '', floor: '' })
    setShowAddRoom(false)
    loadRooms()
  }

  async function togglePriority(room) {
    const reason = room.priority_flag ? null : window.prompt('Reason for priority (e.g. "Early check-in requested"):')
    if (!room.priority_flag && !reason) return
    await supabase
      .from('rooms')
      .update({
        priority_flag: !room.priority_flag,
        priority_reason: room.priority_flag ? null : reason,
        priority_set_by: room.priority_flag ? null : session.user.id,
        priority_set_at: room.priority_flag ? null : new Date().toISOString()
      })
      .eq('id', room.id)
    await logStatusChange({
      entityType: 'room',
      entityId: room.id,
      action: room.priority_flag ? 'priority_cleared' : 'priority_set',
      performedBy: session.user.id,
      role
    })
  }

  const activeRooms = rooms.filter((r) => r.operational_status === 'active')
  const outOfServiceRooms = rooms.filter((r) => r.operational_status !== 'active')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">Room Status Board</h1>
        {role === 'general_manager' && (
          <button onClick={() => setShowAddRoom((s) => !s)} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
            {showAddRoom ? 'Cancel' : 'Add Room'}
          </button>
        )}
      </div>

      {showAddRoom && (
        <form onSubmit={createRoom} className="bg-white border rounded-lg p-4 mb-6 flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium mb-1">Room number</label>
            <input
              required
              value={newRoom.number}
              onChange={(e) => setNewRoom({ ...newRoom, number: e.target.value })}
              className="border rounded-lg px-3 py-2 w-32"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Floor (optional)</label>
            <input
              value={newRoom.floor}
              onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
              className="border rounded-lg px-3 py-2 w-32"
            />
          </div>
          <button className="bg-ink text-white px-4 py-2 rounded-lg font-medium">Add</button>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
        {activeRooms.map((room) => (
          <button
            key={room.id}
            onClick={() => navigate(`/rooms/${room.id}`)}
            className={`text-left border rounded-lg p-3 relative ${STATUS_STYLES[room.cleaning_status]}`}
          >
            <div className="flex items-start justify-between">
              <span className="font-semibold">{room.number}</span>
              <div className="flex gap-1">
                {room.dnd_flag && <span title="Do Not Disturb">🚫</span>}
                {room.priority_flag && <span title={room.priority_reason}>⚡</span>}
              </div>
            </div>
            <div className="text-xs mt-1">{STATUS_LABEL[room.cleaning_status]}</div>
            {canSetPriority && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  togglePriority(room)
                }}
                className="absolute bottom-1 right-1 text-[10px] underline opacity-70"
              >
                {room.priority_flag ? 'clear priority' : 'flag priority'}
              </span>
            )}
          </button>
        ))}
        {activeRooms.length === 0 && <p className="text-sm text-slate-500 col-span-full">No rooms yet — add rooms in Supabase or a future admin screen.</p>}
      </div>

      {outOfServiceRooms.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">Out of Service ({outOfServiceRooms.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {outOfServiceRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => navigate(`/rooms/${room.id}`)}
                className="text-left border rounded-lg p-3 bg-slate-100 text-slate-500 border-slate-300"
              >
                <span className="font-semibold">{room.number}</span>
                <div className="text-xs mt-1 capitalize">{room.operational_status.replace('_', ' ')}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
