'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  async function handle() {
    setLoading(true); setError(''); setSuccess('')
    const supabase = createClient()
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) setError(error.message)
      else setSuccess('Account created! You can now sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else { router.push('/dashboard'); router.refresh() }
    }
    setLoading(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">together<span>.</span></div>
        <div className="auth-sub">{mode === 'signin' ? 'Sign in to your account' : 'Create your account'}</div>
        {mode === 'signup' && (
          <div className="auth-field"><label>Your name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Viet" /></div>
        )}
        <div className="auth-field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>
        <div className="auth-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handle()} /></div>
        <button className="auth-btn" onClick={handle} disabled={loading}>{loading ? 'Loading...' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}
        <div className="auth-switch">
          {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}>{mode === 'signin' ? 'Sign up' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  )
}
