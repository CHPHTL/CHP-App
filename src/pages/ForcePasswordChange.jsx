import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function ForcePasswordChange() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setBusy(true)
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setError(pwError.message)
      setBusy(false)
      return
    }
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', session.user.id)
    setBusy(false)
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-ink mb-1">Set a new password</h1>
        <p className="text-sm text-slate-500 mb-6">This is your first sign-in — choose a password only you know.</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4"
        />
        <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4"
        />
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button disabled={busy} className="w-full bg-ink text-white rounded-lg py-2 font-medium disabled:opacity-50">
          {busy ? 'Saving…' : 'Set password & continue'}
        </button>
      </form>
    </div>
  )
}
