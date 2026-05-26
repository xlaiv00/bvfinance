'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtCur, fmtDate, fmtDisplay, toCZK, today, TRIP_CATS, CAT_EMOJI } from '@/types'

type Cur = 'CZK'|'EUR'
interface Trip { id:string; name:string; budget_czk:number; budget_currency:string; date_from?:string; date_to?:string; created_at:string }
interface TripExp { id:string; trip_id:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; date:string }

const TRIP_TO_HH: Record<string,string> = {
  Flights:'Travel', Accommodation:'Household', 'Food & Drinks':'Restaurants',
  Transport:'Transport', 'Car Rental':'Transport', Activities:'Entertainment',
  Entertainment:'Entertainment', Shopping:'Shopping', Health:'Health', Other:'Other'
}

export default function TripsClient({ householdId, myName, partnerName, initTrips, initTripExp }: any) {
  const [trips, setTrips] = useState<Trip[]>(initTrips)
  const [exps, setExps] = useState<TripExp[]>(initTripExp)
  const [cur, setCur] = useState<Cur>('CZK')
  const [openId, setOpenId] = useState<string|null>(null)
  const [tabMap, setTabMap] = useState<Record<string,string>>({})
  const [editBudgetId, setEditBudgetId] = useState<string|null>(null)
  const [newBudget, setNewBudget] = useState('')
  const [loading, setLoading] = useState(false)
  // New trip form
  const [tName, setTName] = useState(''); const [tBudget, setTBudget] = useState('')
  const [tCur, setTCur] = useState<Cur>('CZK'); const [tFrom, setTFrom] = useState(''); const [tTo, setTTo] = useState('')
  // Expense form per trip
  const [forms, setForms] = useState<Record<string,any>>({})
  const supabase = createClient()
  const f = (czk: number) => fmtCur(czk, cur)
  const getForm = (id: string) => forms[id] || { desc:'', amt:'', cur:'CZK', cat:'Food & Drinks', date:today(), who:'joint' }
  const patchForm = (id: string, patch: any) => setForms((p: any) => ({ ...p, [id]: { ...getForm(id), ...patch } }))
  const getTab = (id: string) => tabMap[id] || 'overview'
  const setTab = (id: string, t: string) => setTabMap(p => ({ ...p, [id]: t }))

  async function createTrip() {
    if (!tName||!tBudget) return
    setLoading(true)
    const b = parseFloat(tBudget); const czk = toCZK(b, tCur)
    const { data } = await supabase.from('trips').insert({ household_id:householdId, name:tName, budget_czk:czk, budget_currency:tCur, date_from:tFrom||null, date_to:tTo||null }).select().single()
    if (data) { setTrips((p: Trip[]) => [data, ...p]); setOpenId(data.id); setTab(data.id,'expenses'); setTName(''); setTBudget('') }
    setLoading(false)
  }

  async function updateBudget(tripId: string, tripCur: string) {
    const b = parseFloat(newBudget); if (!b||b<=0) { setEditBudgetId(null); return }
    const czk = toCZK(b, tripCur as Cur)
    await supabase.from('trips').update({ budget_czk:czk, budget_currency:tripCur }).eq('id',tripId)
    setTrips((p: Trip[]) => p.map(t => t.id===tripId ? { ...t, budget_czk:czk } : t))
    setEditBudgetId(null); setNewBudget('')
  }

  async function addExpense(tripId: string, tripName: string) {
    const form = getForm(tripId)
    if (!form.desc||!form.amt) return
    setLoading(true)
    const amt = parseFloat(form.amt); const czk = toCZK(amt, form.cur)
    const { data } = await supabase.from('trip_expenses').insert({ trip_id:tripId, household_id:householdId, description:form.desc, amount_czk:czk, display_amount:amt, display_currency:form.cur, category:form.cat, date:form.date }).select().single()
    if (data) {
      setExps((p: TripExp[]) => [data, ...p])
      // Mirror to household entries
      await supabase.from('hh_entries').insert({ household_id:householdId, type:'expense', description:'['+tripName+'] '+form.desc, amount_czk:czk, display_amount:amt, display_currency:form.cur, category:TRIP_TO_HH[form.cat]||'Travel', person:form.who, date:form.date, source:'trip', source_id:tripId })
      patchForm(tripId, { desc:'', amt:'' })
    }
    setLoading(false)
  }

  async function deleteTrip(id: string) {
    const trip = trips.find(t => t.id===id)
    const tripExps = exps.filter(e => e.trip_id===id)
    // Remove mirrored hh_entries
    if (trip && tripExps.length>0) {
      for (const e of tripExps) {
        await supabase.from('hh_entries').delete().eq('household_id',householdId).eq('description','['+trip.name+'] '+e.description).eq('date',e.date)
      }
    }
    await supabase.from('trips').delete().eq('id',id)
    setTrips((p: Trip[]) => p.filter(t=>t.id!==id))
    setExps((p: TripExp[]) => p.filter(e=>e.trip_id!==id))
    if (openId===id) setOpenId(null)
  }

  async function deleteExpense(exp: TripExp, tripName: string) {
    await supabase.from('trip_expenses').delete().eq('id',exp.id)
    await supabase.from('hh_entries').delete().eq('household_id',householdId).eq('description','['+tripName+'] '+exp.description).eq('date',exp.date)
    setExps((p: TripExp[]) => p.filter(e=>e.id!==exp.id))
  }

  const CURS = ['CZK','EUR'] as const
  const INP: React.CSSProperties = { background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:8, padding:'7px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none' }

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div className="toggle">
          <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>setCur('CZK')}>CZK</button>
          <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>setCur('EUR')}>EUR</button>
        </div>
      </div>

      {/* New trip */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-head"><span className="card-title">Plan a trip</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg w"><label>Destination</label><input value={tName} onChange={e=>setTName(e.target.value)} placeholder="e.g. Japan 2025" style={{ ...INP, width:'100%' }} /></div>
            <div className="fg m"><label>Budget</label><input type="number" value={tBudget} onChange={e=>setTBudget(e.target.value)} placeholder="3000" style={{ ...INP, width:'100%' }} /></div>
            <div className="fg s"><label>Currency</label><select value={tCur} onChange={e=>setTCur(e.target.value as Cur)} style={{ ...INP, width:'100%' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div className="fg"><label>From</label><input type="date" value={tFrom} onChange={e=>setTFrom(e.target.value)} style={{ ...INP, width:'100%' }} /></div>
            <div className="fg"><label>To</label><input type="date" value={tTo} onChange={e=>setTTo(e.target.value)} style={{ ...INP, width:'100%' }} /></div>
            <button className="add-btn" onClick={createTrip} disabled={loading}>Create</button>
          </div>
        </div>
      </div>

      {trips.length===0&&<div className="empty">No trips yet</div>}

      {trips.map((trip: Trip) => {
        const tripExps = exps.filter((e: TripExp)=>e.trip_id===trip.id).sort((a: TripExp,b: TripExp)=>b.date.localeCompare(a.date))
        const spent = tripExps.reduce((s: number,e: TripExp)=>s+e.amount_czk,0)
        const rem = trip.budget_czk - spent
        const pct = Math.min(trip.budget_czk>0?Math.round(spent/trip.budget_czk*100):0,100)
        const days = trip.date_from&&trip.date_to?Math.max(1,Math.round((new Date(trip.date_to).getTime()-new Date(trip.date_from).getTime())/86400000)+1):null
        const tab = getTab(trip.id)
        const form = getForm(trip.id)
        const isOpen = openId===trip.id

        // Category totals for overview
        const catMap: Record<string,number> = {}
        tripExps.forEach((e: TripExp) => { catMap[e.category]=(catMap[e.category]||0)+e.amount_czk })
        const sortedCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1])
        const maxCat = sortedCats[0]?.[1]||1

        return (
          <div key={trip.id} className="card" style={{ marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', padding:'11px 16px', gap:10 }}>
              <div style={{ flex:1, cursor:'pointer' }} onClick={()=>setOpenId(isOpen?null:trip.id)}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>✈️ {trip.name}</span>
                  {days&&<span style={{ fontSize:11, color:'var(--muted)', background:'var(--surface2)', padding:'2px 8px', borderRadius:20 }}>{days}d</span>}
                </div>
                {(trip.date_from||trip.date_to)&&<div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{trip.date_from?fmtDate(trip.date_from):''}{trip.date_from&&trip.date_to?' → ':''}{trip.date_to?fmtDate(trip.date_to):''}</div>}
              </div>
              <span style={{ fontSize:12, fontWeight:500, color:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }}>{f(spent)} / {f(trip.budget_czk)}</span>
              <button onClick={()=>setOpenId(isOpen?null:trip.id)} style={{ ...INP, width:'auto', fontSize:12, cursor:'pointer', padding:'4px 12px' }}>{isOpen?'Close':'Open'}</button>
              <button onClick={()=>deleteTrip(trip.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:14 }}>🗑</button>
            </div>

            {/* Budget bar */}
            <div style={{ padding:'0 16px 12px' }}>
              <div className="bar-track">
                <div className="bar-fill" style={{ width:pct+'%', background:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6, fontSize:11 }}>
                <span style={{ color:'var(--muted)' }}>{pct}% spent</span>
                {editBudgetId===trip.id ? (
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <input type="number" value={newBudget} onChange={e=>setNewBudget(e.target.value)} autoFocus placeholder={String(fmtCur(trip.budget_czk,'CZK').replace(' Kč','').replace(' Kč',''))} onKeyDown={e=>{if(e.key==='Enter')updateBudget(trip.id,trip.budget_currency);if(e.key==='Escape')setEditBudgetId(null)}} style={{ ...INP, width:100, fontSize:12 }} />
                    <button onClick={()=>updateBudget(trip.id,trip.budget_currency)} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:6, padding:'4px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                    <button onClick={()=>setEditBudgetId(null)} style={{ background:'none', border:'0.5px solid var(--border)', color:'var(--muted)', borderRadius:6, padding:'4px 8px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={()=>{setEditBudgetId(trip.id);setNewBudget('')}} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, color:rem>=0?'var(--green)':'var(--red)', display:'flex', alignItems:'center', gap:5 }}>
                    <span>{rem>=0?f(rem)+' left':f(Math.abs(rem))+' over'}</span>
                    <span style={{ color:'var(--faint)', textDecoration:'underline dotted' }}>edit</span>
                  </button>
                )}
              </div>
            </div>

            {isOpen&&<div style={{ borderTop:'0.5px solid var(--border)' }}>
              <div style={{ display:'flex', borderBottom:'0.5px solid var(--border)' }}>
                {[['overview','📊 Overview'],['expenses','🧾 Expenses']].map(([k,l])=>(
                  <button key={k} className={'tab-btn '+(tab===k?'active':'')} onClick={()=>setTab(trip.id,k)} style={{ flex:1, borderRadius:0 }}>{l}</button>
                ))}
              </div>

              {tab==='overview'&&<div style={{ padding:16 }}>
                <div className="g3" style={{ marginBottom:16 }}>
                  {[{l:'Spent',v:f(spent),c:'var(--red)'},{l:'Remaining',v:f(Math.abs(rem)),c:rem>=0?'var(--green)':'var(--red)'},{l:days?'Daily avg':'Items',v:days&&spent>0?f(spent/days):String(tripExps.length),c:'var(--blue)'}].map(s=>(
                    <div key={s.l} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{s.l}</div>
                      <div style={{ fontSize:18, fontWeight:500, color:s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                {sortedCats.length===0?<div className="empty">No expenses yet</div>:sortedCats.map(([cat,czk])=>(
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                      <span style={{ color:'var(--muted)' }}>{CAT_EMOJI[cat]||'📦'} {cat}</span>
                      <span style={{ fontWeight:500 }}>{f(czk)}</span>
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width:Math.round(czk/maxCat*100)+'%', background:'var(--acc)' }} /></div>
                  </div>
                ))}
              </div>}

              {tab==='expenses'&&<div style={{ padding:16 }}>
                <div style={{ background:'var(--surface2)', borderRadius:10, padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:10 }}>Add expense · mirrors to Household automatically</div>
                  <div className="form-row">
                    <div className="fg w"><label>Description</label><input value={form.desc} onChange={e=>patchForm(trip.id,{desc:e.target.value})} placeholder="e.g. Dinner" onKeyDown={e=>e.key==='Enter'&&addExpense(trip.id,trip.name)} style={{ ...INP, width:'100%' }} /></div>
                    <div className="fg m"><label>Amount</label><input type="number" value={form.amt} onChange={e=>patchForm(trip.id,{amt:e.target.value})} placeholder="0" style={{ ...INP, width:'100%' }} /></div>
                    <div className="fg s"><label>Currency</label><select value={form.cur} onChange={e=>patchForm(trip.id,{cur:e.target.value})} style={{ ...INP, width:'100%' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                    <div className="fg m"><label>Category</label><select value={form.cat} onChange={e=>patchForm(trip.id,{cat:e.target.value})} style={{ ...INP, width:'100%' }}>{TRIP_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                    <div className="fg m"><label>Paid by</label><select value={form.who} onChange={e=>patchForm(trip.id,{who:e.target.value})} style={{ ...INP, width:'100%' }}><option value="you">{myName}</option><option value="partner">{partnerName}</option><option value="joint">Joint</option></select></div>
                    <div className="fg"><label>Date</label><input type="date" value={form.date} onChange={e=>patchForm(trip.id,{date:e.target.value})} style={{ ...INP, width:'100%' }} /></div>
                    <button className="add-btn" onClick={()=>addExpense(trip.id,trip.name)} disabled={loading}>Add</button>
                  </div>
                </div>
                {tripExps.length===0?<div className="empty">No expenses yet</div>:
                Object.entries(tripExps.reduce((acc: any,e: TripExp)=>{(acc[e.date]=acc[e.date]||[]).push(e);return acc},{}))
                  .sort((a,b)=>(b[0] as string).localeCompare(a[0] as string)).map(([date,dayExps]) => (
                  <div key={date} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em', display:'flex', justifyContent:'space-between', paddingBottom:6, marginBottom:4, borderBottom:'0.5px solid var(--border)' }}>
                      <span>{fmtDate(date)}</span>
                      <span>{f((dayExps as TripExp[]).reduce((s: number,e: TripExp)=>s+e.amount_czk,0))}</span>
                    </div>
                    {(dayExps as TripExp[]).map((exp: TripExp)=>(
                      <div key={exp.id} className="tx">
                        <div className="tx-icon">{CAT_EMOJI[exp.category]||'📦'}</div>
                        <div className="tx-info">
                          <div className="tx-name">{exp.description}</div>
                          <div className="tx-meta">{exp.category}</div>
                        </div>
                        <div className="tx-date">{fmtDate(exp.date)}</div>
                        <div className="tx-amt neg">{fmtDisplay(exp.display_amount, exp.display_currency)}</div>
                        <button className="del-btn" onClick={()=>deleteExpense(exp,trip.name)}>✕</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>}
            </div>}
          </div>
        )
      })}
    </>
  )
}
