'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtAmount, fmtRaw, fmtDate, toEUR, todayStr, type SavingsGoal, type SavingsDeposit, type Currency } from '@/types'

export default function SavingsClient({ householdId, goals: initGoals, deposits: initDeposits, myName, partnerName }: { householdId: string; goals: SavingsGoal[]; deposits: SavingsDeposit[]; myName: string; partnerName: string }) {
  const [goals, setGoals] = useState(initGoals)
  const [deposits, setDeposits] = useState(initDeposits)
  const [cur, setCur] = useState<Currency>('EUR')
  const [goalName, setGoalName] = useState(''); const [goalTarget, setGoalTarget] = useState(''); const [goalCur, setGoalCur] = useState<Currency>('EUR'); const [goalEmoji, setGoalEmoji] = useState('')
  const [selGoal, setSelGoal] = useState(''); const [savAmt, setSavAmt] = useState(''); const [savCur, setSavCur] = useState<Currency>('EUR'); const [savDate, setSavDate] = useState(todayStr()); const [savWho, setSavWho] = useState('joint')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const f = (eur: number) => fmtAmount(eur, cur)

  async function createGoal() {
    if (!goalName || !goalTarget) return
    setLoading(true)
    const t = parseFloat(goalTarget)
    const { data, error } = await supabase.from('savings_goals').insert({ household_id: householdId, name: goalName, target_amount: t, currency: goalCur, target_eur: toEUR(t, goalCur), emoji: goalEmoji || '💰' }).select().single()
    if (!error && data) { setGoals(prev => [...prev, data]); setGoalName(''); setGoalTarget(''); setGoalEmoji('') }
    setLoading(false)
  }

  async function addDeposit() {
    if (!selGoal || !savAmt) return
    setLoading(true)
    const a = parseFloat(savAmt)
    const { data, error } = await supabase.from('savings_deposits').insert({ goal_id: selGoal, household_id: householdId, amount: a, currency: savCur, amount_eur: toEUR(a, savCur), date: savDate, deposited_by: savWho }).select().single()
    if (!error && data) { setDeposits(prev => [data, ...prev]); setSavAmt('') }
    setLoading(false)
  }

  async function delGoal(id: string) {
    await supabase.from('savings_goals').delete().eq('id', id)
    setGoals(prev => prev.filter(x => x.id !== id))
    setDeposits(prev => prev.filter(x => x.goal_id !== id))
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div className="cur-toggle">
          <button className={`cur-btn ${cur === 'EUR' ? 'active' : ''}`} onClick={() => setCur('EUR')}>EUR</button>
          <button className={`cur-btn ${cur === 'CZK' ? 'active' : ''}`} onClick={() => setCur('CZK')}>CZK</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">New goal</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg w"><label>Goal name</label><input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="e.g. Japan trip, Emergency fund" /></div>
            <div className="fg m"><label>Target</label><input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="5000" min="0" /></div>
            <div className="fg s"><label>Currency</label><select value={goalCur} onChange={e => setGoalCur(e.target.value as Currency)}><option value="EUR">EUR</option><option value="CZK">CZK</option></select></div>
            <div className="fg s"><label>Emoji</label><input value={goalEmoji} onChange={e => setGoalEmoji(e.target.value)} placeholder="🏯" style={{ width: 54 }} /></div>
            <button className="add-btn" onClick={createGoal} disabled={loading}>Create</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Add to savings</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg m"><label>Goal</label>
              <select value={selGoal} onChange={e => setSelGoal(e.target.value)} style={{ minWidth: 130 }}>
                <option value="">Select goal…</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
              </select>
            </div>
            <div className="fg m"><label>Amount</label><input type="number" value={savAmt} onChange={e => setSavAmt(e.target.value)} placeholder="0.00" min="0" /></div>
            <div className="fg s"><label>Currency</label><select value={savCur} onChange={e => setSavCur(e.target.value as Currency)}><option value="EUR">EUR</option><option value="CZK">CZK</option></select></div>
            <div className="fg"><label>Date</label><input type="date" value={savDate} onChange={e => setSavDate(e.target.value)} /></div>
            <div className="fg s"><label>From</label><select value={savWho} onChange={e => setSavWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option><option value="joint">Joint (both)</option></select></div>
            <button className="add-btn" onClick={addDeposit} disabled={loading}>Save</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">Goals</span></div>
        <div className="card-body">
          {goals.length === 0 ? <div className="empty">No goals yet — create one above</div> :
            goals.map(g => {
              const saved = deposits.filter(d => d.goal_id === g.id).reduce((s, d) => s + d.amount_eur, 0)
              const pct = Math.min(Math.round(saved / g.target_eur * 100), 100)
              const recent = deposits.filter(d => d.goal_id === g.id).slice(0, 3)
              return (
                <div key={g.id} className="goal-item">
                  <div className="goal-row">
                    <span className="goal-name">{g.emoji} {g.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="goal-amts">{f(saved)} / {f(g.target_eur)}</span>
                      <span className={`chip ${pct >= 100 ? 'ch-g' : pct > 50 ? 'ch-b' : 'ch-a'}`}>{pct}%</span>
                      <button className="del-btn" style={{ opacity: 1 }} onClick={() => delGoal(g.id)}>🗑</button>
                    </div>
                  </div>
                  <div className="bar-track" style={{ margin: '6px 0 8px' }}>
                    <div className="bar-fill" style={{ width: pct + '%', background: 'var(--green)' }} />
                  </div>
                  {recent.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', padding: '2px 0' }}>
                      <span>{d.deposited_by === 'you' ? 'You' : d.deposited_by === 'partner' ? 'Partner' : 'Joint'} · {fmtDate(d.date)}</span>
                      <span style={{ color: 'var(--green)' }}>+{fmtRaw(d.amount, d.currency)}</span>
                    </div>
                  ))}
                </div>
              )
            })
          }
        </div>
      </div>
    </>
  )
}
