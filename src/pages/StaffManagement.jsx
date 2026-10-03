import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const ROLES = [
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'housekeeping_staff', label: 'Housekeeping Staff' },
  { value: 'housekeeping_supervisor', label: 'Housekeeping Supervisor' },
  { value: 'maintenance_staff', label: 'Maintenance Staff' },
  { value: 'general_manager', label: 'General Manager' }
]

export default function StaffManagement() {
  const [staff, setStaff] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'front_desk', phone: '' })
  const [busy, setBusy] = useState(false)
  const [lastCreated, setLastCreated] = useState(null)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setStaff(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function createAccount(e) {
    e.preventDefault()
    setBusy(true)
    setLastCreated(null)
    const {
      data: { session }
    } = await supabase.auth.getSession()

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(form)
    })
    const result = await res.json()
    setBusy(false)

    if (result.error) return alert(result.error)

    setLastCreated({ email: form.email, tempPassword: result.tempPassword, emailSent: result.emailSent })
    setForm({ full_name: '', email: '', role: 'front_desk', phone: '' })
    setShowForm(false)
    load()
  }

  async function toggleActive(person) {
    await supabase.from('profiles').update({ active: !person.active }).eq('id', person.id)
    load()
  }

  async function changeRole(person, newRole) {
    if (!window.confirm(`Change ${person.full_name}'s role to ${newRole.replace('_', ' ')}?`)) return
    await supabase.from('profiles').update({ role: newRole }).eq('id', person.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">Staff Accounts</h1>
        <button onClick={() => setShowForm((s) => !s)} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
          {showForm ? 'Cancel' : 'Add Staff'}
        </button>
      </div>

      {lastCreated && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-6 text-sm">
          <div className="font-medium mb-1">Account created for {lastCreated.email}</div>
          <div>
            Temporary password: <span className="font-mono bg-white px-2 py-0.5 rounded border">{lastCreated.tempPassword}</span>
          </div>
          <div className="text-slate-500 mt-1">
            {lastCreated.emailSent
              ? 'An email with these details was also sent.'
              : 'Email sending isn\'t configured yet — share this password with them directly.'}
          </div>
          <div className="text-slate-500 mt-1">They'll be asked to set a new password the first time they sign in.</div>
        </div>
      )}

      {showForm && (
        <form onSubmit={createAccount} className="bg-white border rounded-lg p-4 mb-6 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Full name</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone (optional)</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button disabled={busy} className="bg-ink text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50">
            {busy ? 'Creating…' : 'Create Account'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {staff.map((person) => (
          <div key={person.id} className="border rounded-lg p-3 bg-white flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{person.full_name}</div>
              <div className="text-xs text-slate-500">{person.phone}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={person.role}
                onChange={(e) => changeRole(person, e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button
                onClick={() => toggleActive(person)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  person.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {person.active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        ))}
        {staff.length === 0 && <p className="text-sm text-slate-500">No staff accounts yet.</p>}
      </div>
    </div>
  )
}
