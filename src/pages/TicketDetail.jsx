import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange, notify } from '../lib/audit'

export default function TicketDetail() {
  const { id } = useParams()
  const { session, profile, role } = useAuth()
  const [ticket, setTicket] = useState(null)
  const [itemsUsed, setItemsUsed] = useState('')

  async function load() {
    const { data } = await supabase.from('maintenance_tickets').select('*, rooms(number)').eq('id', id).single()
    setTicket(data)
    setItemsUsed(data?.items_used || '')
  }

  useEffect(() => {
    load()
  }, [id])

  if (!ticket) return <p className="text-sm text-slate-500">Loading…</p>

  const canReroute = ['housekeeping_supervisor', 'maintenance_staff', 'general_manager'].includes(role)
  const otherDept = ticket.ticket_type === 'maintenance' ? 'housekeeping' : 'maintenance'

  async function confirmGuestApproval(status) {
    await supabase
      .from('maintenance_tickets')
      .update({ guest_approval_status: status, guest_approval_confirmed_by: session.user.id })
      .eq('id', id)
    load()
  }

  async function reroute() {
    const reason = window.prompt(`Why reroute to ${otherDept}?`)
    if (!reason) return
    await supabase.from('ticket_reroutes').insert({
      ticket_id: id,
      from_role: role,
      to_role: otherDept === 'housekeeping' ? 'housekeeping_supervisor' : 'maintenance_staff',
      reason,
      performed_by: session.user.id
    })
    await supabase
      .from('maintenance_tickets')
      .update({ ticket_type: otherDept, reroute_count: (ticket.reroute_count || 0) + 1 })
      .eq('id', id)
    await logStatusChange({
      entityType: 'ticket',
      entityId: id,
      action: 'rerouted',
      fromState: ticket.ticket_type,
      toState: otherDept,
      performedBy: session.user.id,
      role
    })
    load()
  }

  async function markComplete() {
    await supabase
      .from('maintenance_tickets')
      .update({ status: 'completed', items_used: itemsUsed })
      .eq('id', id)
    await logStatusChange({
      entityType: 'ticket',
      entityId: id,
      action: 'completed',
      fromState: ticket.status,
      toState: 'completed',
      performedBy: session.user.id,
      role
    })
    load()
  }

  async function gmOverride(decision) {
    const reason = window.prompt('Reason for this decision (required):')
    if (!reason) return
    await supabase
      .from('maintenance_tickets')
      .update({ gm_decision: decision, gm_decision_reason: reason, status: decision === 'override_ready' ? 'completed' : ticket.status })
      .eq('id', id)
    await logStatusChange({
      entityType: 'ticket',
      entityId: id,
      action: `gm_override_${decision}`,
      performedBy: session.user.id,
      role
    })
    load()
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-1">Room {ticket.rooms?.number}</h1>
      <p className="text-sm text-slate-700 mb-4">{ticket.description}</p>
      {ticket.photo_url && <img src={ticket.photo_url} alt="" className="h-40 w-40 object-cover rounded-lg border mb-4" />}

      <div className="flex flex-wrap gap-2 mb-6">
        <span className="status-badge bg-slate-200 capitalize">{ticket.ticket_type}</span>
        <span className="status-badge bg-slate-200 capitalize">{ticket.status.replace('_', ' ')}</span>
        <span className="status-badge bg-amber-100 text-amber-800 capitalize">{ticket.priority}</span>
        {ticket.room_occupancy_at_report === 'occupied' && (
          <span className="status-badge bg-blue-100 text-blue-800">Occupied at report</span>
        )}
      </div>

      {ticket.room_occupancy_at_report === 'occupied' && ticket.guest_approval_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
          <div className="font-medium mb-2">Guest approval required before work can start</div>
          <div className="flex gap-2">
            <button
              onClick={() => confirmGuestApproval('approved_while_away')}
              className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm"
            >
              Guest approved — enter while away
            </button>
            <button
              onClick={() => confirmGuestApproval('defer_until_checkout')}
              className="bg-slate-600 text-white px-3 py-1.5 rounded-lg text-sm"
            >
              Guest prefers after check-out
            </button>
          </div>
        </div>
      )}

      {ticket.guest_approval_status === 'defer_until_checkout' && (
        <div className="bg-slate-100 rounded-lg p-3 mb-6 text-sm text-slate-600">
          Waiting on guest checkout — this ticket will auto-escalate once the room is checked out.
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">Items used (optional)</label>
        <input
          value={itemsUsed}
          onChange={(e) => setItemsUsed(e.target.value)}
          placeholder="e.g. 2x AA batteries, 1 shower head"
          className="w-full border rounded-lg px-3 py-2"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {ticket.status !== 'completed' && (
          <button onClick={markComplete} className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Mark Complete
          </button>
        )}
        {canReroute && ticket.status !== 'completed' && (
          <button onClick={reroute} className="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Reroute to {otherDept}
          </button>
        )}
      </div>

      {role === 'general_manager' && ticket.reroute_count >= 1 && !ticket.gm_decision && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <div className="font-medium mb-2">Unresolved — this ticket has bounced between departments</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => gmOverride('assigned_department')} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
              Assign definitively
            </button>
            <button onClick={() => gmOverride('override_ready')} className="bg-amber-700 text-white px-3 py-1.5 rounded-lg text-sm">
              Override — mark room ready anyway
            </button>
            <button onClick={() => gmOverride('external_escalation')} className="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm">
              Escalate externally
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
