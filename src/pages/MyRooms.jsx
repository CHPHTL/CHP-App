import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { logStatusChange, notify } from '../lib/audit'
import { writeOrQueue, pendingCount } from '../lib/offlineQueue'

const CLEAN_TARGET_MINUTES = 30

export default function MyRooms() {
  const { session, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [unclaimed, setUnclaimed] = useState([])
  const [now, setNow] = useState(Date.now())
  const [offline, setOffline] = useState(!navigator.onLine)
  const [pending, setPending] = useState(0)

  async function loadTasks() {
    const { data } = await supabase
      .from('cleaning_tasks')
      .select('*, rooms(number, priority_flag, priority_reason)')
      .eq('assigned_staff', session.user.id)
      .in('status', ['not_started', 'in_progress'])
      .order('priority_flag', { ascending: false, foreignTable: 'rooms' })
      .order('created_at')
    setTasks(data || [])

    const { data: unclaimedData } = await supabase
      .from('cleaning_tasks')
      .select('*, rooms(number)')
      .is('assigned_staff', null)
      .eq('status', 'not_started')
      .order('created_at')
    setUnclaimed(unclaimedData || [])
  }

  useEffect(() => {
    loadTasks()
    const channel = supabase
      .channel('my-cleaning-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_tasks' }, loadTasks)
      .subscribe()
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const goOffline = () => setOffline(true)
    const goOnline = () => {
      setOffline(false)
      setTimeout(() => pendingCount().then(setPending), 1500) // give the flush a moment
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    pendingCount().then(setPending)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [session])

  const currentTask = tasks.find((t) => t.status === 'in_progress')
  const queued = tasks.filter((t) => t.status === 'not_started')

  async function startCleaning(task) {
    // Enforce one active room at a time — only allow starting if nothing else is in progress.
    if (currentTask) {
      alert('Finish your current room before starting the next one.')
      return
    }
    const startedAt = new Date().toISOString()
    const { queued } = await writeOrQueue(supabase, {
      table: 'cleaning_tasks',
      matchId: task.id,
      payload: { status: 'in_progress', cleaning_started_at: startedAt }
    })
    if (queued) {
      setPending((p) => p + 1)
      // Optimistically reflect the change locally so the UI doesn't feel stuck offline.
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'in_progress', cleaning_started_at: startedAt } : t)))
    }
    if (!queued) {
      await supabase.from('rooms').update({ cleaning_status: 'cleaning_in_progress' }).eq('id', task.room_id)
      await logStatusChange({
        entityType: 'cleaning_task',
        entityId: task.id,
        action: 'start_cleaning',
        fromState: 'not_started',
        toState: 'in_progress',
        performedBy: session.user.id,
        role: profile.role
      })
    }
  }

  async function endCleaning(task) {
    const endedAt = new Date()
    const startedAt = new Date(task.cleaning_started_at)
    const durationMinutes = (endedAt - startedAt) / 60000
    const nextStatus = task.task_type === 'in_house' ? 'completed' : 'pending_inspection'

    const { queued } = await writeOrQueue(supabase, {
      table: 'cleaning_tasks',
      matchId: task.id,
      payload: {
        status: nextStatus,
        cleaning_ended_at: endedAt.toISOString(),
        duration_minutes: durationMinutes,
        excess_duration_flag: durationMinutes > CLEAN_TARGET_MINUTES
      }
    })

    if (queued) {
      setPending((p) => p + 1)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))
      return // room-status update and notifications need a live connection — they'll be
      // slightly behind until reconnect, but the timer data itself (the part that matters
      // for billing/reporting accuracy) is safely queued.
    }

    if (task.task_type === 'checkout_turnover') {
      await supabase.from('rooms').update({ cleaning_status: 'pending_inspection' }).eq('id', task.room_id)
      await notify({
        recipientRole: 'housekeeping_supervisor',
        eventType: 'inspection_pending',
        entityType: 'room',
        entityId: task.room_id,
        message: `Room ${task.rooms?.number} is ready for inspection.`
      })
    } else {
      await supabase.from('rooms').update({ cleaning_status: 'clean_ready' }).eq('id', task.room_id)
    }

    await logStatusChange({
      entityType: 'cleaning_task',
      entityId: task.id,
      action: 'end_cleaning',
      fromState: 'in_progress',
      toState: nextStatus,
      performedBy: session.user.id,
      role: profile.role
    })
  }

  async function claimTask(task) {
    await supabase.from('cleaning_tasks').update({ assigned_staff: session.user.id }).eq('id', task.id)
    await logStatusChange({
      entityType: 'cleaning_task',
      entityId: task.id,
      action: 'self_claimed',
      performedBy: session.user.id,
      role: profile.role
    })
    loadTasks()
  }

  function elapsedLabel(task) {
    if (!task.cleaning_started_at) return null
    const secs = Math.floor((now - new Date(task.cleaning_started_at).getTime()) / 1000)
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    const overTarget = mins >= CLEAN_TARGET_MINUTES
    return (
      <span className={overTarget ? 'text-red-600 font-semibold' : 'text-slate-600'}>
        {mins}:{s.toString().padStart(2, '0')} elapsed {overTarget && '(over target)'}
      </span>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-4">My Rooms</h1>

      {(offline || pending > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-sm text-amber-800">
          {offline
            ? "You're offline — timer taps are being saved on your phone and will sync when you're back online."
            : `Syncing ${pending} saved action${pending === 1 ? '' : 's'}…`}
        </div>
      )}

      {currentTask && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-6">
          <div className="text-xs uppercase tracking-wide text-blue-600 mb-1">Currently cleaning</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold">Room {currentTask.rooms?.number}</div>
              <div className="text-sm text-slate-500 capitalize">{currentTask.task_type.replace('_', ' ')}</div>
              {elapsedLabel(currentTask)}
            </div>
            <button
              onClick={() => endCleaning(currentTask)}
              className="bg-ink text-white px-4 py-2 rounded-lg font-medium"
            >
              End Cleaning
            </button>
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Up next ({queued.length})</h2>
      <div className="space-y-2">
        {queued.map((task) => (
          <div key={task.id} className="flex items-center justify-between border rounded-lg p-3 bg-white">
            <div>
              <div className="font-medium">
                Room {task.rooms?.number}{' '}
                {task.rooms?.priority_flag && <span className="text-amber-600 text-sm">⚡ priority</span>}
              </div>
              <div className="text-xs text-slate-500 capitalize">{task.task_type.replace('_', ' ')}</div>
            </div>
            {!currentTask && (
              <button
                onClick={() => startCleaning(task)}
                className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                Start Cleaning
              </button>
            )}
          </div>
        ))}
        {queued.length === 0 && !currentTask && (
          <p className="text-sm text-slate-500">No rooms assigned right now.</p>
        )}
      </div>

      {unclaimed.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 mt-6 mb-2">Available to pick up ({unclaimed.length})</h2>
          <div className="space-y-2">
            {unclaimed.map((task) => (
              <div key={task.id} className="flex items-center justify-between border rounded-lg p-3 bg-slate-50">
                <div>
                  <div className="font-medium">Room {task.rooms?.number}</div>
                  <div className="text-xs text-slate-500 capitalize">{task.task_type.replace('_', ' ')} · unclaimed</div>
                </div>
                <button onClick={() => claimTask(task)} className="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                  Claim
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
