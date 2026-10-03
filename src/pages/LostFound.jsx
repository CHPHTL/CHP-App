import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import PhotoUpload from '../components/PhotoUpload'

export default function LostFound() {
  const { session, role } = useAuth()
  const [items, setItems] = useState([])
  const [rooms, setRooms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ room_id: '', description: '', photo_url: null })

  async function load() {
    const { data } = await supabase
      .from('lost_found_items')
      .select('*, rooms(number)')
      .order('created_at', { ascending: false })
    setItems(data || [])
    const { data: roomData } = await supabase.from('rooms').select('id, number').order('number')
    setRooms(roomData || [])
  }

  useEffect(() => {
    load()
  }, [])

  const canReport = ['housekeeping_staff', 'housekeeping_supervisor', 'general_manager'].includes(role)
  const canAcknowledge = ['housekeeping_supervisor', 'general_manager'].includes(role)
  const canRelease = ['front_desk', 'general_manager'].includes(role)

  async function submit(e) {
    e.preventDefault()
    await supabase.from('lost_found_items').insert({ ...form, found_by: session.user.id })
    setForm({ room_id: '', description: '', photo_url: null })
    setShowForm(false)
    load()
  }

  async function acknowledge(item) {
    const location = window.prompt('Storage location for this item:')
    if (!location) return
    await supabase
      .from('lost_found_items')
      .update({ status: 'held', storage_location: location, acknowledged_by: session.user.id })
      .eq('id', item.id)
    load()
  }

  async function release(item, reason) {
    await supabase
      .from('lost_found_items')
      .update({ status: 'closed', closed_by: session.user.id, closed_reason: reason })
      .eq('id', item.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink">Lost & Found</h1>
        {canReport && (
          <button onClick={() => setShowForm((s) => !s)} className="bg-ink text-white px-3 py-1.5 rounded-lg text-sm">
            {showForm ? 'Cancel' : 'Report Item'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-lg p-4 mb-6 space-y-3">
          <select
            required
            value={form.room_id}
            onChange={(e) => setForm({ ...form, room_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Room found in…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
          </select>
          <textarea
            required
            placeholder="Describe the item"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
            rows={2}
          />
          <PhotoUpload value={form.photo_url} onChange={(url) => setForm({ ...form, photo_url: url })} />
          <button type="submit" className="bg-ink text-white px-4 py-2 rounded-lg font-medium">Submit</button>
        </form>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="border rounded-lg p-3 bg-white">
            <div className="flex justify-between items-start mb-2 gap-3">
              {item.photo_url && (
                <img src={item.photo_url} alt="" className="h-14 w-14 object-cover rounded-lg border flex-shrink-0" />
              )}
              <div className="flex-1">
                <div className="font-medium">Room {item.rooms?.number} — {item.description}</div>
                <div className="text-xs text-slate-500 capitalize">{item.status}</div>
                {item.storage_location && <div className="text-xs text-slate-500">Stored: {item.storage_location}</div>}
              </div>
            </div>
            <div className="flex gap-2">
              {canAcknowledge && item.status === 'reported' && (
                <button onClick={() => acknowledge(item)} className="bg-slate-700 text-white px-3 py-1 rounded-lg text-xs">
                  Acknowledge & Store
                </button>
              )}
              {canRelease && item.status === 'held' && (
                <>
                  <button onClick={() => release(item, 'collected')} className="bg-green-700 text-white px-3 py-1 rounded-lg text-xs">
                    Collected
                  </button>
                  <button onClick={() => release(item, 'discarded')} className="bg-slate-500 text-white px-3 py-1 rounded-lg text-xs">
                    Discarded
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">No items reported.</p>}
      </div>
    </div>
  )
}
