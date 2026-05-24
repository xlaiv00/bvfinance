'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const EUR_CZK = 24.5; const USD_CZK = 22.8; const VND_CZK = 0.000895
const RATES: Record<string,number> = { CZK:1, EUR:EUR_CZK, USD:USD_CZK, VND:VND_CZK }
const CURRENCIES = ['CZK','EUR','USD','VND'] as const
type Cur = typeof CURRENCIES[number]

function toCZK(a: number, c: Cur) { return a * (RATES[c]||1) }
function fromCZK(czk: number, c: Cur) { return czk / (RATES[c]||1) }
function fmt(czk: number, c: Cur) {
  const v = fromCZK(czk, c)
  if (c==='VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  if (c==='CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (c==='EUR') return '€' + v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})
  return '$' + v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
}
function fmtOrig(czk: number, c: Cur) {
  const v = fromCZK(czk, c)
  if (c==='VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  if (c==='CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (c==='EUR') return '€' + v.toFixed(2)
  if (c==='USD') return '$' + v.toFixed(2)
  return v.toFixed(2)
}

interface Sale { id:string; date:string; customer:string; watch_name:string; revenue_czk:number; revenue_cur:Cur; watch_cost_czk:number; watch_cost_cur:Cur; shipping_cost_czk:number; shipping_cost_cur:Cur; ads_cost_czk:number; ads_cost_cur:Cur; notes:string }
interface Inventory { id:string; watch_name:string; brand:string; model:string; purchase_price_czk:number; purchase_cur:Cur; asking_price_czk:number; asking_cur:Cur; status:'in_stock'|'listed'|'sold'|'reserved'; notes:string; date_purchased:string }

type FormState = { date:string; customer:string; watch_name:string; revenue:string; revenue_cur:Cur; watch_cost:string; watch_cost_cur:Cur; shipping_cost:string; shipping_cost_cur:Cur; ads_cost:string; ads_cost_cur:Cur; notes:string }
const emptyForm = (): FormState => ({ date: new Date().toISOString().split('T')[0], customer:'', watch_name:'', revenue:'', revenue_cur:'CZK', watch_cost:'', watch_cost_cur:'VND', shipping_cost:'', shipping_cost_cur:'CZK', ads_cost:'', ads_cost_cur:'CZK', notes:'' })

const STATUS_LABELS: Record<string,string> = { in_stock:'🟢 In stock', listed:'🟡 Listed', sold:'🔴 Sold', reserved:'🔵 Reserved' }
const STATUS_COLORS: Record<string,string> = { in_stock:'var(--green)', listed:'var(--gold)', sold:'var(--red)', reserved:'var(--blue)' }

export default function SalesClient({ householdId }: { householdId: string }) {
  const [sales, setSales] = useState<Sale[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [mainTab, setMainTab] = useState<'sales'|'inventory'>('sales')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [loading, setLoading] = useState(false)
  const [displayCur, setDisplayCur] = useState<Cur>('CZK')
  const [filterMonth, setFilterMonth] = useState('all')

  // Inventory form
  const [showInvForm, setShowInvForm] = useState(false)
  const [editInvId, setEditInvId] = useState<string|null>(null)
  const [invName, setInvName] = useState(''); const [invBrand, setInvBrand] = useState(''); const [invModel, setInvModel] = useState('')
  const [invPurchase, setInvPurchase] = useState(''); const [invPurchaseCur, setInvPurchaseCur] = useState<Cur>('VND')
  const [invAsking, setInvAsking] = useState(''); const [invAskingCur, setInvAskingCur] = useState<Cur>('CZK')
  const [invStatus, setInvStatus] = useState<Inventory['status']>('in_stock')
  const [invNotes, setInvNotes] = useState(''); const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0])

  const supabase = createClient()
  useEffect(() => { load() }, [])

  async function load() {
    const [s, inv] = await Promise.all([
      supabase.from('watch_sales').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('watch_inventory').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])
    if (s.data) setSales(s.data as Sale[])
    if (inv.data) setInventory(inv.data as Inventory[])
  }

  function p(patch: Partial<FormState>) { setForm(prev => ({ ...prev, ...patch })) }
  function totalCostCZK(s: Sale) { return (s.watch_cost_czk||0)+(s.shipping_cost_czk||0)+(s.ads_cost_czk||0) }
  function profitCZK(s: Sale) { return (s.revenue_czk||0) - totalCostCZK(s) }

  const months = sales.map(s => s.date?.slice(0,7)).filter((m,i,a): m is string => Boolean(m) && a.indexOf(m)===i).sort().reverse()
  const filtered = filterMonth==='all' ? sales : sales.filter(s => s.date?.startsWith(filterMonth))
  const totalRevCZK = filtered.reduce((s,x)=>s+(x.revenue_czk||0),0)
  const totalCostAll = filtered.reduce((s,x)=>s+totalCostCZK(x),0)
  const totalProfit = totalRevCZK - totalCostAll
  const margin = totalRevCZK > 0 ? Math.round(totalProfit/totalRevCZK*100) : 0
  function pc(czk: number) { return czk>0?'var(--green)':czk<0?'var(--red)':'var(--muted)' }

  function openEdit(s: Sale) {
    setForm({ date:s.date, customer:s.customer, watch_name:s.watch_name, revenue:fromCZK(s.revenue_czk,s.revenue_cur).toFixed(s.revenue_cur==='VND'?0:2).replace(/\.00$/,''), revenue_cur:s.revenue_cur, watch_cost:fromCZK(s.watch_cost_czk,s.watch_cost_cur).toFixed(s.watch_cost_cur==='VND'?0:2).replace(/\.00$/,''), watch_cost_cur:s.watch_cost_cur, shipping_cost:fromCZK(s.shipping_cost_czk,s.shipping_cost_cur).toFixed(2).replace(/\.00$/,''), shipping_cost_cur:s.shipping_cost_cur, ads_cost:fromCZK(s.ads_cost_czk,s.ads_cost_cur).toFixed(2).replace(/\.00$/,''), ads_cost_cur:s.ads_cost_cur, notes:s.notes })
    setEditId(s.id); setShowForm(true)
  }

  async function save() {
    setLoading(true)
    const row = { household_id:householdId, date:form.date, customer:form.customer, watch_name:form.watch_name, revenue_czk:toCZK(parseFloat(form.revenue)||0,form.revenue_cur), revenue_cur:form.revenue_cur, watch_cost_czk:toCZK(parseFloat(form.watch_cost)||0,form.watch_cost_cur), watch_cost_cur:form.watch_cost_cur, shipping_cost_czk:toCZK(parseFloat(form.shipping_cost)||0,form.shipping_cost_cur), shipping_cost_cur:form.shipping_cost_cur, ads_cost_czk:toCZK(parseFloat(form.ads_cost)||0,form.ads_cost_cur), ads_cost_cur:form.ads_cost_cur, notes:form.notes }
    if (editId) { const {data} = await supabase.from('watch_sales').update(row).eq('id',editId).select().single(); if(data) setSales(p=>p.map(s=>s.id===editId?data as Sale:s)) }
    else { const {data} = await supabase.from('watch_sales').insert(row).select().single(); if(data) setSales(p=>[data as Sale,...p]) }
    setShowForm(false); setEditId(null); setLoading(false)
  }

  async function del(id: string) {
    await supabase.from('watch_sales').delete().eq('id',id)
    setSales(p=>p.filter(s=>s.id!==id))
  }

  function openEditInv(inv: Inventory) {
    setInvName(inv.watch_name); setInvBrand(inv.brand); setInvModel(inv.model)
    setInvPurchase(fromCZK(inv.purchase_price_czk,inv.purchase_cur).toFixed(inv.purchase_cur==='VND'?0:2).replace(/\.00$/,''))
    setInvPurchaseCur(inv.purchase_cur); setInvAsking(fromCZK(inv.asking_price_czk,inv.asking_cur).toFixed(2).replace(/\.00$/,''))
    setInvAskingCur(inv.asking_cur); setInvStatus(inv.status); setInvNotes(inv.notes); setInvDate(inv.date_purchased||'')
    setEditInvId(inv.id); setShowInvForm(true)
  }

  async function saveInv() {
    setLoading(true)
    const row = { household_id:householdId, watch_name:invName, brand:invBrand, model:invModel, purchase_price_czk:toCZK(parseFloat(invPurchase)||0,invPurchaseCur), purchase_cur:invPurchaseCur, asking_price_czk:toCZK(parseFloat(invAsking)||0,invAskingCur), asking_cur:invAskingCur, status:invStatus, notes:invNotes, date_purchased:invDate||null }
    if (editInvId) { const {data} = await supabase.from('watch_inventory').update(row).eq('id',editInvId).select().single(); if(data) setInventory(p=>p.map(i=>i.id===editInvId?data as Inventory:i)) }
    else { const {data} = await supabase.from('watch_inventory').insert(row).select().single(); if(data) setInventory(p=>[data as Inventory,...p]) }
    setShowInvForm(false); setEditInvId(null); setLoading(false)
    setInvName(''); setInvBrand(''); setInvModel(''); setInvPurchase(''); setInvAsking(''); setInvNotes(''); setInvDate(new Date().toISOString().split('T')[0])
  }

  async function delInv(id: string) {
    await supabase.from('watch_inventory').delete().eq('id',id)
    setInventory(p=>p.filter(i=>i.id!==id))
  }

  const inp: React.CSSProperties = { background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:8, padding:'8px 10px', fontSize:13, color:'var(--text)', fontFamily:'inherit', outline:'none', width:'100%' }
  const CurSel = ({ val, onChange }: { val: Cur; onChange: (c:Cur)=>void }) => (
    <select value={val} onChange={e=>onChange(e.target.value as Cur)} style={{ ...inp, width:'auto', minWidth:60 }}>
      {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
    </select>
  )

  const formRevCZK = toCZK(parseFloat(form.revenue)||0,form.revenue_cur)
  const formCostCZK = toCZK(parseFloat(form.watch_cost)||0,form.watch_cost_cur)+toCZK(parseFloat(form.shipping_cost)||0,form.shipping_cost_cur)+toCZK(parseFloat(form.ads_cost)||0,form.ads_cost_cur)
  const formProfit = formRevCZK - formCostCZK

  // Inventory stats
  const inStock = inventory.filter(i=>i.status==='in_stock').length
  const listed = inventory.filter(i=>i.status==='listed').length
  const reserved = inventory.filter(i=>i.status==='reserved').length
  const invValue = inventory.filter(i=>i.status!=='sold').reduce((s,i)=>s+i.purchase_price_czk,0)

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Main tabs */}
      <div style={{ display:'flex', borderBottom:'0.5px solid var(--border)', marginBottom:20 }}>
        {[['sales','💰 Sales'],['inventory','📦 Inventory']].map(([key,label])=>(
          <button key={key} onClick={()=>setMainTab(key as any)} style={{ padding:'10px 20px', border:'none', background:'none', fontSize:13, fontWeight:mainTab===key?500:400, cursor:'pointer', fontFamily:'inherit', color:mainTab===key?'var(--text)':'var(--muted)', borderBottom:mainTab===key?'2px solid var(--acc)':'2px solid transparent' }}>{label}</button>
        ))}
      </div>

      {/* ── SALES TAB ── */}
      {mainTab === 'sales' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{ ...inp, width:'auto', fontSize:12 }}>
                <option value="all">All time</option>
                {months.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} sales</span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ display:'flex', background:'var(--surface2)', borderRadius:8, padding:2, gap:2 }}>
                {CURRENCIES.map(c=><button key={c} onClick={()=>setDisplayCur(c)} style={{ padding:'4px 10px', border:'none', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:displayCur===c?600:400, background:displayCur===c?'var(--surface)':'transparent', color:displayCur===c?'var(--text)':'var(--muted)' }}>{c}</button>)}
              </div>
              <button onClick={()=>{setForm(emptyForm());setEditId(null);setShowForm(true)}} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>+ Add sale</button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {[{label:'Revenue',val:totalRevCZK,color:'var(--green)'},{label:'Total cost',val:totalCostAll,color:'var(--red)'},{label:'Profit',val:totalProfit,color:pc(totalProfit)},{label:'Margin',val:null,display:margin+'%',color:pc(totalProfit)}].map(s=>(
              <div key={s.label} className="stat" style={{ padding:'12px 16px' }}>
                <div className="stat-lbl">{s.label}</div>
                <div style={{ fontSize:16, fontWeight:500, color:s.color, marginTop:4 }}>{s.val!==null?fmt(s.val,displayCur):s.display}</div>
              </div>
            ))}
          </div>

          {showForm && (
            <div className="card" style={{ marginBottom:14 }}>
              <div className="card-head"><span className="card-title">{editId?'Edit sale':'New sale'}</span><button onClick={()=>setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>✕</button></div>
              <div className="card-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Date</label><input type="date" value={form.date} onChange={e=>p({date:e.target.value})} style={inp} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Customer</label><input value={form.customer} onChange={e=>p({customer:e.target.value})} placeholder="Customer name" style={inp} /></div>
                  <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Watch name / model</label><input value={form.watch_name} onChange={e=>p({watch_name:e.target.value})} placeholder="e.g. Tissot Seastar C350" style={inp} /></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  {[{label:'Sell price',key:'revenue' as const,cur:'revenue_cur' as const,color:'var(--green)'},{label:'Watch cost (supplier)',key:'watch_cost' as const,cur:'watch_cost_cur' as const},{label:'Shipping cost',key:'shipping_cost' as const,cur:'shipping_cost_cur' as const},{label:'Ads cost',key:'ads_cost' as const,cur:'ads_cost_cur' as const}].map(f2=>(
                    <div key={f2.key}>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f2.label}</label>
                      <div style={{ display:'flex', gap:4 }}>
                        <input type="number" value={form[f2.key]} onChange={e=>p({[f2.key]:e.target.value})} placeholder="0" style={{ ...inp, flex:1, borderRadius:'8px 0 0 8px', color:f2.color||'var(--text)' }} />
                        <CurSel val={form[f2.cur]} onChange={c=>p({[f2.cur]:c})} />
                      </div>
                    </div>
                  ))}
                </div>
                {(formRevCZK > 0 || formCostCZK > 0) && (
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 14px', marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>All converted to CZK</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                      {[{l:'Revenue',v:formRevCZK,c:'var(--green)'},{l:'Watch',v:toCZK(parseFloat(form.watch_cost)||0,form.watch_cost_cur),c:'var(--muted)'},{l:'Shipping',v:toCZK(parseFloat(form.shipping_cost)||0,form.shipping_cost_cur),c:'var(--muted)'},{l:'Ads',v:toCZK(parseFloat(form.ads_cost)||0,form.ads_cost_cur),c:'var(--muted)'}].map(r=>(
                        <div key={r.l} style={{ textAlign:'center' }}>
                          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{r.l}</div>
                          <div style={{ fontSize:12, fontWeight:500, color:r.c }}>{Math.round(r.v).toLocaleString('cs-CZ')} Kč</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop:'0.5px solid var(--border)', marginTop:10, paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>Estimated profit</span>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:16, fontWeight:600, color:pc(formProfit) }}>{Math.round(formProfit).toLocaleString('cs-CZ')} Kč</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>≈ {fmt(formProfit,'EUR')} · {fmt(formProfit,'USD')} · {fmt(formProfit,'VND')}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ marginBottom:12 }}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label><input value={form.notes} onChange={e=>p({notes:e.target.value})} placeholder="Optional" style={inp} /></div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={save} disabled={loading} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Saving…':editId?'Update':'Add sale'}</button>
                  <button onClick={()=>setShowForm(false)} style={{ background:'none', border:'0.5px solid var(--border2)', color:'var(--muted)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 256px', gap:16, alignItems:'start' }}>
            <div className="card">
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
                    {['Date','Customer','Watch','Revenue','Watch cost','Profit',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3?'right':'left', fontWeight:500, color:'var(--muted)', whiteSpace:'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filtered.length===0?<tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>No sales yet</td></tr>:filtered.map((s,i)=>{
                      const pr = profitCZK(s)
                      return (<tr key={s.id} style={{ borderBottom:i<filtered.length-1?'0.5px solid var(--border)':'none', cursor:'pointer' }} onClick={()=>openEdit(s)}>
                        <td style={{ padding:'9px 12px', color:'var(--muted)', whiteSpace:'nowrap' }}>{s.date}</td>
                        <td style={{ padding:'9px 12px', fontWeight:500 }}>{s.customer}</td>
                        <td style={{ padding:'9px 12px', color:'var(--muted)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.watch_name}</td>
                        <td style={{ padding:'9px 12px', textAlign:'right' }}>
                          <div style={{ color:'var(--green)', fontWeight:500 }}>{fmt(s.revenue_czk,displayCur)}</div>
                          {s.revenue_cur!==displayCur&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(s.revenue_czk,s.revenue_cur)}</div>}
                        </td>
                        <td style={{ padding:'9px 12px', textAlign:'right' }}>
                          <div style={{ color:'var(--muted)' }}>{s.watch_cost_czk>0?fmt(s.watch_cost_czk,displayCur):'—'}</div>
                          {s.watch_cost_czk>0&&s.watch_cost_cur!==displayCur&&<div style={{ fontSize:10, color:'var(--faint)' }}>{fmtOrig(s.watch_cost_czk,s.watch_cost_cur)}</div>}
                        </td>
                        <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:600, color:pc(pr) }}>{fmt(pr,displayCur)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right' }}><button onClick={e=>{e.stopPropagation();del(s.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:13 }}>✕</button></td>
                      </tr>)
                    })}
                  </tbody>
                  {filtered.length>0&&<tfoot><tr style={{ borderTop:'1px solid var(--border2)', background:'var(--surface2)' }}>
                    <td colSpan={3} style={{ padding:'9px 12px', fontWeight:600 }}>Total ({filtered.length})</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--green)', fontWeight:600 }}>{fmt(totalRevCZK,displayCur)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'var(--red)', fontWeight:600 }}>{fmt(totalCostAll,displayCur)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700, color:pc(totalProfit) }}>{fmt(totalProfit,displayCur)}</td>
                    <td/>
                  </tr></tfoot>}
                </table>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, position:'sticky', top:16 }}>
              <div className="card" style={{ padding:'16px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Profit margin</div>
                <div style={{ fontSize:28, fontWeight:500, color:pc(totalProfit) }}>{margin}%</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{filtered.length} sales</div>
              </div>
              <div className="card"><div className="card-head"><span className="card-title">Summary</span></div>
                <div style={{ padding:'6px 0' }}>
                  {[{l:'Revenue',v:totalRevCZK,c:'var(--green)'},{l:'Total cost',v:totalCostAll,c:'var(--red)'},{l:'Profit',v:totalProfit,c:pc(totalProfit)}].map(r=>(
                    <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 16px', fontSize:13 }}><span style={{ color:'var(--muted)' }}>{r.l}</span><span style={{ fontWeight:500, color:r.c }}>{fmt(r.v,displayCur)}</span></div>
                  ))}
                </div>
              </div>
              <div className="card"><div className="card-head"><span className="card-title">Rates (to CZK)</span></div>
                <div style={{ padding:'6px 0' }}>
                  {CURRENCIES.filter(c=>c!=='CZK').map(c=>(
                    <div key={c} style={{ display:'flex', justifyContent:'space-between', padding:'5px 16px', fontSize:12 }}><span style={{ color:'var(--muted)' }}>1 {c}</span><span style={{ fontWeight:500 }}>{RATES[c]} Kč</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INVENTORY TAB ── */}
      {mainTab === 'inventory' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ display:'flex', gap:12, fontSize:13 }}>
              {[{label:'In stock',count:inStock,color:'var(--green)'},{label:'Listed',count:listed,color:'var(--gold)'},{label:'Reserved',count:reserved,color:'var(--blue)'}].map(s=>(
                <span key={s.label} style={{ color:'var(--muted)' }}>{s.label}: <strong style={{ color:s.color }}>{s.count}</strong></span>
              ))}
              <span style={{ color:'var(--muted)' }}>Value: <strong style={{ color:'var(--text)' }}>{fmt(invValue,'CZK')}</strong></span>
            </div>
            <button onClick={()=>{setShowInvForm(true);setEditInvId(null)}} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>+ Add watch</button>
          </div>

          {showInvForm && (
            <div className="card" style={{ marginBottom:14 }}>
              <div className="card-head"><span className="card-title">{editInvId?'Edit watch':'Add to inventory'}</span><button onClick={()=>setShowInvForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>✕</button></div>
              <div className="card-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Watch name</label><input value={invName} onChange={e=>setInvName(e.target.value)} placeholder="e.g. Tissot Seastar C350" style={inp} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Brand</label><input value={invBrand} onChange={e=>setInvBrand(e.target.value)} placeholder="e.g. Tissot" style={inp} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Model / ref</label><input value={invModel} onChange={e=>setInvModel(e.target.value)} placeholder="e.g. T066.427.22.051.00" style={inp} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Status</label>
                    <select value={invStatus} onChange={e=>setInvStatus(e.target.value as any)} style={inp}>
                      <option value="in_stock">🟢 In stock</option><option value="listed">🟡 Listed</option><option value="reserved">🔵 Reserved</option><option value="sold">🔴 Sold</option>
                    </select>
                  </div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Purchase price</label>
                    <div style={{ display:'flex', gap:4 }}>
                      <input type="number" value={invPurchase} onChange={e=>setInvPurchase(e.target.value)} placeholder="0" style={{ ...inp, flex:1, borderRadius:'8px 0 0 8px' }} />
                      <select value={invPurchaseCur} onChange={e=>setInvPurchaseCur(e.target.value as Cur)} style={{ ...inp, width:'auto', minWidth:60, borderRadius:'0 8px 8px 0' }}>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
                    </div>
                  </div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Asking price</label>
                    <div style={{ display:'flex', gap:4 }}>
                      <input type="number" value={invAsking} onChange={e=>setInvAsking(e.target.value)} placeholder="0" style={{ ...inp, flex:1, borderRadius:'8px 0 0 8px' }} />
                      <select value={invAskingCur} onChange={e=>setInvAskingCur(e.target.value as Cur)} style={{ ...inp, width:'auto', minWidth:60, borderRadius:'0 8px 8px 0' }}>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
                    </div>
                  </div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Date purchased</label><input type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} style={inp} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label><input value={invNotes} onChange={e=>setInvNotes(e.target.value)} placeholder="Condition, source, etc." style={inp} /></div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={saveInv} disabled={loading} style={{ background:'var(--acc2)', border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{loading?'Saving…':editInvId?'Update':'Add watch'}</button>
                  <button onClick={()=>setShowInvForm(false)} style={{ background:'none', border:'0.5px solid var(--border2)', color:'var(--muted)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'var(--surface2)', borderBottom:'0.5px solid var(--border)' }}>
                  {['Watch','Brand/Model','Status','Purchased for','Asking price','Margin','Notes',''].map((h,i)=><th key={i} style={{ padding:'8px 12px', textAlign:i>=3&&i<=5?'right':'left', fontWeight:500, color:'var(--muted)', whiteSpace:'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {inventory.length===0?<tr><td colSpan={8} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>No watches in inventory yet</td></tr>:
                  inventory.map((inv,i)=>{
                    const potential = inv.asking_price_czk - inv.purchase_price_czk
                    return (<tr key={inv.id} style={{ borderBottom:i<inventory.length-1?'0.5px solid var(--border)':'none', cursor:'pointer', background:inv.status==='sold'?'rgba(0,0,0,.02)':'' }} onClick={()=>openEditInv(inv)}>
                      <td style={{ padding:'9px 12px', fontWeight:500, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.watch_name}</td>
                      <td style={{ padding:'9px 12px', color:'var(--muted)' }}>{inv.brand}{inv.model?<div style={{ fontSize:10, color:'var(--faint)' }}>{inv.model}</div>:null}</td>
                      <td style={{ padding:'9px 12px' }}><span style={{ fontSize:11, fontWeight:500, color:STATUS_COLORS[inv.status], background:STATUS_COLORS[inv.status]+'18', padding:'2px 8px', borderRadius:20 }}>{STATUS_LABELS[inv.status]}</span></td>
                      <td style={{ padding:'9px 12px', textAlign:'right' }}>
                        <div>{inv.purchase_price_czk>0?fmt(inv.purchase_price_czk,'CZK'):'—'}</div>
                        {inv.purchase_cur!=='CZK'&&inv.purchase_price_czk>0&&<div style={{ fontSize:10, color:'var(--muted)' }}>{fmtOrig(inv.purchase_price_czk,inv.purchase_cur)}</div>}
                      </td>
                      <td style={{ padding:'9px 12px', textAlign:'right' }}>
                        <div style={{ color:'var(--green)' }}>{inv.asking_price_czk>0?fmt(inv.asking_price_czk,inv.asking_cur):'—'}</div>
                      </td>
                      <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:500, color:potential>=0?'var(--green)':'var(--red)' }}>{inv.asking_price_czk>0&&inv.purchase_price_czk>0?fmt(potential,'CZK'):'—'}</td>
                      <td style={{ padding:'9px 12px', color:'var(--muted)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.notes}</td>
                      <td style={{ padding:'9px 8px', textAlign:'right' }}><button onClick={e=>{e.stopPropagation();delInv(inv.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:13 }}>✕</button></td>
                    </tr>)
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
