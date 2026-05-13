'use client'
import { useState, useEffect, useRef } from 'react'
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
  const [newMonthName, setNewMonthName] = useState('')
  const [showNewMonth, setShowNewMonth] = useState(false)
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null)
  const newMonthRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  function fmt(n: number) {
    const v = cur === 'CZK' ? n : n / EUR_CZK
    if (cur === 'CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
    return '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const activeMonth = months.find(m => m.id === activeMonthId)
  const mSections = sections.filter(s => s.month_id === activeMonthId).sort((a,b) => a.sort_order - b.sort_order)
  const mHighlights = highlights.filter(h => h.month_id === activeMonthId)

  function secRows(secId: string) { return rows.filter(r => r.section_id === secId).sort((a,b) => a.sort_order - b.sort_order) }
  function secTotal(secId: string) { return secRows(secId).reduce((s, r) => s + (r.amount || 0), 0) }
  function totalIncome() { return mSections.filter(s => s.type === 'income').reduce((s, sec) => s + secTotal(sec.id), 0) }
  function totalExpense() { return mSections.filter(s => s.type === 'expense').reduce((s, sec) => s + secTotal(sec.id), 0) }
  function net() { return totalIncome() - totalExpense() }

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('cf-' + householdId)
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
    return () => { supabase.removeChannel(ch) }
  }, [householdId])

  async function createMonth() {
    const name = newMonthName.trim()
    if (!name) return
    const { data } = await supabase.from('cashflow_months').insert({ household_id: householdId, name, sort_order: months.length }).select().single()
    if (data) {
      setMonths(prev => [...prev, data])
      setActiveMonthId(data.id)
      setNewMonthName('')
      setShowNewMonth(false)
    }
  }

  async function renameMonth(id: string, name: string) {
    if (!name.trim()) return
    await supabase.from('cashflow_months').update({ name: name.trim() }).eq('id', id)
    setMonths(prev => prev.map(m => m.id === id ? { ...m, name: name.trim() } : m))
    setEditingMonthId(null)
  }

  async function deleteMonth(id: string) {
    await supabase.from('cashflow_months').delete().eq('id', id)
    setMonths(prev => prev.filter(m => m.id !== id))
    if (activeMonthId === id) setActiveMonthId(months.find(m => m.id !== id)?.id || null)
  }

  async function addSection(type: 'income' | 'expense') {
    if (!activeMonthId) return
    const title = type === 'income' ? 'Cash in' : 'Expenses'
    const { data } = await supabase.from('cashflow_sections').insert({ month_id: activeMonthId, household_id: householdId, title, type, sort_order: mSections.length }).select().single()
    if (data) {
      setSections(prev => [...prev, data])
      // Auto-add first empty row
      const { data: rowData } = await supabase.from('cashflow_rows').insert({ section_id: data.id, household_id: householdId, description: '', account: '', amount: 0, highlight: '', sort_order: 0 }).select().single()
      if (rowData) setRows(prev => [...prev, rowData])
    }
  }

  async function addRow(secId: string) {
    const existing = secRows(secId)
    const { data } = await supabase.from('cashflow_rows').insert({ section_id: secId, household_id: householdId, description: '', account: '', amount: 0, highlight: '', sort_order: existing.length }).select().single()
    if (data) {
      setRows(prev => [...prev, data])
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(`[data-sec="${secId}"] .desc-input`)
        if (inputs.length) inputs[inputs.length - 1].focus()
      }, 50)
    }
  }

  async function updateRow(rowId: string, field: string, val: string | number) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: val } : r))
    await supabase.from('cashflow_rows').update({ [field]: val }).eq('id', rowId)
  }

  async function deleteRow(rowId: string) {
    await supabase.from('cashflow_rows').delete().eq('id', rowId)
    setRows(prev => prev.filter(r => r.id !== rowId))
  }

  async function updateSectionTitle(secId: string, title: string) {
    setSections(prev => prev.map(s => s.id === secId ? { ...s, title } : s))
    await supabase.from('cashflow_sections').update({ title }).eq('id', secId)
  }

  async function deleteSection(secId: string) {
    await supabase.from('cashflow_sections').delete().eq('id', secId)
    setSections(prev => prev.filter(s => s.id !== secId))
    setRows(prev => prev.filter(r => r.section_id !== secId))
  }

  async function cycleHighlight(rowId: string, current: string) {
    const cycle = ['', '#f5a623', '#4fd896', '#5badee']
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length]
    await updateRow(rowId, 'highlight', next)
  }

  async function addHighlight() {
    if (!activeMonthId) return
    const { data } = await supabase.from('cashflow_highlights').insert({ month_id: activeMonthId, household_id: householdId, label: '', amount: 0, color: '#f5a623', sort_order: mHighlights.length }).select().single()
    if (data) {
      setHighlights(prev => [...prev, data])
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('.hl-label-input')
        if (inputs.length) inputs[inputs.length - 1].focus()
      }, 50)
    }
  }

  async function updateHighlight(hlId: string, field: string, val: string | number) {
    setHighlights(prev => prev.map(h => h.id === hlId ? { ...h, [field]: val } : h))
    await supabase.from('cashflow_highlights').update({ [field]: val }).eq('id', hlId)
  }

  async function deleteHighlight(hlId: string) {
    await supabase.from('cashflow_highlights').delete().eq('id', hlId)
    setHighlights(prev => prev.filter(h => h.id !== hlId))
  }

  function rowStyle(highlight: string): React.CSSProperties {
    const bg: Record<string, string> = { '#f5a623': 'rgba(245,166,35,.07)', '#4fd896': 'rgba(79,216,150,.07)', '#5badee': 'rgba(91,173,238,.07)' }
    return { background: bg[highlight] || 'transparent', borderLeft: highlight ? `3px solid ${highlight}` : '3px solid transparent' }
  }

  const netVal = net()
  const MONTHS_LIST = ['January','February','March','April','May','June','July','August','September','October','November','December']

  // Input style reused
  const cellInput = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: 'transparent', border: 'none', width: '100%', fontFamily: 'inherit',
    fontSize: 13, color: 'var(--text)', outline: 'none', ...extra
  })

  return (
    <div style={{ paddingBottom: 60 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>

        {/* Month tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {months.map(m => (
            <div key={m.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              {editingMonthId === m.id ? (
                <input
                  autoFocus
                  defaultValue={m.name}
                  onBlur={e => renameMonth(m.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameMonth(m.id, e.currentTarget.value); if (e.key === 'Escape') setEditingMonthId(null) }}
                  style={{ padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--acc)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 100, outline: 'none' }}
                />
              ) : (
                <button
                  onClick={() => setActiveMonthId(m.id)}
                  onDoubleClick={() => setEditingMonthId(m.id)}
                  style={{ padding: '5px 12px', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: m.id === activeMonthId ? 500 : 400, background: m.id === activeMonthId ? 'var(--surface)' : 'transparent', color: m.id === activeMonthId ? 'var(--text)' : 'var(--muted)', border: m.id === activeMonthId ? '0.5px solid var(--border2)' : '0.5px solid transparent' }}>
                  {m.name}
                </button>
              )}
            </div>
          ))}

          {showNewMonth ? (
            <input
              ref={newMonthRef}
              autoFocus
              value={newMonthName}
              onChange={e => setNewMonthName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createMonth(); if (e.key === 'Escape') { setShowNewMonth(false); setNewMonthName('') } }}
              onBlur={() => { if (newMonthName.trim()) createMonth(); else { setShowNewMonth(false); setNewMonthName('') } }}
              placeholder={MONTHS_LIST[months.length % 12]}
              style={{ padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--acc)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 100, outline: 'none' }}
            />
          ) : (
            <button onClick={() => setShowNewMonth(true)} style={{ padding: '5px 10px', border: '0.5px dashed var(--border2)', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit' }}>
              + Month
            </button>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, gap: 2 }}>
            {(['CZK', 'EUR'] as const).map(c => (
              <button key={c} onClick={() => setCur(c)} style={{ padding: '4px 11px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: cur === c ? 500 : 400, background: cur === c ? 'var(--surface)' : 'transparent', color: cur === c ? 'var(--text)' : 'var(--muted)' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {!activeMonthId ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
          Click <strong style={{ color: 'var(--text)' }}>+ Month</strong> above to start tracking
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

          {/* ── Left: sections ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {mSections.map(sec => {
              const sRows = secRows(sec.id)
              const total = secTotal(sec.id)
              const isIncome = sec.type === 'income'
              return (
                <div key={sec.id} className="card" data-sec={sec.id}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '0.5px solid var(--border)', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isIncome ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
                    <input
                      defaultValue={sec.title}
                      onBlur={e => updateSectionTitle(sec.id, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                      style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: isIncome ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{fmt(total)}</span>
                    <button onClick={() => deleteSection(sec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: '2px 4px', opacity: 0.5, flexShrink: 0 }} onMouseOver={e => (e.currentTarget.style.opacity = '1')} onMouseOut={e => (e.currentTarget.style.opacity = '0.5')}>✕</button>
                  </div>

                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 52px', borderBottom: '0.5px solid var(--border)', padding: '4px 14px', background: 'var(--surface2)' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Description</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Account</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>Amount</span>
                    <span />
                  </div>

                  {/* Rows */}
                  {sRows.map((row, ri) => (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 52px', alignItems: 'center', padding: '1px 14px', borderBottom: ri < sRows.length - 1 ? '0.5px solid var(--border)' : 'none', ...rowStyle(row.highlight) }}>
                      <input
                        className="desc-input"
                        defaultValue={row.description}
                        placeholder="Description"
                        onBlur={e => updateRow(row.id, 'description', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow(sec.id) } if (e.key === 'Tab') { /* natural tab */ } }}
                        style={{ ...cellInput(), padding: '7px 0' }}
                      />
                      <input
                        defaultValue={row.account}
                        placeholder="Account"
                        onBlur={e => updateRow(row.id, 'account', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addRow(sec.id) }}
                        style={{ ...cellInput({ fontSize: 12, color: 'var(--muted)' }), padding: '7px 8px' }}
                      />
                      <input
                        key={cur + row.id}
                        defaultValue={row.amount > 0 ? (cur === 'CZK' ? Math.round(row.amount) : +(row.amount / EUR_CZK).toFixed(2)) : ''}
                        placeholder="0"
                        type="number"
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          updateRow(row.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK))
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow(sec.id) } }}
                        style={{ ...cellInput({ fontWeight: 500, color: isIncome ? 'var(--green)' : 'var(--red)', textAlign: 'right' }), padding: '7px 0' }}
                      />
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center', padding: '7px 0' }}>
                        <button onClick={() => cycleHighlight(row.id, row.highlight)} title="Highlight" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: row.highlight || 'var(--faint)', border: '1.5px solid var(--border2)', transition: 'background .15s' }} />
                        </button>
                        <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 2, opacity: 0 }} onMouseOver={e => (e.currentTarget.style.opacity = '1')} onMouseOut={e => (e.currentTarget.style.opacity = '0')}>✕</button>
                      </div>
                    </div>
                  ))}

                  {/* Add row */}
                  <button onClick={() => addRow(sec.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, color: 'var(--faint)', cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', width: '100%', borderTop: sRows.length > 0 ? '0.5px solid var(--border)' : 'none' }} onMouseOver={e => (e.currentTarget.style.color = 'var(--muted)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}>
                    <span>+</span> Add row <span style={{ fontSize: 10, marginLeft: 4, opacity: .6 }}>or press Enter</span>
                  </button>
                </div>
              )
            })}

            {/* Add section — simple two buttons, no modal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => addSection('income')}
                style={{ padding: '10px 16px', border: '0.5px dashed rgba(79,216,150,.4)', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>+</span> Income section
              </button>
              <button onClick={() => addSection('expense')}
                style={{ padding: '10px 16px', border: '0.5px dashed rgba(240,99,117,.4)', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>+</span> Expense section
              </button>
            </div>
          </div>

          {/* ── Right: summary ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>

            {/* Net */}
            <div className="card" style={{ padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Net — {activeMonth?.name}</div>
              <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em', color: netVal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netVal)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{netVal >= 0 ? 'surplus' : 'deficit'}</div>
            </div>

            {/* Totals */}
            <div className="card">
              <div className="card-head"><span className="card-title">Summary</span></div>
              <div className="card-body" style={{ padding: '8px 0' }}>
                {[
                  { label: 'Cash in', val: totalIncome(), color: 'var(--green)' },
                  { label: 'Cash out', val: totalExpense(), color: 'var(--red)' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: row.color }}>{fmt(row.val)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, borderTop: '0.5px solid var(--border)', fontWeight: 500 }}>
                  <span>Net</span>
                  <span style={{ color: netVal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netVal)}</span>
                </div>
                {mSections.length > 0 && (
                  <div style={{ borderTop: '0.5px solid var(--border)', padding: '6px 0' }}>
                    {mSections.map(sec => (
                      <div key={sec.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 16px', fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)' }}>{sec.title}</span>
                        <span style={{ fontWeight: 500, color: sec.type === 'income' ? 'var(--green)' : 'var(--red)' }}>{fmt(secTotal(sec.id))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Highlights */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Notes & balances</span>
                <button onClick={addHighlight} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontFamily: 'inherit', padding: '2px 6px' }}>+ Add</button>
              </div>
              {mHighlights.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>Current balances, targets, notes…</div>
              ) : mHighlights.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '0.5px solid var(--border)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
                  <input
                    className="hl-label-input"
                    defaultValue={h.label}
                    placeholder="Label"
                    onBlur={e => updateHighlight(h.id, 'label', e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }}
                  />
                  <input
                    key={cur + h.id}
                    defaultValue={h.amount > 0 ? (cur === 'CZK' ? Math.round(h.amount) : +(h.amount / EUR_CZK).toFixed(2)) : ''}
                    type="number" placeholder="0"
                    onBlur={e => {
                      const v = parseFloat(e.target.value) || 0
                      updateHighlight(h.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK))
                    }}
                    style={{ width: 72, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text)', outline: 'none', textAlign: 'right' }}
                  />
                  <button onClick={() => deleteHighlight(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 2, opacity: 0.5 }} onMouseOver={e => (e.currentTarget.style.opacity = '1')} onMouseOut={e => (e.currentTarget.style.opacity = '0.5')}>✕</button>
                </div>
              ))}
            </div>

            {/* Month actions */}
            {activeMonthId && (
              <button onClick={() => { if (confirm('Delete this month and all its data?')) deleteMonth(activeMonthId) }}
                style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '7px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Delete {activeMonth?.name}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
