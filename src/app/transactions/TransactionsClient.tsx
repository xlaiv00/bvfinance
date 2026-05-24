'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ToastProvider'
import { EXPENSE_CATEGORIES, CAT_EMOJI, fmtAmount, fmtRaw, fmtDate, toEUR, todayStr, type Expense, type Contribution, type Currency } from '@/types'

interface Props { householdId: string; myName: string; partnerName: string }

export default function TransactionsClient({ householdId, myName, partnerName }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [cur, setCur] = useState<Currency>(() => typeof window !== 'undefined' ? (localStorage.getItem('together_cur') as Currency || 'EUR') : 'EUR')
  const [tab, setTab] = useState<'expense'|'income'>('expense')
  const [loading, setLoading] = useState(false)

  // Expense form
  const [eDesc, setEDesc] = useState(''); const [eAmt, setEAmt] = useState(''); const [eCur, setECur] = useState<Currency>('CZK')
  const [eCat, setECat] = useState('Groceries'); const [eDate, setEDate] = useState(todayStr()); const [eWho, setEWho] = useState('joint')

  // Income form
  const [iAmt, setIAmt] = useState(''); const [iCur, setICur] = useState<Currency>('CZK')
  const [iWho, setIWho] = useState('you'); const [iDate, setIDate] = useState(todayStr()); const [iNote, setINote] = useState('')

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const [e, c] = await Promise.all([
      supabase.from('expenses').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('contributions').select('*').eq('household_id', householdId).order('date', { ascending: false }),
    ])
    setExpenses(e.data || []); setContributions(c.data || [])
  }

  const f = (eur: number) => fmtAmount(eur, cur)
  const allExpEUR = expenses.reduce((s, x) => s + x.amount_eur, 0)
  const allConEUR = contributions.reduce((s, x) => s + x.amount_eur, 0)

  async function addExpense() {
    if (!eDesc || !eAmt) return
    setLoading(true)
    const a = parseFloat(eAmt)
    const { data } = await supabase.from('expenses').insert({ household_id: householdId, description: eDesc, amount: a, currency: eCur, amount_eur: toEUR(a, eCur), date: eDate, category: eCat, paid_by: eWho }).select().single()
    if (data) { setExpenses(p => [data, ...p]); setEDesc(''); setEAmt('') }
    setLoading(false)
  }

  async function addIncome() {
    if (!iAmt) return
    setLoading(true)
    const a = parseFloat(iAmt)
    const { data } = await supabase.from('contributions').insert({ household_id: householdId, person: iWho, amount: a, currency: iCur, amount_eur: toEUR(a, iCur), date: iDate, note: iNote || null }).select().single()
    if (data) { setContributions(p => [data, ...p]); setIAmt(''); setINote('') }
    setLoading(false)
  }

  async function delExpense(e: Expense) {
    setExpenses(p => p.filter(x => x.id !== e.id))
    await supabase.from('expenses').delete().eq('id', e.id)
    toast('Expense deleted', 'undo', async () => {
      const { data } = await supabase.from('expenses').insert({ household_id: householdId, description: e.description, amount: e.amount, currency: e.currency, amount_eur: e.amount_eur, date: e.date, category: e.category, paid_by: e.paid_by }).select().single()
      if (data) setExpenses(p => [data, ...p].sort((a,b) => b.date.localeCompare(a.date)))
    })
  }

  async function delContribution(c: Contribution) {
    setContributions(p => p.filter(x => x.id !== c.id))
    await supabase.from('contributions').delete().eq('id', c.id)
    toast('Contribution deleted', 'undo', async () => {
      const { data } = await supabase.from('contributions').insert({ household_id: householdId, person: c.person, amount: c.amount, currency: c.currency, amount_eur: c.amount_eur, date: c.date, note: c.note }).select().single()
      if (data) setContributions(p => [data, ...p].sort((a,b) => b.date.localeCompare(a.date)))
    })
  }

  // Merge and sort all transactions
  type TX = { id: string; date: string; type: 'expense'|'income'; desc: string; meta: string; amount: number; currency: string; amtEUR: number }
  const all: TX[] = [
    ...expenses.map(e => ({ id: e.id, date: e.date, type: 'expense' as const, desc: e.description, meta: e.category + ' · ' + (e.paid_by === 'you' ? myName : e.paid_by === 'partner' ? partnerName : 'Joint'), amount: e.amount, currency: e.currency, amtEUR: e.amount_eur })),
    ...contributions.map(c => ({ id: c.id, date: c.date, type: 'income' as const, desc: c.note || (c.person === 'you' ? myName : partnerName), meta: (c.person === 'you' ? myName : partnerName) + (c.note?.startsWith('[CF]') ? ' · Cashflow' : ' · Contribution'), amount: c.amount, currency: c.currency, amtEUR: c.amount_eur })),
  ].sort((a,b) => b.date.localeCompare(a.date))

  const expObj = Object.fromEntries(expenses.map(e => [e.id, e]))
  const conObj = Object.fromEntries(contributions.map(c => [c.id, c]))

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '0.5px solid var(--border2)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <div className="stat s-green"><div className="stat-lbl">Money in</div><div className="stat-val green">{f(allConEUR)}</div><div className="stat-sub">All time</div></div>
        <div className="stat s-red"><div className="stat-lbl">Expenses</div><div className="stat-val red">{f(allExpEUR)}</div><div className="stat-sub">All time</div></div>
        <div className={'stat ' + (allConEUR - allExpEUR >= 0 ? 's-acc' : 's-red')}><div className="stat-lbl">Balance</div><div className={'stat-val ' + (allConEUR - allExpEUR >= 0 ? 'acc' : 'red')}>{f(allConEUR - allExpEUR)}</div><div className="stat-sub">Net</div></div>
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)' }}>
          {[['expense','🧾 Expense'],['income','💰 Money In']] .map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as any)} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', fontSize: 13, fontWeight: tab === key ? 500 : 400, cursor: 'pointer', fontFamily: 'inherit', color: tab === key ? 'var(--text)' : 'var(--muted)', borderBottom: tab === key ? '2px solid var(--acc)' : '2px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="card-body">
          {tab === 'expense' ? (
            <div className="form-row">
              <div className="fg w"><label>Description</label><input value={eDesc} onChange={e => setEDesc(e.target.value)} placeholder="e.g. Groceries" onKeyDown={e => e.key === 'Enter' && addExpense()} /></div>
              <div className="fg m"><label>Amount</label><input type="number" value={eAmt} onChange={e => setEAmt(e.target.value)} placeholder="0.00" min="0" /></div>
              <div className="fg s"><label>Currency</label><select value={eCur} onChange={e => setECur(e.target.value as Currency)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
              <div className="fg m"><label>Category</label><select value={eCat} onChange={e => setECat(e.target.value)}>{EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div className="fg m"><label>Paid by</label><select value={eWho} onChange={e => setEWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option><option value="joint">Joint</option></select></div>
              <div className="fg"><label>Date</label><input type="date" value={eDate} onChange={e => setEDate(e.target.value)} /></div>
              <button className="add-btn" onClick={addExpense} disabled={loading}>Add</button>
            </div>
          ) : (
            <div className="form-row">
              <div className="fg m"><label>Amount</label><input type="number" value={iAmt} onChange={e => setIAmt(e.target.value)} placeholder="0.00" min="0" onKeyDown={e => e.key === 'Enter' && addIncome()} /></div>
              <div className="fg s"><label>Currency</label><select value={iCur} onChange={e => setICur(e.target.value as Currency)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
              <div className="fg m"><label>Who</label><select value={iWho} onChange={e => setIWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option></select></div>
              <div className="fg w"><label>Note (optional)</label><input value={iNote} onChange={e => setINote(e.target.value)} placeholder="e.g. May salary" /></div>
              <div className="fg"><label>Date</label><input type="date" value={iDate} onChange={e => setIDate(e.target.value)} /></div>
              <button className="add-btn" onClick={addIncome} disabled={loading}>Add</button>
            </div>
          )}
        </div>
      </div>

      {/* Currency + transaction list */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{all.length} transactions</span>
        <div className="cur-toggle">
          {(['EUR','CZK'] as Currency[]).map(c => <button key={c} className={'cur-btn ' + (cur === c ? 'active' : '')} onClick={() => { setCur(c); localStorage.setItem('together_cur', c) }}>{c}</button>)}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {all.length === 0 ? <div className="empty">No transactions yet</div> : all.map(tx => (
            <div key={tx.type + tx.id} className="tx" style={{ padding: '9px 16px' }}>
              <div className="tx-icon" style={{ background: tx.type === 'income' ? 'rgba(79,216,150,.12)' : 'var(--surface2)' }}>
                {tx.type === 'income' ? '↓' : (CAT_EMOJI[expenses.find(e=>e.id===tx.id)?.category||''] || '📦')}
              </div>
              <div className="tx-info">
                <div className="tx-name">{tx.desc}</div>
                <div className="tx-meta">{tx.meta}</div>
              </div>
              <div className="tx-date">{fmtDate(tx.date)}</div>
              <div className={'tx-amt ' + (tx.type === 'income' ? 'pos' : 'neg')}>{fmtRaw(tx.amount, tx.currency)}</div>
              <button className="del-btn" onClick={() => tx.type === 'expense' ? delExpense(expObj[tx.id]) : delContribution(conObj[tx.id])}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
