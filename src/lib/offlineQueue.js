// Lightweight offline write queue.
//
// Covers the actions staff are most likely to make in dead zones (stairwells, basements):
// Start Cleaning / End Cleaning. Each queued action is a simple "update this table/row with
// this payload" instruction, replayed in order once the connection comes back.
//
// This intentionally does NOT try to queue everything in the app — reads always need a live
// connection anyway (there's nothing meaningful to show offline beyond what's already on
// screen), and the highest-value case is "don't lose a timer tap because the wifi dropped."

const DB_NAME = 'hotel-ops-offline'
const STORE = 'pending-actions'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function queueAction({ table, payload, matchId }) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ table, payload, matchId, queuedAt: new Date().toISOString() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAllQueued() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function removeQueued(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function pendingCount() {
  const items = await getAllQueued()
  return items.length
}

// Attempts a Supabase write; if it fails because we're offline (or the network call itself
// throws), queue it instead of losing it. Returns { queued: boolean }.
export async function writeOrQueue(supabase, { table, payload, matchId }) {
  if (!navigator.onLine) {
    await queueAction({ table, payload, matchId })
    return { queued: true }
  }
  try {
    const { error } = await supabase.from(table).update(payload).eq('id', matchId)
    if (error) throw error
    return { queued: false }
  } catch {
    await queueAction({ table, payload, matchId })
    return { queued: true }
  }
}

// Call once on app load and whenever the browser regains connectivity.
export async function flushQueue(supabase) {
  const items = await getAllQueued()
  for (const item of items) {
    try {
      const { error } = await supabase.from(item.table).update(item.payload).eq('id', item.matchId)
      if (!error) await removeQueued(item.id)
    } catch {
      // Still offline or the write failed again — leave it queued, try again next flush.
      break
    }
  }
}

export function setupOfflineSync(supabase) {
  window.addEventListener('online', () => flushQueue(supabase))
  // Also try once on load, in case we came back online while the tab was closed.
  flushQueue(supabase)
}
