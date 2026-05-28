'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, MONTHS, MONTHS_S, CAT_EMOJI } from '@/types'
import { useCurrencyRates, fmtR } from '@/hooks/useCurrencyRates'

interface HHEntry { id:string; type:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; person:string; date:string; source:string }
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

  // ── Household P&L ──
  const hhIncome = pEntries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const hhExpense = pEntries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)
  const hhNet = hhIncome - hhExpense

  // ── Business P&L ──
  function saleProfitCZK(s: BizSale) {
    return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.sup_shipping_czk||0)-(s.service_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0)
  }
  const bizRevenue = pSales.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const bizCosts = pSales.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const bizProfit = bizRevenue - bizCosts

  // ── Combined ──
  const combinedIn = hhIncome + bizRevenue
  const combinedOut = hhExpense + bizCosts
  const combinedNet = hhNet + bizProfit

  // ── All-time numbers ──
  const allHHIncome = entries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const allHHExpense = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)
  const allBizProfit = sales.reduce((s,x)=>s+saleProfitCZK(x),0)
  const allTimeBalance = allHHIncome - allHHExpense + allBizProfit

  // ── 50/50 Contribution tracker ──
  // Only manual income entries count as personal contributions
  const allContributions = entries.filter(e => e.type==='income' && e.source==='manual')
  const myContribCZK = allContributions.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const partnerContribCZK = allContributions.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const totalContrib = myContribCZK + partnerContribCZK
  const fairShare = totalContrib / 2  // what each person should have put in
  const myOwes = fairShare - myContribCZK    // positive = I owe, negative = partner owes me
  const partnerOwes = fairShare - partnerContribCZK

  // Period contributions
  const pContrib = pEntries.filter(e=>e.type==='income'&&e.source==='manual')
  const pMyContrib = pContrib.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const pPartnerContrib = pContrib.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)

  // ── Chart data ──
  const chartData = MONTHS_S.map((m,i) => {
    const me = entries.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const ms = sales.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const inc = me.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)+ms.reduce((s,x)=>s+(x.revenue_czk||0),0)
    const exp = me.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)+ms.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
    return { m, inc, exp }
  })
  const maxBar = Math.max(...chartData.map(d=>Math.max(d.inc,d.exp)),1)
  const activeMonths = [...new Set(entries.map(e=>new Date(e.date+'T12:00:00')).filter(d=>d.getFullYear()===year).map(d=>d.getMonth()))]
  const years = [...new Set([new Date().getFullYear(),...entries.map(e=>new Date(e.date+'T12:00:00').getFullYear())])].sort()
  const lbl = view==='year' ? String(year) : MONTHS[month]+' '+year

  // Category breakdown
  const cats: Record<string,number> = {}
  pEntries.filter(e=>e.type==='expense').forEach(e => { cats[e.category]=(cats[e.category]||0)+e.amount_czk })
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const maxCat = topCats[0]?.[1]||1

  const recentHH = [...pEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)
  const recentBiz = [...pSales].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4)

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--muted)', fontSize:13 }}>Loading...</div>

  const INP_SM: React.CSSProperties = { background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:7, padding:'4px 10px', fontSize:12, color:'var(--text)', fontFamily:'inherit', outline:'none', cursor:'pointer' }

  return (
    <>
      {/* ── Top controls ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, letterSpacing:'-.02em' }}>Dashboard</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, fontWeight:500 }}>{lbl}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={fetchAll} style={{ ...INP_SM, padding:'5px 10px' }}>↻</button>
          <div className="toggle">
            <button className={'toggle-btn '+(view==='month'?'active':'')} onClick={()=>setView('month')}>Month</button>
            <button className={'toggle-btn '+(view==='year'?'active':'')} onClick={()=>setView('year')}>Year</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Currency</span>
            <div className="toggle">
              <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>saveCur('CZK')}>CZK</button>
              <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>saveCur('EUR')}>EUR</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Year / Month nav ── */}
      <div style={{ display:'flex', gap:4, marginBottom:8 }}>
        {years.map(y=><button key={y} onClick={()=>setYear(y)} style={{ padding:'3px 12px', border:'1px solid var(--border2)', borderRadius:20, fontSize:12, cursor:'pointer', background:y===year?'var(--acc2)':'transparent', color:y===year?'#fff':'var(--muted)', fontFamily:'inherit', fontWeight:600 }}>{y}</button>)}
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

      {/* ══ SECTION 1: COMBINED OVERVIEW ══ */}
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--acc)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>⚡ Combined overview</div>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10, marginBottom:12 }}>
          {/* Big balance card */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(249,115,22,.06) 0%, transparent 60%)', pointerEvents:'none' }} />
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>All-time balance</div>
            <div style={{ fontSize:32, fontWeight:800, letterSpacing:'-.03em', color:allTimeBalance>=0?'var(--green)':'var(--red)', marginBottom:4 }}>{f(allTimeBalance)}</div>
            <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>Household + Business combined</div>
            <div style={{ display:'flex', gap:16, marginTop:12 }}>
              <div><div style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>HH net</div><div style={{ fontSize:13, fontWeight:700, color:(allHHIncome-allHHExpense)>=0?'var(--green)':'var(--red)' }}>{f(allHHIncome-allHHExpense)}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>Biz profit</div><div style={{ fontSize:13, fontWeight:700, color:allBizProfit>=0?'var(--green)':'var(--red)' }}>{f(allBizProfit)}</div></div>
            </div>
          </div>
          <div className="stat s-green"><div className="stat-lbl">In ({lbl})</div><div className="stat-val" style={{ color:'var(--green)' }}>{f(combinedIn)}</div><div className="stat-sub">HH + Business</div></div>
          <div className="stat s-red"><div className="stat-lbl">Out ({lbl})</div><div className="stat-val" style={{ color:'var(--red)' }}>{f(combinedOut)}</div><div className="stat-sub">Expenses + costs</div></div>
          <div className={'stat '+(combinedNet>=0?'s-acc':'s-red')}><div className="stat-lbl">Net ({lbl})</div><div className="stat-val" style={{ color:combinedNet>=0?'var(--acc)':'var(--red)' }}>{combinedNet>=0?'+':''}{f(combinedNet)}</div><div className="stat-sub">Combined</div></div>
        </div>
      </div>

      {/* ══ SECTION 2: HH vs BIZ SPLIT ══ */}
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Breakdown — {lbl}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          {/* Household */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12, padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>🏠 Household</div>
              <div style={{ fontSize:14, fontWeight:700, color:hhNet>=0?'var(--green)':'var(--red)' }}>{hhNet>=0?'+':''}{f(hhNet)}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>INCOME</div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--green)' }}>{f(hhIncome)}</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>EXPENSES</div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--red)' }}>{f(hhExpense)}</div>
              </div>
            </div>
            {/* Contribution split */}
            {(pMyContrib > 0 || pPartnerContrib > 0) && (
              <div style={{ marginTop:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:6 }}>CONTRIBUTIONS</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <span style={{ color:'var(--muted)', fontWeight:500 }}>{myName}</span>
                  <span style={{ fontWeight:700, color:'var(--blue)' }}>{f(pMyContrib)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                  <span style={{ color:'var(--muted)', fontWeight:500 }}>{partnerName}</span>
                  <span style={{ fontWeight:700, color:'var(--purple)' }}>{f(pPartnerContrib)}</span>
                </div>
              </div>
            )}
          </div>
          {/* Business */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12, padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>⌚ Watch Business</div>
              <div style={{ fontSize:14, fontWeight:700, color:bizProfit>=0?'var(--green)':'var(--red)' }}>{bizProfit>=0?'+':''}{f(bizProfit)}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>REVENUE</div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--gold)' }}>{f(bizRevenue)}</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>COSTS</div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--red)' }}>{f(bizCosts)}</div>
              </div>
            </div>
            {pSales.length > 0 && (
              <div style={{ marginTop:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4 }}>SALES THIS PERIOD</div>
                <div style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>{pSales.length} watch{pSales.length!==1?'es':''} sold · {f(bizRevenue/pSales.length)}/avg revenue</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ SECTION 3: 50/50 BALANCE ══ */}
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>⚖️ 50/50 Contribution balance — all time</div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12, padding:'16px', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:6 }}>TOTAL CONTRIBUTED</div>
              <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>{f(totalContrib)}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>combined</div>
            </div>
            <div style={{ textAlign:'center', borderLeft:'1px solid var(--border2)', borderRight:'1px solid var(--border2)', padding:'0 12px' }}>
              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:6 }}>FAIR SHARE EACH</div>
              <div style={{ fontSize:22, fontWeight:800, color:'var(--acc)' }}>{f(fairShare)}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>50% of total</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:6 }}>BALANCE STATUS</div>
              {Math.abs(myOwes) < 100 ? (
                <div style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>✓ Balanced</div>
              ) : myOwes > 0 ? (
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--red)' }}>{myName} owes</div>
                  <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(myOwes)}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--red)' }}>{partnerName} owes</div>
                  <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(Math.abs(myOwes))}</div>
                </div>
              )}
            </div>
          </div>

          {/* Per-person bars */}
          {totalContrib > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { name: myName, contrib: myContribCZK, owes: myOwes, color: 'var(--blue)' },
                { name: partnerName, contrib: partnerContribCZK, owes: partnerOwes, color: 'var(--purple)' }
              ].map(p => {
                const pct = totalContrib > 0 ? Math.round(p.contrib / totalContrib * 100) : 0
                const atFairShare = Math.abs(p.owes) < 100
                return (
                  <div key={p.name} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, fontWeight:500 }}>contributed {pct}% of total</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:16, fontWeight:800, color:p.color }}>{f(p.contrib)}</div>
                        {atFairShare ? (
                          <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, marginTop:2 }}>✓ fair share met</div>
                        ) : p.owes > 0 ? (
                          <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, marginTop:2 }}>still owes {f(p.owes)}</div>
                        ) : (
                          <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, marginTop:2 }}>+{f(Math.abs(p.owes))} extra</div>
                        )}
                      </div>
                    </div>
                    <div className="bar-track" style={{ height:6 }}>
                      <div className="bar-fill" style={{ width:pct+'%', background:p.color }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginTop:4, fontWeight:500 }}>
                      <span>{pct}% contributed</span>
                      <span>fair share: {f(fairShare)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 4: CHART (year only) ══ */}
      {view==='year'&&(
        <div style={{ marginBottom:6 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Monthly overview — {year}</div>
          <div className="card" style={{ marginBottom:12 }}>
            <div className="card-body">
              <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90, marginBottom:8 }}>
                {chartData.map((d,i)=>(
                  <div key={i} style={{ flex:1, display:'flex', gap:2, alignItems:'flex-end', height:'100%' }}>
                    <div style={{ flex:1, background:'var(--green)', opacity:.7, borderRadius:'3px 3px 0 0', height:d.inc>0?Math.max(Math.round(d.inc/maxBar*100),3)+'%':'2px' }} />
                    <div style={{ flex:1, background:'var(--red)', opacity:.7, borderRadius:'3px 3px 0 0', height:d.exp>0?Math.max(Math.round(d.exp/maxBar*100),3)+'%':'2px' }} />
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:6 }}>{chartData.map((d,i)=><div key={i} style={{ flex:1, textAlign:'center', fontSize:10, color:'var(--muted)', fontWeight:600 }}>{d.m}</div>)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SECTION 5: RECENT ACTIVITY ══ */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Recent activity</div>
      <div className="g2" style={{ marginBottom:12 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">🏠 Household</span><span className="card-meta">{pEntries.length} entries · {lbl}</span></div>
          <div className="card-body">
            {recentHH.length===0?<div className="empty">No entries for {lbl}</div>:recentHH.map(e=>(
              <div key={e.id} className="tx">
                <div className="tx-icon" style={{ background:e.type==='income'?'rgba(34,197,94,.12)':'var(--surface2)', fontSize:14, border:e.type==='income'?'1px solid rgba(34,197,94,.25)':'1px solid var(--border2)' }}>
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
          <div className="card-head"><span className="card-title">⌚ Business sales</span><span className="card-meta">{pSales.length} sales · {lbl}</span></div>
          <div className="card-body">
            {recentBiz.length===0?<div className="empty">No sales for {lbl}</div>:recentBiz.map(s=>{
              const pr = saleProfitCZK(s)
              return (
                <div key={s.id} className="tx">
                  <div className="tx-icon" style={{ background:'rgba(251,191,36,.12)', fontSize:14, border:'1px solid rgba(251,191,36,.25)' }}>⌚</div>
                  <div className="tx-info">
                    <div className="tx-name">{s.watch_name||'Watch sale'}</div>
                    <div className="tx-meta">{s.customer} · {fmtDate(s.date)}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--gold)' }}>{f(s.revenue_czk||0)}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:pr>=0?'var(--green)':'var(--red)' }}>{pr>=0?'+':''}{f(pr)} profit</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══ SECTION 6: CATEGORY + TRIPS ══ */}
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-title">Top expense categories</span><span className="card-meta">{lbl}</span></div>
          <div className="card-body">
            {topCats.length===0?<div className="empty">No expenses for {lbl}</div>:topCats.map(([cat,czk])=>(
              <div key={cat} style={{ marginBottom:11 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <span style={{ color:'var(--muted)', fontWeight:500 }}>{CAT_EMOJI[cat]||''} {cat}</span>
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
