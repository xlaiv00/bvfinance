'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Profile {
  id: string
  display_name: string
  household_id: string
}

interface Props {
  userId: string
  myName: string
  householdName: string
  householdId: string
  inviteCode: string
  allProfiles: Profile[]
}

export default function SettingsClient({ userId, myName: initName, householdName: initHouseName, householdId, inviteCode, allProfiles }: Props) {
  const [myName, setMyName] = useState(initName)
  const [houseName, setHouseName] = useState(initHouseName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const partnerProfiles = allProfiles.filter(p => p.id !== userId)
  const myProfile = allProfiles.find(p => p.id === userId)

  async function saveName() {
    if (!myName.trim()) return
    setSaving(true)
    await supabase.from('profiles').update({ display_name: myName.trim() }).eq('id', userId)
    setSaved('Name saved!')
    setSaving(false)
    setTimeout(() => setSaved(''), 2500)
    router.refresh()
  }

  async function saveHouseName() {
    setSaving(true)
    await supabase.from('households').update({ name: houseName.trim() }).eq('id', householdId)
    setSaved('Household name saved!')
    setSaving(false)
    setTimeout(() => setSaved(''), 2500)
    router.refresh()
  }

  function copyCode() {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: 560 }}>

      {saved && (
        <div style={{ background: 'rgba(79,216,150,.12)', border: '0.5px solid rgba(79,216,150,.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
          ✓ {saved}
        </div>
      )}

      {/* My name */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Your name</span></div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            This is how you appear on transactions — your partner will see this name on everything you add.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="fg" style={{ flex: 1 }}>
              <label>Display name</label>
              <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="e.g. Jan" onKeyDown={e => e.key === 'Enter' && saveName()} />
            </div>
            <button className="add-btn" style={{ alignSelf: 'flex-end' }} onClick={saveName} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Household members */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-title">Household members</span>
          <span className="card-meta">{allProfiles.length} {allProfiles.length === 1 ? 'person' : 'people'}</span>
        </div>
        <div className="card-body">
          {allProfiles.map((p, i) => (
            <div key={p.id} className="tx" style={{ padding: '10px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.id === userId ? 'rgba(124,111,247,.2)' : 'rgba(91,173,238,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: p.id === userId ? 'var(--acc)' : 'var(--blue)', flexShrink: 0 }}>
                {(p.display_name || '?')[0].toUpperCase()}
              </div>
              <div className="tx-info">
                <div className="tx-name">{p.display_name || 'Unnamed'} {p.id === userId ? '(you)' : ''}</div>
                <div className="tx-meta">{p.id === userId ? 'Your account' : 'Partner'}</div>
              </div>
            </div>
          ))}
          {allProfiles.length < 2 && (
            <div style={{ marginTop: 12, padding: '12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
              Your partner hasn't joined yet. Share the invite code below with them.
            </div>
          )}
        </div>
      </div>

      {/* Invite code */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Invite partner</span></div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Share this code with your partner. They sign up at the same URL, choose "Join existing", and enter this code.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: 'var(--surface2)', border: '0.5px solid var(--border2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 20, fontWeight: 600, letterSpacing: '.12em', color: 'var(--acc)' }}>
              {inviteCode}
            </div>
            <button className="add-btn" onClick={copyCode}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Household name */}
      <div className="card">
        <div className="card-head"><span className="card-title">Household name</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="fg" style={{ flex: 1 }}>
              <label>Name</label>
              <input value={houseName} onChange={e => setHouseName(e.target.value)} placeholder="e.g. Our Finances" onKeyDown={e => e.key === 'Enter' && saveHouseName()} />
            </div>
            <button className="add-btn" style={{ alignSelf: 'flex-end' }} onClick={saveHouseName} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
