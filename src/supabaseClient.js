import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly on purpose — a missing .env file is the #1 setup mistake.
  console.error(
    'Missing Supabase environment variables. Create a .env file — see .env.example.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
