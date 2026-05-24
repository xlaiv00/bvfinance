'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props { householdId: string; myName: string; inviteCode: string; householdName: string; members: any[] }

export default function SettingsClient({ householdId, myName, inviteCode, householdName, members }: Props) {
  const [name, setName] = useState(myName)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const supabase = createClient()

  async function saveName() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) { await supabase.from('profiles').update({ display_name: name }).eq('id', user.id); setMsg('Saved!') }
    setSaving(false); setTimeout(() => setMsg(''), 2000)
  }

  function copyCode() { navigator.clipboard.writeText(inviteCode).then(() => setMsg('Copied!')); setTimeout(() => setMsg(''), 2000) }

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Your profile</span></div>
        <div className="card-body">
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Display name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
              <button onClick={saveName} disabled={saving} style={{ background: 'var(--acc2)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
          {msg && <div style={{ fontSize: 12, color: 'var(--green)' }}>{msg}</div>}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Household</span></div>
        <div className="card-body">
          <div style={{ fontSize: 13, marginBottom: 16 }}><strong>{householdName}</strong></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Members</div>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500 }}>
                {(m.display_name || '?')[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 13 }}>{m.display_name || 'Unknown'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">Invite partner</span></div>
        <div className="card-body">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Share this code with your partner so they can join your household</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '.12em', color: 'var(--acc)', fontFamily: 'monospace', background: 'var(--surface2)', padding: '10px 16px', borderRadius: 8, flex: 1, textAlign: 'center' }}>{inviteCode}</div>
            <button onClick={copyCode} style={{ background: 'var(--surface2)', border: '0.5px solid var(--border2)', color: 'var(--text)', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Copy</button>
          </div>
        </div>
      </div>
    </div>
  )
}
