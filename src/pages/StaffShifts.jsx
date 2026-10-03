import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function StaffShifts() {
  const [date, setDate] = useState(todayISO())
  const [staff, setStaff] = useState([])
  const [zones, setZones] = useState([])
  const [shifts, setShifts] = useState({}) // staff_id -> { zone_id, shift_time }

  async function load() {
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['housekeeping_staff', 'maintenance_staff'])
      .eq('active', true)
      .order('full_name')
    setStaff(staffData || [])

    const { data: zoneData } = await supabase.from('zones').select('*').order('name')
    setZones(zoneData || [])

    const { data: shiftData } = await supabase.from('staff_shifts').select('*').eq('shift_date', date)
    const map = {}
    ;(shiftData || []).forEach((s) => {
      map[s.staff_id] = { zone_id: s.zone_id || '', shift_time: s.shift_time || '' }
    })
    setShifts(map)
  }

  useEffect(() => {
    load()
  }, [date])

  function updateLocal(staffId, field, value) {
    setShifts((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }))
  }

  async function saveShift(staffId) {
    const s = shifts[staffId] || {}
    await supabase.from('staff_shifts').upsert(
      { staff_id: staffId, shift_date: date, zone_id: s.zone_id || null, shift_time: s.shift_time || null },
      { onConflict: 'staff_id,shift_date' }
    )
  }

  const housekeeping = staff.filter((s) => s.role === 'housekeeping_staff')
  const maintenance = staff.filter((s) => s.role === 'maintenance_staff')

  function renderRow(person) {
    const s = shifts[person.id] || { zone_id: '', shift_time: '' }
    return (
      <div key={person.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-3 bg-white">
        <div className="font-medium w-40">{person.full_name}</div>
        <input
          placeholder="Shift time (e.g. 8am–4pm)"
          value={s.shift_time}
          onChange={(e) => updateLocal(person.id, 'shift_time', e.target.value)}
          onBlur={() => saveShift(person.id)}
          className="border rounded-lg px-2 py-1 text-sm w-40"
        />
        {person.role === 'housekeeping_staff' && (
          <select
            value={s.zone_id}
            onChange={(e) => {
              updateLocal(person.id, 'zone_id', e.target.value)
              setTimeout(() => saveShift(person.id), 0)
            }}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            <option value="">No zone</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">Staff Shifts</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Housekeeping</h2>
      <div className="space-y-2 mb-6">
        {housekeeping.map(renderRow)}
        {housekeeping.length === 0 && <p className="text-sm text-slate-500">No active housekeeping staff.</p>}
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Maintenance</h2>
      <div className="space-y-2">
        {maintenance.map(renderRow)}
        {maintenance.length === 0 && <p className="text-sm text-slate-500">No active maintenance staff.</p>}
      </div>
    </div>
  )
}
