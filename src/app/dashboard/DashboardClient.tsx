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
  const pSales = filterPeriod(sales)

  // Joint P&L
  const jIncome = pEntries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const jExpense = pEntries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)
  const jNet = jIncome - jExpense
  const allJIncome = entries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const allJExpense = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)

  // Business P&L
  function saleProfit(s: BizSale) { return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.sup_shipping_czk||0)-(s.service_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0) }
  const bizRev = pSales.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const bizCosts = pSales.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const bizProfit = bizRev - bizCosts
  const allBizProfit = sales.reduce((s,x)=>s+saleProfit(x),0)

  // Combined all-time
  const allTimeBalance = (allJIncome - allJExpense) + allBizProfit

  // 50/50 tracker
  const allContribs = entries.filter(e=>e.type==='income'&&e.source==='manual')
  const myContrib = allContribs.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const partnerContrib = allContribs.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const totalContrib = myContrib + partnerContrib
  const fairShare = totalContrib / 2
  const myOwes = fairShare - myContrib
  const partnerOwes = fairShare - partnerContrib

  // Chart
  const chartData = MONTHS_S.map((m,i) => {
    const me = entries.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const ms = sales.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    return {
      m,
      jIn: me.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0),
      jOut: me.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0),
      bRev: ms.reduce((s,x)=>s+(x.revenue_czk||0),0),
      bProfit: ms.reduce((s,x)=>s+saleProfit(x),0),
    }
  })
  const maxBar = Math.max(...chartData.map(d=>Math.max(d.jIn,d.jOut,d.bRev)),1)
  const activeMonths = [...new Set(entries.map(e=>new Date(e.date+'T12:00:00')).filter(d=>d.getFullYear()===year).map(d=>d.getMonth()))]
  const years = [...new Set([new Date().getFullYear(),...entries.map(e=>new Date(e.date+'T12:00:00').getFullYear())])].sort()
  const lbl = view==='year' ? String(year) : MONTHS[month]+' '+year

  // Categories
  const cats: Record<string,number> = {}
  pEntries.filter(e=>e.type==='expense').forEach(e => { cats[e.category]=(cats[e.category]||0)+e.amount_czk })
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const maxCat = topCats[0]?.[1]||1

  const recentJ = [...pEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)
  const recentB = [...pSales].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4)

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--muted)', fontSize:13, fontWeight:600 }}>Loading...</div>

  // Shared card style
  const S = { card: (accent: string): React.CSSProperties => ({ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, overflow:'hidden', position:'relative' as const }) }

  return (
    <>
      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-.03em' }}>Overview</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, fontWeight:600 }}>{lbl}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
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

      {/* Year + month nav */}
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

      {/* ══════════════════════════════════════
          TWO P&L CARDS SIDE BY SIDE
      ══════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>

        {/* ── JOINT ── */}
        <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border2)', overflow:'hidden' }}>
          {/* Header stripe */}
          <div style={{ background:'linear-gradient(135deg, #1e3a5f 0%, #162d47 100%)', padding:'14px 18px', borderBottom:'1px solid rgba(96,165,250,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(96,165,250,.2)', border:'1px solid rgba(96,165,250,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🏠</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>Joint</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontWeight:500 }}>personal finances</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.5)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>NET</div>
                <div style={{ fontSize:22, fontWeight:800, color:jNet>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{jNet>=0?'+':''}{f(jNet)}</div>
              </div>
            </div>
          </div>
          {/* Body */}
          <div style={{ padding:'14px 18px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.15)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Income</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--green)' }}>{f(jIncome)}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, fontWeight:500 }}>{pEntries.filter(e=>e.type==='income').length} entries</div>
              </div>
              <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Expenses</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(jExpense)}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, fontWeight:500 }}>{pEntries.filter(e=>e.type==='expense').length} entries</div>
              </div>
            </div>
            {/* Contribution split */}
            {totalContrib > 0 && (
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Contributions — all time</div>
                {[
                  { name: myName, contrib: myContrib, owes: myOwes, color: '#60a5fa' },
                  { name: partnerName, contrib: partnerContrib, owes: partnerOwes, color: '#a78bfa' }
                ].map(p => {
                  const pct = totalContrib > 0 ? Math.round(p.contrib / totalContrib * 100) : 0
                  return (
                    <div key={p.name} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{p.name}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {Math.abs(p.owes) < 100 ? (
                            <span style={{ fontSize:10, color:'var(--green)', fontWeight:700 }}>✓ balanced</span>
                          ) : p.owes > 0 ? (
                            <span style={{ fontSize:10, color:'var(--red)', fontWeight:700 }}>owes {f(p.owes)}</span>
                          ) : (
                            <span style={{ fontSize:10, color:'var(--green)', fontWeight:700 }}>+{f(Math.abs(p.owes))} extra</span>
                          )}
                          <span style={{ fontSize:13, fontWeight:800, color:p.color }}>{f(p.contrib)}</span>
                        </div>
                      </div>
                      <div className="bar-track" style={{ height:5 }}>
                        <div className="bar-fill" style={{ width:pct+'%', background:p.color }}/>
                      </div>
                    </div>
                  )
                })}
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                  <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Fair share each</span>
                  <span style={{ fontSize:11, fontWeight:800, color:'var(--acc)' }}>{f(fairShare)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── WATCH BUSINESS ── */}
        <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border2)', overflow:'hidden' }}>
          {/* Header stripe */}
          <div style={{ background:'linear-gradient(135deg, #3d2000 0%, #2d1800 100%)', padding:'14px 18px', borderBottom:'1px solid rgba(251,191,36,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(251,191,36,.2)', border:'1px solid rgba(251,191,36,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>⌚</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>Watch Business</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontWeight:500 }}>sales & operations</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.5)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>PROFIT</div>
                <div style={{ fontSize:22, fontWeight:800, color:bizProfit>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{bizProfit>=0?'+':''}{f(bizProfit)}</div>
              </div>
            </div>
          </div>
          {/* Body */}
          <div style={{ padding:'14px 18px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.15)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Revenue</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--gold)' }}>{f(bizRev)}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, fontWeight:500 }}>{pSales.length} sale{pSales.length!==1?'s':''}</div>
              </div>
              <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Costs</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(bizCosts)}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, fontWeight:500 }}>all in</div>
              </div>
            </div>
            {/* Sales stats */}
            <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Performance — {lbl}</div>
              {pSales.length === 0 ? (
                <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>No sales this period</div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    { l:'Avg revenue', v:f(bizRev/pSales.length) },
                    { l:'Avg profit', v:f(bizProfit/pSales.length) },
                    { l:'Margin', v:bizRev>0?Math.round(bizProfit/bizRev*100)+'%':'—' },
                  ].map(s=>(
                    <div key={s.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:3 }}>{s.l}</div>
                      <div style={{ fontSize:13, fontWeight:800, color:'var(--text)' }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          COMBINED TOTALS BAR
      ══════════════════════════════════════ */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, padding:'16px 20px', marginBottom:14, display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:16, alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>All-time balance (Joint + Business)</div>
          <div style={{ fontSize:28, fontWeight:800, color:allTimeBalance>=0?'var(--green)':'var(--red)', letterSpacing:'-.03em' }}>{f(allTimeBalance)}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, fontWeight:500 }}>
            Joint {f(allJIncome-allJExpense)} &nbsp;·&nbsp; Business {f(allBizProfit)}
          </div>
        </div>
        {[
          { l:'Joint net', v:jNet, c:jNet>=0?'var(--green)':'var(--red)' },
          { l:'Biz profit', v:bizProfit, c:bizProfit>=0?'var(--green)':'var(--red)' },
          { l:'Combined', v:jNet+bizProfit, c:(jNet+bizProfit)>=0?'var(--acc)':'var(--red)' },
        ].map(s=>(
          <div key={s.l} style={{ textAlign:'center', borderLeft:'1px solid var(--border2)', paddingLeft:16 }}>
            <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{s.l} · {lbl}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v>=0?'+':''}{f(s.v)}</div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════
          YEAR CHART
      ══════════════════════════════════════ */}
      {view==='year'&&(
        <div className="card" style={{ marginBottom:14 }}>
          <div className="card-head">
            <span className="card-title">Monthly overview — {year}</span>
            <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--muted)', fontWeight:600 }}>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'#60a5fa', borderRadius:2, marginRight:4 }}/>Joint in</span>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'#f87171', borderRadius:2, marginRight:4 }}/>Joint out</span>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'var(--gold)', borderRadius:2, marginRight:4 }}/>Biz rev</span>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:100, marginBottom:8 }}>
              {chartData.map((d,i)=>(
                <div key={i} style={{ flex:1, display:'flex', gap:1, alignItems:'flex-end', height:'100%' }}>
                  <div title={'Joint in'} style={{ flex:1, background:'#60a5fa', opacity:.7, borderRadius:'2px 2px 0 0', height:d.jIn>0?Math.max(Math.round(d.jIn/maxBar*100),2)+'%':'2px' }}/>
                  <div title={'Joint out'} style={{ flex:1, background:'#f87171', opacity:.7, borderRadius:'2px 2px 0 0', height:d.jOut>0?Math.max(Math.round(d.jOut/maxBar*100),2)+'%':'2px' }}/>
                  <div title={'Biz rev'} style={{ flex:1, background:'var(--gold)', opacity:.7, borderRadius:'2px 2px 0 0', height:d.bRev>0?Math.max(Math.round(d.bRev/maxBar*100),2)+'%':'2px' }}/>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:4 }}>{chartData.map((d,i)=><div key={i} style={{ flex:1, textAlign:'center', fontSize:10, color:'var(--muted)', fontWeight:600 }}>{d.m}</div>)}</div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          RECENT ACTIVITY
      ══════════════════════════════════════ */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Recent activity</div>
      <div className="g2" style={{ marginBottom:14 }}>
        <div className="card">
          <div className="card-head" style={{ borderLeft:'3px solid #60a5fa' }}>
            <span className="card-title">🏠 Joint</span>
            <span className="card-meta">{pEntries.length} entries · {lbl}</span>
          </div>
          <div className="card-body">
            {recentJ.length===0?<div className="empty">No entries for {lbl}</div>:recentJ.map(e=>(
              <div key={e.id} className="tx">
                <div className="tx-icon" style={{ background:e.type==='income'?'rgba(96,165,250,.12)':'var(--surface2)', fontSize:14, border:e.type==='income'?'1px solid rgba(96,165,250,.25)':'1px solid var(--border2)' }}>
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
            <span className="card-title">⌚ Watch Business</span>
            <span className="card-meta">{pSales.length} sales · {lbl}</span>
          </div>
          <div className="card-body">
            {recentB.length===0?<div className="empty">No sales for {lbl}</div>:recentB.map(s=>{
              const pr = saleProfit(s)
              return (
                <div key={s.id} className="tx">
                  <div className="tx-icon" style={{ background:'rgba(251,191,36,.12)', fontSize:14, border:'1px solid rgba(251,191,36,.25)' }}>⌚</div>
                  <div className="tx-info">
                    <div className="tx-name">{s.watch_name||'Watch sale'}</div>
                    <div className="tx-meta">{s.customer}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--gold)' }}>{f(s.revenue_czk||0)}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:pr>=0?'var(--green)':'var(--red)' }}>{pr>=0?'+':''}{f(pr)} profit</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          CATEGORIES + TRIPS
      ══════════════════════════════════════ */}
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-title">Top expense categories</span><span className="card-meta">{lbl}</span></div>
          <div className="card-body">
            {topCats.length===0?<div className="empty">No expenses for {lbl}</div>:topCats.map(([cat,czk])=>(
              <div key={cat} style={{ marginBottom:11 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <span style={{ color:'var(--muted)', fontWeight:600 }}>{CAT_EMOJI[cat]||''} {cat}</span>
                  <span style={{ fontWeight:700 }}>{f(czk)}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width:Math.round(czk/maxCat*100)+'%', background:'var(--acc)' }}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">✈️ Trips</span><span className="card-meta">{trips.length} planned</span></div>
          <div className="card-body">
            {trips.length===0?<div className="empty">No trips yet</div>:trips.slice(0,4).map(t=>{
              const spent = entries.filter(e=>e.source_id===t.id).reduce((s,x)=>s+x.amount_czk,0)
              const pct = t.budget_czk>0?Math.min(Math.round(spent/t.budget_czk*100),100):0
              return (
                <div key={t.id} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                    <span style={{ fontWeight:700 }}>✈️ {t.name}</span>
                    <span style={{ color:'var(--blue)', fontWeight:700 }}>{f(t.budget_czk)}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width:pct+'%', background:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }}/></div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginTop:4, fontWeight:500 }}>
                    <span>{pct}% used</span><span>{f(t.budget_czk-spent)} left</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
