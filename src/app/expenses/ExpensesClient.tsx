'use client'
import { useState } from 'react'
import Timeline from '@/components/Timeline'
import { createClient } from '@/lib/supabase/client'
import { EXPENSE_CATEGORIES, CAT_EMOJI, fmtAmount, fmtRaw, fmtDate, toEUR, todayStr, MONTHS, type Expense, type Currency } from '@/types'

function getYears(arr: { date: string }[]) {
  const ys: number[] = [new Date().getFullYear()]
  arr.forEach(x => { const y = new Date(x.date + 'T12:00:00').getFullYear(); if (!ys.includes(y)) ys.push(y) })
  return ys.sort()
}
function filterMonth<T extends { date: string }>(arr: T[], m: number, y: number) {
  return arr.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d.getMonth() === m && d.getFullYear() === y })
}

interface Props {
  householdId: string
  expenses: Expense[]
  myName: string
  partnerName: string
}

export default function ExpensesClient({ householdId, expenses: initial, myName, partnerName }: Props) {
  const [expenses, setExpenses] = useState(initial)
  const [cur, setCur] = useState<Currency>('EUR')
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [desc, setDesc] = useState('')
  const [amt, setAmt] = useState('')
  const [expCur, setExpCur] = useState<Currency>('EUR')
  const [date, setDate] = useState(todayStr())
  const [cat, setCat] = useState('Groceries')
  const [who, setWho] = useState('you')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const years = getYears(expenses)
  const actMonths = expenses.filter(x => new Date(x.date + 'T12:00:00').getFullYear() === selYear).map(x => new Date(x.date + 'T12:00:00').getMonth()).filter((m,i,a) => a.indexOf(m) === i)
  const mExps = filterMonth(expenses, selMonth, selYear)
  const f = (eur: number) => fmtAmount(eur, cur)

  function paidByLabel(paid_by: string) {
    if (paid_by === 'you') return myName || 'You'
    if (paid_by === 'partner') return partnerName || 'Partner'
    if (paid_by === 'joint') return 'Joint'
    // Could be a real name stored directly
    return paid_by
  }

  async function add() {
    if (!desc || !amt || parseFloat(amt) <= 0) return
    setLoading(true)
    const amtN = parseFloat(amt)
    const row = { household_id: householdId, description: desc, amount: amtN, currency: expCur, amount_eur: toEUR(amtN, expCur), date, category: cat, paid_by: who }
    const { data, error } = await supabase.from('expenses').insert(row).select().single()
    if (!error && data) {
      setExpenses(prev => [data, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
      setDesc(''); setAmt('')
    }
    setLoading(false)
  }

  async function del(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(x => x.id !== id))
  }

  const cats: Record<string, number> = {}
  mExps.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount_eur })
  const maxCat = Math.max(...Object.values(cats), 1)

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
        <div className="card-head"><span className="card-title">Add expense</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg w"><label>Description</label><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Tesco groceries" /></div>
            <div className="fg m"><label>Amount</label><input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="0.00" min="0" step="0.01" /></div>
            <div className="fg s"><label>Currency</label><select value={expCur} onChange={e => setExpCur(e.target.value as Currency)}><option value="EUR">EUR</option><option value="CZK">CZK</option></select></div>
            <div className="fg"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="fg m"><label>Category</label>
              <select value={cat} onChange={e => setCat(e.target.value)}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="fg m"><label>Paid by</label>
              <select value={who} onChange={e => setWho(e.target.value)}>
                <option value="you">{myName}</option>
                <option value="partner">{partnerName}</option>
                <option value="joint">Joint (both)</option>
              </select>
            </div>
            <button className="add-btn" onClick={add} disabled={loading}>Add</button>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Transactions</span>
            <span className="card-meta">{mExps.length} items · {f(mExps.reduce((s,x)=>s+x.amount_eur,0))}</span>
          </div>
          <div className="card-body">
            {mExps.length === 0 ? <div className="empty">No expenses in {MONTHS[selMonth]} {selYear}</div> :
              mExps.map(e => (
                <div key={e.id} className="tx">
                  <div className="tx-icon">{CAT_EMOJI[e.category] || '📦'}</div>
                  <div className="tx-info">
                    <div className="tx-name">{e.description}</div>
                    <div className="tx-meta">{e.category} · {paidByLabel(e.paid_by)}</div>
                  </div>
                  <div className="tx-date">{fmtDate(e.date)}</div>
                  <div className="tx-amt neg">{fmtRaw(e.amount, e.currency)}</div>
                  <button className="del-btn" onClick={() => del(e.id)}>✕</button>
                </div>
              ))
            }
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">By category</span></div>
          <div className="card-body">
            {Object.keys(cats).length === 0 ? <div className="empty">No data</div> :
              Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c, v]) => (
                <div key={c} style={{ marginBottom: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>{CAT_EMOJI[c] || ''} {c}</span>
                    <span style={{ fontWeight: 500 }}>{f(v)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: Math.round(v / maxCat * 100) + '%', background: 'var(--acc)' }} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </>
  )
}
