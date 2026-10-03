// Supabase Edge Function: create-staff-account
// Deploy with: supabase functions deploy create-staff-account
//
// This is the ONLY place the service role key is used — it never touches the frontend.
// It verifies the caller is a General Manager, creates the auth user + profile row,
// generates a temporary password, and (if RESEND_API_KEY is set) emails it to the new staff member.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY') // optional — email invite is skipped if unset

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  let pw = ''
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify the caller is signed in and is a General Manager
    const {
      data: { user }
    } = await callerClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'general_manager') {
      return new Response(JSON.stringify({ error: 'Only a General Manager can create staff accounts.' }), { status: 403 })
    }

    const { full_name, email, role, phone } = await req.json()
    if (!full_name || !email || !role) {
      return new Response(JSON.stringify({ error: 'full_name, email, and role are required.' }), { status: 400 })
    }

    const tempPassword = generateTempPassword()

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    })
    if (createError) return new Response(JSON.stringify({ error: createError.message }), { status: 400 })

    const { error: profileError } = await admin.from('profiles').insert({
      id: newUser.user.id,
      full_name,
      role,
      phone: phone || null,
      active: true,
      must_change_password: true
    })
    if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 400 })

    await admin.from('status_log').insert({
      entity_type: 'profile',
      entity_id: newUser.user.id,
      action: 'account_created',
      to_state: role,
      performed_by: user.id,
      role: 'general_manager'
    })

    // Send the temp password by email if RESEND_API_KEY is configured. If not, the GM sees
    // the temp password on-screen in the app and shares it directly — no email setup required to launch.
    let emailSent = false
    if (resendApiKey) {
      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Hotel Ops <onboarding@yourdomain.com>', // replace with your verified sending domain
          to: email,
          subject: 'Your Hotel Ops account',
          text: `Hi ${full_name},\n\nAn account has been created for you.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set a new password the first time you sign in.`
        })
      })
      emailSent = emailResp.ok
    }

    return new Response(JSON.stringify({ success: true, tempPassword, emailSent }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
