'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Exchange rates to CZK (base currency for storage)
const RATES_TO_CZK: Record<string, number> = {
  CZK: 1,
  EUR: 24.5,
  USD: 22.8,
  VND: 0.000895, // 1 VND = 0.000895 CZK
}

const CURRENCIES = ['CZK', 'EUR', 'USD', 'VND'] as const
type Cur = typeof CURRENCIES[number]

function toCZK(amount: number, cur: Cur): number {
  return amount * (RATES_TO_CZK[cur] || 1)
}

function fromCZK(amountCZK: number, cur: Cur): number {
  return amountCZK / (RATES_TO_CZK[cur] || 1)
}

function fmt(amountCZK: number, displayCur: Cur): string {
  const v = fromCZK(amountCZK, displayCur)
  if (displayCur === 'VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  if (displayCur === 'CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (displayCur === 'EUR') return '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (displayCur === 'USD') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toFixed(2)
}

function fmtInput(amountCZK: number, cur: Cur): string {
  if (!amountCZK) return ''
  const v = fromCZK(amountCZK, cur)
  if (cur === 'VND') return String(Math.round(v))
  return v.toFixed(2).replace(/\.00$/, '')
}

interface Sale {
  id: string
  date: string
  customer: string
  watch_name: string
  // All amounts stored in CZK internally
  revenue_czk: number
  revenue_cur: Cur
  watch_cost_czk: number
  watch_cost_cur: Cur
  shipping_cost_czk: number
  shipping_cost_cur: Cur
  ads_cost_czk: number
  ads_cost_cur: Cur
  notes: string
}

interface FormState {
  date: string
  customer: string
  watch_name: string
  revenue: string
  revenue_cur: Cur
  watch_cost: string
  watch_cost_cur: Cur
  shipping_cost: string
  shipping_cost_cur: Cur
  ads_cost: string
  ads_cost_cur: Cur
  notes: string
}

function emptyForm(): FormState {
  return {
    date: new Date().toISOString().split('T')[0],
    customer: '', watch_name: '',
    revenue: '', revenue_cur: 'CZK',
    watch_cost: '', watch_cost_cur: 'VND',
    shipping_cost: '', shipping_cost_cur: 'CZK',
    ads_cost: '', ads_cost_cur: 'CZK',
    notes: '',
  }
}

function formToDB(f: FormState, householdId: string) {
  return {
    household_id: householdId,
    date: f.date,
    customer: f.customer,
    watch_name: f.watch_name,
    revenue_czk: toCZK(parseFloat(f.revenue) || 0, f.revenue_cur),
    revenue_cur: f.revenue_cur,
    watch_cost_czk: toCZK(parseFloat(f.watch_cost) || 0, f.watch_cost_cur),
    watch_cost_cur: f.watch_cost_cur,
    shipping_cost_czk: toCZK(parseFloat(f.shipping_cost) || 0, f.shipping_cost_cur),
    shipping_cost_cur: f.shipping_cost_cur,
    ads_cost_czk: toCZK(parseFloat(f.ads_cost) || 0, f.ads_cost_cur),
    ads_cost_cur: f.ads_cost_cur,
    notes: f.notes,
  }
}

function saleToForm(s: Sale): FormState {
  return {
    date: s.date,
    customer: s.customer,
    watch_name: s.watch_name,
    revenue: fmtInput(s.revenue_czk, s.revenue_cur),
    revenue_cur: s.revenue_cur,
    watch_cost: fmtInput(s.watch_cost_czk, s.watch_cost_cur),
    watch_cost_cur: s.watch_cost_cur,
    shipping_cost: fmtInput(s.shipping_cost_czk, s.shipping_cost_cur),
    shipping_cost_cur: s.shipping_cost_cur,
    ads_cost: fmtInput(s.ads_cost_czk, s.ads_cost_cur),
    ads_cost_cur: s.ads_cost_cur,
    notes: s.notes,
  }
}

function CurrencyInput({ label, value, cur, onValueChange, onCurChange, color }: {
  label: string; value: string; cur: Cur
  onValueChange: (v: string) => void; onCurChange: (c: Cur) => void
  color?: string
}) {
  const inp: React.CSSProperties = {
    background: 'var(--surface2)', border: '0.5px solid var(--border2)',
    borderRadius: '8px 0 0 8px', padding: '8px 10px', fontSize: 13,
    color: color || 'var(--text)', fontFamily: 'inherit', outline: 'none',
    width: '100%', borderRight: 'none',
  }
  const sel: React.CSSProperties = {
    background: 'var(--surface2)', border: '0.5px solid var(--border2)',
    borderRadius: '0 8px 8px 0', padding: '8px 6px', fontSize: 12,
    color: 'var(--muted)', fontFamily: 'inherit', outline: 'none',
    cursor: 'pointer', minWidth: 52, borderLeft: '0.5px solid var(--border)',
  }
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex' }}>
        <input type="number" value={value} onChange={e => onValueChange(e.target.value)} placeholder="0" style={inp} />
        <select value={cur} onChange={e => onCurChange(e.target.value as Cur)} style={sel}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function SalesClient({ householdId }: { householdId: string }) {
  const [sales, setSales] = useState<Sale[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [loading, setLoading] = useState(false)
  const [displayCur, setDisplayCur] = useState<Cur>('CZK')
  const [filterMonth, setFilterMonth] = useState('all')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('watch_sales').select('*')
      .eq('household_id', householdId).order('date', { ascending: false })
    if (data) setSales(data as Sale[])
  }

  function p(f: Partial<FormState>) { setForm(prev => ({ ...prev, ...f })) }

  // Profit calculated in CZK then displayed
  function totalCostCZK(s: Sale) {
    return (s.watch_cost_czk||0) + (s.shipping_cost_czk||0) + (s.ads_cost_czk||0)
  }
  function profitCZK(s: Sale) { return (s.revenue_czk||0) - totalCostCZK(s) }

  const months = sales.map(s => s.date?.slice(0,7)).filter((m,i,a): m is string => Boolean(m) && a.indexOf(m) === i).sort().reverse()
  const filtered = filterMonth === 'all' ? sales : sales.filter(s => s.date?.startsWith(filterMonth))

  const totalRevCZK = filtered.reduce((s,x) => s+(x.revenue_czk||0), 0)
  const totalCostCZKAll = filtered.reduce((s,x) => s+totalCostCZK(x), 0)
  const totalProfitCZK = totalRevCZK - totalCostCZKAll
  const profitMargin = totalRevCZK > 0 ? Math.round(totalProfitCZK/totalRevCZK*100) : 0

  function profitColor(czk: number) { return czk > 0 ? 'var(--green)' : czk < 0 ? 'var(--red)' : 'var(--muted)' }

  function openNew() { setForm(emptyForm()); setEditId(null); setShowForm(true) }
  function openEdit(s: Sale) { setForm(saleToForm(s)); setEditId(s.id); setShowForm(true) }

  async function save() {
    setLoading(true)
    const row = formToDB(form, householdId)
    if (editId) {
      const { data } = await supabase.from('watch_sales').update(row).eq('id', editId).select().single()
      if (data) setSales(p => p.map(s => s.id === editId ? data as Sale : s))
    } else {
      const { data } = await supabase.from('watch_sales').insert(row).select().single()
      if (data) setSales(p => [data as Sale, ...p])
    }
    setShowForm(false); setEditId(null); setLoading(false)
  }

  async function del(id: string) {
    await supabase.from('watch_sales').delete().eq('id', id)
    setSales(p => p.filter(s => s.id !== id))
  }

  // Preview profit in form
  const formRevCZK = toCZK(parseFloat(form.revenue)||0, form.revenue_cur)
  const formCostCZK = toCZK(parseFloat(form.watch_cost)||0, form.watch_cost_cur)
    + toCZK(parseFloat(form.shipping_cost)||0, form.shipping_cost_cur)
    + toCZK(parseFloat(form.ads_cost)||0, form.ads_cost_cur)
  const formProfitCZK = formRevCZK - formCostCZK

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '0.5px solid var(--border2)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%' }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inp, width: 'auto', fontSize: 12 }}>
            <option value="all">All time</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} sale{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Display currency toggle */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, gap: 2 }}>
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setDisplayCur(c)}
                style={{ padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: displayCur===c?600:400, background: displayCur===c?'var(--surface)':'transparent', color: displayCur===c?'var(--text)':'var(--muted)' }}>{c}</button>
            ))}
          </div>
          <button onClick={openNew}
            style={{ background: 'var(--acc2)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add sale
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 256px', gap: 16, alignItems: 'start' }}>
        <div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Revenue', val: totalRevCZK, color: 'var(--green)' },
              { label: 'Total cost', val: totalCostCZKAll, color: 'var(--red)' },
              { label: 'Profit', val: totalProfitCZK, color: profitColor(totalProfitCZK) },
              { label: 'Margin', val: null, display: profitMargin + '%', color: profitColor(totalProfitCZK) },
            ].map(s => (
              <div key={s.label} className="stat" style={{ padding: '12px 16px' }}>
                <div className="stat-lbl">{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: s.color, marginTop: 4 }}>
                  {s.val !== null ? fmt(s.val, displayCur) : s.display}
                </div>
              </div>
            ))}
          </div>

          {/* Add/Edit form */}
          {showForm && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-head">
                <span className="card-title">{editId ? 'Edit sale' : 'New sale'}</span>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>✕</button>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date</label>
                    <input type="date" value={form.date} onChange={e => p({ date: e.target.value })} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Customer</label>
                    <input value={form.customer} onChange={e => p({ customer: e.target.value })} placeholder="e.g. Russian guy" style={inp} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Watch name / model</label>
                    <input value={form.watch_name} onChange={e => p({ watch_name: e.target.value })} placeholder="e.g. Tissot Seastar C350" style={inp} />
                  </div>
                </div>

                {/* Currency fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <CurrencyInput label="Sell price (revenue)" value={form.revenue} cur={form.revenue_cur}
                    onValueChange={v => p({ revenue: v })} onCurChange={c => p({ revenue_cur: c })}
                    color="var(--green)" />
                  <CurrencyInput label="Watch cost from supplier" value={form.watch_cost} cur={form.watch_cost_cur}
                    onValueChange={v => p({ watch_cost: v })} onCurChange={c => p({ watch_cost_cur: c })} />
                  <CurrencyInput label="Shipping cost" value={form.shipping_cost} cur={form.shipping_cost_cur}
                    onValueChange={v => p({ shipping_cost: v })} onCurChange={c => p({ shipping_cost_cur: c })} />
                  <CurrencyInput label="Ads cost" value={form.ads_cost} cur={form.ads_cost_cur}
                    onValueChange={v => p({ ads_cost: v })} onCurChange={c => p({ ads_cost_cur: c })} />
                </div>

                {/* Live conversion preview */}
                {(formRevCZK > 0 || formCostCZK > 0) && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>All converted to CZK</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                      {[
                        { label: 'Revenue', czk: formRevCZK, color: 'var(--green)' },
                        { label: 'Watch cost', czk: toCZK(parseFloat(form.watch_cost)||0, form.watch_cost_cur), color: 'var(--muted)' },
                        { label: 'Shipping', czk: toCZK(parseFloat(form.shipping_cost)||0, form.shipping_cost_cur), color: 'var(--muted)' },
                        { label: 'Ads', czk: toCZK(parseFloat(form.ads_cost)||0, form.ads_cost_cur), color: 'var(--muted)' },
                      ].map(r => (
                        <div key={r.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{r.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: r.color }}>{Math.round(r.czk).toLocaleString('cs-CZ')} Kč</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: '0.5px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Estimated profit</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: profitColor(formProfitCZK) }}>{Math.round(formProfitCZK).toLocaleString('cs-CZ')} Kč</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>≈ {fmt(formProfitCZK, 'EUR')} · {fmt(formProfitCZK, 'USD')} · {fmt(formProfitCZK, 'VND')}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
                  <input value={form.notes} onChange={e => p({ notes: e.target.value })} placeholder="Optional" style={{ ...inp, marginBottom: 12 }} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={save} disabled={loading}
                    style={{ background: 'var(--acc2)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {loading ? 'Saving…' : editId ? 'Update' : 'Add sale'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    style={{ background: 'none', border: '0.5px solid var(--border2)', color: 'var(--muted)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sales table */}
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '0.5px solid var(--border)' }}>
                    {['Date','Customer','Watch','Revenue','Cost (watch)','Shipping','Ads','Total cost','Profit',''].map((h,i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No sales yet — click + Add sale</td></tr>
                  ) : filtered.map((s, i) => {
                    const tc = totalCostCZK(s)
                    const pr = profitCZK(s)
                    return (
                      <tr key={s.id} style={{ borderBottom: i < filtered.length-1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }} onClick={() => openEdit(s)}>
                        <td style={{ padding: '9px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.date}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 500 }}>{s.customer}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.watch_name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <div style={{ color: 'var(--green)', fontWeight: 500 }}>{fmt(s.revenue_czk, displayCur)}</div>
                          {s.revenue_cur !== displayCur && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtInput(s.revenue_czk, s.revenue_cur)} {s.revenue_cur}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <div style={{ color: 'var(--muted)' }}>{s.watch_cost_czk > 0 ? fmt(s.watch_cost_czk, displayCur) : '—'}</div>
                          {s.watch_cost_czk > 0 && s.watch_cost_cur !== displayCur && <div style={{ fontSize: 10, color: 'var(--faint)' }}>{fmtInput(s.watch_cost_czk, s.watch_cost_cur)} {s.watch_cost_cur}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{s.shipping_cost_czk > 0 ? fmt(s.shipping_cost_czk, displayCur) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{s.ads_cost_czk > 0 ? fmt(s.ads_cost_czk, displayCur) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--red)' }}>{fmt(tc, displayCur)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: profitColor(pr) }}>{fmt(pr, displayCur)}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); del(s.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 13, padding: 2 }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--border2)', background: 'var(--surface2)' }}>
                      <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 600, fontSize: 12 }}>Total ({filtered.length} sales)</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmt(totalRevCZK, displayCur)}</td>
                      <td colSpan={3} style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}></td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{fmt(totalCostCZKAll, displayCur)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: profitColor(totalProfitCZK) }}>{fmt(totalProfitCZK, displayCur)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Profit margin</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: profitColor(totalProfitCZK) }}>{profitMargin}%</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{filtered.length} sales</div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">Summary</span></div>
            <div style={{ padding: '6px 0' }}>
              {[
                { l: 'Revenue', v: totalRevCZK, c: 'var(--green)' },
                { l: 'Total cost', v: totalCostCZKAll, c: 'var(--red)' },
                { l: 'Profit', v: totalProfitCZK, c: profitColor(totalProfitCZK) },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{r.l}</span>
                  <span style={{ fontWeight: 500, color: r.c }}>{fmt(r.v, displayCur)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Exchange rates */}
          <div className="card">
            <div className="card-head"><span className="card-title">Exchange rates (to CZK)</span></div>
            <div style={{ padding: '6px 0' }}>
              {CURRENCIES.filter(c => c !== 'CZK').map(c => (
                <div key={c} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 16px', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>1 {c}</span>
                  <span style={{ fontWeight: 500 }}>{RATES_TO_CZK[c]} Kč</span>
                </div>
              ))}
              <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--faint)' }}>
                Rates are approximate. Update in code if needed.
              </div>
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="card">
              <div className="card-head"><span className="card-title">Per sale average</span></div>
              <div style={{ padding: '6px 0' }}>
                {[
                  { l: 'Avg revenue', v: totalRevCZK/filtered.length, c: 'var(--green)' },
                  { l: 'Avg cost', v: totalCostCZKAll/filtered.length, c: 'var(--red)' },
                  { l: 'Avg profit', v: totalProfitCZK/filtered.length, c: profitColor(totalProfitCZK/filtered.length) },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 16px', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{r.l}</span>
                    <span style={{ fontWeight: 500, color: r.c }}>{fmt(r.v, displayCur)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
