'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { today } from '@/types'
import { useCurrencyRates, toCZKr, fromCZKr, fmtR } from '@/hooks/useCurrencyRates'

const CURS = ['CZK','EUR','USD','VND'] as const
type Cur = typeof CURS[number]

function pc(czk: number) { return czk>0?'var(--green)':czk<0?'var(--red)':'var(--muted)' }

interface Sale { id:string; date:string; customer:string; watch_name:string; revenue_czk:number; revenue_cur:string; watch_cost_czk:number; watch_cost_cur:string; sup_shipping_czk:number; sup_shipping_cur:string; service_czk:number; service_cur:string; shipping_czk:number; shipping_cur:string; ads_czk:number; ads_cur:string; notes:string }
interface Inv { id:string; watch_name:string; brand:string; model:string; purchase_czk:number; purchase_cur:string; supplier_shipping_czk:number; supplier_shipping_cur:string; service_czk:number; service_cur:string; asking_czk:number; asking_cur:string; status:string; notes:string; date_purchased:string }

type Form = { date:string; customer:string; watch_name:string; revenue:string; revenue_cur:Cur; watch_cost:string; watch_cost_cur:Cur; sup_shipping:string; sup_shipping_cur:Cur; service:string; service_cur:Cur; shipping:string; shipping_cur:Cur; ads:string; ads_cur:Cur; notes:string }
const EF = (): Form => ({ date:today(), customer:'', watch_name:'', revenue:'', revenue_cur:'CZK', watch_cost:'', watch_cost_cur:'VND', sup_shipping:'', sup_shipping_cur:'CZK', service:'', service_cur:'CZK', shipping:'', shipping_cur:'CZK', ads:'', ads_cur:'CZK', notes:'' })

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
  const [iSupShip, setISupShip] = useState('')
  const [iSupShipCur, setISupShipCur] = useState<Cur>('CZK')
  const [iService, setIService] = useState('')
  const [iServiceCur, setIServiceCur] = useState<Cur>('CZK')
  const supabase = createClient()
  const rates = useCurrencyRates()

  function fmtC(czk: number, c: string) { return fmtR(czk, c, rates) }
  function tc(a: number, c: string) { return toCZKr(a, c, rates) }
  function fc(czk: number, c: string) { return fromCZKr(czk, c, rates) }

  function fmtOrig(czk: number, cur: string, r?: any) {
    const rr = r || rates
    if (cur === 'CZK') return Math.round(czk).toLocaleString('cs-CZ') + ' Kč'
    const val = fromCZKr(czk, cur, rr)
    if (cur === 'VND') return Math.round(val).toLocaleString('vi-VN') + ' ₫'
    if (cur === 'EUR') return '€' + val.toFixed(2)
    if (cur === 'USD') return '$' + val.toFixed(2)
    return val.toFixed(2)
  }

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
  function profitCZK(s: Sale) { return (s.revenue_czk||0)-(s.watch_cost_czk||0)-(s.sup_shipping_czk||0)-(s.service_czk||0)-(s.shipping_czk||0)-(s.ads_czk||0) }

  const months = sales.map(s=>s.date?.slice(0,7)).filter((m,i,a):m is string=>Boolean(m)&&a.indexOf(m)===i).sort().reverse()
  const filtered = filterMonth==='all'?sales:sales.filter(s=>s.date?.startsWith(filterMonth))
  const totRev = filtered.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const totCost = filtered.reduce((s,x)=>s+(x.watch_cost_czk||0)+(x.sup_shipping_czk||0)+(x.service_czk||0)+(x.shipping_czk||0)+(x.ads_czk||0),0)
  const totProfit = totRev - totCost
  const margin = totRev>0?Math.round(totProfit/totRev*100):0

  function openEdit(s: Sale) {
    setForm({ date:s.date, customer:s.customer, watch_name:s.watch_name,
      revenue:fc(s.revenue_czk,s.revenue_cur).toFixed(s.revenue_cur==='VND'?0:2).replace(/\.00$/,''), revenue_cur:s.revenue_cur as Cur,
      watch_cost:fc(s.watch_cost_czk,s.watch_cost_cur).toFixed(s.watch_cost_cur==='VND'?0:2).replace(/\.00$/,''), watch_cost_cur:s.watch_cost_cur as Cur,
      sup_shipping:fc(s.sup_shipping_czk||0,'CZK').toFixed(2).replace(/\.00$/,''), sup_shipping_cur:(s.sup_shipping_cur||'CZK') as Cur,
      service:fc(s.service_czk||0,'CZK').toFixed(2).replace(/\.00$/,''), service_cur:(s.service_cur||'CZK') as Cur,
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
      sup_shipping_czk:tc(parseFloat(form.sup_shipping)||0,form.sup_shipping_cur), sup_shipping_cur:form.sup_shipping_cur,
      service_czk:tc(parseFloat(form.service)||0,form.service_cur), service_cur:form.service_cur,
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
    setISupShip(i.supplier_shipping_czk>0?fc(i.supplier_shipping_czk,i.supplier_shipping_cur||'CZK').toFixed(2).replace(/\.00$/,''):'')
    setISupShipCur((i.supplier_shipping_cur||'CZK') as Cur)
    setIService(i.service_czk>0?fc(i.service_czk,i.service_cur||'CZK').toFixed(2).replace(/\.00$/,''):'')
    setIServiceCur((i.service_cur||'CZK') as Cur)
    setEditInvId(i.id); setShowInvForm(true)
  }

  async function saveInv() {
    setLoading(true)
    const row = { household_id:householdId, watch_name:iName, brand:iBrand, model:iModel,
      purchase_czk:tc(parseFloat(iPurchase)||0,iPurchaseCur), purchase_cur:iPurchaseCur,
      supplier_shipping_czk:tc(parseFloat(iSupShip)||0,iSupShipCur), supplier_shipping_cur:iSupShipCur,
      service_czk:tc(parseFloat(iService)||0,iServiceCur), service_cur:iServiceCur,
      asking_czk:tc(parseFloat(iAsking)||0,iAskingCur), asking_cur:iAskingCur,
      status:iStatus, notes:iNotes, date_purchased:iDate||null }
    if (editInvId) { const{data}=await supabase.from('biz_inventory').update(row).eq('id',editInvId).select().single(); if(data) setInv(p=>p.map(i=>i.id===editInvId?data as Inv:i)) }
    else { const{data}=await supabase.from('biz_inventory').insert(row).select().single(); if(data) setInv(p=>[data as Inv,...p]) }
    setShowInvForm(false); setEditInvId(null); setLoading(false)
    setIName(''); setIBrand(''); setIModel(''); setIPurchase(''); setISupShip(''); setIService(''); setIAsking(''); setINotes(''); setIDate(today())
  }

  async function delInv(id: string) {
    await supabase.from('biz_inventory').delete().eq('id',id)
    setInv(p=>p.filter(i=>i.id!==id))
  }

  // Quick sell from inventory
  const [sellInv, setSellInv] = useState<Inv|null>(null)
  const [sellCustomer, setSellCustomer] = useState('')
  const [sellRevenue, setSellRevenue] = useState('')
  const [sellRevCur, setSellRevCur] = useState<Cur>('CZK')
  const [sellDate, setSellDate] = useState(today())
  const [sellAds, setSellAds] = useState('')
  const [sellAdsCur, setSellAdsCur] = useState<Cur>('CZK')
  const [sellShipping, setSellShipping] = useState('')
  const [sellShipCur, setSellShipCur] = useState<Cur>('CZK')

  function openSell(item: Inv) {
    setSellInv(item)
    setSellCustomer('')
    setSellRevenue(item.asking_czk > 0 ? fc(item.asking_czk, item.asking_cur).toFixed(item.asking_cur==='VND'?0:2).replace(/\.00$/,'') : '')
    setSellRevCur(item.asking_cur as Cur)
    setSellAds(''); setSellShipping(''); setSellDate(today())
  }

  async function confirmSell() {
    if (!sellInv || !sellRevenue) return
    setLoading(true)
    const revCZK = tc(parseFloat(sellRevenue)||0, sellRevCur)
    const shipCZK = tc(parseFloat(sellShipping)||0, sellShipCur)
    const adsCZK = tc(parseFloat(sellAds)||0, sellAdsCur)
    const profit = revCZK - sellInv.purchase_czk - (sellInv.supplier_shipping_czk||0) - (sellInv.service_czk||0) - shipCZK - adsCZK

    // 1. Create sale record
    const { data: saleData } = await supabase.from('biz_sales').insert({
      household_id: householdId,
      date: sellDate,
      customer: sellCustomer || 'Unknown',
      watch_name: sellInv.watch_name,
      revenue_czk: revCZK, revenue_cur: sellRevCur,
      watch_cost_czk: sellInv.purchase_czk + (sellInv.supplier_shipping_czk||0) + (sellInv.service_czk||0), watch_cost_cur: sellInv.purchase_cur,
      shipping_czk: shipCZK, shipping_cur: sellShipCur,
      ads_czk: adsCZK, ads_cur: sellAdsCur,
      notes: sellInv.notes || ''
    }).select().single()
    if (saleData) setSales(p => [saleData as Sale, ...p])

    // 2. Mark inventory as sold
    await supabase.from('biz_inventory').update({ status: 'sold' }).eq('id', sellInv.id)
    setInv(p => p.map(i => i.id === sellInv!.id ? { ...i, status: 'sold' } : i))

    setSellInv(null)
    setLoading(false)
  }

  const INP: React.CSSProperties = { background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:8, padding:'8px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none', width:'100%' }
  const fRev = tc(parseFloat(form.revenue)||0,form.revenue_cur)
  const fCost = tc(parseFloat(form.watch_cost)||0,form.watch_cost_cur)+tc(parseFloat(form.sup_shipping)||0,form.sup_shipping_cur)+tc(parseFloat(form.service)||0,form.service_cur)+tc(parseFloat(form.shipping)||0,form.shipping_cur)+tc(parseFloat(form.ads)||0,form.ads_cur)
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

        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
          <div className="rates-badge">
            <span className={'dot'+(rates.loading?' loading':'')} />
            {rates.loading ? 'Fetching rates...' : `Live · 1 EUR = ${rates.EUR_CZK.toFixed(2)} Kč · 1 USD = ${rates.USD_CZK.toFixed(2)} Kč · 1M VND = ${(rates.VND_CZK*1000000).toFixed(2)} Kč`}
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
              {([['Sell price','revenue','revenue_cur','var(--green)'],['Watch cost (supplier)','watch_cost','watch_cost_cur',null],['Supplier shipping','sup_shipping','sup_shipping_cur',null],['Service cost','service','service_cur',null],['Delivery shipping','shipping','shipping_cur',null],['Ads / Meta','ads','ads_cur',null]] as [string,keyof Form,keyof Form,string|null][]).map(([l,k,ck,col])=>(
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
                {[{l:'Revenue',v:fRev,c:'var(--green)'},{l:'Watch',v:tc(parseFloat(form.watch_cost)||0,form.watch_cost_cur),c:'var(--muted)'},{l:'Sup.ship',v:tc(parseFloat(form.sup_shipping)||0,form.sup_shipping_cur),c:'var(--muted)'},{l:'Service',v:tc(parseFloat(form.service)||0,form.service_cur),c:'var(--muted)'},{l:'Delivery',v:tc(parseFloat(form.shipping)||0,form.shipping_cur),c:'var(--muted)'},{l:'Ads',v:tc(parseFloat(form.ads)||0,form.ads_cur),c:'var(--muted)'}].map(r=>(
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
                {['Date','Customer','Watch','Revenue','Watch cost','Sup. ship','Service','Delivery','Ads','Profit',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3?'right':'left', fontWeight:500, color:'var(--muted)', whiteSpace:'nowrap' }}>{h}</th>)}
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
                      {s.revenue_cur!==dc&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(s.revenue_czk,s.revenue_cur,rates)}</div>}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{(s.watch_cost_czk||0)>0?fmtC(s.watch_cost_czk||0,dc):'—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{(s.sup_shipping_czk||0)>0?fmtC(s.sup_shipping_czk,dc):'—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{(s.service_czk||0)>0?fmtC(s.service_czk,dc):'—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{(s.shipping_czk||0)>0?fmtC(s.shipping_czk,dc):'—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>{(s.ads_czk||0)>0?fmtC(s.ads_czk,dc):'—'}</td>
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
            <div className="card"><div className="card-head"><span className="card-title">Live rates</span><span style={{ fontSize:10, color:'var(--green)', fontWeight:600 }}>LIVE</span></div>
              <div style={{ padding:'4px 0' }}>
                <div style={{ padding:'5px 16px', fontSize:12, display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--muted)' }}>1 EUR</span><span style={{ fontWeight:600 }}>{rates.EUR_CZK.toFixed(2)} Kč</span></div>
                <div style={{ padding:'5px 16px', fontSize:12, display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--muted)' }}>1 USD</span><span style={{ fontWeight:600 }}>{rates.USD_CZK.toFixed(2)} Kč</span></div>
                <div style={{ padding:'5px 16px', fontSize:12, display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--muted)' }}>1M VND</span><span style={{ fontWeight:600 }}>{(rates.VND_CZK*1000000).toFixed(2)} Kč</span></div>
                {rates.lastUpdated!=='fallback'&&<div style={{ padding:'4px 16px 8px', fontSize:10, color:'var(--muted)' }}>Updated {rates.lastUpdated}</div>}
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
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Supplier shipping</label>
                <div style={{ display:'flex', gap:4 }}><input type="number" value={iSupShip} onChange={e=>setISupShip(e.target.value)} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} /><select value={iSupShipCur} onChange={e=>setISupShipCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Service cost</label>
                <div style={{ display:'flex', gap:4 }}><input type="number" value={iService} onChange={e=>setIService(e.target.value)} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} /><select value={iServiceCur} onChange={e=>setIServiceCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
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
              {['Watch','Brand','Status','Bought for','Sup. shipping','Service','Total cost','Asking','Margin',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3?'right':'left', fontWeight:500, color:'var(--muted)', whiteSpace:'nowrap' }}>{h}</th>)}
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
                    {item.purchase_cur!=='CZK'&&item.purchase_czk>0&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(item.purchase_czk,item.purchase_cur,rates)}</div>}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>
                    <div>{(item.supplier_shipping_czk||0)>0?fmtC(item.supplier_shipping_czk,'CZK'):'—'}</div>
                    {item.supplier_shipping_cur&&item.supplier_shipping_cur!=='CZK'&&(item.supplier_shipping_czk||0)>0&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(item.supplier_shipping_czk,item.supplier_shipping_cur,rates)}</div>}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--muted)' }}>
                    <div>{(item.service_czk||0)>0?fmtC(item.service_czk,'CZK'):'—'}</div>
                    {item.service_cur&&item.service_cur!=='CZK'&&(item.service_czk||0)>0&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(item.service_czk,item.service_cur,rates)}</div>}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--red)', fontWeight:500 }}>
                    {fmtC(item.purchase_czk+(item.supplier_shipping_czk||0)+(item.service_czk||0),'CZK')}
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--green)' }}>{item.asking_czk>0?fmtC(item.asking_czk,item.asking_cur as Cur):'—'}</td>
                  <td style={{ padding:'9px 12px', textAlign:'right' }}>
                    {item.asking_czk>0&&item.purchase_czk>0?<><div style={{ fontWeight:500, color:pc(pot) }}>{fmtC(pot,'CZK')}</div><div style={{ fontSize:10, color:pm>=30?'var(--green)':pm>=15?'var(--gold)':'var(--red)' }}>{pm}%</div></>:'—'}
                  </td>
                  <td style={{ padding:'9px 8px', textAlign:'right' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      {item.status !== 'sold' && (
                        <button onClick={e=>{e.stopPropagation();openSell(item)}} style={{ background:'var(--green)', border:'none', color:'#fff', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:500, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          💰 Sell
                        </button>
                      )}
                      <button onClick={e=>{e.stopPropagation();delInv(item.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:13 }}>✕</button>
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div></div>
      </>}

      {/* ─── QUICK SELL MODAL ─── */}
      {sellInv && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:16, padding:28, width:480, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600 }}>💰 Sell watch</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>{sellInv.watch_name}</div>
              </div>
              <button onClick={()=>setSellInv(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:20 }}>✕</button>
            </div>

            {/* Watch summary */}
            <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div><div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>Watch</div><div style={{ fontSize:12, fontWeight:500 }}>{sellInv.watch_name}</div></div>
                <div><div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>Brand</div><div style={{ fontSize:12 }}>{sellInv.brand||'—'}</div></div>
                <div><div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>Bought for</div><div style={{ fontSize:12, fontWeight:500, color:'var(--red)' }}>{sellInv.purchase_czk>0?fmtC(sellInv.purchase_czk,'CZK'):'—'}{sellInv.purchase_cur!=='CZK'&&<span style={{ fontSize:10, color:'var(--muted)', display:'block' }}>{fmtOrig(sellInv.purchase_czk,sellInv.purchase_cur,rates)}</span>}</div></div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Sell date</label><input type="date" value={sellDate} onChange={e=>setSellDate(e.target.value)} style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Customer</label><input value={sellCustomer} onChange={e=>setSellCustomer(e.target.value)} placeholder="Customer name" style={INP} /></div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Sell price</label>
                <div style={{ display:'flex', gap:4 }}>
                  <input type="number" value={sellRevenue} onChange={e=>setSellRevenue(e.target.value)} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px', color:'var(--green)' }} />
                  <select value={sellRevCur} onChange={e=>setSellRevCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Shipping cost</label>
                <div style={{ display:'flex', gap:4 }}>
                  <input type="number" value={sellShipping} onChange={e=>setSellShipping(e.target.value)} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} />
                  <select value={sellShipCur} onChange={e=>setSellShipCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Ads cost</label>
                <div style={{ display:'flex', gap:4 }}>
                  <input type="number" value={sellAds} onChange={e=>setSellAds(e.target.value)} placeholder="0" style={{ ...INP, flex:1, borderRadius:'8px 0 0 8px' }} />
                  <select value={sellAdsCur} onChange={e=>setSellAdsCur(e.target.value as Cur)} style={{ ...INP, width:'auto', minWidth:58, borderRadius:'0 8px 8px 0', borderLeft:'none' }}>{CURS.map(c=><option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>
            </div>

            {/* Live profit preview */}
            {sellRevenue && (
              <div style={{ background:'var(--surface2)', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Profit preview</div>
                {(() => {
                  const rev = tc(parseFloat(sellRevenue)||0, sellRevCur)
                  const ship = tc(parseFloat(sellShipping)||0, sellShipCur)
                  const ads = tc(parseFloat(sellAds)||0, sellAdsCur)
                  const profit = rev - sellInv.purchase_czk - ship - ads
                  const m = rev > 0 ? Math.round(profit/rev*100) : 0
                  return (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>
                        <div>{fmtC(rev,'CZK')} revenue</div>
                        <div>− {fmtC(sellInv.purchase_czk + ship + ads,'CZK')} costs</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:20, fontWeight:600, color:pc(profit) }}>{fmtC(profit,'CZK')}</div>
                        <div style={{ fontSize:12, color:m>=30?'var(--green)':m>=15?'var(--gold)':'var(--red)' }}>{m}% margin</div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={confirmSell} disabled={loading||!sellRevenue} style={{ flex:1, background:'var(--green)', border:'none', color:'#fff', borderRadius:8, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', opacity:!sellRevenue?.5:1 }}>
                {loading ? 'Recording...' : '✓ Record sale & mark as sold'}
              </button>
              <button onClick={()=>setSellInv(null)} style={{ background:'none', border:'0.5px solid var(--border2)', color:'var(--muted)', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
