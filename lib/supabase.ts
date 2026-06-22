import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Student = {
  id: number
  full_name: string
  birth_date: string | null
  status: 'activo' | 'inactivo'
  grupo_activo: string | null
}
