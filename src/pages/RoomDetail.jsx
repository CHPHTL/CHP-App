import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange } from '../lib/audit'

export default function RoomDetail() {
  const { id } = useParams()
  const { session, role } = useAuth()
  const [room, setRoom] = useState(null)
  const [tasks, setTasks] = useState([])
  const [tickets, setTickets] = useState([])
  const [linkedTicket, setLinkedTicket] = useState(null)

  async function load() {
    const { data: roomData } = await supabase.from('rooms').select('*').eq('id', id).single()
    setRoom(roomData)
    const { data: taskData } = await supabase
      .from('cleaning_tasks')
      .select('*, assigned_staff(full_name)')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    setTasks(taskData || [])
    const { data: ticketData } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    setTickets(ticketData || [])
    if (roomData?.linked_maintenance_ticket_id) {
      const { data: lt } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .eq('id', roomData.linked_maintenance_ticket_id)
        .single()
      setLinkedTicket(lt)
    } else {
      setLinkedTicket(null)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function toggleDnd() {
    await supabase.from('rooms').update({ dnd_flag: !room.dnd_flag }).eq('id', id)
    await logStatusChange({
      entityType: 'room',
      entityId: id,
      action: room.dnd_flag ? 'dnd_cleared' : 'dnd_set',
      performedBy: session.user.id,
      role
    })
    load()
  }

  // Release flow: the linked maintenance ticket must be completed first. The supervisor then
  // chooses whether the room needs a full housekeeping clean, or can go straight to their own
  // inspection — but their own inspection is never skippable, in either path.
  async function releaseSendToHousekeeping() {
    await supabase.from('cleaning_tasks').insert({ room_id: id, task_type: 'checkout_turnover', status: 'not_started' })
    await supabase.from('rooms').update({ cleaning_status: 'checked_out', operational_status: 'active' }).eq('id', id)
    await logStatusChange({
      entityType: 'room',
      entityId: id,
      action: 'released_to_housekeeping',
      fromState: room.operational_status,
      toState: 'active',
      performedBy: session.user.id,
      role
    })
    load()
  }

  async function releaseSkipToInspection() {
    await supabase.from('cleaning_tasks').insert({
      room_id: id,
      task_type: 'checkout_turnover',
      status: 'pending_inspection',
      assigned_staff: session.user.id
    })
    await supabase.from('rooms').update({ cleaning_status: 'pending_inspection', operational_status: 'active' }).eq('id', id)
    await logStatusChange({
      entityType: 'room',
      entityId: id,
      action: 'released_skip_to_inspection',
      fromState: room.operational_status,
      toState: 'active',
      performedBy: session.user.id,
      role
    })
    load()
  }

  async function markCheckedOut() {
    await supabase.from('cleaning_tasks').insert({ room_id: id, task_type: 'checkout_turnover', status: 'not_started' })
    await supabase.from('rooms').update({ cleaning_status: 'checked_out' }).eq('id', id)
    await logStatusChange({
      entityType: 'room',
      entityId: id,
      action: 'marked_checked_out',
      fromState: room.cleaning_status,
      toState: 'checked_out',
      performedBy: session.user.id,
      role
    })
    load()
  }

  async function requestInHouseClean() {
    await supabase.from('cleaning_tasks').insert({ room_id: id, task_type: 'in_house', status: 'not_started' })
    await logStatusChange({
      entityType: 'room',
      entityId: id,
      action: 'in_house_clean_requested',
      performedBy: session.user.id,
      role
    })
    load()
    alert('In-house cleaning request created — a supervisor can assign it from the zone queue.')
  }

  if (!room) return <p className="text-sm text-slate-500">Loading…</p>

  const canSetDnd = ['front_desk', 'housekeeping_supervisor', 'general_manager'].includes(role)

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-1">Room {room.number}</h1>
      <div className="flex gap-2 mb-4">
        <span className="status-badge bg-slate-200 text-slate-700 capitalize">{room.cleaning_status.replace('_', ' ')}</span>
        {room.operational_status !== 'active' && (
          <span className="status-badge bg-slate-500 text-white capitalize">{room.operational_status.replace('_', ' ')}</span>
        )}
        {room.dnd_flag && <span className="status-badge bg-red-100 text-red-800">Do Not Disturb</span>}
        {room.priority_flag && <span className="status-badge bg-amber-100 text-amber-800">Priority: {room.priority_reason}</span>}
      </div>

      {canSetDnd && (
        <button onClick={toggleDnd} className="mb-6 text-sm underline text-slate-600">
          {room.dnd_flag ? 'Clear Do Not Disturb' : 'Set Do Not Disturb'}
        </button>
      )}

      {['front_desk', 'housekeeping_supervisor', 'general_manager'].includes(role) && room.operational_status === 'active' && (
        <div className="flex flex-wrap gap-2 mb-6">
          {room.cleaning_status === 'clean_ready' && (
            <button onClick={markCheckedOut} className="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm">
              Mark Checked Out (guest departed)
            </button>
          )}
          <button onClick={requestInHouseClean} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm">
            Request In-House Clean
          </button>
        </div>
      )}

      {room.operational_status !== 'active' && (
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 mb-6 text-sm">
          <div className="font-medium mb-1">Out of service</div>
          <div>{room.blocked_reason}</div>
          {room.expected_release_at && (
            <div className="text-slate-500">Expected back: {new Date(room.expected_release_at).toLocaleString()}</div>
          )}
          {['housekeeping_supervisor', 'general_manager'].includes(role) && (
            <>
              {linkedTicket && linkedTicket.status !== 'completed' && (
                <div className="mt-2 text-amber-700">
                  Waiting on the linked maintenance ticket to be marked complete before this room can be released.
                </div>
              )}
              {(!linkedTicket || linkedTicket.status === 'completed') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={releaseSendToHousekeeping} className="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs">
                    Needs cleaning — send to housekeeping
                  </button>
                  <button onClick={releaseSkipToInspection} className="bg-ink text-white px-3 py-1.5 rounded-lg text-xs">
                    No cleaning needed — inspect now
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Either path always ends with your own inspection before the room returns to "Ready for Check-in."
              </p>
            </>
          )}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Cleaning history</h2>
      <div className="space-y-2 mb-6">
        {tasks.map((t) => (
          <div key={t.id} className="border rounded-lg p-3 text-sm bg-white">
            <div className="flex justify-between">
              <span className="capitalize">{t.task_type.replace('_', ' ')} — {t.status.replace('_', ' ')}</span>
              <span className="text-slate-400">{new Date(t.created_at).toLocaleDateString()}</span>
            </div>
            {t.assigned_staff?.full_name && <div className="text-slate-500">By {t.assigned_staff.full_name}</div>}
            {t.duration_minutes && <div className="text-slate-500">{Math.round(t.duration_minutes)} min</div>}
            {t.rejection_note && <div className="text-red-600">Rejected: {t.rejection_note}</div>}
            {t.supervisor_note && <div className="text-amber-700">Note: {t.supervisor_note}</div>}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-slate-400">No cleaning history yet.</p>}
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Maintenance tickets</h2>
      <div className="space-y-2">
        {tickets.map((t) => (
          <div key={t.id} className="border rounded-lg p-3 text-sm bg-white">
            <div className="flex justify-between">
              <span>{t.description}</span>
              <span className="text-slate-400 capitalize">{t.status}</span>
            </div>
          </div>
        ))}
        {tickets.length === 0 && <p className="text-sm text-slate-400">No tickets for this room.</p>}
      </div>
    </div>
  )
}
