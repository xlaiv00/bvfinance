'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

const NAV = [
  { section: null, href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { section: 'Personal', href: '/household', label: 'Joint', icon: '💳' },
  { section: null, href: '/trips', label: 'Trips', icon: '✈️' },
  { section: 'Business', href: '/business', label: 'Watch Business', icon: '⌚' },
  { section: 'Other', href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ inviteCode, myName, partnerName, householdId, userId }: any) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [partnerPage, setPartnerPage] = useState('')
  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!householdId || !userId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel('presence-' + householdId, { config: { presence: { key: userId } } })
    channelRef.current = ch
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<any>()
      const keys = Object.keys(state).filter(k => k !== userId)
      if (keys.length > 0 && state[keys[0]]?.length > 0) {
        setPartnerOnline(true); setPartnerPage(state[keys[0]][0].page || '')
      } else { setPartnerOnline(false); setPartnerPage('') }
    })
    ch.on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
      if (key !== userId) { setPartnerOnline(true); setPartnerPage(newPresences[0]?.page || '') }
    })
    ch.on('presence', { event: 'leave' }, ({ key }: any) => {
      if (key !== userId) { setPartnerOnline(false); setPartnerPage('') }
    })
    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ name: myName || 'Someone', page: pathname })
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

  let lastSection = ''
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-name">together<span>.</span></div>
        <div className="brand-sub">{myName && partnerName ? myName + ' & ' + partnerName : myName || 'Joint finances'}</div>
      </div>
      <div className="nav-section" style={{ flex: 1 }}>
        {NAV.map(n => {
          const showLabel = n.section && n.section !== lastSection
          if (n.section) lastSection = n.section
          return (
            <div key={n.href}>
              {showLabel && <div className="nav-label" style={{ marginTop: 8 }}>{n.section}</div>}
              <Link href={n.href} className={'nav-item ' + (pathname === n.href ? 'active' : '')}>
                <span className="nav-icon">{n.icon}</span>{n.label}
              </Link>
            </div>
          )
        })}
      </div>
      <div className="nav-bottom">
        <div className="presence-block">
          <div className="presence-row">
            <div className={'presence-dot ' + (partnerOnline ? 'online' : 'offline')} />
            <div>
              <div className="presence-name">{partnerName || 'Partner'}</div>
              <div className="presence-status">{partnerOnline ? pageLabel(partnerPage) : 'offline'}</div>
            </div>
          </div>
        </div>
        <button className="nav-item" style={{ color: 'var(--muted)' }} onClick={signOut}>
          <span className="nav-icon">↪</span>Sign out
        </button>
      </div>
    </nav>
  )
}
