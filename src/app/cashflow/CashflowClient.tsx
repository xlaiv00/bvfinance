'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const EUR_CZK = 24.5

interface CfMonth { id: string; name: string; sort_order: number }
interface CfSection { id: string; month_id: string; title: string; type: string; sort_order: number }
interface CfRow { id: string; section_id: string; description: string; account: string; amount: number; highlight: string; sort_order: number }
interface CfHighlight { id: string; month_id: string; label: string; amount: number; color: string; sort_order: number }

interface Props {
  householdId: string
  initialMonths: CfMonth[]
  initialSections: CfSection[]
  initialRows: CfRow[]
  initialHighlights: CfHighlight[]
}

export default function CashflowClient({ householdId, initialMonths, initialSections, initialRows, initialHighlights }: Props) {
  const [months, setMonths] = useState<CfMonth[]>(initialMonths)
  const [sections, setSections] = useState<CfSection[]>(initialSections)
  const [rows, setRows] = useState<CfRow[]>(initialRows)
  const [highlights, setHighlights] = useState<CfHighlight[]>(initialHighlights)
  const [activeMonthId, setActiveMonthId] = useState<string | null>(initialMonths[0]?.id || null)
  const [cur, setCur] = useState<'CZK' | 'EUR'>('CZK')
  const supabase = createClient()

  function fmt(n: number) {
    if (cur === 'CZK') return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
    return '€' + (n / EUR_CZK).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const activeMonth = months.find(m => m.id === activeMonthId) || months[0]
  const mSections = sections.filter(s => s.month_id === activeMonthId)
  const mHighlights = highlights.filter(h => h.month_id === activeMonthId)

  function secRows(secId: string) { return rows.filter(r => r.section_id === secId) }
  function secTotal(secId: string) { return secRows(secId).reduce((s, r) => s + (r.amount || 0), 0) }
  function totalIncome() { return mSections.filter(s => s.type === 'income').reduce((s, sec) => s + secTotal(sec.id), 0) }
  function totalExpense() { return mSections.filter(s => s.type === 'expense').reduce((s, sec) => s + secTotal(sec.id), 0) }
  function netFlow() { return totalIncome() - totalExpense() }

  // Realtime sync
  useEffect(() => {
    const channel = supabase.channel('cashflow-' + householdId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_months' }, () => {
        supabase.from('cashflow_months').select('*').eq('household_id', householdId).order('sort_order').order('created_at').then(({ data }) => { if (data) setMonths(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_sections' }, () => {
        supabase.from('cashflow_sections').select('*').eq('household_id', householdId).order('sort_order').then(({ data }) => { if (data) setSections(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_rows' }, () => {
        supabase.from('cashflow_rows').select('*').eq('household_id', householdId).order('sort_order').then(({ data }) => { if (data) setRows(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_highlights' }, () => {
        supabase.from('cashflow_highlights').select('*').eq('household_id', householdId).order('sort_order').then(({ data }) => { if (data) setHighlights(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId])

  async function addMonth() {
    const name = prompt('Month name:')
    if (!name) return
    const { data } = await supabase.from('cashflow_months').insert({ household_id: householdId, name, sort_order: months.length }).select().single()
    if (data) { setMonths(prev => [...prev, data]); setActiveMonthId(data.id) }
  }

  async function addSection(type: string) {
    if (!activeMonthId) return
    const title = prompt(type === 'income' ? 'Income section name:' : 'Expense section name:')
    if (!title) return
    const { data } = await supabase.from('cashflow_sections').insert({ month_id: activeMonthId, household_id: householdId, title, type, sort_order: mSections.length }).select().single()
    if (data) setSections(prev => [...prev, data])
  }

  async function deleteSection(secId: string) {
    if (!confirm('Delete this section and all its rows?')) return
    await supabase.from('cashflow_sections').delete().eq('id', secId)
    setSections(prev => prev.filter(s => s.id !== secId))
    setRows(prev => prev.filter(r => r.section_id !== secId))
  }

  async function addRow(secId: string) {
    const { data } = await supabase.from('cashflow_rows').insert({ section_id: secId, household_id: householdId, description: '', account: '', amount: 0, highlight: '', sort_order: secRows(secId).length }).select().single()
    if (data) setRows(prev => [...prev, data])
  }

  async function updateRow(rowId: string, field: string, val: string | number) {
    const update: Record<string, string | number> = { [field]: val }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: val } : r))
    await supabase.from('cashflow_rows').update(update).eq('id', rowId)
  }

  async function deleteRow(rowId: string) {
    await supabase.from('cashflow_rows').delete().eq('id', rowId)
    setRows(prev => prev.filter(r => r.id !== rowId))
  }

  async function cycleHighlight(rowId: string, current: string) {
    const cycle = ['', '#EF9F27', '#4fd896', '#5badee']
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length]
    await updateRow(rowId, 'highlight', next)
  }

  async function addHighlight() {
    if (!activeMonthId) return
    const { data } = await supabase.from('cashflow_highlights').insert({ month_id: activeMonthId, household_id: householdId, label: 'New note', amount: 0, color: '#EF9F27', sort_order: mHighlights.length }).select().single()
    if (data) setHighlights(prev => [...prev, data])
  }

  async function updateHighlight(hlId: string, field: string, val: string | number) {
    setHighlights(prev => prev.map(h => h.id === hlId ? { ...h, [field]: val } : h))
    await supabase.from('cashflow_highlights').update({ [field]: val }).eq('id', hlId)
  }

  async function deleteHighlight(hlId: string) {
    await supabase.from('cashflow_highlights').delete().eq('id', hlId)
    setHighlights(prev => prev.filter(h => h.id !== hlId))
  }

  function rowBg(highlight: string) {
    if (highlight === '#EF9F27') return 'rgba(245,166,35,.08)'
    if (highlight === '#4fd896') return 'rgba(79,216,150,.08)'
    if (highlight === '#5badee') return 'rgba(91,173,238,.08)'
    return 'transparent'
  }
  function rowBorderLeft(highlight: string) {
    return highlight ? `3px solid ${highlight}` : '3px solid transparent'
  }

  const net = netFlow()

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3, overflowX: 'auto', maxWidth: 400 }}>
          {months.map(m => (
            <button key={m.id} onClick={() => setActiveMonthId(m.id)}
              style={{ padding: '5px 12px', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: m.id === activeMonthId ? 500 : 400, background: m.id === activeMonthId ? 'var(--surface)' : 'transparent', color: m.id === activeMonthId ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
              {m.name}
            </button>
          ))}
          <button onClick={addMonth} style={{ padding: '5px 10px', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: 'var(--muted)', whiteSpace: 'nowrap' }}>+ Month</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, gap: 2 }}>
            {(['CZK', 'EUR'] as const).map(c => (
              <button key={c} onClick={() => setCur(c)} style={{ padding: '4px 11px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: cur === c ? 500 : 400, background: cur === c ? 'var(--surface)' : 'transparent', color: cur === c ? 'var(--text)' : 'var(--muted)' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {!activeMonthId ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 13 }}>
          Click <strong>+ Month</strong> to create your first cashflow month
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
          {/* Left — sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mSections.map(sec => {
              const sRows = secRows(sec.id)
              const total = secTotal(sec.id)
              return (
                <div key={sec.id} className="card">
                  <div className="card-head">
                    <span className="card-title">{sec.title}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: sec.type === 'income' ? 'var(--green)' : 'var(--red)' }}>{fmt(total)}</span>
                      <button onClick={() => deleteSection(sec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 13, padding: '2px 4px', borderRadius: 4 }} title="Delete section">🗑</button>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <th style={{ padding: '6px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 500, textAlign: 'left', borderBottom: '0.5px solid var(--border)', width: '46%' }}>Description</th>
                          <th style={{ padding: '6px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 500, textAlign: 'left', borderBottom: '0.5px solid var(--border)', width: '22%' }}>Account</th>
                          <th style={{ padding: '6px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 500, textAlign: 'right', borderBottom: '0.5px solid var(--border)', width: '22%' }}>Amount</th>
                          <th style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border)', width: '10%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sRows.map((row, ri) => (
                          <tr key={row.id} style={{ background: rowBg(row.highlight), borderLeft: rowBorderLeft(row.highlight), borderBottom: ri < sRows.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                            <td style={{ padding: '6px 14px' }}>
                              <input
                                defaultValue={row.description}
                                placeholder="Description"
                                onBlur={e => updateRow(row.id, 'description', e.target.value)}
                                style={{ background: 'transparent', border: 'none', width: '100%', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                                onFocus={e => (e.target.style.background = 'var(--surface2)', e.target.style.borderRadius = '4px', e.target.style.padding = '1px 4px')}
                              />
                            </td>
                            <td style={{ padding: '6px 14px' }}>
                              <input
                                defaultValue={row.account}
                                placeholder="Account"
                                onBlur={e => updateRow(row.id, 'account', e.target.value)}
                                style={{ background: 'transparent', border: 'none', width: '100%', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                                onFocus={e => (e.target.style.background = 'var(--surface2)', e.target.style.borderRadius = '4px', e.target.style.padding = '1px 4px')}
                              />
                            </td>
                            <td style={{ padding: '6px 14px', textAlign: 'right' }}>
                              <input
                                defaultValue={row.amount > 0 ? (cur === 'CZK' ? Math.round(row.amount) : +(row.amount / EUR_CZK).toFixed(2)) : ''}
                                placeholder="0"
                                type="number"
                                onBlur={e => {
                                  const v = parseFloat(e.target.value) || 0
                                  const stored = cur === 'CZK' ? v : v * EUR_CZK
                                  updateRow(row.id, 'amount', stored)
                                }}
                                style={{ background: 'transparent', border: 'none', width: '100%', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: sec.type === 'income' ? 'var(--green)' : 'var(--red)', outline: 'none', textAlign: 'right' }}
                                onFocus={e => (e.target.style.background = 'var(--surface2)', e.target.style.borderRadius = '4px')}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button onClick={() => cycleHighlight(row.id, row.highlight)} title="Highlight" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: row.highlight || 'var(--faint)', border: '1.5px solid var(--border2)' }} />
                                </button>
                                <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 13, padding: 2, borderRadius: 4 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => addRow(sec.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', width: '100%', textAlign: 'left', borderTop: sRows.length > 0 ? '0.5px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 14 }}>+</span> Add row
                  </button>
                </div>
              )
            })}

            {/* Add section buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => addSection('income')} style={{ flex: 1, padding: '10px', border: '0.5px dashed var(--border2)', borderRadius: 12, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--green)' }}>
                + Add income section
              </button>
              <button onClick={() => addSection('expense')} style={{ flex: 1, padding: '10px', border: '0.5px dashed var(--border2)', borderRadius: 12, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--red)' }}>
                + Add expense section
              </button>
            </div>
          </div>

          {/* Right — summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
            {/* Net card */}
            <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Net cashflow — {activeMonth?.name}</div>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-.02em', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{net >= 0 ? 'surplus' : 'deficit'}</div>
            </div>

            {/* Summary breakdown */}
            <div className="card">
              <div className="card-head"><span className="card-title">Summary</span></div>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Total cash in</span>
                  <span style={{ fontWeight: 500, color: 'var(--green)' }}>{fmt(totalIncome())}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Total cash out</span>
                  <span style={{ fontWeight: 500, color: 'var(--red)' }}>{fmt(totalExpense())}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13, fontWeight: 500 }}>
                  <span>Net</span>
                  <span style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</span>
                </div>
                {mSections.map(sec => (
                  <div key={sec.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{sec.title}</span>
                    <span style={{ fontWeight: 500, color: sec.type === 'income' ? 'var(--green)' : 'var(--red)' }}>{fmt(secTotal(sec.id))}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Highlights & notes</span>
                <button onClick={addHighlight} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontFamily: 'inherit' }}>+ Add</button>
              </div>
              <div className="card-body" style={{ padding: mHighlights.length === 0 ? '12px 16px' : '8px 0' }}>
                {mHighlights.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>No highlights yet</div>
                ) : mHighlights.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
                    <input
                      defaultValue={h.label}
                      onBlur={e => updateHighlight(h.id, 'label', e.target.value)}
                      style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }}
                    />
                    <input
                      defaultValue={h.amount > 0 ? (cur === 'CZK' ? Math.round(h.amount) : +(h.amount / EUR_CZK).toFixed(2)) : ''}
                      type="number"
                      placeholder="0"
                      onBlur={e => {
                        const v = parseFloat(e.target.value) || 0
                        updateHighlight(h.id, 'amount', cur === 'CZK' ? v : v * EUR_CZK)
                      }}
                      style={{ width: 72, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text)', outline: 'none', textAlign: 'right' }}
                    />
                    <button onClick={() => deleteHighlight(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
