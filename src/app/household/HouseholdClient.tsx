'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ToastProvider'
import { fmtCur, fmtDisplay, fmtDate, toCZK, EXPENSE_CATS, today } from '@/types'

type Cur = 'CZK'|'EUR'
interface Entry { id:string; type:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; person:string; date:string; source:string }

export default function HouseholdClient({ householdId, myName, partnerName }: { householdId:string; myName:string; partnerName:string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tab, setTab] = useState<'expense'|'income'>('expense')
  const [cur, setCur] = useState<Cur>(() => typeof window !== 'undefined' ? (localStorage.getItem('cur') as Cur || 'CZK') : 'CZK')
  const [loading, setLoading] = useState(false)
  // Expense form
  const [eDesc, setEDesc] = useState(''); const [eAmt, setEAmt] = useState(''); const [eCur, setECur] = useState<Cur>('CZK')
  const [eCat, setECat] = useState('Groceries'); const [eWho, setEWho] = useState('joint'); const [eDate, setEDate] = useState(today())
  // Income form
  const [iDesc, setIDesc] = useState(''); const [iAmt, setIAmt] = useState(''); const [iCur, setICur] = useState<Cur>('CZK')
  const [iWho, setIWho] = useState('you'); const [iDate, setIDate] = useState(today())
  const supabase = createClient()
  const f = (czk: number) => fmtCur(czk, cur)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('hh_entries').select('*').eq('household_id', householdId).eq('source', 'manual').order('date', { ascending: false })
    setEntries(data || [])
  }

  const totalIncome = entries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const totalExpense = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)

  async function addExpense() {
    if (!eDesc || !eAmt) return
    setLoading(true)
    const amt = parseFloat(eAmt); const czk = toCZK(amt, eCur)
    const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:'expense', description:eDesc, amount_czk:czk, display_amount:amt, display_currency:eCur, category:eCat, person:eWho, date:eDate, source:'manual' }).select().single()
    if (data) { setEntries(p => [data, ...p]); setEDesc(''); setEAmt('') }
    setLoading(false)
  }

  async function addIncome() {
    if (!iAmt) return
    setLoading(true)
    const amt = parseFloat(iAmt); const czk = toCZK(amt, iCur)
    const desc = iDesc || (iWho === 'you' ? myName : partnerName)
    const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:'income', description:desc, amount_czk:czk, display_amount:amt, display_currency:iCur, category:'Income', person:iWho, date:iDate, source:'manual' }).select().single()
    if (data) { setEntries(p => [data, ...p]); setIAmt(''); setIDesc('') }
    setLoading(false)
  }

  async function del(entry: Entry) {
    setEntries(p => p.filter(x => x.id !== entry.id))
    await supabase.from('hh_entries').delete().eq('id', entry.id)
    toast(entry.type === 'expense' ? 'Expense deleted' : 'Income deleted', async () => {
      const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:entry.type, description:entry.description, amount_czk:entry.amount_czk, display_amount:entry.display_amount, display_currency:entry.display_currency, category:entry.category, person:entry.person, date:entry.date, source:'manual' }).select().single()
      if (data) setEntries(p => [data, ...p].sort((a,b)=>b.date.localeCompare(a.date)))
    })
  }

  const INP: React.CSSProperties = { background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:8, padding:'7px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none', width:'100%' }

  return (
    <div>
      {/* Summary */}
      <div className="g3" style={{ marginBottom:16 }}>
        <div className="stat s-green"><div className="stat-lbl">Total income</div><div className="stat-val" style={{ color:'var(--green)' }}>{f(totalIncome)}</div><div className="stat-sub">all time</div></div>
        <div className="stat s-red"><div className="stat-lbl">Total expenses</div><div className="stat-val" style={{ color:'var(--red)' }}>{f(totalExpense)}</div><div className="stat-sub">all time</div></div>
        <div className={'stat '+(totalIncome-totalExpense>=0?'s-acc':'s-red')}><div className="stat-lbl">Balance</div><div className="stat-val" style={{ color:totalIncome-totalExpense>=0?'var(--acc)':'var(--red)' }}>{f(totalIncome-totalExpense)}</div><div className="stat-sub">net</div></div>
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="tabs" style={{ margin:0, borderBottom:'0.5px solid var(--border)', padding:'0' }}>
          <button className={'tab-btn '+(tab==='expense'?'active':'')} onClick={()=>setTab('expense')}>🧾 Add expense</button>
          <button className={'tab-btn '+(tab==='income'?'active':'')} onClick={()=>setTab('income')}>💰 Add income</button>
        </div>
        <div className="card-body">
          {tab === 'expense' ? (
            <div className="form-row">
              <div className="fg w"><label>Description</label><input value={eDesc} onChange={e=>setEDesc(e.target.value)} placeholder="e.g. Groceries" onKeyDown={e=>e.key==='Enter'&&addExpense()} /></div>
              <div className="fg m"><label>Amount</label><input type="number" value={eAmt} onChange={e=>setEAmt(e.target.value)} placeholder="0" min="0" /></div>
              <div className="fg s"><label>Currency</label><select value={eCur} onChange={e=>setECur(e.target.value as Cur)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
              <div className="fg m"><label>Category</label><select value={eCat} onChange={e=>setECat(e.target.value)}>{EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div className="fg m"><label>Paid by</label><select value={eWho} onChange={e=>setEWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option><option value="joint">Joint</option></select></div>
              <div className="fg"><label>Date</label><input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} /></div>
              <button className="add-btn" onClick={addExpense} disabled={loading}>Add</button>
            </div>
          ) : (
            <div className="form-row">
              <div className="fg w"><label>Description (optional)</label><input value={iDesc} onChange={e=>setIDesc(e.target.value)} placeholder="e.g. May salary" onKeyDown={e=>e.key==='Enter'&&addIncome()} /></div>
              <div className="fg m"><label>Amount</label><input type="number" value={iAmt} onChange={e=>setIAmt(e.target.value)} placeholder="0" min="0" /></div>
              <div className="fg s"><label>Currency</label><select value={iCur} onChange={e=>setICur(e.target.value as Cur)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
              <div className="fg m"><label>Who</label><select value={iWho} onChange={e=>setIWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option></select></div>
              <div className="fg"><label>Date</label><input type="date" value={iDate} onChange={e=>setIDate(e.target.value)} /></div>
              <button className="add-btn" onClick={addIncome} disabled={loading}>Add</button>
            </div>
          )}
        </div>
      </div>

      {/* Currency toggle + list */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{entries.length} transactions</span>
        <div className="toggle">
          <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>{setCur('CZK');localStorage.setItem('cur','CZK')}}>CZK</button>
          <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>{setCur('EUR');localStorage.setItem('cur','EUR')}}>EUR</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {entries.length === 0 ? <div className="empty">No transactions yet — add one above</div> :
          entries.map(e => (
            <div key={e.id} className="tx" style={{ padding:'9px 16px' }}>
              <div className="tx-icon" style={{ background:e.type==='income'?'rgba(79,216,150,.12)':'var(--surface2)', fontSize:14 }}>
                {e.type==='income'?'↓':'📦'}
              </div>
              <div className="tx-info">
                <div className="tx-name">{e.description}</div>
                <div className="tx-meta">{e.category} · {e.person==='you'?myName:e.person==='partner'?partnerName:'Joint'}</div>
              </div>
              <div className="tx-date">{fmtDate(e.date)}</div>
              <div className={'tx-amt '+(e.type==='income'?'pos':'neg')}>{fmtDisplay(e.display_amount, e.display_currency)}</div>
              <button className="del-btn" onClick={()=>del(e)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
