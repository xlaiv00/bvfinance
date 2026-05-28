'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ToastProvider'
import { fmtDate, EXPENSE_CATS, INCOME_CATS, today } from '@/types'
import { useCurrencyRates, toCZKr, fromCZKr, fmtR } from '@/hooks/useCurrencyRates'

type Cur = 'CZK'|'EUR'
interface Entry {
  id:string; type:string; description:string; amount_czk:number
  display_amount:number; display_currency:string; category:string; person:string; date:string; source:string
}

export default function FinancesClient({ householdId, myName, partnerName }: { householdId:string; myName:string; partnerName:string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tab, setTab] = useState<'expense'|'income'>('expense')
  const [cur, setCur] = useState<Cur>(() => typeof window !== 'undefined' ? (localStorage.getItem('cur') as Cur||'CZK') : 'CZK')
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [editData, setEditData] = useState<Partial<Entry>>({})
  const rates = useCurrencyRates()

  // Expense form
  const [eDesc, setEDesc] = useState(''); const [eAmt, setEAmt] = useState(''); const [eCur, setECur] = useState<Cur>('CZK')
  const [eCat, setECat] = useState('Groceries'); const [eWho, setEWho] = useState('joint'); const [eDate, setEDate] = useState(today())
  // Income form
  const [iDesc, setIDesc] = useState(''); const [iAmt, setIAmt] = useState(''); const [iCur, setICur] = useState<Cur>('CZK')
  const [iWho, setIWho] = useState('you'); const [iDate, setIDate] = useState(today()); const [iCat, setICat] = useState('Joint Contribution')

  const supabase = createClient()
  const f = (czk: number) => fmtR(czk, cur, rates)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('hh_entries').select('*').eq('household_id', householdId).eq('source', 'manual').order('date', { ascending: false })
    setEntries(data || [])
  }

  const totalIncome = entries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const totalExpense = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)

  async function addExpense() {
    if (!eDesc||!eAmt) return
    setLoading(true)
    const amt = parseFloat(eAmt); const czk = toCZKr(amt, eCur, rates)
    const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:'expense', description:eDesc, amount_czk:czk, display_amount:amt, display_currency:eCur, category:eCat, person:eWho, date:eDate, source:'manual' }).select().single()
    if (data) { setEntries(p=>[data,...p]); setEDesc(''); setEAmt('') }
    setLoading(false)
  }

  async function addIncome() {
    if (!iAmt) return
    setLoading(true)
    const amt = parseFloat(iAmt); const czk = toCZKr(amt, iCur, rates)
    const desc = iDesc || (iWho==='you'?myName:partnerName)
    const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:'income', description:desc, amount_czk:czk, display_amount:amt, display_currency:iCur, category:'Income', person:iWho, date:iDate, source:'manual' }).select().single()
    if (data) { setEntries(p=>[data,...p]); setIAmt(''); setIDesc('') }
    setLoading(false)
  }

  function startEdit(e: Entry) {
    setEditId(e.id)
    setEditData({ description:e.description, category:e.category, person:e.person, date:e.date, display_amount:e.display_amount, display_currency:e.display_currency })
  }

  async function saveEdit(e: Entry) {
    if (!editData) return
    const czk = toCZKr(editData.display_amount||e.display_amount, editData.display_currency||e.display_currency, rates)
    const updated = { description:editData.description||e.description, category:editData.category||e.category, person:editData.person||e.person, date:editData.date||e.date, display_amount:editData.display_amount||e.display_amount, display_currency:editData.display_currency||e.display_currency, amount_czk:czk }
    await supabase.from('hh_entries').update(updated).eq('id', e.id)
    setEntries(p=>p.map(x=>x.id===e.id?{...x,...updated}:x))
    setEditId(null); setEditData({})
  }

  async function del(entry: Entry) {
    setEntries(p=>p.filter(x=>x.id!==entry.id))
    await supabase.from('hh_entries').delete().eq('id', entry.id)
    toast(entry.type==='expense'?'Expense deleted':'Income deleted', async () => {
      const { data } = await supabase.from('hh_entries').insert({ household_id:householdId, type:entry.type, description:entry.description, amount_czk:entry.amount_czk, display_amount:entry.display_amount, display_currency:entry.display_currency, category:entry.category, person:entry.person, date:entry.date, source:'manual' }).select().single()
      if (data) setEntries(p=>[data,...p].sort((a,b)=>b.date.localeCompare(a.date)))
    })
  }

  const INP: React.CSSProperties = { background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none', width:'100%' }
  const pLabel = (p: string) => p==='you'?myName:p==='partner'?partnerName:'Joint'

  return (
    <div>
      {/* Rates badge */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
        <div className="rates-badge">
          <span className={'dot'+(rates.loading?' loading':'')} />
          {rates.loading ? 'Fetching rates...' : `Rates live · 1 EUR = ${rates.EUR_CZK.toFixed(2)} Kč · 1 USD = ${rates.USD_CZK.toFixed(2)} Kč · updated ${rates.lastUpdated}`}
        </div>
      </div>

      {/* Summary */}
      <div className="g3" style={{ marginBottom:16 }}>
        <div className="stat s-green">
          <div className="stat-lbl">Total income</div>
          <div className="stat-val" style={{ color:'var(--green)' }}>{f(totalIncome)}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat s-red">
          <div className="stat-lbl">Total expenses</div>
          <div className="stat-val" style={{ color:'var(--red)' }}>{f(totalExpense)}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className={'stat '+(totalIncome-totalExpense>=0?'s-acc':'s-red')}>
          <div className="stat-lbl">Balance</div>
          <div className="stat-val" style={{ color:totalIncome-totalExpense>=0?'var(--acc)':'var(--red)' }}>{f(totalIncome-totalExpense)}</div>
          <div className="stat-sub">net</div>
        </div>
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="tabs" style={{ margin:0, borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
          <button className={'tab-btn '+(tab==='expense'?'active':'')} onClick={()=>setTab('expense')}>🧾 Expense</button>
          <button className={'tab-btn '+(tab==='income'?'active':'')} onClick={()=>setTab('income')}>💰 Income</button>
        </div>
        <div className="card-body">
          {tab==='expense' ? (
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
              <div className="fg w"><label>Description</label><input value={iDesc} onChange={e=>setIDesc(e.target.value)} placeholder="e.g. May salary" onKeyDown={e=>e.key==='Enter'&&addIncome()} /></div>
              <div className="fg m"><label>Amount</label><input type="number" value={iAmt} onChange={e=>setIAmt(e.target.value)} placeholder="0" min="0" /></div>
              <div className="fg s"><label>Currency</label><select value={iCur} onChange={e=>setICur(e.target.value as Cur)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
              <div className="fg m"><label>Category</label><select value={iCat} onChange={e=>setICat(e.target.value)}>{INCOME_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div className="fg m"><label>Who</label><select value={iWho} onChange={e=>setIWho(e.target.value)}><option value="you">{myName}</option><option value="partner">{partnerName}</option></select></div>
              <div className="fg"><label>Date</label><input type="date" value={iDate} onChange={e=>setIDate(e.target.value)} /></div>
              <button className="add-btn" onClick={addIncome} disabled={loading}>Add</button>
            </div>
          )}
        </div>
      </div>

      {/* Currency toggle */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>{entries.length} transactions · click any row to edit</span>
        <div className="toggle">
          <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>{setCur('CZK');localStorage.setItem('cur','CZK')}}>CZK</button>
          <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>{setCur('EUR');localStorage.setItem('cur','EUR')}}>EUR</button>
        </div>
      </div>

      {/* Transactions list */}
      <div className="card">
        {entries.length===0 ? <div className="empty">No transactions yet — add one above</div> :
        entries.map(e => {
          const isEditing = editId === e.id
          return (
            <div key={e.id}>
              {isEditing ? (
                <div style={{ padding:'12px 16px', background:'var(--surface3)', borderBottom:'1px solid var(--border2)' }}>
                  <div className="form-row" style={{ marginBottom:8 }}>
                    <div className="fg w"><label>Description</label><input value={editData.description??e.description} onChange={ev=>setEditData(p=>({...p,description:ev.target.value}))} /></div>
                    <div className="fg m"><label>Amount</label><input type="number" value={editData.display_amount??e.display_amount} onChange={ev=>setEditData(p=>({...p,display_amount:parseFloat(ev.target.value)||0}))} /></div>
                    <div className="fg s"><label>Currency</label><select value={editData.display_currency??e.display_currency} onChange={ev=>setEditData(p=>({...p,display_currency:ev.target.value}))}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></div>
                    {e.type==='expense'&&<div className="fg m"><label>Category</label><select value={editData.category??e.category} onChange={ev=>setEditData(p=>({...p,category:ev.target.value}))}>{EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
                    <div className="fg m"><label>Person</label><select value={editData.person??e.person} onChange={ev=>setEditData(p=>({...p,person:ev.target.value}))}><option value="you">{myName}</option><option value="partner">{partnerName}</option><option value="joint">Joint</option></select></div>
                    <div className="fg"><label>Date</label><input type="date" value={editData.date??e.date} onChange={ev=>setEditData(p=>({...p,date:ev.target.value}))} /></div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>saveEdit(e)} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:7, padding:'6px 16px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                    <button onClick={()=>{setEditId(null);setEditData({})}} style={{ background:'none', border:'1px solid var(--border2)', color:'var(--muted)', borderRadius:7, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="tx" style={{ padding:'10px 16px', cursor:'pointer' }} onClick={()=>startEdit(e)}>
                  <div className="tx-icon" style={{ background:e.type==='income'?'rgba(52,211,153,.15)':'var(--surface2)', fontSize:14, border:e.type==='income'?'1px solid rgba(52,211,153,.3)':'1px solid var(--border2)' }}>
                    {e.type==='income'?'↓':'📦'}
                  </div>
                  <div className="tx-info">
                    <div className="tx-name">{e.description}</div>
                    <div className="tx-meta">{e.category} · {pLabel(e.person)} · {fmtDate(e.date)}</div>
                  </div>
                  <div className={'tx-amt '+(e.type==='income'?'pos':'neg')}>{fmtR(e.amount_czk, cur, rates)}</div>
                  <button className="del-btn" onClick={ev=>{ev.stopPropagation();del(e)}}>✕</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
