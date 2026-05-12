import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import SavingsClient from './SavingsClient'

export default async function SavingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')
  const hid = profile.household_id
  const { data: allProfiles } = await supabase.from('profiles').select('*').eq('household_id', hid)
  const [{ data: goals }, { data: deposits }] = await Promise.all([
    supabase.from('savings_goals').select('*').eq('household_id', hid).order('created_at'),
    supabase.from('savings_deposits').select('*').eq('household_id', hid).order('date', { ascending: false }),
  ])
  const myProfile = allProfiles?.find(p => p.id === user.id)
  const partnerProfile = allProfiles?.find(p => p.id !== user.id)
  return (
    <div className="shell">
      <Sidebar inviteCode={(profile.households as any)?.invite_code} myName={myProfile?.display_name} partnerName={partnerProfile?.display_name} householdId={profile.household_id} userId={user.id} />
      <div className="main">
        <div className="topbar"><span className="page-heading">Savings</span></div>
        <div className="content">
          <SavingsClient householdId={hid} goals={goals || []} deposits={deposits || []} myName={myProfile?.display_name || 'You'} partnerName={partnerProfile?.display_name || 'Partner'} />
        </div>
      </div>
    </div>
  )
}
