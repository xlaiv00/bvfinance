'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, MONTHS, MONTHS_S, CAT_EMOJI } from '@/types'
import { useCurrencyRates, fmtR } from '@/hooks/useCurrencyRates'

interface HHEntry { id:string; type:string; description:string; amount_czk:number; display_amount:number; display_currency:string; category:string; person:string; date:string; source:string; source_id?:string }
interface BizSale { id:string; date:string; watch_name:string; customer:string; revenue_czk:number; watch_cost_czk:number; sup_shipping_czk:number; service_czk:number; shipping_czk:number; ads_czk:number }
interface Trip { id:string; name:string; budget_czk:number; date_from?:string; date_to?:string }
interface BizContrib { id:string; person:string; amount_czk:number; display_amount:number; display_currency:string; date:string; note:string }
type Cur = 'CZK'|'EUR'


interface ContribCardProps {
  title: string; myName: string; partnerName: string
  myC: number; partnerC: number; total: number; diff: number
  color1: string; color2: string; f: (n:number)=>string
  householdId: string; supabase: any; category: string
  onAdd: (entry: any) => void
}

function ContribCard({ title, myName, partnerName, myC, partnerC, total, diff, color1, color2, f, householdId, supabase, category, onAdd }: ContribCardProps) {
  const [adding, setAdding] = useState(false)
  const [who, setWho] = useState('you')
  const [amt, setAmt] = useState('')
  const [cur, setCur] = useState('CZK')
  const [loading, setLoading] = useState(false)
  const rates = useCurrencyRates()

  // target = whatever the OTHER person put in (to match them)
  const target = Math.max(myC, partnerC)
  const balanced = Math.abs(diff) < 100
  // who needs to top up?
  const behindName  = diff > 0 ? partnerName : myName    // whoever put in less
  const behindOwes  = Math.abs(diff)

  async function add() {
    if (!amt) return
    setLoading(true)
    const a = parseFloat(amt)
    const czk = a * (cur==='EUR'?rates.EUR_CZK:cur==='USD'?rates.USD_CZK:1)
    const { data } = await supabase.from('hh_entries').insert({
      household_id: householdId, type:'income',
      description: (who==='you'?myName:partnerName)+' — '+category,
      amount_czk: czk, display_amount: a, display_currency: cur,
      category, person: who, date: new Date().toISOString().split('T')[0], source:'manual'
    }).select().single()
    if (data) onAdd(data)
    setAmt(''); setAdding(false); setLoading(false)
  }

  const INP: React.CSSProperties = { background:'var(--surface3)', border:'1px solid var(--border2)', borderRadius:7, padding:'6px 9px', fontSize:12, color:'var(--text)', fontFamily:'inherit', outline:'none' }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700 }}>{title}</span>
        <button onClick={()=>setAdding(a=>!a)} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:7, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          {adding?'Cancel':'+ Add'}
        </button>
      </div>

      {adding && (
        <div style={{ padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border2)', display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Who</label>
            <select value={who} onChange={e=>setWho(e.target.value)} style={INP}>
              <option value="you">{myName}</option>
              <option value="partner">{partnerName}</option>
            </select>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Amount</label>
            <input type="number" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0" style={{ ...INP, width:90 }} onKeyDown={e=>e.key==='Enter'&&add()} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>Currency</label>
            <select value={cur} onChange={e=>setCur(e.target.value)} style={INP}>
              <option value="CZK">CZK</option><option value="EUR">EUR</option>
            </select>
          </div>
          <button onClick={add} disabled={loading||!amt} style={{ background:'var(--green)', border:'none', color:'#fff', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', opacity:!amt?.5:1 }}>
            {loading?'...':'Save'}
          </button>
        </div>
      )}

      <div style={{ padding:'14px 16px' }}>
        {total === 0 ? (
          <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500, textAlign:'center', padding:'8px 0' }}>No contributions yet</div>
        ) : (
          <>
            {/* Status banner */}
            <div style={{ background:balanced?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)', border:`1px solid ${balanced?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`, borderRadius:9, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, fontWeight:700, color:balanced?'var(--green)':'var(--red)' }}>
                {balanced ? '✓ Balanced' : behindName+' still needs to add'}
              </span>
              {!balanced && <span style={{ fontSize:16, fontWeight:800, color:'var(--red)' }}>{f(behindOwes)}</span>}
            </div>
            {/* Per person */}
            {[
              { name:myName, contrib:myC, color:color1 },
              { name:partnerName, contrib:partnerC, color:color2 },
            ].map(p => {
              const pct = target>0?Math.min(Math.round(p.contrib/target*100),100):0
              const thisOwes = target - p.contrib
              return (
                <div key={p.name} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.name}</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:15, fontWeight:800, color:p.color }}>{f(p.contrib)}</span>
                      {thisOwes > 100 && <div style={{ fontSize:10, color:'var(--red)', fontWeight:700 }}>needs {f(thisOwes)} more</div>}
                      {thisOwes <= 100 && <div style={{ fontSize:10, color:'var(--green)', fontWeight:700 }}>✓ matched</div>}
                    </div>
                  </div>
                  <div className="bar-track" style={{ height:6 }}>
                    <div className="bar-fill" style={{ width:pct+'%', background:p.color }}/>
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3, fontWeight:600, textAlign:'right' }}>
                    target: {f(target)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardClient({ householdId, myName, partnerName }: { householdId:string; myName:string; partnerName:string }) {
  const [entries, setEntries] = useState<HHEntry[]>([])
  const [sales, setSales] = useState<BizSale[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [bizContribs, setBizContribs] = useState<BizContrib[]>([])
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
    const [e, s, t, bc] = await Promise.all([
      supabase.from('hh_entries').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('biz_sales').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('trips').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
      supabase.from('biz_contributions').select('*').eq('household_id', householdId).order('date', { ascending: false }),
    ])
    setEntries(e.data || [])
    setSales(s.data || [])
    setTrips(t.data || [])
    setBizContribs(bc.data || [])
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

  // Joint
  const jIn  = pEntries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const jOut = pEntries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)
  const jNet = jIn - jOut
  const allJIn  = entries.filter(e=>e.type==='income').reduce((s,x)=>s+x.amount_czk,0)
  const allJOut = entries.filter(e=>e.type==='expense').reduce((s,x)=>s+x.amount_czk,0)

  // Business
  function saleProfit(s: BizSale) { return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.sup_shipping_czk||0)-(s.service_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0) }
  const bRev    = pSales.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const bCosts  = pSales.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const bProfit = bRev - bCosts
  const allBizProfit = sales.reduce((s,x)=>s+saleProfit(x),0)
  const allBalance   = (allJIn - allJOut) + allBizProfit

  // 50/50 — split joint vs business contributions
  const allContribs = entries.filter(e=>e.type==='income'&&e.source==='manual')
  // Joint contributions = category is NOT 'Business Contribution'
  const jContribs     = allContribs.filter(e=>e.category!=='Business Contribution')
  const jMyC          = jContribs.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const jPartnerC     = jContribs.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const jTotal        = jMyC + jPartnerC
  // Business contributions = category === 'Business Contribution'
  const bContribs     = allContribs.filter(e=>e.category==='Business Contribution')
  const bMyC          = bContribs.filter(e=>e.person==='you').reduce((s,x)=>s+x.amount_czk,0)
  const bPartnerC     = bContribs.filter(e=>e.person==='partner').reduce((s,x)=>s+x.amount_czk,0)
  const bTotal        = bMyC + bPartnerC
  // Correct math: owe = difference to match whoever put in more
  // e.g. partner puts 5000, I put 3000 → I owe 2000 (not 1000)
  const jDiff  = jMyC - jPartnerC   // positive = partner owes me, negative = I owe partner
  const bDiff  = bMyC - bPartnerC

  // Unified feed — merge joint + biz, sort by date, take 8
  type FeedItem = { id:string; date:string; label:string; sub:string; amount:string; amtColor:string; icon:string; iconBg:string; iconBorder:string }
  const feed: FeedItem[] = [
    ...pEntries.slice(0,20).map(e => ({
      id: 'e'+e.id, date: e.date,
      label: e.description,
      sub: e.category + ' · ' + (e.person==='you'?myName:e.person==='partner'?partnerName:'Joint'),
      amount: (e.type==='income'?'+':'-') + fmtR(e.amount_czk, cur, rates),
      amtColor: e.type==='income'?'var(--green)':'var(--red)',
      icon: e.type==='income'?'↓':(CAT_EMOJI[e.category]||'📦'),
      iconBg: e.type==='income'?'rgba(96,165,250,.12)':'var(--surface2)',
      iconBorder: e.type==='income'?'1px solid rgba(96,165,250,.25)':'1px solid var(--border2)',
    })),
    ...pSales.slice(0,20).map(s => {
      const pr = saleProfit(s)
      return {
        id: 's'+s.id, date: s.date,
        label: s.watch_name || 'Watch sale',
        sub: s.customer ? s.customer : 'Watch business',
        amount: '+'+fmtR(s.revenue_czk||0, cur, rates),
        amtColor: 'var(--gold)',
        icon: '⌚',
        iconBg: 'rgba(251,191,36,.12)',
        iconBorder: '1px solid rgba(251,191,36,.25)',
      }
    }),
  ].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10)

  const activeMonths = [...new Set(entries.map(e=>new Date(e.date+'T12:00:00')).filter(d=>d.getFullYear()===year).map(d=>d.getMonth()))]
  const years = [...new Set([new Date().getFullYear(),...entries.map(e=>new Date(e.date+'T12:00:00').getFullYear())])].sort()
  const lbl = view==='year' ? String(year) : MONTHS[month]+' '+year

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--muted)', fontSize:13, fontWeight:600 }}>Loading...</div>

  return (
    <>
      {/* ── Controls ── */}
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

      {/* ── Year / Month nav ── */}
      <div style={{ display:'flex', gap:4, marginBottom:8 }}>
        {years.map(y=><button key={y} onClick={()=>setYear(y)} style={{ padding:'3px 12px', border:'1px solid var(--border2)', borderRadius:20, fontSize:12, cursor:'pointer', background:y===year?'var(--acc2)':'transparent', color:y===year?'#fff':'var(--muted)', fontFamily:'inherit', fontWeight:700 }}>{y}</button>)}
      </div>
      {view==='month' && (
        <div className="timeline">
          {MONTHS_S.map((m,i)=>(
            <button key={i} onClick={()=>setMonth(i)} className={'tl-btn '+(i===month?'active ':'')+(activeMonths.includes(i)?'has-data':'')}>
              <span className="tl-m">{m}</span><span className="tl-dot">●</span>
            </button>
          ))}
        </div>
      )}
      {view==='year' && <div style={{ marginBottom:20 }}/>}

      {/* ═══════════════════════════════
          ZONE 1 — TWO P&L CARDS
      ═══════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>

        {/* Joint */}
        <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border2)', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#1a2d4a 0%,#111e30 100%)', padding:'16px 18px', borderBottom:'1px solid rgba(96,165,250,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(96,165,250,.18)', border:'1px solid rgba(96,165,250,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🏠</div>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Joint</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', fontWeight:500 }}>personal finances</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>NET</div>
                <div style={{ fontSize:24, fontWeight:800, color:jNet>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{jNet>=0?'+':''}{f(jNet)}</div>
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
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
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Watch Business</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', fontWeight:500 }}>sales & operations</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>PROFIT</div>
                <div style={{ fontSize:24, fontWeight:800, color:bProfit>=0?'#4ade80':'#f87171', letterSpacing:'-.02em' }}>{bProfit>=0?'+':''}{f(bProfit)}</div>
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'rgba(251,191,36,.07)', border:'1px solid rgba(251,191,36,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Revenue</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--gold)' }}>{f(bRev)}</div>
              </div>
              <div style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.18)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'var(--red)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Costs</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--red)' }}>{f(bCosts)}</div>
              </div>
            </div>
            {/* Business stats */}
            <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Performance — {lbl}</div>
              {pSales.length===0
                ? <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>No sales this period</div>
                : <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    {[
                      { l:'Sales', v:String(pSales.length) },
                      { l:'Avg profit', v:f(bProfit/pSales.length) },
                      { l:'Margin', v:bRev>0?Math.round(bProfit/bRev*100)+'%':'—' },
                    ].map(s=>(
                      <div key={s.l} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:3 }}>{s.l}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════
          ZONE 2 — COMBINED BAR
      ═══════════════════════════════ */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, padding:'16px 20px', marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:0, alignItems:'center' }}>
          <div style={{ paddingRight:20 }}>
            <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>All-time balance</div>
            <div style={{ fontSize:30, fontWeight:800, color:allBalance>=0?'var(--green)':'var(--red)', letterSpacing:'-.03em', lineHeight:1 }}>{f(allBalance)}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, fontWeight:500 }}>Joint {f(allJIn-allJOut)} · Business {f(allBizProfit)}</div>
          </div>
          {[
            { l:'Joint net', v:jNet, c:jNet>=0?'var(--green)':'var(--red)' },
            { l:'Biz profit', v:bProfit, c:bProfit>=0?'var(--green)':'var(--red)' },
            { l:'Combined', v:jNet+bProfit, c:(jNet+bProfit)>=0?'var(--acc)':'var(--red)' },
          ].map((s,i)=>(
            <div key={s.l} style={{ textAlign:'center', borderLeft:'1px solid var(--border2)', paddingLeft:0 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{s.l} · {lbl}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v>=0?'+':''}{f(s.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════
          ZONE 3 — CONTRIBUTIONS (split)
      ═══════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>

        {/* Joint contributions */}
        <div style={{ background:'var(--surface)', border:'1px solid rgba(96,165,250,.3)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#1a2d4a 0%,#111e30 100%)', padding:'12px 18px', borderBottom:'1px solid rgba(96,165,250,.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>🏠 Joint contributions</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontWeight:600 }}>all time</div>
          </div>
          <div style={{ padding:'14px 18px' }}>
            {totalC === 0
              ? <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>No contributions yet — add income in Joint tab</div>
              : <>
                  {[
                    { name:myName, contrib:myC, color:'#60a5fa', diff: jDiff },
                    { name:partnerName, contrib:partnerC, color:'#a78bfa', diff: -jDiff },
                  ].map(p=>{
                    const target = Math.max(myC, partnerC)
                    const owes = target - p.contrib
                    const balanced = Math.abs(owes) < 100
                    return (
                      <div key={p.name} style={{ marginBottom:14 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.name}</span>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:16, fontWeight:800, color:p.color }}>{f(p.contrib)}</div>
                            <div style={{ fontSize:11, fontWeight:700, color:balanced?'var(--green)':owes>0?'var(--red)':'var(--green)' }}>
                              {balanced?'✓ balanced':owes>0?'owes '+f(owes):'+'+f(Math.abs(owes))+' extra'}
                            </div>
                          </div>
                        </div>
                        <div className="bar-track" style={{ height:6 }}>
                          <div className="bar-fill" style={{ width:target>0?Math.round(p.contrib/target*100)+'%':'0%', background:p.color }}/>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--muted)', fontWeight:600 }}>Total contributed</span>
                    <span style={{ fontWeight:800 }}>{f(totalC)}</span>
                  </div>
                  {Math.abs(jDiff) >= 100 && (
                    <div style={{ marginTop:8, background:jDiff>0?'rgba(251,191,36,.08)':'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, color:'var(--gold)', textAlign:'center' }}>
                      {jDiff>0 ? `${partnerName} needs to add ${f(Math.abs(jDiff))} to match` : `${myName} needs to add ${f(Math.abs(jDiff))} to match`}
                    </div>
                  )}
                </>
            }
          </div>
        </div>

        {/* Business contributions */}
        <div style={{ background:'var(--surface)', border:'1px solid rgba(251,191,36,.3)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#3d2000 0%,#271500 100%)', padding:'12px 18px', borderBottom:'1px solid rgba(251,191,36,.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>⌚ Business contributions</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontWeight:600 }}>all time</div>
          </div>
          <div style={{ padding:'14px 18px' }}>
            {myBizC === 0 && partnerBizC === 0
              ? <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>No business contributions yet — add in Watch Business tab</div>
              : <>
                  {[
                    { name:myName, contrib:myBizC, color:'#60a5fa' },
                    { name:partnerName, contrib:partnerBizC, color:'#a78bfa' },
                  ].map(p=>{
                    const target = Math.max(myBizC, partnerBizC)
                    const owes = target - p.contrib
                    const balanced = Math.abs(owes) < 100
                    return (
                      <div key={p.name} style={{ marginBottom:14 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.name}</span>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:16, fontWeight:800, color:p.color }}>{f(p.contrib)}</div>
                            <div style={{ fontSize:11, fontWeight:700, color:balanced?'var(--green)':owes>0?'var(--red)':'var(--green)' }}>
                              {balanced?'✓ balanced':owes>0?'owes '+f(owes):'+'+f(Math.abs(owes))+' extra'}
                            </div>
                          </div>
                        </div>
                        <div className="bar-track" style={{ height:6 }}>
                          <div className="bar-fill" style={{ width:target>0?Math.round(p.contrib/target*100)+'%':'0%', background:p.color }}/>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--muted)', fontWeight:600 }}>Total invested</span>
                    <span style={{ fontWeight:800 }}>{f(myBizC+partnerBizC)}</span>
                  </div>
                  {Math.abs(bizDiff) >= 100 && (
                    <div style={{ marginTop:8, background:'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, color:'var(--gold)', textAlign:'center' }}>
                      {bizDiff>0 ? `${partnerName} needs to invest ${f(Math.abs(bizDiff))} to match` : `${myName} needs to invest ${f(Math.abs(bizDiff))} to match`}
                    </div>
                  )}
                </>
            }
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════
          ZONE 4 — BOTH RECENT ACTIVITIES
      ═══════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        {/* Joint — left */}
        <div className="card">
          <div className="card-head" style={{ borderLeft:'3px solid #60a5fa' }}>
            <span className="card-title">🏠 Joint — recent</span>
            <span className="card-meta">{pEntries.length} entries · {lbl}</span>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {pEntries.length===0
              ? <div className="empty">No entries for {lbl}</div>
              : [...pEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).map(e=>(
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
              ))
            }
          </div>
        </div>

        {/* Watch Business — right */}
        <div className="card">
          <div className="card-head" style={{ borderLeft:'3px solid var(--gold)' }}>
            <span className="card-title">⌚ Watch Business — recent</span>
            <span className="card-meta">{pSales.length} sales · {lbl}</span>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {pSales.length===0
              ? <div className="empty">No sales for {lbl}</div>
              : [...pSales].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).map(s=>{
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
                })
            }
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════
          ZONE 5 — TRIPS
      ═══════════════════════════════ */}
      <div className="card">
        <div className="card-head"><span className="card-title">✈️ Trips</span><span className="card-meta">{trips.length} planned</span></div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:16 }}>
          {trips.length===0
            ? <div className="empty">No trips yet</div>
            : trips.map(t=>{
                const spent = entries.filter(e=>e.source_id===t.id).reduce((s,x)=>s+x.amount_czk,0)
                const pct = t.budget_czk>0?Math.min(Math.round(spent/t.budget_czk*100),100):0
                const rem = t.budget_czk - spent
                return (
                  <div key={t.id}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:13, fontWeight:700 }}>{t.name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--blue)' }}>{f(t.budget_czk)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width:pct+'%', background:pct>90?'var(--red)':pct>70?'var(--gold)':'var(--blue)' }}/>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginTop:4, fontWeight:600 }}>
                      <span>{f(spent)} spent</span>
                      <span style={{ color:rem>=0?'var(--green)':'var(--red)' }}>{rem>=0?f(rem)+' left':f(Math.abs(rem))+' over'}</span>
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    </>
  )
}
