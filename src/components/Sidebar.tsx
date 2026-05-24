'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/transactions', label: 'Transactions', icon: '🔄' },
  { href: '/trips', label: 'Trips', icon: '✈️' },
  { href: '/cashflow', label: 'Cashflow', icon: '📊' },
  { href: '/sales', label: 'Watch Sales', icon: '⌚' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

interface Props {
  inviteCode?: string; myName?: string; partnerName?: string
  householdId?: string; userId?: string
}

export default function Sidebar({ inviteCode, myName, partnerName, householdId, userId }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [partnerPage, setPartnerPage] = useState('')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!householdId || !userId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase.channel('presence-' + householdId, {
      config: { presence: { key: userId }, broadcast: { self: false } }
    })
    channelRef.current = channel
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ name: string; page: string }>()
      const keys = Object.keys(state).filter(k => k !== userId)
      if (keys.length > 0 && state[keys[0]]?.length > 0) {
        setPartnerOnline(true); setPartnerPage(state[keys[0]][0].page || '')
      } else { setPartnerOnline(false); setPartnerPage('') }
    })
    channel.on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
      if (key !== userId) { setPartnerOnline(true); setPartnerPage(newPresences[0]?.page || '') }
    })
    channel.on('presence', { event: 'leave' }, ({ key }: any) => {
      if (key !== userId) { setPartnerOnline(false); setPartnerPage('') }
    })
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ name: myName || 'Someone', page: pathname })
    })
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null } }
  }, [householdId, userId, myName])

  useEffect(() => {
    channelRef.current?.track({ name: myName || 'Someone', page: pathname }).catch(() => {})
  }, [pathname])

  async function signOut() {
    if (channelRef.current) { await channelRef.current.untrack(); supabase.removeChannel(channelRef.current) }
    await supabase.auth.signOut(); router.push('/login'); router.refresh()
  }

  function pageLabel(page: string) {
    const match = NAV.find(n => n.href === page)
    return match ? match.icon + ' ' + match.label : page.replace('/', '')
  }

  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-name">together<span>.</span></div>
        <div className="brand-sub">{myName && partnerName ? myName + ' & ' + partnerName : myName || 'Joint finances'}</div>
      </div>
      <div className="nav-group" style={{ flex: 1 }}>
        {NAV.map(n => (
          <Link key={n.href} href={n.href} className={'nav-item ' + (pathname === n.href ? 'active' : '')}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </Link>
        ))}
      </div>
      <div className="nav-bottom">
        <div className="presence-block">
          <div className="presence-row">
            <div className={'presence-dot ' + (partnerOnline ? 'online' : 'offline')} />
            <div>
              <div className="presence-name">{partnerName || 'Partner'}</div>
              <div className="presence-status">{partnerOnline ? 'on ' + pageLabel(partnerPage) : 'offline'}</div>
            </div>
          </div>
        </div>
        <button className="nav-item signout-btn" onClick={signOut}>
          <span className="nav-icon">↪</span>Sign out
        </button>
      </div>
    </nav>
  )
}
