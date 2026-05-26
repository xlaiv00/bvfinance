export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TripsClient from './TripsClient'
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')
  const hid = profile.household_id
  const { data: ap } = await supabase.from('profiles').select('*').eq('household_id', hid)
  const me = ap?.find((p: any) => p.id === user.id)
  const partner = ap?.find((p: any) => p.id !== user.id)
  const [{ data: trips }, { data: tripExp }] = await Promise.all([
    supabase.from('trips').select('*').eq('household_id', hid).order('created_at', { ascending: false }),
    supabase.from('trip_expenses').select('*').eq('household_id', hid),
  ])
  return (
    <div className="shell">
      <Sidebar inviteCode={(profile.households as any)?.invite_code} myName={me?.display_name} partnerName={partner?.display_name} householdId={hid} userId={user.id} />
      <div className="main">
        <div className="topbar"><span className="page-title">Trips</span></div>
        <div className="content"><TripsClient householdId={hid} myName={me?.display_name || 'You'} partnerName={partner?.display_name || 'Partner'} initTrips={trips||[]} initTripExp={tripExp||[]} /></div>
      </div>
    </div>
  )
}
