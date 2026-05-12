import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import HouseholdSetup from '@/components/HouseholdSetup'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, households(*)').eq('id', user.id).single()

  if (!profile?.household_id) {
    return <HouseholdSetup userId={user.id} />
  }

  const householdId = profile.household_id
  const household = profile.households as any
  const { data: allProfiles } = await supabase.from('profiles').select('*').eq('household_id', householdId)

  const myProfile = allProfiles?.find(p => p.id === user.id)
  const partnerProfile = allProfiles?.find(p => p.id !== user.id)

  return (
    <div className="shell">
      <Sidebar
        inviteCode={household?.invite_code}
        myName={myProfile?.display_name}
        partnerName={partnerProfile?.display_name}
        householdId={householdId}
        userId={user.id}
      />
      <div className="main">
        <div className="topbar"><span className="page-heading">Dashboard</span></div>
        <div className="content">
          <DashboardClient
            householdId={householdId}
            myName={myProfile?.display_name || 'You'}
            partnerName={partnerProfile?.display_name || 'Partner'}
          />
        </div>
      </div>
    </div>
  )
}
