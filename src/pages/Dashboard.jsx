import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState(null)

  async function load() {
    const { data: tasks } = await supabase
      .from('cleaning_tasks')
      .select('duration_minutes, excess_duration_flag, inspection_result, assigned_staff(full_name)')
      .not('duration_minutes', 'is', null)

    const { data: tickets } = await supabase.from('maintenance_tickets').select('status, ticket_type')

    const avgDuration = tasks?.length
      ? (tasks.reduce((sum, t) => sum + (t.duration_minutes || 0), 0) / tasks.length).toFixed(1)
      : '—'

    const rejections = tasks?.filter((t) => t.inspection_result === 'rejected') || []
    const byStaff = {}
    tasks?.forEach((t) => {
      const name = t.assigned_staff?.full_name || 'Unknown'
      byStaff[name] = byStaff[name] || { total: 0, rejected: 0 }
      byStaff[name].total += 1
    })
    rejections.forEach((t) => {
      const name = t.assigned_staff?.full_name || 'Unknown'
      if (byStaff[name]) byStaff[name].rejected += 1
    })

    const openByType = { maintenance: 0, housekeeping: 0 }
    tickets?.forEach((t) => {
      if (t.status !== 'completed' && t.status !== 'verified') openByType[t.ticket_type] += 1
    })

    setStats({
      avgDuration,
      excessCount: tasks?.filter((t) => t.excess_duration_flag).length || 0,
      totalCleaned: tasks?.length || 0,
      byStaff,
      openByType
    })
  }

  useEffect(() => {
    load()
  }, [])

  if (!stats) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-2xl font-semibold">{stats.avgDuration}</div>
          <div className="text-xs text-slate-500">Avg. cleaning time (min)</div>
        </div>
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-2xl font-semibold">{stats.totalCleaned}</div>
          <div className="text-xs text-slate-500">Rooms cleaned (all time)</div>
        </div>
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-2xl font-semibold text-red-600">{stats.excessCount}</div>
          <div className="text-xs text-slate-500">Over target duration</div>
        </div>
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-2xl font-semibold">{stats.openByType.maintenance + stats.openByType.housekeeping}</div>
          <div className="text-xs text-slate-500">Open tickets</div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Open tickets by type</h2>
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xl font-semibold">{stats.openByType.maintenance}</div>
          <div className="text-xs text-slate-500">Maintenance</div>
        </div>
        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xl font-semibold">{stats.openByType.housekeeping}</div>
          <div className="text-xs text-slate-500">Housekeeping</div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Rejection rate by housekeeper (training signal)</h2>
      <div className="space-y-2">
        {Object.entries(stats.byStaff).map(([name, s]) => (
          <div key={name} className="flex justify-between border rounded-lg p-3 bg-white text-sm">
            <span>{name}</span>
            <span className="text-slate-500">
              {s.rejected}/{s.total} rejected ({s.total ? Math.round((s.rejected / s.total) * 100) : 0}%)
            </span>
          </div>
        ))}
        {Object.keys(stats.byStaff).length === 0 && <p className="text-sm text-slate-500">No data yet.</p>}
      </div>
    </div>
  )
}
