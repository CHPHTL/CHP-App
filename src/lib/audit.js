import { supabase } from '../supabaseClient'

// Append a row to the immutable audit trail. Never call update/delete on status_log —
// the database itself has no policy allowing it, this is just the write helper.
export async function logStatusChange({ entityType, entityId, action, fromState, toState, performedBy, role }) {
  await supabase.from('status_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    from_state: fromState,
    to_state: toState,
    performed_by: performedBy,
    role,
    device: navigator.userAgent
  })
}

// Create a notification row. The dashboard bell and push-permission service worker
// both read from this same table (see NotificationBell.jsx).
//
// Pass either recipientId (a specific person) or recipientRole (fans out to every
// active staff member currently holding that role) — notifications are always stored
// per-person, since the bell only ever queries by recipient_id.
export async function notify({ recipientId, recipientRole, eventType, entityType, entityId, message }) {
  let recipientIds = recipientId ? [recipientId] : []

  if (!recipientId && recipientRole) {
    const { data: people } = await supabase.from('profiles').select('id').eq('role', recipientRole).eq('active', true)
    recipientIds = (people || []).map((p) => p.id)
  }

  if (recipientIds.length === 0) return

  await supabase.from('notifications').insert(
    recipientIds.map((id) => ({
      recipient_id: id,
      recipient_role: recipientRole || null,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      message
    }))
  )

  // Fire a browser push notification if permission was granted (see main.jsx onboarding prompt).
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.ready
    reg.showNotification('Hotel Ops', { body: message, icon: '/icon.svg' })
  }
}
