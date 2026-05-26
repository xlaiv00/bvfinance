'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtCur, fromCZK, toCZK, today } from '@/types'

const RATES: Record<string,number> = { CZK:1, EUR:24.5, USD:22.8, VND:0.000895 }
const CURS = ['CZK','EUR','USD','VND'] as const
type Cur = typeof CURS[number]

function fmtC(czk: number, c: Cur) { return fmtCur(czk, c as any) }
function fmtOrig(czk: number, c: string) {
  const v = czk / (RATES[c]||1)
  if (c==='VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  if (c==='CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (c==='EUR') return '€' + v.toFixed(2)
  if (c==='USD') return '$' + v.toFixed(2)
  return v.toFixed(2)
}
function tc(a: number, c: string) { return a * (RATES[c]||1) }
function fc(czk: number, c: string) { return czk / (RATES[c]||1) }
function pc(czk: number) { return czk>0?'var(--green)':czk<0?'var(--red)':'var(--muted)' }

interface Sale { id:string; date:string; customer:string; watch_name:string; revenue_czk:number; revenue_cur:string; watch_cost_czk:number; watch_cost_cur:string; shipping_czk:number; shipping_cur:string; ads_czk:number; ads_cur:string; notes:string }
interface Inv { id:string; watch_name:string; brand:string; model:string; purchase_czk:number; purchase_cur:string; asking_czk:number; asking_cur:string; status:string; notes:string; date_purchased:string }

type Form = { date:string; customer:string; watch_name:string; revenue:string; revenue_cur:Cur; watch_cost:string; watch_cost_cur:Cur; shipping:string; shipping_cur:Cur; ads:string; ads_cur:Cur; notes:string }
const EF = (): Form => ({ date:today(), customer:'', watch_name:'', revenue:'', revenue_cur:'CZK', watch_cost:'', watch_cost_cur:'VND', shipping:'', shipping_cur:'CZK', ads:'', ads_cur:'CZK', notes:'' })

const STATUS = { in_stock:{l:'🟢 In stock',c:'var(--green)'}, listed:{l:'🟡 Listed',c:'var(--gold)'}, reserved:{l:'🔵 Reserved',c:'var(--blue)'}, sold:{l:'🔴 Sold',c:'var(--red)'} } as any

export default function BusinessClient({ householdId }: { householdId:string }) {
  const [sales, setSales] = useState<Sale[]>([])
  const [inv, setInv] = useState<Inv[]>([])
  const [tab, setTab] = useState<'sales'|'analytics'|'inventory'>('sales')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState<Form>(EF())
  const [loading, setLoading] = useState(false)
  const [dc, setDc] = useState<Cur>('CZK')
  const [filterMonth, setFilterMonth] = useState('all')
  // Inventory form state
  const [showInvForm, setShowInvForm] = useState(false)
  const [editInvId, setEditInvId] = useState<string|null>(null)
  const [iName, setIName] = useState(''); const [iBrand, setIBrand] = useState(''); const [iModel, setIModel] = useState('')
  const [iPurchase, setIPurchase] = useState(''); const [iPurchaseCur, setIPurchaseCur] = useState<Cur>('VND')
  const [iAsking, setIAsking] = useState(''); const [iAskingCur, setIAskingCur] = useState<Cur>('CZK')
  const [iStatus, setIStatus] = useState('in_stock'); const [iNotes, setINotes] = useState(''); const [iDate, setIDate] = useState(today())
  const supabase = createClient()

  useEffect(() => { load() }, [])
  async function load() {
    const [s, i] = await Promise.all([
      supabase.from('biz_sales').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('biz_inventory').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])
    if (s.data) setSales(s.data as Sale[])
    if (i.data) setInv(i.data as Inv[])
  }

  function p(patch: Partial<Form>) { setForm(prev => ({ ...prev, ...patch })) }
  function profitCZK(s: Sale) { return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0) }

  const months = sales.map(s=>s.date?.slice(0,7)).filter((m,i,a):m is string=>Boolean(m)&&a.indexOf(m)===i).sort().reverse()
  const filtered = filterMonth==='all'?sales:sales.filter(s=>s.date?.startsWith(filterMonth))
  const totRev = filtered.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const totCost = filtered.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const totProfit = totRev - totCost
  const margin = totRev>0?Math.round(totProfit/totRev*100):0

  function openEdit(s: Sale) {
    setForm({ date:s.date, customer:s.customer, watch_name:s.watch_name,
      revenue:fc(s.revenue_czk,s.revenue_cur).toFixed(s.revenue_cur==='VND'?0:2).replace(/\.00$/,''), revenue_cur:s.revenue_cur as Cur,
      watch_cost:fc(s.watch_cost_czk,s.watch_cost_cur).toFixed(s.watch_cost_cur==='VND'?0:2).replace(/\.00$/,''), watch_cost_cur:s.watch_cost_cur as Cur,
      shipping:fc(s.shipping_czk,s.shipping_cur).toFixed(2).replace(/\.00$/,''), shipping_cur:s.shipping_cur as Cur,
      ads:fc(s.ads_czk,s.ads_cur).toFixed(2).replace(/\.00$/,''), ads_cur:s.ads_cur as Cur,
      notes:s.notes })
    setEditId(s.id); setShowForm(true)
  }

  async function save() {
    setLoading(true)
    const revCZK = tc(parseFloat(form.revenue)||0, form.revenue_cur)
    const row = { household_id:householdId, date:form.date, customer:form.customer, watch_name:form.watch_name,
      revenue_czk:revCZK, revenue_cur:form.revenue_cur,
      watch_cost_czk:tc(parseFloat(form.watch_cost)||0,form.watch_cost_cur), watch_cost_cur:form.watch_cost_cur,
      shipping_czk:tc(parseFloat(form.shipping)||0,form.shipping_cur), shipping_cur:form.shipping_cur,
      ads_czk:tc(parseFloat(form.ads)||0,form.ads_cur), ads_cur:form.ads_cur,
      notes:form.notes }
    if (editId) {
      const {data} = await supabase.from('biz_sales').update(row).eq('id',editId).select().single()
      if (data) setSales(p=>p.map(s=>s.id===editId?data as Sale:s))
    } else {
      const {data} = await supabase.from('biz_sales').insert(row).select().single()
      if (data) setSales(p=>[data as Sale,...p])
    }
    setShowForm(false); setEditId(null); setLoading(false)
  }

  async function del(id: string) {
    await supabase.from('biz_sales').delete().eq('id',id)
    setSales(p=>p.filter(s=>s.id!==id))
  }

  function openEditInv(i: Inv) {
    setIName(i.watch_name); setIBrand(i.brand); setIModel(i.model)
    setIPurchase(fc(i.purchase_czk,i.purchase_cur).toFixed(i.purchase_cur==='VND'?0:2).replace(/\.00$/,''))
    setIPurchaseCur(i.purchase_cur as Cur)
    setIAsking(fc(i.asking_czk,i.asking_cur).toFixed(2).replace(/\.00$/,''))
    setIAskingCur(i.asking_cur as Cur)
    setIStatus(i.status); setINotes(i.notes); setIDate(i.date_purchased||today())
    setEditInvId(i.id); setShowInvForm(true)
  }

  async function saveInv() {
    setLoading(true)
    const row = { household_id:householdId, watch_name:iName, brand:iBrand, model:iModel,
      purchase_czk:tc(parseFloat(iPurchase)||0,iPurchaseCur), purchase_cur:iPurchaseCur,
      asking_czk:tc(parseFloat(iAsking)||0,iAskingCur), asking_cur:iAskingCur,
      status:iStatus, notes:iNotes, date_purchased:iDate||null }
    if (editInvId) { const{data}=await supabase.from('biz_inventory').update(row).eq('id',editInvId).select().single(); if(data) setInv(p=>p.map(i=>i.id===editInvId?data as Inv:i)) }
    else { const{data}=await supabase.from('biz_inventory').insert(row).select().single(); if(data) setInv(p=>[data as Inv,...p]) }
    setShowInvForm(false); setEditInvId(null); setLoading(false)
    setIName(''); setIBrand(''); setIModel(''); setIPurchase(''); setIAsking(''); setINotes(''); setIDate(today())
  }

  async function delInv(id: string) {
    await supabase.from('biz_inventory').delete().eq('id',id)
    setInv(p=>p.filter(i=>i.id!==id))
  }

  const INP: React.CSSProperties = { background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:8, padding:'8px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none', width:'100%' }
  const fRev = tc(parseFloat(form.revenue)||0,form.revenue_cur)
  const fCost = tc(parseFloat(form.watch_cost)||0,form.watch_cost_cur)+tc(parseFloat(form.shipping)||0,form.shipping_cur)+tc(parseFloat(form.ads)||0,form.ads_cur)
  const fProfit = fRev - fCost

  // Analytics
  const allRev = sales.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const allProfit = sales.reduce((s,x)=>s+profitCZK(x),0)
  const monthStats = months.map(m => {
    const ms = sales.filter(s=>s.date?.startsWith(m))
    const r=ms.reduce((s,x)=>s+(x.revenue_czk||0),0), c=ms.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
    return { m, count:ms.length, rev:r, profit:r-c, margin:r>0?Math.round((r-c)/r*100):0 }
  })
  const maxMonthR = Math.max(...monthStats.map(m=>m.rev),1)

  // Inventory stats
  const inStockInv = inv.filter(i=>i.status==='in_stock').length
  const listedInv = inv.filter(i=>i.status==='listed').length
  const invVal = inv.filter(i=>i.status!=='sold').reduce((s,i)=>s+i.purchase_czk,0)
  const potRev = inv.filter(i=>i.status!=='sold'&&i.asking_czk>0).reduce((s,i)=>s+i.asking_czk,0)

  return (
    <div style={{ paddingBottom:40 }}>
      <div className="tabs">
        {[['sales','💰 Sales'],['analytics','📈 Analytics'],['inventory','📦 Inventory']].map(([k,l])=>(
          <button key={k} className={'tab-btn '+(tab===k?'active':'')} onClick={()=>setTab(k as any)}>{l}</button>
        ))}
      </div>

      {/* ─── SALES ─── */}
      {tab==='sales'&&<>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{ ...INP, width:'auto', fontSize:12 }}>
              <option value="all">All time</option>
              {months.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} sales</span>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div className="toggle">{CURS.map(c=><button key={c} className={'toggle-btn '+(dc===c?'active':'')} onClick={()=>setDc(c)} style={{ fontSize:11 }}>{c}</button>)}</div>
            <button onClick={()=>{setForm(EF());setEditId(null);setShowForm(true)}} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>+ Add sale</button>
          </div>
        </div>

        <div className="g4" style={{ marginBottom:14 }}>
          {[{l:'Revenue',v:totRev,c:'var(--green)'},{l:'Total cost',v:totCost,c:'var(--red)'},{l:'Profit',v:totProfit,c:pc(totProfit)},{l:'Margin',v:null,d:margin+'%',c:pc(totProfit)}].map(s=>(
            <div key={s.l} className="stat" style={{ padding:'12px 16px' }}>
              <div className="stat-lbl">{s.l}</div>
              <div style={{ fontSize:16, fontWeight:500, color:s.c, marginTop:4 }}>{s.v!==null?fmtC(s.v,dc):s.d}</div>
            </div>
          ))}
        </div>

        {showForm&&<div className="card" style={{ marginBottom:14 }}>
          <div className="card-head"><span className="card-title">{editId?'Edit sale':'New sale'}</span><button onClick={()=>setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>✕</button></div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Date</label><input type="date" value={form.date} onChange={e=>p({date:e.target.value})} style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Customer</label><input value={form.customer} onChange={e=>p({customer:e.target.value})} placeholder="Customer name" style={INP} /></div>
              <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Watch name</label><input value={form.watch_name} onChange={e=>p({watch_name:e.target.value})} placeholder="e.g. Tissot Seastar C350" style={INP} /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              {([['Sell price','revenue','revenue_cur','var(--green)'],['Watch cost (supplier)','watch_cost','watch_cost_cur',null],['Shipping','shipping','shipping_cur',null],['Ads / Meta','ads','ads_cur',null]] as [string,keyof Form,keyof Form,string|null][]).map(([l,k,ck,col])=>(
                <div key={String(k)}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{l}</label>
                  <div style={{ display:'flex', gap:4 }}>
                    <input type="number" value={form[k] as string} onChange={e=>p({[k]:e.target.value})} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px', color:col||'var(--text)' }} />
                    <select value={form[ck] as string} onChange={e=>p({[ck]:e.target.value as Cur})} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select>
                  </div>
                </div>
              ))}
            </div>
            {(fRev>0||fCost>0)&&<div style={{ background:'var(--surface2)', borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 }}>
                {[{l:'Revenue',v:fRev,c:'var(--green)'},{l:'Watch',v:tc(parseFloat(form.watch_cost)||0,form.watch_cost_cur),c:'var(--muted)'},{l:'Shipping',v:tc(parseFloat(form.shipping)||0,form.shipping_cur),c:'var(--muted)'},{l:'Ads',v:tc(parseFloat(form.ads)||0,form.ads_cur),c:'var(--muted)'}].map(r=>(
                  <div key={r.l} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{r.l}</div>
                    <div style={{ fontSize:12, fontWeight:500, color:r.c }}>{Math.round(r.v).toLocaleString('cs-CZ')} Kč</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>Estimated profit</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:18, fontWeight:600, color:pc(fProfit) }}>{Math.round(fProfit).toLocaleString('cs-CZ')} Kč</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>≈ {fmtC(fProfit,'EUR')} · {fmtC(fProfit,'USD')} · {fmtC(fProfit,'VND')}</div>
                </div>
              </div>
            </div>}
            <div style={{ marginBottom:12 }}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label><input value={form.notes} onChange={e=>p({notes:e.target.value})} placeholder="Optional" style={INP} /></div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} disabled={loading} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Saving…':editId?'Update':'Add sale'}</button>
              <button onClick={()=>setShowForm(false)} style={{ background:'none', border:'0.5px solid var(--border2)', color:'var(--muted)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 240px', gap:16, alignItems:'start' }}>
          <div className="card"><div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
                {['Date','Customer','Watch','Revenue','Cost','Profit',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3?'right':'left', fontWeight:500, color:'var(--muted)', whiteSpace:'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.length===0?<tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>No sales yet</td></tr>:
                filtered.map((s,i)=>{
                  const pr=profitCZK(s); const m=s.revenue_czk>0?Math.round(pr/s.revenue_czk*100):0
                  return <tr key={s.id} style={{ borderBottom:i<filtered.length-1?'0.5px solid var(--border)':'none', cursor:'pointer' }} onClick={()=>openEdit(s)}>
                    <td style={{ padding:'9px 12px', color:'var(--muted)' }}>{s.date}</td>
                    <td style={{ padding:'9px 12px', fontWeight:500 }}>{s.customer}</td>
                    <td style={{ padding:'9px 12px', color:'var(--muted)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.watch_name}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>
                      <div style={{ color:'var(--green)', fontWeight:500 }}>{fmtC(s.revenue_czk,dc)}</div>
                      {s.revenue_cur!==dc&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(s.revenue_czk,s.revenue_cur)}</div>}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{fmtC((s.watch_cost_czk||0)+(s.shipping_czk||0)+(s.ads_czk||0),dc)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>
                      <div style={{ fontWeight:600, color:pc(pr) }}>{fmtC(pr,dc)}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{m}%</div>
                    </td>
                    <td style={{ padding:'9px 8px' }}><button onClick={e=>{e.stopPropagation();del(s.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:13 }}>✕</button></td>
                  </tr>
                })}
              </tbody>
              {filtered.length>0&&<tfoot><tr style={{ borderTop:'1px solid var(--border2)', background:'var(--surface2)' }}>
                <td colSpan={3} style={{ padding:'9px 12px', fontWeight:600 }}>Total ({filtered.length})</td>
                <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--green)', fontWeight:600 }}>{fmtC(totRev,dc)}</td>
                <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--red)', fontWeight:600 }}>{fmtC(totCost,dc)}</td>
                <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700, color:pc(totProfit) }}>{fmtC(totProfit,dc)}</td>
                <td/>
              </tr></tfoot>}
            </table>
          </div></div>

          <div style={{ display:'flex', flexDirection:'column', gap:12, position:'sticky', top:16 }}>
            <div className="card" style={{ padding:'16px', textAlign:'center' }}>
              <div className="stat-lbl">Profit margin</div>
              <div style={{ fontSize:30, fontWeight:500, color:pc(totProfit), letterSpacing:'-.02em', marginTop:6 }}>{margin}%</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{filtered.length} sales · avg {fmtC(filtered.length>0?totProfit/filtered.length:0,dc)}/sale</div>
            </div>
            <div className="card"><div className="card-head"><span className="card-title">Cost breakdown</span></div>
              <div style={{ padding:'6px 0' }}>
                {[{l:'Watch costs',v:filtered.reduce((s,x)=>s+(x.watch_cost_czk||0),0)},{l:'Shipping',v:filtered.reduce((s,x)=>s+(x.shipping_czk||0),0)},{l:'Ads',v:filtered.reduce((s,x)=>s+(x.ads_czk||0),0)}].map(r=>(
                  <div key={r.l} style={{ padding:'6px 16px 8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}><span style={{ color:'var(--muted)' }}>{r.l}</span><span style={{ fontWeight:500 }}>{fmtC(r.v,dc)}</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width:totCost>0?Math.round(r.v/totCost*100)+'%':'0%', background:'var(--red)', opacity:.7 }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card"><div className="card-head"><span className="card-title">Rates to CZK</span></div>
              <div style={{ padding:'4px 0' }}>
                {['EUR','USD','VND'].map(c=><div key={c} style={{ display:'flex', justifyContent:'space-between', padding:'5px 16px', fontSize:12 }}><span style={{ color:'var(--muted)' }}>1 {c}</span><span style={{ fontWeight:500 }}>{RATES[c]} Kč</span></div>)}
              </div>
            </div>
          </div>
        </div>
      </>}

      {/* ─── ANALYTICS ─── */}
      {tab==='analytics'&&<>
        <div className="g4" style={{ marginBottom:16 }}>
          {[{l:'Total revenue',v:fmtC(allRev,dc),c:'var(--green)',s:'all time'},{l:'Total profit',v:fmtC(allProfit,dc),c:pc(allProfit),s:'all time'},{l:'Avg per sale',v:sales.length>0?fmtC(allProfit/sales.length,dc):'—',c:'var(--acc)',s:sales.length+' sales'},{l:'Overall margin',v:allRev>0?Math.round(allProfit/allRev*100)+'%':'—',c:'var(--blue)',s:'profit/revenue'}].map(s=>(
            <div key={s.l} className="stat" style={{ padding:'14px 16px' }}>
              <div className="stat-lbl">{s.l}</div>
              <div style={{ fontSize:18, fontWeight:500, color:s.c, marginTop:6 }}>{s.v}</div>
              <div className="stat-sub">{s.s}</div>
            </div>
          ))}
        </div>

        {monthStats.length>0&&<div className="card" style={{ marginBottom:14 }}>
          <div className="card-head"><span className="card-title">Monthly performance</span>
            <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--muted)' }}>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'var(--green)', borderRadius:2, marginRight:4 }} />Revenue</span>
              <span><span style={{ display:'inline-block', width:8, height:8, background:'var(--acc)', borderRadius:2, marginRight:4 }} />Profit</span>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90, marginBottom:8 }}>
              {monthStats.map((m,i)=>(
                <div key={i} style={{ flex:1, display:'flex', gap:2, alignItems:'flex-end', height:'100%' }}>
                  <div style={{ flex:1, background:'var(--green)', opacity:.6, borderRadius:'3px 3px 0 0', height:Math.max(Math.round(m.rev/maxMonthR*100),2)+'%' }} />
                  <div style={{ flex:1, background:m.profit>=0?'var(--acc)':'var(--red)', opacity:.8, borderRadius:'3px 3px 0 0', height:Math.max(Math.round(Math.abs(m.profit)/maxMonthR*100),2)+'%' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>{monthStats.map((m,i)=><div key={i} style={{ flex:1, textAlign:'center', fontSize:10, color:'var(--muted)' }}>{m.m.slice(5)}</div>)}</div>
          </div>
        </div>}

        <div className="g2" style={{ marginBottom:14 }}>
          <div className="card"><div className="card-head"><span className="card-title">Month breakdown</span></div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
                  {['Month','Sales','Revenue','Profit','Margin'].map((h,i)=><th key={i} style={{ padding:'7px 12px', textAlign:i>0?'right':'left', fontWeight:500, color:'var(--muted)' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {monthStats.map((m,i)=>(
                    <tr key={i} style={{ borderBottom:'0.5px solid var(--border)' }}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>{m.m}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--muted)' }}>{m.count}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--green)' }}>{fmtC(m.rev,dc)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:500, color:pc(m.profit) }}>{fmtC(m.profit,dc)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:m.margin>=30?'var(--green)':m.margin>=15?'var(--gold)':'var(--red)' }}>{m.margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card"><div className="card-head"><span className="card-title">All sales ranked</span></div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
                  {['#','Watch','Revenue','Profit','Margin'].map((h,i)=><th key={i} style={{ padding:'7px 10px', textAlign:i>=2?'right':'left', fontWeight:500, color:'var(--muted)' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...sales].sort((a,b)=>profitCZK(b)-profitCZK(a)).map((s,i)=>{
                    const pr=profitCZK(s); const m=s.revenue_czk>0?Math.round(pr/s.revenue_czk*100):0
                    return <tr key={s.id} style={{ borderBottom:'0.5px solid var(--border)' }}>
                      <td style={{ padding:'7px 10px', color:i===0?'var(--gold)':i===1?'var(--muted)':i===2?'#cd7f32':'var(--faint)', fontWeight:i<3?600:400 }}>{i+1}</td>
                      <td style={{ padding:'7px 10px', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.watch_name||s.customer}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'var(--green)' }}>{fmtC(s.revenue_czk,dc)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:500, color:pc(pr) }}>{fmtC(pr,dc)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:m>=30?'var(--green)':m>=15?'var(--gold)':'var(--red)' }}>{m}%</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </>}

      {/* ─── INVENTORY ─── */}
      {tab==='inventory'&&<>
        <div className="g4" style={{ marginBottom:14 }}>
          {[{l:'In stock',v:String(inStockInv),c:'var(--green)',s:'watches'},{l:'Listed',v:String(listedInv),c:'var(--gold)',s:'for sale'},{l:'Stock value',v:fmtC(invVal,'CZK'),c:'var(--red)',s:'purchase cost'},{l:'Potential revenue',v:invVal>0?fmtC(potRev,'CZK'):'—',c:'var(--green)',s:'if all sold'}].map(s=>(
            <div key={s.l} className="stat" style={{ padding:'12px 16px' }}>
              <div className="stat-lbl">{s.l}</div>
              <div style={{ fontSize:15, fontWeight:500, color:s.c, marginTop:4 }}>{s.v}</div>
              <div className="stat-sub">{s.s}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
          <button onClick={()=>{setShowInvForm(true);setEditInvId(null)}} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>+ Add watch</button>
        </div>
        {showInvForm&&<div className="card" style={{ marginBottom:14 }}>
          <div className="card-head"><span className="card-title">{editInvId?'Edit watch':'Add to inventory'}</span><button onClick={()=>setShowInvForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>✕</button></div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Watch name</label><input value={iName} onChange={e=>setIName(e.target.value)} placeholder="e.g. Tissot Seastar" style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Brand</label><input value={iBrand} onChange={e=>setIBrand(e.target.value)} placeholder="Brand" style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Model / reference</label><input value={iModel} onChange={e=>setIModel(e.target.value)} placeholder="Model ref" style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Status</label>
                <select value={iStatus} onChange={e=>setIStatus(e.target.value)} style={INP}>
                  <option value="in_stock">🟢 In stock</option><option value="listed">🟡 Listed</option><option value="reserved">🔵 Reserved</option><option value="sold">🔴 Sold</option>
                </select>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Purchase price</label>
                <div style={{ display:'flex', gap:4 }}><input type="number" value={iPurchase} onChange={e=>setIPurchase(e.target.value)} style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} /><select value={iPurchaseCur} onChange={e=>setIPurchaseCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Asking price</label>
                <div style={{ display:'flex', gap:4 }}><input type="number" value={iAsking} onChange={e=>setIAsking(e.target.value)} style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} /><select value={iAskingCur} onChange={e=>setIAskingCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Date purchased</label><input type="date" value={iDate} onChange={e=>setIDate(e.target.value)} style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label><input value={iNotes} onChange={e=>setINotes(e.target.value)} placeholder="Condition, source…" style={INP} /></div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveInv} disabled={loading} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Saving…':editInvId?'Update':'Add watch'}</button>
              <button onClick={()=>setShowInvForm(false)} style={{ background:'none', border:'0.5px solid var(--border2)', color:'var(--muted)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>}
        <div className="card"><div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
              {['Watch','Brand','Status','Bought for','Asking','Margin',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3?'right':'left', fontWeight:500, color:'var(--muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {inv.length===0?<tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>No watches yet</td></tr>:
              inv.map((item,i)=>{
                const pot=item.asking_czk-item.purchase_czk; const pm=item.asking_czk>0?Math.round(pot/item.asking_czk*100):0
                return <tr key={item.id} style={{ borderBottom:i<inv.length-1?'0.5px solid var(--border)':'none', cursor:'pointer', opacity:item.status==='sold'?.5:1 }} onClick={()=>openEditInv(item)}>
                  <td style={{ padding:'9px 12px', fontWeight:500, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.watch_name}</td>
                  <td style={{ padding:'9px 12px', color:'var(--muted)' }}>{item.brand}{item.model&&<div style={{ fontSize:10, color:'var(--faint)' }}>{item.model}</div>}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ fontSize:11, fontWeight:500, color:STATUS[item.status]?.c, background:STATUS[item.status]?.c+'18', padding:'2px 8px', borderRadius:20 }}>{STATUS[item.status]?.l}</span></td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--red)' }}>
                    <div>{item.purchase_czk>0?fmtC(item.purchase_czk,'CZK'):'—'}</div>
                    {item.purchase_cur!=='CZK'&&item.purchase_czk>0&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(item.purchase_czk,item.purchase_cur)}</div>}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--green)' }}>{item.asking_czk>0?fmtC(item.asking_czk,item.asking_cur as Cur):'—'}</td>
                  <td style={{ padding:'9px 12px', textAlign:'right' }}>
                    {item.asking_czk>0&&item.purchase_czk>0?<><div style={{ fontWeight:500, color:pc(pot) }}>{fmtC(pot,'CZK')}</div><div style={{ fontSize:10, color:pm>=30?'var(--green)':pm>=15?'var(--gold)':'var(--red)' }}>{pm}%</div></>:'—'}
                  </td>
                  <td style={{ padding:'9px 8px' }}><button onClick={e=>{e.stopPropagation();delInv(item.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:13 }}>✕</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div></div>
      </>}
    </div>
  )
}
