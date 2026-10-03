import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function ZoneManagement() {
  const { session } = useAuth()
  const [zones, setZones] = useState([])
  const [rooms, setRooms] = useState([])
  const [newZoneName, setNewZoneName] = useState('')

  async function load() {
    const { data: zoneData } = await supabase.from('zones').select('*').order('name')
    setZones(zoneData || [])
    const { data: roomData } = await supabase.from('rooms').select('*').order('number')
    setRooms(roomData || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function createZone(e) {
    e.preventDefault()
    if (!newZoneName.trim()) return
    await supabase.from('zones').insert({ name: newZoneName, created_by: session.user.id })
    setNewZoneName('')
    load()
  }

  async function assignRoomZone(room, zoneId) {
    await supabase.from('rooms').update({ zone_id: zoneId || null }).eq('id', room.id)
    load()
  }

  async function deleteZone(zone) {
    if (!window.confirm(`Delete zone "${zone.name}"? Rooms in it will become unassigned.`)) return
    await supabase.from('zones').delete().eq('id', zone.id)
    load()
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink mb-4">Zone Management</h1>

      <form onSubmit={createZone} className="flex gap-2 mb-6">
        <input
          value={newZoneName}
          onChange={(e) => setNewZoneName(e.target.value)}
          placeholder="New zone name (e.g. Floor 2 West)"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button className="bg-ink text-white px-4 py-2 rounded-lg font-medium">Add Zone</button>
      </form>

      <div className="space-y-2 mb-8">
        {zones.map((z) => (
          <div key={z.id} className="flex items-center justify-between border rounded-lg p-3 bg-white">
            <div>
              <div className="font-medium">{z.name}</div>
              <div className="text-xs text-slate-500">{rooms.filter((r) => r.zone_id === z.id).length} rooms</div>
            </div>
            <button onClick={() => deleteZone(z)} className="text-xs text-red-600 underline">Delete</button>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-slate-500">No zones yet — add one above.</p>}
      </div>

      <h2 className="text-sm font-semibold text-slate-500 mb-2">Assign rooms to zones</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {rooms.map((room) => (
          <div key={room.id} className="border rounded-lg p-2 bg-white">
            <div className="font-medium text-sm mb-1">Room {room.number}</div>
            <select
              value={room.zone_id || ''}
              onChange={(e) => assignRoomZone(room, e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
            >
              <option value="">No zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
        ))}
        {rooms.length === 0 && <p className="text-sm text-slate-500 col-span-full">No rooms yet.</p>}
      </div>
    </div>
  )
}
