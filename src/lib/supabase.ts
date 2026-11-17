import { createClient } from '@supabase/supabase-js'

// Estes dois valores são públicos por natureza: os dados ficam protegidos pelo login
// e pelas regras de segurança (RLS) definidas em supabase/schema.sql.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://aqpwouwdocosztxyaufl.supabase.co'
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcHdvdXdkb2Nvc3p0eHlhdWZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4ODU5MjQsImV4cCI6MjExMDQ2MTkyNH0.0mlk_Y7boe_yoD_uKmi7ItAIzlUcN2oNdkY7pN06Jpg'

export const supabase = createClient(URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})
