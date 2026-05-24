'use client'
import { useState } from 'react'
import Timeline from '@/components/Timeline'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ToastProvider'
import { fmtAmount, fmtRaw, fmtDateFull, toEUR, todayStr, MONTHS, type Contribution, type Currency } from '@/types'

function getYears(arr: { date: string }[]) {
  const ys: number[] = [new Date().getFullYear()]
  arr.forEach(x => { const y = new Date(x.date + 'T12:00:00').getFullYear(); if (!ys.includes(y)) ys.push(y) })
  return ys.sort()
}
function filterMonth<T extends { date: string }>(arr: T[], m: number, y: number) {
  return arr.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d.getMonth() === m && d.getFullYear() === y })
}

export default function ContributionsClient({ householdId, contributions: initial, myName, partnerName }: { householdId: string; contributions: Contribution[]; myName: string; partnerName: string }) {
  const [contributions, setContributions] = useState(initial)
  const [cur, setCur] = useState<Currency>('EUR')
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [who, setWho] = useState('you'); const [amt, setAmt] = useState(''); const [conCur, setConCur] = useState<Currency>('EUR')
  const [date, setDate] = useState(todayStr()); const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const years = getYears(contributions)
  const actMonths = contributions.filter(x => new Date(x.date + 'T12:00:00').getFullYear() === selYear).map(x => new Date(x.date + 'T12:00:00').getMonth()).filter((m,i,a) => a.indexOf(m) === i)
  const mCons = filterMonth(contributions, selMonth, selYear)
  const f = (eur: number) => fmtAmount(eur, cur)
  const mTotal = mCons.reduce((s, x) => s + x.amount_eur, 0)

  async function add() {
    if (!amt || parseFloat(amt) <= 0) return
    setLoading(true)
    const amtN = parseFloat(amt)
    const row = { household_id: householdId, person: who, amount: amtN, currency: conCur, amount_eur: toEUR(amtN, conCur), date, note: note || null }
    const { data, error } = await supabase.from('contributions').insert(row).select().single()
    if (!error && data) { setContributions(prev => [data, ...prev].sort((a,b) => b.date.localeCompare(a.date))); setAmt(''); setNote('') }
    setLoading(false)
  }

  async function del(id: string) {
    const item = contributions.find(c => c.id === id)
    if (!item) return
    setContributions(prev => prev.filter(x => x.id !== id))
    await supabase.from('contributions').delete().eq('id', id)
    toast('Contribution deleted', 'undo', async () => {
      const { data } = await supabase.from('contributions').insert({
        household_id: householdId, person: item.person, amount: item.amount,
        currency: item.currency, amount_eur: item.amount_eur, date: item.date, note: item.note
      }).select().single()
      if (data) setContributions(prev => [data, ...prev].sort((a,b) => b.date.localeCompare(a.date)))
    })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div className="cur-toggle">
          <button className={`cur-btn ${cur === 'EUR' ? 'active' : ''}`} onClick={() => setCur('EUR')}>EUR</button>
          <button className={`cur-btn ${cur === 'CZK' ? 'active' : ''}`} onClick={() => setCur('CZK')}>CZK</button>
        </div>
      </div>
      <Timeline selYear={selYear} selMonth={selMonth} years={years} activeMonths={actMonths} onYearChange={setSelYear} onMonthChange={setSelMonth} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">Log contribution</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg s"><label>Person</label>
              <select value={who} onChange={e => setWho(e.target.value)}>
                <option value="you">{myName}</option><option value="partner">{partnerName}</option>
              </select>
            </div>
            <div className="fg m"><label>Amount</label><input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="0.00" min="0" step="0.01" /></div>
            <div className="fg s"><label>Currency</label>
              <select value={conCur} onChange={e => setConCur(e.target.value as Currency)}>
                <option value="EUR">EUR</option><option value="CZK">CZK</option>
              </select>
            </div>
            <div className="fg"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="fg w"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. April salary share" /></div>
            <button className="add-btn" onClick={add} disabled={loading}>Add</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <span className="card-title">History</span>
          <span className="card-meta">{MONTHS[selMonth]} {selYear} · {f(mTotal)}</span>
        </div>
        <div className="card-body">
          {mCons.length === 0 ? <div className="empty">No contributions in {MONTHS[selMonth]} {selYear}</div> :
            mCons.map(c => (
              <div key={c.id} className="tx">
                <div className="tx-icon" style={{ background: c.person === 'you' ? 'rgba(124,111,247,.15)' : 'rgba(124,122,144,.1)' }}>
                  <span style={{ fontSize: 14, color: c.person === 'you' ? 'var(--acc)' : 'var(--muted)' }}>↓</span>
                </div>
                <div className="tx-info">
                  <div className="tx-name">{c.person === 'you' ? 'You' : 'Partner'}{c.note ? ' — ' + c.note : ''}</div>
                  <div className="tx-meta">{fmtDateFull(c.date)}</div>
                </div>
                <div className="tx-amt pos">{fmtRaw(c.amount, c.currency)}</div>
                <button className="del-btn" onClick={() => del(c.id)}>✕</button>
              </div>
            ))
          }
        </div>
      </div>
    </>
  )
}
