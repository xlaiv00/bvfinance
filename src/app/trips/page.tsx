import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TripsClient from './TripsClient'

export default async function TripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')
  const hid = profile.household_id
  const { data: allProfiles } = await supabase.from('profiles').select('*').eq('household_id', hid)
  const [{ data: trips }, { data: tripExpenses }] = await Promise.all([
    supabase.from('trips').select('*').eq('household_id', hid).order('created_at', { ascending: false }),
    supabase.from('trip_expenses').select('*').eq('household_id', hid).order('date', { ascending: false }),
  ])
  const myProfile = allProfiles?.find(p => p.id === user.id)
  const partnerProfile = allProfiles?.find(p => p.id !== user.id)
  return (
    <div className="shell">
      <Sidebar inviteCode={(profile.households as any)?.invite_code} myName={myProfile?.display_name} partnerName={partnerProfile?.display_name} householdId={hid} userId={user.id} />
      <div className="main">
        <div className="topbar"><span className="page-heading">Trips</span></div>
        <div className="content">
          <TripsClient
            householdId={hid}
            trips={trips || []}
            tripExpenses={tripExpenses || []}
            myName={myProfile?.display_name || 'You'}
            partnerName={partnerProfile?.display_name || 'Partner'}
          />
        </div>
      </div>
    </div>
  )
}
