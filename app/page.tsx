export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export default async function RootPage() {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return redirect('/auth')
    const user = authData.user
  if (user) redirect('/dashboard')
  else redirect('/auth')
}
