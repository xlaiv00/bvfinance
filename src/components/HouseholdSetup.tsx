'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function HouseholdSetup({ userId }: { userId: string }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [householdName, setHouseholdName] = useState('Our Finances')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function createHousehold() {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('households')
      .insert({ name: householdName })
      .select()
      .single()
    if (error || !data) { setError(error?.message || 'Failed'); setLoading(false); return }
    await supabase.from('profiles').update({ household_id: data.id }).eq('id', userId)
    router.refresh()
  }

  async function joinHousehold() {
    setLoading(true); setError('')
    const code = inviteCode.trim().toLowerCase()
    const { data, error } = await supabase
      .from('households')
      .select()
      .eq('invite_code', code)
      .single()
    if (error || !data) { setError('Invite code not found'); setLoading(false); return }
    await supabase.from('profiles').update({ household_id: data.id }).eq('id', userId)
    router.refresh()
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">together<span>.</span></div>
        <div className="auth-sub">Set up your shared household</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button className="auth-btn" style={{ background: mode === 'create' ? 'var(--acc2)' : 'var(--surface2)', border: '0.5px solid var(--border2)' }}
            onClick={() => setMode('create')}>Create new</button>
          <button className="auth-btn" style={{ background: mode === 'join' ? 'var(--acc2)' : 'var(--surface2)', border: '0.5px solid var(--border2)' }}
            onClick={() => setMode('join')}>Join existing</button>
        </div>

        {mode === 'create' ? (
          <>
            <div className="auth-field">
              <label>Household name</label>
              <input value={householdName} onChange={e => setHouseholdName(e.target.value)} />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-btn" onClick={createHousehold} disabled={loading}>
              {loading ? 'Creating…' : 'Create household'}
            </button>
            <div className="auth-sub" style={{ marginTop: 16, marginBottom: 0 }}>
              After creating, share the invite code with your partner so they can join.
            </div>
          </>
        ) : (
          <>
            <div className="auth-field">
              <label>Invite code</label>
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                placeholder="e.g. a1b2c3d4" style={{ letterSpacing: '.08em', fontFamily: 'monospace' }} />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-btn" onClick={joinHousehold} disabled={loading}>
              {loading ? 'Joining…' : 'Join household'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
