import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { supabase } from './supabaseClient'
import { setupOfflineSync } from './lib/offlineQueue'

setupOfflineSync(supabase)

// Ask for push permission once, after the app has loaded (not on the login screen —
// browsers are more likely to grant permission after a user has already engaged).
if ('Notification' in window && Notification.permission === 'default') {
  window.addEventListener('load', () => {
    setTimeout(() => Notification.requestPermission(), 3000)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
