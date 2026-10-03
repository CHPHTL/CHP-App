import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Uploads to the 'photos' bucket (created by schema.sql) and returns the public URL.
// Used by the Report an Issue and Lost & Found forms.
export default function PhotoUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(value || null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setPreview(URL.createObjectURL(file))

    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('photos').upload(path, file, { upsert: false })

    if (error) {
      alert('Photo upload failed: ' + error.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('photos').getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Photo (optional)</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="w-full text-sm border rounded-lg px-3 py-2"
      />
      {uploading && <p className="text-xs text-slate-500 mt-1">Uploading…</p>}
      {preview && !uploading && (
        <img src={preview} alt="Preview" className="mt-2 h-24 w-24 object-cover rounded-lg border" />
      )}
    </div>
  )
}
