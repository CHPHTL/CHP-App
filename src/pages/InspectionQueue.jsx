import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange, notify } from '../lib/audit'

export default function InspectionQueue() {
  const { session, profile } = useAuth()
  const [tasks, setTasks] = useState([])

  async function loadQueue() {
    const { data } = await supabase
      .from('cleaning_tasks')
      .select('*, rooms(number, priority_flag, priority_reason), assigned_staff(full_name)')
      .eq('status', 'pending_inspection')
      .order('created_at')
    // Priority rooms first
    const sorted = (data || []).sort((a, b) => (b.rooms?.priority_flag ? 1 : 0) - (a.rooms?.priority_flag ? 1 : 0))
    setTasks(sorted)
  }

  useEffect(() => {
    loadQueue()
    const channel = supabase
      .channel('inspection-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_tasks' }, loadQueue)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function approve(task) {
    await supabase
      .from('cleaning_tasks')
      .update({ status: 'completed', inspected_by: session.user.id, inspection_result: 'approved' })
      .eq('id', task.id)
    await supabase.from('rooms').update({ cleaning_status: 'clean_ready' }).eq('id', task.room_id)
    await logStatusChange({
      entityType: 'cleaning_task',
      entityId: task.id,
      action: 'inspection_approved',
      fromState: 'pending_inspection',
      toState: 'clean_ready',
      performedBy: session.user.id,
      role: profile.role
    })
  }

  async function reject(task) {
    const note = window.prompt('What needs fixing?')
    if (!note) return
    const route = window.confirm('Send back to the SAME housekeeper?\n\nOK = same housekeeper, Cancel = general queue')
      ? 'same_staff'
      : 'general_queue'

    await supabase
      .from('cleaning_tasks')
      .update({
        status: 'not_started',
        inspected_by: session.user.id,
        inspection_result: 'rejected',
        rejection_note: note,
        rejection_route: route,
        assigned_staff: route === 'general_queue' ? null : task.assigned_staff
      })
      .eq('id', task.id)

    await supabase.from('rooms').update({ cleaning_status: 'checked_out' }).eq('id', task.room_id)

    await logStatusChange({
      entityType: 'cleaning_task',
      entityId: task.id,
      action: 'inspection_rejected',
      fromState: 'pending_inspection',
      toState: 'checked_out',
      performedBy: session.user.id,
      role: profile.role
    })

    if (route === 'same_staff') {
      await notify({
        recipientId: task.assigned_staff,
        eventType: 'inspection_rejected',
        entityType: 'room',
        entityId: task.room_id,
        message: `Room ${task.rooms?.number} was sent back: ${note}`
      })
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-4">Inspection Queue ({tasks.length})</h1>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-lg">
                  Room {task.rooms?.number}{' '}
                  {task.rooms?.priority_flag && (
                    <span className="text-amber-600 text-sm align-middle">⚡ {task.rooms.priority_reason}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Cleaned by {task.assigned_staff?.full_name} · {Math.round(task.duration_minutes || 0)} min
                  {task.excess_duration_flag && <span className="text-red-600 font-medium"> (over target)</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => approve(task)} className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Approve — Ready for Check-in
              </button>
              <button onClick={() => reject(task)} className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Reject
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-slate-500">No rooms awaiting inspection.</p>}
      </div>
    </div>
  )
}
