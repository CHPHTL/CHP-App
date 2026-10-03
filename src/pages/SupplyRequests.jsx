import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function SupplyRequests() {
  const { session } = useAuth()
  const [requests, setRequests] = useState([])
  const [staff, setStaff] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ item: '', quantity: 1, assigned_to_staff: '', assigned_to_team: '', assigned_to_department: '' })

  async function load() {
    const { data } = await supabase
      .from('supply_requests')
      .select('*, assigned_to_staff(full_name)')
      .order('created_at', { ascending: false })
    setRequests(data || [])
    const { data: staffData } = await supabase.from('profiles').select('id, full_name').eq('active', true)
    setStaff(staffData || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function submit(e) {
    e.preventDefault()
    await supabase.from('supply_requests').insert({
      item: form.item,
      quantity: form.quantity,
      assigned_to_staff: form.assigned_to_staff || null,
      assigned_to_team: form.assigned_to_team || null,
      assigned_to_department: form.assigned_to_department || null,
      requested_by: session.user.id,
      status: form.assigned_to_staff || form.assigned_to_team || form.assigned_to_department ? 'assigned' : 'open'
    })
    setForm({ item: '', quantity: 1, assigned_to_staff: '', assigned_to_team: '', assigned_to_department: '' })
    setShowForm(false)
    load()
  }

  async function fulfill(req) {
    await supabase.from('supply_requests').update({ status: 'fulfilled' }).eq('id', req.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">Supply Requests</h1>
        <button onClick={() => setShowForm((s) => !s)} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-lg p-4 mb-6 space-y-3">
          <input
            required
            placeholder="Item (e.g. towels, minibar snacks)"
            value={form.item}
            onChange={(e) => setForm({ ...form, item: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <p className="text-xs text-slate-500">Assign to whoever's available — leave blank to keep it open for anyone.</p>
          <select
            value={form.assigned_to_staff}
            onChange={(e) => setForm({ ...form, assigned_to_staff: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Assign to specific staff…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <input
            placeholder="Or a team (optional)"
            value={form.assigned_to_team}
            onChange={(e) => setForm({ ...form, assigned_to_team: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <input
            placeholder="Or a department (optional)"
            value={form.assigned_to_department}
            onChange={(e) => setForm({ ...form, assigned_to_department: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <button className="bg-ink text-white px-4 py-2 rounded-lg font-medium">Submit</button>
        </form>
      )}

      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="border rounded-lg p-3 bg-white flex items-center justify-between">
            <div>
              <div className="font-medium">{r.quantity}x {r.item}</div>
              <div className="text-xs text-slate-500">
                {r.assigned_to_staff?.full_name || r.assigned_to_team || r.assigned_to_department || 'Unassigned'} · {r.status}
              </div>
            </div>
            {r.status !== 'fulfilled' && (
              <button onClick={() => fulfill(r)} className="bg-green-700 text-white px-3 py-1 rounded-lg text-xs">
                Fulfilled
              </button>
            )}
          </div>
        ))}
        {requests.length === 0 && <p className="text-sm text-slate-500">No supply requests yet.</p>}
      </div>
    </div>
  )
}
