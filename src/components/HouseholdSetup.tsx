'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
export default function HouseholdSetup({ userId }: { userId: string }) {
  const [mode, setMode] = useState<'create'|'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()
  async function create() {
    if (!name.trim()) return
    setLoading(true); setError('')
    const inviteCode = Math.random().toString(36).slice(2,8).toUpperCase()
    const { data: hh, error: e1 } = await supabase.from('households').insert({ name: name.trim(), invite_code: inviteCode }).select().single()
    if (e1) { setError(e1.message); setLoading(false); return }
    await supabase.from('profiles').update({ household_id: hh.id }).eq('id', userId)
    router.push('/dashboard'); router.refresh()
  }
  async function join() {
    if (!code.trim()) return
    setLoading(true); setError('')
    const { data: hh } = await supabase.from('households').select('*').eq('invite_code', code.trim().toUpperCase()).single()
    if (!hh) { setError('Invite code not found'); setLoading(false); return }
    await supabase.from('profiles').update({ household_id: hh.id }).eq('id', userId)
    router.push('/dashboard'); router.refresh()
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ width:360, background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:16, padding:32 }}>
        <div style={{ fontSize:22, fontWeight:600, marginBottom:6 }}>together<span style={{ color:'var(--acc)' }}>.</span></div>
        <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24 }}>Set up your household</div>
        <div style={{ display:'flex', gap:8, marginBottom:24 }}>
          {(['create','join'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'8px', border:mode===m?'0.5px solid var(--acc)':'0.5px solid var(--border2)', borderRadius:8, background:mode===m?'rgba(124,111,247,.1)':'transparent', color:mode===m?'var(--acc)':'var(--muted)', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:500 }}>
              {m === 'create' ? 'Create new' : 'Join existing'}
            </button>
          ))}
        </div>
        {mode === 'create' ? (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Household name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Viet & Bich" onKeyDown={e=>e.key==='Enter'&&create()} style={{ width:'100%', padding:'10px 12px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--surface2)', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none', marginBottom:14 }} />
              <button onClick={create} disabled={loading} style={{ width:'100%', padding:'10px', background:'var(--acc2)', border:'none', borderRadius:8, color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Creating...':'Create household'}</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Invite code</label>
              <input value={code} onChange={e=>setCode(e.target.value)} placeholder="e.g. ABC123" onKeyDown={e=>e.key==='Enter'&&join()} style={{ width:'100%', padding:'10px 12px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--surface2)', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none', marginBottom:14 }} />
              <button onClick={join} disabled={loading} style={{ width:'100%', padding:'10px', background:'var(--acc2)', border:'none', borderRadius:8, color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Joining...':'Join household'}</button>
            </div>
          </>
        )}
        {error && <div style={{ marginTop:12, color:'var(--red)', fontSize:12 }}>{error}</div>}
      </div>
    </div>
  )
}
