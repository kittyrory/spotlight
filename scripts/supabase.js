// connects supabase for auth and user data
// railway will also be used for separate purposes

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qhcohcxmxndexkhexbst.supabase.co',
const supabaseAnonKey = 'sb_publishable_mX0YOWlolguEx3j0uCjtmQ_VlMdEYhz'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
