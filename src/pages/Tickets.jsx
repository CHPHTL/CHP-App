import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange } from '../lib/audit'
import PhotoUpload from '../components/PhotoUpload'

const PRIORITY_STYLE = {
  normal: 'bg-slate-100 text-slate-700',
  escalated: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800'
}

export default function Tickets() {
  const { session, profile, role } = useAuth()
  const [tickets, setTickets] = useState([])
  const [rooms, setRooms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    room_id: '',
    description: '',
    photo_url: null,
    ticket_type: 'maintenance',
    room_occupancy_at_report: 'vacant',
    guest_approval_status: 'not_applicable',
    requires_room_block: false,
    block_duration: 'short'
  })

  async function load() {
    let query = supabase.from('maintenance_tickets').select('*, rooms(number)').order('created_at', { ascending: false })
    if (role === 'maintenance_staff') query = query.eq('assigned_to', session.user.id)
    const { data } = await query
    setTickets(data || [])
    const { data: roomData } = await supabase.from('rooms').select('id, number').order('number')
    setRooms(roomData || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('tickets-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [role])

  async function submitTicket(e) {
    e.preventDefault()
    if (form.room_occupancy_at_report === 'occupied' && form.guest_approval_status === 'pending') {
      alert('Please confirm guest approval status before submitting — this is required for occupied rooms.')
      return
    }
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .insert({
        room_id: form.room_id,
        description: form.description,
        photo_url: form.photo_url,
        ticket_type: form.ticket_type,
        room_occupancy_at_report: form.room_occupancy_at_report,
        guest_approval_status: form.guest_approval_status,
        requires_room_block: form.requires_room_block,
        reported_by: session.user.id,
        reported_by_role: role,
        guest_approval_confirmed_by:
          form.room_occupancy_at_report === 'occupied' ? session.user.id : null
      })
      .select()
      .single()
    if (error) return alert(error.message)

    if (form.requires_room_block) {
      const expectedRelease =
        form.block_duration === 'short'
          ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          : null
      await supabase
        .from('rooms')
        .update({
          operational_status: form.block_duration === 'short' ? 'blocked' : 'out_of_service',
          blocked_reason: form.description,
          blocked_by: session.user.id,
          blocked_at: new Date().toISOString(),
          expected_release_at: expectedRelease,
          linked_maintenance_ticket_id: data.id
        })
        .eq('id', form.room_id)
    }

    await logStatusChange({
      entityType: 'ticket',
      entityId: data.id,
      action: 'reported',
      toState: 'reported',
      performedBy: session.user.id,
      role
    })
    setShowForm(false)
    setForm({ room_id: '', description: '', photo_url: null, ticket_type: 'maintenance', room_occupancy_at_report: 'vacant', guest_approval_status: 'not_applicable', requires_room_block: false, block_duration: 'short' })
    load()
  }

  const needsGuestApproval = form.room_occupancy_at_report === 'occupied'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">{role === 'maintenance_staff' ? 'My Jobs' : 'Issues'}</h1>
        <button onClick={() => setShowForm((s) => !s)} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
          {showForm ? 'Cancel' : 'Report an Issue'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitTicket} className="bg-white border rounded-lg p-4 mb-6 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Room</label>
            <select
              required
              value={form.room_id}
              onChange={(e) => setForm({ ...form, room_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Select room…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">What's wrong?</label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
            />
          </div>
          <PhotoUpload value={form.photo_url} onChange={(url) => setForm({ ...form, photo_url: url })} />
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={form.ticket_type}
              onChange={(e) => setForm({ ...form, ticket_type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="maintenance">Maintenance (repair, fixture, appliance)</option>
              <option value="housekeeping">Housekeeping (stain, damage, missing item)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Is the room currently occupied?</label>
            <select
              value={form.room_occupancy_at_report}
              onChange={(e) =>
                setForm({
                  ...form,
                  room_occupancy_at_report: e.target.value,
                  guest_approval_status: e.target.value === 'occupied' ? 'pending' : 'not_applicable'
                })
              }
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
            </select>
          </div>
          {needsGuestApproval && (
            <div>
              <label className="block text-sm font-medium mb-1">Guest approval — required</label>
              <select
                required
                value={form.guest_approval_status}
                onChange={(e) => setForm({ ...form, guest_approval_status: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="pending">Not yet confirmed</option>
                <option value="approved_while_away">Guest approved — okay to enter while they're away</option>
                <option value="defer_until_checkout">Guest prefers it fixed after check-out</option>
              </select>
            </div>
          )}
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.requires_room_block}
                onChange={(e) => setForm({ ...form, requires_room_block: e.target.checked })}
              />
              This job requires the room to be taken out of service
            </label>
            {form.requires_room_block && (
              <select
                value={form.block_duration}
                onChange={(e) => setForm({ ...form, block_duration: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 mt-2"
              >
                <option value="short">Short-term (a few days) — Blocked</option>
                <option value="long">Longer-term — Out of Service</option>
              </select>
            )}
          </div>
          <button type="submit" className="bg-ink text-white px-4 py-2 rounded-lg font-medium">
            Submit
          </button>
        </form>
      )}

      <div className="space-y-2">
        {tickets.map((t) => (
          <Link
            key={t.id}
            to={`/tickets/${t.id}`}
            className="block border rounded-lg p-3 bg-white hover:bg-slate-50"
          >
            <div className="flex justify-between items-start gap-3">
              {t.photo_url && <img src={t.photo_url} alt="" className="h-12 w-12 object-cover rounded-lg border flex-shrink-0" />}
              <div className="flex-1">
                <div className="font-medium">Room {t.rooms?.number} — {t.description}</div>
                <div className="text-xs text-slate-500 capitalize">{t.ticket_type} · {t.status.replace('_', ' ')}</div>
              </div>
              <span className={`status-badge ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
            </div>
          </Link>
        ))}
        {tickets.length === 0 && <p className="text-sm text-slate-500">No tickets to show.</p>}
      </div>
    </div>
  )
}
