import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ContributionsClient from './ContributionsClient'

export default async function ContributionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')
  const { data: allProfiles } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
  const { data: contributions } = await supabase.from('contributions').select('*').eq('household_id', profile.household_id).order('date', { ascending: false })
  const myProfile = allProfiles?.find(p => p.id === user.id)
  const partnerProfile = allProfiles?.find(p => p.id !== user.id)
  return (
    <div className="shell">
      <Sidebar inviteCode={(profile.households as any)?.invite_code} myName={myProfile?.display_name} partnerName={partnerProfile?.display_name} householdId={profile.household_id} userId={user.id} />
      <div className="main">
        <div className="topbar"><span className="page-heading">Contributions</span></div>
        <div className="content">
          <ContributionsClient householdId={profile.household_id} contributions={contributions || []} myName={myProfile?.display_name || 'You'} partnerName={partnerProfile?.display_name || 'Partner'} />
        </div>
      </div>
    </div>
  )
}
