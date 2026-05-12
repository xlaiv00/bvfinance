import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')

  // Get all profiles in the same household
  const { data: allProfiles } = await supabase
    .from('profiles').select('*').eq('household_id', profile.household_id)

  return (
    <div className="shell">
      <Sidebar inviteCode={(profile.households as any)?.invite_code} />
      <div className="main">
        <div className="topbar"><span className="page-heading">Settings</span></div>
        <div className="content">
          <SettingsClient
            userId={user.id}
            myName={profile.display_name || ''}
            householdName={(profile.households as any)?.name || ''}
            householdId={profile.household_id}
            inviteCode={(profile.households as any)?.invite_code || ''}
            allProfiles={allProfiles || []}
          />
        </div>
      </div>
    </div>
  )
}
