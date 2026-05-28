'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, MONTHS, MONTHS_S, CAT_EMOJI } from '@/types'
import { useCurrencyRates, fmtR } from '@/hooks/useCurrencyRates'

interface HHEntry { id:string; type:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; person:string; date:string; source:string; source_id?:string }
interface BizSale { id:string; date:string; watch_name:string; customer:string; revenue_czk:number; watch_cost_czk:number; sup_shipping_czk:number; service_czk:number; shipping_czk:number; ads_czk:number }
interface Trip { id:string; name:string; budget_czk:number; date_from?:string; date_to?:string }
type Cur = 'CZK'|'EUR'

export default function DashboardClient({ householdId, myName, partnerName }: { householdId:string; myName:string; partnerName:string }) {
  const [entries, setEntries] = useState<HHEntry[]>([])
  const [sales, setSales] = useState<BizSale[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [cur, setCur] = useState<Cur>(() => typeof window !== 'undefined' ? (localStorage.getItem('cur') as Cur||'CZK') : 'CZK')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [view, setView] = useState<'month'|'year'>('month')
  // Contribution add forms
  const [jAdding, setJAdding] = useState(false)
  const [jWho, setJWho] = useState('you'); const [jAmt, setJAmt] = useState(''); const [jCurr, setJCurr] = useState('CZK')
  const [bAdding, setBAdding] = useState(false)
  const [bWho, setBWho] = useState('you'); const [bAmt, setBAmt] = useState(''); const [bCurr, setBCurr] = useState('CZK')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()
  const rates = useCurrencyRates()
  const f = (czk: number) => fmtR(czk, cur, rates)
  function saveCur(c: Cur) { setCur(c); localStorage.setItem('cur', c) }

  const fetchAll = useCallback(async () => {
    const [e, s, t] = await Promise.all([
      supabase.from('hh_entries').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('biz_sales').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('trips').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])
    setEntries(e.data || [])
    setSales(s.data || [])
    setTrips(t.data || [])
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    fetchAll()
    const onVis = () => { if (document.visibilityState === 'visible') fetchAll() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', fetchAll)
    const ch = supabase.channel('dash-' + householdId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hh_entries' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biz_sales' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', fetchAll) }
  }, [householdId, fetchAll])

  function filterPeriod<T extends { date: string }>(arr: T[]) {
    if (view === 'year') return arr.filter(x => new Date(x.date+'T12:00:00').getFullYear() === year)
    return arr.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year && d.getMonth()===month })
  }

  const pEntries = filterPeriod(entries)
  const pSales   = filterPeriod(sales)

  // Joint P&L
  const jIn  = pEntries.filter(e=>e.type==='income'&&e.category!=='Watch Contribution').reduce((s,x)=>s+x.amount_czk,0)
  const jOut = pEntries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)
  const jNet = jIn - jOut
  const allJIn  = entries.filter(e=>e.type==='income'&&e.category!=='Watch Contribution').reduce((s,x)=>s+x.amount_czk,0)
  const allJOut = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)

  // Business P&L
  function saleProfit(s: BizSale) { return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.sup_shipping_czk||0)-(s.service_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0) }
  const bRev    = pSales.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const bCosts  = pSales.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const bProfit = bRev - bCosts
  const allBizProfit = sales.reduce((s,x)=>s+saleProfit(x),0)
  // ── Contributions ──
  const allManual = entries.filter(e=>e.type==='income'&&e.source==='manual')
  const jContribs = allManual.filter(e=>e.category==='Joint Contribution')
  const jMyC      = jContribs.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const jPartnerC = jContribs.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const wContribs = allManual.filter(e=>e.category==='Watch Contribution')
  const wMyC      = wContribs.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const wPartnerC = wContribs.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const wTotalContrib = wMyC + wPartnerC

  // All-time balance = Joint net + Watch profit (capital is already inside profit via costs)
  const allBalance   = (allJIn - allJOut) + allBizProfit



  // Correct math: target = whoever contributed more; other person must match
  function contribStatus(myAmt: number, partnerAmt: number, pName: string, mName: string) {
    const diff = Math.abs(myAmt - partnerAmt)
    const balanced = diff < 100
    const behindName = myAmt < partnerAmt ? mName : pName
    const target = Math.max(myAmt, partnerAmt)
    return { balanced, behindName, diff, target }
  }
  const jStatus = contribStatus(jMyC, jPartnerC, partnerName, myName)
  const wStatus = contribStatus(wMyC, wPartnerC, partnerName, myName)

  async function addContrib(category: string, who: string, amt: string, curr: string, onDone: ()=>void) {
    if (!amt) return
    setSaving(true)
    const a = parseFloat(amt)
    const czk = a * (curr==='EUR'?rates.EUR_CZK:curr==='USD'?rates.USD_CZK:1)
    const { data } = await supabase.from('hh_entries').insert({
      household_id: householdId, type:'income',
      description: (who==='you'?myName:partnerName)+' — '+category,
      amount_czk: czk, display_amount: a, display_currency: curr,
      category, person: who, date: new Date().toISOString().split('T')[0], source:'manual'
    }).select().single()
    if (data) setEntries(p=>[data,...p])
    onDone(); setSaving(false)
  }

  // Chart
  const chartData = MONTHS_S.map((m,i) => {
    const me = entries.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const ms = sales.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    return { m, jIn:me.filter(e=>e.type==='income'&&e.category!=='Watch Contribution').reduce((s,x)=>s+x.amount_czk,0), jOut:me.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0), bRev:ms.reduce((s,x)=>s+(x.revenue_czk||0),0) }
  })
  const maxBar = Math.max(...chartData.map(d=>Math.max(d.jIn,d.jOut,d.bRev)),1)
  const activeMonths = [...new Set(entries.map(e=>new Date(e.date+'T12:00:00')).filter(d=>d.getFullYear()===year).map(d=>d.getMonth()))]
  const years = [...new Set([new Date().getFullYear(),...entries.map(e=>new Date(e.date+'T12:00:00').getFullYear())])].sort()
  const lbl = view==='year' ? String(year) : MONTHS[month]+' '+year

  const INP: React.CSSProperties = { background:'var(--surface3)', border:'1px solid var(--border2)', borderRadius:7, padding:'6px 9px', fontSize:12, color:'var(--text)', fontFamily:'inherit', outline:'none' }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--muted)', fontSize:13, fontWeight:600 }}>Loading...</div>

  return (
    <>
      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-.03em' }}>Overview</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, fontWeight:600 }}>{lbl}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchAll} style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:8, padding:'5px 10px', fontSize:12, color:'var(--muted)', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>↻</button>
          <div className="toggle">
            <button className={'toggle-btn '+(view==='month'?'active':'')} onClick={()=>setView('month')}>Month</button>
            <button className={'toggle-btn '+(view==='year'?'active':'')} onClick={()=>setView('year')}>Year</button>
          </div>
          <div className="toggle">
            <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>saveCur('CZK')}>CZK</button>
            <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>saveCur('EUR')}>EUR</button>
          </div>
        </div>
      </div>

      {/* Year / month nav */}
      <div style={{ display:'flex', gap:4, marginBottom:8 }}>
        {years.map(y=><button key={y} onClick={()=>setYear(y)} style={{ padding:'3px 12px', border:'1px solid var(--border2)', borderRadius:20, fontSize:12, cursor:'pointer', background:y===year?'var(--acc2)':'transparent', color:y===year?'#fff':'var(--muted)', fontFamily:'inherit', fontWeight:700 }}>{y}</button>)}
      </div>
      {view==='month'&&(
        <div className="timeline">
          {MONTHS_S.map((m,i)=>(
            <button key={i} onClick={()=>setMonth(i)} className={'tl-btn '+(i===month?'active ':'')+(activeMonths.includes(i)?'has-data':'')}>
              <span className="tl-m">{m}</span><span className="tl-dot">●</span>
            </button>
          ))}
        </div>
      )}
      {view==='year'&&<div style={{ marginBottom:20 }}/>}

      {/* ═══ ZONE 1: TWO P&L CARDS ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        {/* Joint */}
        <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border2)', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#1a2d4a 0%,#111e30 100%)', padding:'16px 18px', borderBottom:'1px solid rgba(96,165,250,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(96,165,250,.18)', border:'1px solid rgba(96,165,250,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🏠</div>
                <div><div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Joint</div><div style={{ fontSize:11, color:'rgba(255,255,255,.45)', fontWeight:500 }}>personal finances</div></div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>NET</div>
                <div style={{ fontSize:24, fontWeight:800, color:jNet>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{jNet>=0?'+':''}{f(jNet)}</div>
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 18px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Income</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--green)' }}>{f(jIn)}</div>
              </div>
              <div style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Expenses</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(jOut)}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Watch Business */}
        <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border2)', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#3d2000 0%,#271500 100%)', padding:'16px 18px', borderBottom:'1px solid rgba(251,191,36,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(251,191,36,.18)', border:'1px solid rgba(251,191,36,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>⌚</div>
                <div><div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Watch Business</div><div style={{ fontSize:11, color:'rgba(255,255,255,.45)', fontWeight:500 }}>sales & operations</div></div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>PROFIT · {lbl}</div>
                <div style={{ fontSize:24, fontWeight:800, color:bProfit>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{bProfit>=0?'+':''}{f(bProfit)}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', fontWeight:500, marginTop:2 }}>all-time: {f(allBizProfit)}</div>
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 18px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div style={{ background:'rgba(251,191,36,.07)', border:'1px solid rgba(251,191,36,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Revenue</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--gold)' }}>{f(bRev)}</div>
              </div>
              <div style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Costs</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(bCosts)}</div>
              </div>
            </div>
            {/* Capital invested — from Watch Contributions */}
            {wTotalContrib > 0 && (
              <div style={{ background:'rgba(96,165,250,.07)', border:'1px solid rgba(96,165,250,.18)', borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:10, color:'var(--blue)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Capital invested</div>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>money put into the business · already in costs</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:18, fontWeight:800, color:'var(--blue)' }}>{f(wTotalContrib)}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:500, marginTop:2 }}>
                      {myName} {f(wMyC)} · {partnerName} {f(wPartnerC)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {pSales.length>0&&<div style={{ background:'var(--surface2)', borderRadius:9, padding:'10px 12px', border:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[{l:'Sales',v:String(pSales.length)},{l:'Avg profit',v:f(bProfit/pSales.length)},{l:'Margin',v:bRev>0?Math.round(bProfit/bRev*100)+'%':'—'}].map(s=>(
                <div key={s.l} style={{ textAlign:'center' }}><div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:2 }}>{s.l}</div><div style={{ fontSize:13, fontWeight:800 }}>{s.v}</div></div>
              ))}
            </div>}
          </div>
        </div>
      </div>

      {/* ═══ ZONE 2: COMBINED BALANCE ═══ */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, padding:'18px 20px', marginBottom:14 }}>
        {/* All-time big number */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>All-time balance — everything combined</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
            <div style={{ fontSize:36, fontWeight:800, color:allBalance>=0?'var(--green)':'var(--red)', letterSpacing:'-.03em', lineHeight:1 }}>{f(allBalance)}</div>
            <div style={{ display:'flex', gap:16, fontSize:12, fontWeight:600 }}>
              <span style={{ color:'var(--muted)' }}>Joint <span style={{ color:(allJIn-allJOut)>=0?'var(--green)':'var(--red)' }}>{f(allJIn-allJOut)}</span></span>
              <span style={{ color:'var(--faint)' }}>+</span>
              <span style={{ color:'var(--muted)' }}>Watch profit <span style={{ color:allBizProfit>=0?'var(--gold)':'var(--red)' }}>{f(allBizProfit)}</span></span>
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{ borderTop:'1px solid var(--border2)', paddingTop:14 }}>
          <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>This period — {lbl}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[
              { l:'Joint net', v:jNet, sub:'income − expenses', c:jNet>=0?'var(--green)':'var(--red)' },
              { l:'Watch profit', v:bProfit, sub:'revenue − costs', c:bProfit>=0?'var(--gold)':'var(--red)' },
              { l:'Combined', v:jNet+bProfit, sub:'joint + watch', c:(jNet+bProfit)>=0?'var(--acc)':'var(--red)' },
            ].map(s=>(
              <div key={s.l} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{s.l}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v>=0?'+':''}{f(s.v)}</div>
                <div style={{ fontSize:10, color:'var(--faint)', fontWeight:600, marginTop:3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ ZONE 3: CONTRIBUTIONS ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        {[
          { key:'joint', title:'🏠 Joint', category:'Joint Contribution', myAmt:jMyC, partnerAmt:jPartnerC, adding:jAdding, setAdding:setJAdding, who:jWho, setWho:setJWho, amt:jAmt, setAmt:setJAmt, curr:jCurr, setCurr:setJCurr, accent:'#60a5fa' },
          { key:'watch', title:'⌚ Watch Business', category:'Watch Contribution', myAmt:wMyC, partnerAmt:wPartnerC, adding:bAdding, setAdding:setBAdding, who:bWho, setWho:setBWho, amt:bAmt, setAmt:setBAmt, curr:bCurr, setCurr:setBCurr, accent:'#fbbf24' },
        ].map(card=>{
          const diff = card.myAmt - card.partnerAmt
          const balanced = Math.abs(diff) < 100
          const owesPerson = diff < 0 ? myName : partnerName
          const owesAmt = Math.abs(diff)
          const target = Math.max(card.myAmt, card.partnerAmt)
          return (
            <div key={card.key} style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, overflow:'hidden' }}>
              {/* Header */}
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{card.title} contributions</span>
                <button onClick={()=>card.setAdding(!card.adding)} style={{ background:card.adding?'transparent':'var(--acc2)', border:'1px solid var(--border2)', color:card.adding?'var(--muted)':'#fff', borderRadius:7, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {card.adding?'✕':'+ Add'}
                </button>
              </div>

              {/* Add form */}
              {card.adding&&(
                <div style={{ padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border2)', display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Who</label>
                    <select value={card.who} onChange={e=>card.setWho(e.target.value)} style={INP}>
                      <option value="you">{myName}</option>
                      <option value="partner">{partnerName}</option>
                    </select>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Amount</label>
                    <input type="number" value={card.amt} onChange={e=>card.setAmt(e.target.value)} placeholder="0" style={{ ...INP, width:90 }} onKeyDown={e=>{ if(e.key==='Enter'&&card.amt) addContrib(card.category, card.who, card.amt, card.curr, ()=>{ card.setAmt(''); card.setAdding(false) }) }} autoFocus />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Currency</label>
                    <select value={card.curr} onChange={e=>card.setCurr(e.target.value)} style={INP}>
                      <option value="CZK">CZK</option><option value="EUR">EUR</option>
                    </select>
                  </div>
                  <button onClick={()=>{ if(card.amt) addContrib(card.category, card.who, card.amt, card.curr, ()=>{ card.setAmt(''); card.setAdding(false) }) }} disabled={saving||!card.amt} style={{ background:'var(--green)', border:'none', color:'#fff', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!card.amt?0.4:1 }}>
                    {saving?'…':'Save'}
                  </button>
                </div>
              )}

              <div style={{ padding:'14px 16px' }}>
                {(card.myAmt===0&&card.partnerAmt===0)
                  ? <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>No contributions yet</div>
                  : <>
                      {/* Two people, side by side amounts */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                        {[{name:myName,amt:card.myAmt,color:card.accent==='#60a5fa'?'#60a5fa':'#fbbf24'},{name:partnerName,amt:card.partnerAmt,color:card.accent==='#60a5fa'?'#a78bfa':'#f97316'}].map(p=>{
                          const pct = target>0?Math.min(Math.round(p.amt/target*100),100):100
                          const isAhead = p.amt >= target - 100
                          return (
                            <div key={p.name} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', border:`1px solid ${isAhead?'rgba(34,197,94,.2)':'var(--border)'}` }}>
                              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>{p.name}</div>
                              <div style={{ fontSize:20, fontWeight:800, color:p.color, marginBottom:8 }}>{f(p.amt)}</div>
                              <div className="bar-track" style={{ height:5 }}>
                                <div className="bar-fill" style={{ width:pct+'%', background:p.color }}/>
                              </div>
                              <div style={{ fontSize:10, color:isAhead?'var(--green)':'var(--muted)', fontWeight:700, marginTop:4 }}>
                                {isAhead?'✓ matched':''+Math.round((target-p.amt))+'...'}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Status line — dead simple */}
                      {balanced
                        ? <div style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)', borderRadius:9, padding:'10px 14px', textAlign:'center' }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>✓ Perfectly balanced</span>
                          </div>
                        : <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:9, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div>
                              <div style={{ fontSize:11, color:'var(--red)', fontWeight:600, marginBottom:1 }}>{owesPerson} needs to add</div>
                              <div style={{ fontSize:10, color:'rgba(239,68,68,.6)', fontWeight:500 }}>to match {owesPerson===myName?partnerName:myName}</div>
                            </div>
                            <div style={{ fontSize:22, fontWeight:800, color:'var(--red)' }}>{f(owesAmt)}</div>
                          </div>
                      }
                    </>
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* ═══ ZONE 4: RECENT ACTIVITIES ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div className="card">
          <div className="card-head" style={{ borderLeft:'3px solid #60a5fa' }}>
            <span className="card-title">🏠 Joint — recent</span>
            <span className="card-meta">{pEntries.length} entries · {lbl}</span>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {pEntries.length===0?<div className="empty">No entries for {lbl}</div>:
            [...pEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).map(e=>(
              <div key={e.id} className="tx" style={{ padding:'10px 16px' }}>
                <div className="tx-icon" style={{ background:e.type==='income'?'rgba(96,165,250,.12)':'var(--surface2)', border:e.type==='income'?'1px solid rgba(96,165,250,.25)':'1px solid var(--border2)', fontSize:14 }}>
                  {e.type==='income'?'↓':(CAT_EMOJI[e.category]||'📦')}
                </div>
                <div className="tx-info">
                  <div className="tx-name">{e.description}</div>
                  <div className="tx-meta">{e.category} · {e.person==='you'?myName:e.person==='partner'?partnerName:'Joint'}</div>
                </div>
                <div className="tx-date">{fmtDate(e.date)}</div>
                <div className={'tx-amt '+(e.type==='income'?'pos':'neg')}>{fmtR(e.amount_czk,cur,rates)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head" style={{ borderLeft:'3px solid var(--gold)' }}>
            <span className="card-title">⌚ Watch Business — recent</span>
            <span className="card-meta">{pSales.length} sales · {lbl}</span>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {pSales.length===0?<div className="empty">No sales for {lbl}</div>:
            [...pSales].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).map(s=>{
              const pr = saleProfit(s)
              return (
                <div key={s.id} className="tx" style={{ padding:'10px 16px' }}>
                  <div className="tx-icon" style={{ background:'rgba(251,191,36,.12)', border:'1px solid rgba(251,191,36,.25)', fontSize:14 }}>⌚</div>
                  <div className="tx-info">
                    <div className="tx-name">{s.watch_name||'Watch sale'}</div>
                    <div className="tx-meta">{s.customer||'—'}</div>
                  </div>
                  <div className="tx-date">{fmtDate(s.date)}</div>
                  <div style={{ textAlign:'right', flexShrink:0, minWidth:80 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--gold)' }}>{f(s.revenue_czk||0)}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:pr>=0?'var(--green)':'var(--red)' }}>{pr>=0?'+':''}{f(pr)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══ ZONE 5: TRIPS ═══ */}
      {trips.length>0&&(
        <div className="card">
          <div className="card-head"><span className="card-title">✈️ Trips</span><span className="card-meta">{trips.length} planned</span></div>
          <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
            {trips.map(t=>{
              const spent = entries.filter(e=>e.source_id===t.id).reduce((s,x)=>s+x.amount_czk,0)
              const pct = t.budget_czk>0?Math.min(Math.round(spent/t.budget_czk*100),100):0
              const rem = t.budget_czk - spent
              return (
                <div key={t.id}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>{t.name}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--blue)' }}>{f(t.budget_czk)}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width:pct+'%', background:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }}/></div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginTop:4, fontWeight:600 }}>
                    <span>{f(spent)} spent</span>
                    <span style={{ color:rem>=0?'var(--green)':'var(--red)' }}>{rem>=0?f(rem)+' left':f(Math.abs(rem))+' over'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
