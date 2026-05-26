'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, MONTHS, MONTHS_S } from '@/types'
import { useCurrencyRates, fmtR } from '@/hooks/useCurrencyRates'

interface HHEntry { id:string; type:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; person:string; date:string; source:string }
interface BizSale { id:string; date:string; revenue_czk:number; watch_cost_czk:number; shipping_czk:number; ads_czk:number }
interface Trip { id:string; name:string; budget_czk:number; date_from?:string; date_to?:string }

type Cur = 'CZK'|'EUR'

export default function DashboardClient({ householdId, myName, partnerName }: { householdId:string; myName:string; partnerName:string }) {
  const [entries, setEntries] = useState<HHEntry[]>([])
  const [sales, setSales] = useState<BizSale[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [cur, setCur] = useState<Cur>(() => typeof window !== 'undefined' ? (localStorage.getItem('cur') as Cur || 'CZK') : 'CZK')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [view, setView] = useState<'month'|'year'>('month')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const rates = useCurrencyRates()

  function saveCur(c: Cur) { setCur(c); localStorage.setItem('cur', c) }
  function f(czk: number) { return fmtR(czk, cur, rates) }

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

  function filterByPeriod<T extends { date: string }>(arr: T[]) {
    if (view === 'year') return arr.filter(x => new Date(x.date + 'T12:00:00').getFullYear() === year)
    return arr.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d.getFullYear() === year && d.getMonth() === month })
  }

  const periodEntries = filterByPeriod(entries)
  const periodSales = filterByPeriod(sales)

  // Household P&L
  const hhIncome = periodEntries.filter(e => e.type === 'income').reduce((s,x) => s + x.amount_czk, 0)
  const hhExpense = periodEntries.filter(e => e.type === 'expense').reduce((s,x) => s + x.amount_czk, 0)
  const hhNet = hhIncome - hhExpense

  // Business P&L
  const bizRevenue = periodSales.reduce((s,x) => s + (x.revenue_czk||0), 0)
  const bizCosts = periodSales.reduce((s,x) => s + (x.watch_cost_czk||0) + (x.shipping_czk||0) + (x.ads_czk||0), 0)
  const bizProfit = bizRevenue - bizCosts

  // Combined
  const totalIn = hhIncome + bizRevenue
  const totalOut = hhExpense + bizCosts
  const totalNet = hhNet + bizProfit

  // All time balance
  const allTimeIn = entries.filter(e => e.type === 'income').reduce((s,x) => s + x.amount_czk, 0)
    + sales.reduce((s,x) => s + (x.revenue_czk||0), 0)
  const allTimeOut = entries.filter(e => e.type === 'expense').reduce((s,x) => s + x.amount_czk, 0)
    + sales.reduce((s,x) => s + (x.watch_cost_czk||0) + (x.shipping_czk||0) + (x.ads_czk||0), 0)

  // Monthly chart data
  const chartData = MONTHS_S.map((m, i) => {
    const me = entries.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const ms = sales.filter(x => { const d = new Date(x.date+'T12:00:00'); return d.getFullYear()===year&&d.getMonth()===i })
    const inc = me.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0) + ms.reduce((s,x)=>s+(x.revenue_czk||0),0)
    const exp = me.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0) + ms.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
    return { m, inc, exp, net: inc - exp }
  })
  const maxBar = Math.max(...chartData.map(d => Math.max(d.inc, d.exp)), 1)

  // Active months
  const activeMonths = [...new Set(entries.map(e => new Date(e.date+'T12:00:00')).filter(d=>d.getFullYear()===year).map(d=>d.getMonth()))]

  const lbl = view === 'year' ? String(year) : MONTHS[month] + ' ' + year
  const years = [...new Set([new Date().getFullYear(), ...entries.map(e => new Date(e.date+'T12:00:00').getFullYear())])].sort()

  // Recent activity
  const recentHH = [...periodEntries].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5)
  const recentBiz = [...periodSales].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 4)

  // Category breakdown
  const cats: Record<string,number> = {}
  periodEntries.filter(e=>e.type==='expense').forEach(e => { cats[e.category] = (cats[e.category]||0) + e.amount_czk })
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const maxCat = topCats[0]?.[1]||1

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--muted)', fontSize:13 }}>Loading...</div>

  return (
    <>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:500, letterSpacing:'-.01em' }}>Overview</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{lbl}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchAll} style={{ background:'var(--surface2)', border:'0.5px solid var(--border)', borderRadius:7, padding:'4px 10px', fontSize:12, color:'var(--muted)', cursor:'pointer', fontFamily:'inherit' }}>↻</button>
          <div className="toggle">
            <button className={'toggle-btn '+(view==='month'?'active':'')} onClick={()=>setView('month')}>Month</button>
            <button className={'toggle-btn '+(view==='year'?'active':'')} onClick={()=>setView('year')}>Year</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Currency</span>
            <div className="toggle">
              <button className={'toggle-btn '+(cur==='CZK'?'active':'')} onClick={()=>saveCur('CZK')}>CZK</button>
              <button className={'toggle-btn '+(cur==='EUR'?'active':'')} onClick={()=>saveCur('EUR')}>EUR</button>
            </div>
          </div>
        </div>
      </div>

      {/* Year row */}
      <div style={{ display:'flex', gap:4, marginBottom:8 }}>
        {years.map(y => <button key={y} onClick={()=>setYear(y)} style={{ padding:'3px 12px', border:'0.5px solid var(--border)', borderRadius:20, fontSize:12, cursor:'pointer', background:y===year?'var(--faint)':'transparent', color:y===year?'var(--text)':'var(--muted)', fontFamily:'inherit', fontWeight:y===year?500:400 }}>{y}</button>)}
      </div>

      {/* Month strip */}
      {view === 'month' && (
        <div className="timeline">
          {MONTHS_S.map((m,i) => (
            <button key={i} onClick={()=>setMonth(i)} className={'tl-btn '+(i===month?'active ':'')+(activeMonths.includes(i)?'has-data':'')}>
              <span className="tl-m">{m}</span><span className="tl-dot">●</span>
            </button>
          ))}
        </div>
      )}
      {view === 'year' && <div style={{ marginBottom:20 }} />}

      {/* Top KPIs - 2 columns: Household | Business */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        {/* Household column */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 2px' }}>🏠 Household</div>
          <div className="g3">
            <div className="stat s-green"><div className="stat-lbl">Income</div><div className="stat-val" style={{ color:'var(--green)', fontSize:17 }}>{f(hhIncome)}</div></div>
            <div className="stat s-red"><div className="stat-lbl">Expenses</div><div className="stat-val" style={{ color:'var(--red)', fontSize:17 }}>{f(hhExpense)}</div></div>
            <div className={'stat '+(hhNet>=0?'s-acc':'s-red')}><div className="stat-lbl">Net</div><div className="stat-val" style={{ color:hhNet>=0?'var(--acc)':'var(--red)', fontSize:17 }}>{hhNet>=0?'+':''}{f(hhNet)}</div></div>
          </div>
        </div>
        {/* Business column */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 2px' }}>⌚ Watch Business</div>
          <div className="g3">
            <div className="stat s-gold"><div className="stat-lbl">Revenue</div><div className="stat-val" style={{ color:'var(--gold)', fontSize:17 }}>{f(bizRevenue)}</div></div>
            <div className="stat s-red"><div className="stat-lbl">Costs</div><div className="stat-val" style={{ color:'var(--red)', fontSize:17 }}>{f(bizCosts)}</div></div>
            <div className={'stat '+(bizProfit>=0?'s-green':'s-red')}><div className="stat-lbl">Profit</div><div className="stat-val" style={{ color:bizProfit>=0?'var(--green)':'var(--red)', fontSize:17 }}>{bizProfit>=0?'+':''}{f(bizProfit)}</div></div>
          </div>
        </div>
      </div>

      {/* Combined net + all-time balance */}
      <div className="g2" style={{ marginBottom:16 }}>
        <div className={'stat '+(totalNet>=0?'s-acc':'s-red')} style={{ padding:'16px 18px' }}>
          <div className="stat-lbl">Combined net — {lbl}</div>
          <div style={{ fontSize:26, fontWeight:500, color:totalNet>=0?'var(--acc)':'var(--red)', letterSpacing:'-.02em', marginTop:6 }}>{totalNet>=0?'+':''}{f(totalNet)}</div>
          <div className="stat-sub">{f(totalIn)} in · {f(totalOut)} out</div>
        </div>
        <div className="stat s-blue" style={{ padding:'16px 18px' }}>
          <div className="stat-lbl">All-time balance</div>
          <div style={{ fontSize:26, fontWeight:500, color:'var(--blue)', letterSpacing:'-.02em', marginTop:6 }}>{f(allTimeIn - allTimeOut)}</div>
          <div className="stat-sub">Total money in minus total out</div>
        </div>
      </div>

      {/* Year chart */}
      {view === 'year' && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-head">
            <span className="card-title">Monthly overview — {year}</span>
            <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--muted)' }}>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'var(--green)', borderRadius:2, marginRight:4 }} />In</span>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'var(--red)', borderRadius:2, marginRight:4 }} />Out</span>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90, marginBottom:8 }}>
              {chartData.map((d,i) => (
                <div key={i} style={{ flex:1, display:'flex', gap:2, alignItems:'flex-end', height:'100%' }}>
                  <div title={MONTHS[i]+' income'} style={{ flex:1, background:'var(--green)', opacity:.7, borderRadius:'3px 3px 0 0', height:d.inc>0?Math.max(Math.round(d.inc/maxBar*100),3)+'%':'2px' }} />
                  <div title={MONTHS[i]+' expenses'} style={{ flex:1, background:'var(--red)', opacity:.7, borderRadius:'3px 3px 0 0', height:d.exp>0?Math.max(Math.round(d.exp/maxBar*100),3)+'%':'2px' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>{chartData.map((d,i) => <div key={i} style={{ flex:1, textAlign:'center', fontSize:10, color:'var(--muted)' }}>{d.m}</div>)}</div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="g2" style={{ marginBottom:16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">🏠 Recent household</span><span className="card-meta">{periodEntries.length} entries</span></div>
          <div className="card-body">
            {recentHH.length === 0 ? <div className="empty">No entries for {lbl}</div> : recentHH.map(e => (
              <div key={e.id} className="tx">
                <div className="tx-icon" style={{ background: e.type==='income'?'rgba(79,216,150,.12)':'var(--surface2)', fontSize:14 }}>
                  {e.type==='income'?'↓':'📦'}
                </div>
                <div className="tx-info">
                  <div className="tx-name">{e.description}</div>
                  <div className="tx-meta">{e.category} · {e.person==='you'?myName:e.person==='partner'?partnerName:'Joint'}</div>
                </div>
                <div className="tx-date">{fmtDate(e.date)}</div>
                <div className={'tx-amt '+(e.type==='income'?'pos':'neg')}>{fmtR(e.amount_czk, cur, rates)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">⌚ Recent sales</span><span className="card-meta">{periodSales.length} sales</span></div>
          <div className="card-body">
            {recentBiz.length === 0 ? <div className="empty">No sales for {lbl}</div> : recentBiz.map(s => {
              const profit = (s.revenue_czk||0) - (s.watch_cost_czk||0) - (s.shipping_czk||0) - (s.ads_czk||0)
              return (
                <div key={s.id} className="tx">
                  <div className="tx-icon" style={{ background:'rgba(245,166,35,.12)', fontSize:14 }}>⌚</div>
                  <div className="tx-info">
                    <div className="tx-name">{(s as any).watch_name || 'Watch sale'}</div>
                    <div className="tx-meta">{(s as any).customer}</div>
                  </div>
                  <div className="tx-date">{fmtDate(s.date)}</div>
                  <div className="tx-amt pos">{f(profit)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Category + Trips */}
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-title">Household expenses by category</span><span className="card-meta">{lbl}</span></div>
          <div className="card-body">
            {topCats.length === 0 ? <div className="empty">No expenses for {lbl}</div> : topCats.map(([cat, czk]) => (
              <div key={cat} style={{ marginBottom:11 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <span style={{ color:'var(--muted)' }}>{cat}</span>
                  <span style={{ fontWeight:500 }}>{f(czk)}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width:Math.round(czk/maxCat*100)+'%', background:'var(--acc)' }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">✈️ Trips</span><span className="card-meta">{trips.length} planned</span></div>
          <div className="card-body">
            {trips.length === 0 ? <div className="empty">No trips yet</div> : trips.slice(0,4).map(t => {
              const spent = entries.filter(e => e.source_id === t.id).reduce((s,x) => s+x.amount_czk, 0)
              const pct = t.budget_czk > 0 ? Math.min(Math.round(spent/t.budget_czk*100), 100) : 0
              return (
                <div key={t.id} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                    <span style={{ fontWeight:500 }}>✈️ {t.name}</span>
                    <span style={{ color:'var(--blue)', fontWeight:500 }}>{f(t.budget_czk)}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width:pct+'%', background:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }} /></div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginTop:3 }}>
                    <span>{pct}% used</span><span>{f(t.budget_czk - spent)} left</span>
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
