'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Sale {
  id: string
  date: string
  customer: string
  watch_name: string
  revenue: number
  watch_cost: number
  shipping_cost: number
  ads_cost: number
  notes: string
}

interface Settings {
  meta_ads_total: number
  meta_ads_per_unit: number
}

const EMPTY_SALE = (): Omit<Sale, 'id'> => ({
  date: new Date().toISOString().split('T')[0],
  customer: '', watch_name: '', revenue: 0,
  watch_cost: 0, shipping_cost: 0, ads_cost: 0, notes: ''
})

function fmtCZK(n: number) {
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}
function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SalesClient({ householdId }: { householdId: string }) {
  const [sales, setSales] = useState<Sale[]>([])
  const [settings, setSettings] = useState<Settings>({ meta_ads_total: 0, meta_ads_per_unit: 0 })
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_SALE())
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const [s, st] = await Promise.all([
      supabase.from('watch_sales').select('*').eq('household_id', householdId).order('date', { ascending: false }),
      supabase.from('watch_settings').select('*').eq('household_id', householdId).single(),
    ])
    if (s.data) setSales(s.data)
    if (st.data) setSettings(st.data)
  }

  function totalCost(s: Sale) {
    return (s.watch_cost || 0) + (s.shipping_cost || 0) + (s.ads_cost || 0)
  }
  function profit(s: Sale) { return (s.revenue || 0) - totalCost(s) }

  const months = sales.map(s => s.date?.slice(0, 7)).filter((m): m is string => Boolean(m)).filter((m, i, a) => a.indexOf(m) === i).sort().reverse()
  const filtered = filterMonth === 'all' ? sales : sales.filter(s => s.date?.startsWith(filterMonth))

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.revenue || 0), 0)
  const totalCostAll = filtered.reduce((sum, s) => sum + totalCost(s), 0)
  const totalProfit = filtered.reduce((sum, s) => sum + profit(s), 0)
  const totalWatchCost = filtered.reduce((sum, s) => sum + (s.watch_cost || 0), 0)
  const totalShipping = filtered.reduce((sum, s) => sum + (s.shipping_cost || 0), 0)
  const totalAds = filtered.reduce((sum, s) => sum + (s.ads_cost || 0), 0)

  function openNew() {
    setForm(EMPTY_SALE())
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(s: Sale) {
    setForm({ date: s.date, customer: s.customer, watch_name: s.watch_name, revenue: s.revenue, watch_cost: s.watch_cost, shipping_cost: s.shipping_cost, ads_cost: s.ads_cost, notes: s.notes })
    setEditId(s.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.customer && !form.watch_name) return
    setLoading(true)
    if (editId) {
      const { data } = await supabase.from('watch_sales').update(form).eq('id', editId).select().single()
      if (data) setSales(p => p.map(s => s.id === editId ? data : s))
    } else {
      const { data } = await supabase.from('watch_sales').insert({ ...form, household_id: householdId }).select().single()
      if (data) setSales(p => [data, ...p])
    }
    setShowForm(false)
    setEditId(null)
    setLoading(false)
  }

  async function deleteSale(id: string) {
    await supabase.from('watch_sales').delete().eq('id', id)
    setSales(p => p.filter(s => s.id !== id))
  }

  async function saveSettings(patch: Partial<Settings>) {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await supabase.from('watch_settings').upsert({ household_id: householdId, ...updated })
  }

  const inp: React.CSSProperties = { background: 'var(--surface2)', border: '0.5px solid var(--border2)', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%' }
  const profitColor = (p: number) => p > 0 ? 'var(--green)' : p < 0 ? 'var(--red)' : 'var(--muted)'

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            style={{ ...inp, width: 'auto', fontSize: 12 }}>
            <option value="all">All time</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} sale{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={openNew}
          style={{ background: 'var(--acc2)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add sale
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

        {/* Main table */}
        <div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total revenue', val: totalRevenue, color: 'var(--green)' },
              { label: 'Total cost', val: totalCostAll, color: 'var(--red)' },
              { label: 'Total profit', val: totalProfit, color: profitColor(totalProfit) },
            ].map(s => (
              <div key={s.label} className="stat" style={{ padding: '12px 16px' }}>
                <div className="stat-lbl">{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: s.color, marginTop: 4 }}>{fmtCZK(s.val)}</div>
              </div>
            ))}
          </div>

          {/* Add / Edit form */}
          {showForm && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-head">
                <span className="card-title">{editId ? 'Edit sale' : 'New sale'}</span>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>✕</button>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date</label>
                    <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Customer</label>
                    <input value={form.customer} onChange={e => setForm(p => ({ ...p, customer: e.target.value }))} placeholder="e.g. Russian guy" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Watch name / model</label>
                    <input value={form.watch_name} onChange={e => setForm(p => ({ ...p, watch_name: e.target.value }))} placeholder="e.g. Tissot Seastar C350" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Revenue (Kč)</label>
                    <input type="number" value={form.revenue || ''} onChange={e => setForm(p => ({ ...p, revenue: parseFloat(e.target.value) || 0 }))} placeholder="0" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Watch cost from supplier (Kč)</label>
                    <input type="number" value={form.watch_cost || ''} onChange={e => setForm(p => ({ ...p, watch_cost: parseFloat(e.target.value) || 0 }))} placeholder="0" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Shipping cost (Kč)</label>
                    <input type="number" value={form.shipping_cost || ''} onChange={e => setForm(p => ({ ...p, shipping_cost: parseFloat(e.target.value) || 0 }))} placeholder="0" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Ads cost (Kč)</label>
                    <input type="number" value={form.ads_cost || ''} onChange={e => setForm(p => ({ ...p, ads_cost: parseFloat(e.target.value) || 0 }))} placeholder="0" style={inp} /></div>
                  <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
                    <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" style={inp} /></div>
                </div>
                {/* Preview profit */}
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Estimated profit</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: profitColor(form.revenue - form.watch_cost - form.shipping_cost - form.ads_cost) }}>
                    {fmtCZK(form.revenue - form.watch_cost - form.shipping_cost - form.ads_cost)}
                  </span>
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
                    {['Date', 'Customer', 'Watch', 'Revenue', 'Watch cost', 'Shipping', 'Ads', 'Total cost', 'Profit', ''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>No sales yet — click + Add sale above</td></tr>
                  ) : filtered.map((s, i) => {
                    const tc = totalCost(s)
                    const pr = profit(s)
                    return (
                      <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}
                        onClick={() => openEdit(s)}>
                        <td style={{ padding: '9px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 500 }}>{s.customer}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{s.watch_name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--green)', fontWeight: 500 }}>{fmtCZK(s.revenue)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{s.watch_cost > 0 ? fmtCZK(s.watch_cost) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{s.shipping_cost > 0 ? fmtCZK(s.shipping_cost) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{s.ads_cost > 0 ? fmtCZK(s.ads_cost) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--red)' }}>{fmtCZK(tc)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: profitColor(pr) }}>{fmtCZK(pr)}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); deleteSale(s.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 13, padding: 2 }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--border2)', background: 'var(--surface2)' }}>
                      <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 600, fontSize: 12 }}>Total ({filtered.length} sales)</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmtCZK(totalRevenue)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>{fmtCZK(totalWatchCost)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>{fmtCZK(totalShipping)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>{fmtCZK(totalAds)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{fmtCZK(totalCostAll)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: profitColor(totalProfit) }}>{fmtCZK(totalProfit)}</td>
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

          {/* Profit margin */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Profit margin</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: profitColor(totalProfit), letterSpacing: '-.02em' }}>
              {totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) : 0}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{fmtCZK(totalProfit)} profit on {fmtCZK(totalRevenue)}</div>
          </div>

          {/* Cost breakdown */}
          <div className="card">
            <div className="card-head"><span className="card-title">Cost breakdown</span></div>
            <div style={{ padding: '6px 0' }}>
              {[
                { l: 'Watch costs', v: totalWatchCost },
                { l: 'Shipping', v: totalShipping },
                { l: 'Ads', v: totalAds },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{r.l}</span>
                  <span style={{ fontWeight: 500 }}>{fmtCZK(r.v)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, fontWeight: 500, borderTop: '0.5px solid var(--border)' }}>
                <span>Total cost</span>
                <span style={{ color: 'var(--red)' }}>{fmtCZK(totalCostAll)}</span>
              </div>
            </div>
          </div>

          {/* Meta ads settings */}
          <div className="card">
            <div className="card-head"><span className="card-title">Meta ads</span></div>
            <div className="card-body">
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Total Meta ads spend (Kč)</label>
                <input type="number" value={settings.meta_ads_total || ''}
                  onChange={e => saveSettings({ meta_ads_total: parseFloat(e.target.value) || 0 })}
                  placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Ads cost per unit (Kč)</label>
                <input type="number" value={settings.meta_ads_per_unit || ''}
                  onChange={e => saveSettings({ meta_ads_per_unit: parseFloat(e.target.value) || 0 })}
                  placeholder="0" style={inp} />
              </div>
              {settings.meta_ads_total > 0 && filtered.length > 0 && (
                <div style={{ marginTop: 10, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>
                  Avg per sale: <strong style={{ color: 'var(--text)' }}>{fmtCZK(settings.meta_ads_total / filtered.length)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Per sale avg */}
          {filtered.length > 0 && (
            <div className="card">
              <div className="card-head"><span className="card-title">Averages per sale</span></div>
              <div style={{ padding: '6px 0' }}>
                {[
                  { l: 'Avg revenue', v: totalRevenue / filtered.length, c: 'var(--green)' },
                  { l: 'Avg cost', v: totalCostAll / filtered.length, c: 'var(--red)' },
                  { l: 'Avg profit', v: totalProfit / filtered.length, c: profitColor(totalProfit / filtered.length) },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{r.l}</span>
                    <span style={{ fontWeight: 500, color: r.c }}>{fmtCZK(r.v)}</span>
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
