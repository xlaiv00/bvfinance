import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import CashflowClient from './CashflowClient'

export default async function CashflowPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, households(*)').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/dashboard')
  const hid = profile.household_id
  const { data: allProfiles } = await supabase.from('profiles').select('*').eq('household_id', hid)
  const myProfile = allProfiles?.find((p: any) => p.id === user.id)
  const partnerProfile = allProfiles?.find((p: any) => p.id !== user.id)
  return (
    <div className="shell">
      <Sidebar
        inviteCode={(profile.households as any)?.invite_code}
        myName={myProfile?.display_name}
        partnerName={partnerProfile?.display_name}
        householdId={hid}
        userId={user.id}
      />
      <div className="main">
        <div className="topbar"><span className="page-heading">Cashflow</span></div>
        <div className="content">
          <CashflowClient householdId={hid} />
        </div>
      </div>
    </div>
  )
}
