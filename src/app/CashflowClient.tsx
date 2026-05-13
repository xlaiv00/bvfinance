'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const EUR_CZK = 24.5

interface CfMonth { id: string; name: string; sort_order: number }
interface CfRow {
  id: string; month_id: string; household_id: string
  description: string; account: string; amount: number
  type: 'in' | 'out'; category: string; highlight: string; sort_order: number
}
interface CfNote { id: string; month_id: string; label: string; amount: number; color: string }

interface Props {
  householdId: string
  initialMonths: CfMonth[]
  initialRows: CfRow[]
  initialNotes: CfNote[]
}

const HIGHLIGHT_CYCLE = ['', '#f5a623', '#4fd896', '#5badee']
const MONTHS_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function CashflowClient({ householdId, initialMonths, initialRows, initialNotes }: Props) {
  const [months, setMonths] = useState<CfMonth[]>(initialMonths)
  const [rows, setRows] = useState<CfRow[]>(initialRows)
  const [notes, setNotes] = useState<CfNote[]>(initialNotes)
  const [activeMonthId, setActiveMonthId] = useState<string | null>(initialMonths[0]?.id || null)
  const [cur, setCur] = useState<'CZK' | 'EUR'>('CZK')
  const [addingMonth, setAddingMonth] = useState(false)
  const [newMonthName, setNewMonthName] = useState('')
  const supabase = createClient()

  const mRows = rows.filter(r => r.month_id === activeMonthId)
  const inRows = mRows.filter(r => r.type === 'in')
  const outRows = mRows.filter(r => r.type === 'out')
  const totalIn = inRows.reduce((s, r) => s + (r.amount || 0), 0)
  const totalOut = outRows.reduce((s, r) => s + (r.amount || 0), 0)
  const net = totalIn - totalOut
  const mNotes = notes.filter(n => n.month_id === activeMonthId)
  const activeMonth = months.find(m => m.id === activeMonthId)

  function fmt(n: number) {
    const v = cur === 'CZK' ? n : n / EUR_CZK
    if (cur === 'CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
    return '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('cf2-' + householdId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_rows' }, () => {
        supabase.from('cashflow_rows').select('*').eq('household_id', householdId).order('sort_order')
          .then(({ data }) => { if (data) setRows(data as CfRow[]) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_months' }, () => {
        supabase.from('cashflow_months').select('*').eq('household_id', householdId).order('sort_order').order('created_at')
          .then(({ data }) => { if (data) setMonths(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashflow_highlights' }, () => {
        supabase.from('cashflow_highlights').select('*').eq('household_id', householdId)
          .then(({ data }) => { if (data) setNotes(data as CfNote[]) })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [householdId])

  async function createMonth() {
    const name = newMonthName.trim() || MONTHS_NAMES[months.length % 12]
    const { data } = await supabase.from('cashflow_months')
      .insert({ household_id: householdId, name, sort_order: months.length })
      .select().single()
    if (data) {
      setMonths(prev => [...prev, data])
      setActiveMonthId(data.id)
      setNewMonthName('')
      setAddingMonth(false)
    }
  }

  async function addRow(type: 'in' | 'out', focusLast = true) {
    if (!activeMonthId) return
    const existing = mRows.filter(r => r.type === type)
    const { data } = await supabase.from('cashflow_rows')
      .insert({ month_id: activeMonthId, household_id: householdId, description: '', account: '', amount: 0, type, category: '', highlight: '', sort_order: existing.length })
      .select().single()
    if (data) {
      setRows(prev => [...prev, data as CfRow])
      if (focusLast) {
        setTimeout(() => {
          const inputs = document.querySelectorAll<HTMLInputElement>(`[data-type="${type}"] .desc-inp`)
          inputs[inputs.length - 1]?.focus()
        }, 40)
      }
    }
  }

  async function updateRow(id: string, field: string, val: string | number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
    await supabase.from('cashflow_rows').update({ [field]: val }).eq('id', id)
  }

  async function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
    await supabase.from('cashflow_rows').delete().eq('id', id)
  }

  async function cycleHL(row: CfRow) {
    const next = HIGHLIGHT_CYCLE[(HIGHLIGHT_CYCLE.indexOf(row.highlight) + 1) % HIGHLIGHT_CYCLE.length]
    await updateRow(row.id, 'highlight', next)
  }

  async function addNote() {
    if (!activeMonthId) return
    const { data } = await supabase.from('cashflow_highlights')
      .insert({ month_id: activeMonthId, household_id: householdId, label: '', amount: 0, color: '#f5a623' })
      .select().single()
    if (data) {
      setNotes(prev => [...prev, data as CfNote])
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('.note-label-inp')
        inputs[inputs.length - 1]?.focus()
      }, 40)
    }
  }

  async function updateNote(id: string, field: string, val: string | number) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, [field]: val } : n))
    await supabase.from('cashflow_highlights').update({ [field]: val }).eq('id', id)
  }

  async function deleteNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
    await supabase.from('cashflow_highlights').delete().eq('id', id)
  }

  function hlBg(h: string) {
    const map: Record<string, string> = { '#f5a623': 'rgba(245,166,35,.09)', '#4fd896': 'rgba(79,216,150,.09)', '#5badee': 'rgba(91,173,238,.09)' }
    return map[h] || ''
  }

  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 13,
    color: 'var(--text)', outline: 'none', width: '100%', ...extra
  })

  function RowLine({ row, type }: { row: CfRow; type: 'in' | 'out' }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 44px', alignItems: 'center', borderBottom: '0.5px solid var(--border)', background: hlBg(row.highlight), borderLeft: row.highlight ? `3px solid ${row.highlight}` : '3px solid transparent', transition: 'background .15s' }}
        className="cf-row">
        <input className="desc-inp" defaultValue={row.description} placeholder="Description…"
          onBlur={e => updateRow(row.id, 'description', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow(type) } }}
          style={{ ...inp(), padding: '8px 14px' }} />
        <input defaultValue={row.account} placeholder="Account"
          onBlur={e => updateRow(row.id, 'account', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addRow(type) }}
          style={{ ...inp({ fontSize: 12, color: 'var(--muted)' }), padding: '8px 10px', borderLeft: '0.5px solid var(--border)' }} />
        <input key={cur + row.id} type="number"
          defaultValue={row.amount > 0 ? (cur === 'CZK' ? Math.round(row.amount) : +(row.amount / EUR_CZK).toFixed(2)) : ''}
          placeholder="0"
          onBlur={e => {
            const v = parseFloat(e.target.value) || 0
            updateRow(row.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK))
          }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow(type) } }}
          style={{ ...inp({ fontWeight: 500, textAlign: 'right', color: type === 'in' ? 'var(--green)' : 'var(--red)' }), padding: '8px 14px 8px 10px', borderLeft: '0.5px solid var(--border)' }} />
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', borderLeft: '0.5px solid var(--border)', height: '100%' }}>
          <button onClick={() => cycleHL(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.highlight || 'var(--faint)', border: '1.5px solid var(--border2)', display: 'inline-block' }} />
          </button>
          <button onClick={() => deleteRow(row.id)} className="row-del" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 2, opacity: 0 }}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`.cf-row:hover .row-del { opacity: 1 !important }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {months.map(m => (
            <button key={m.id} onClick={() => setActiveMonthId(m.id)}
              style={{ padding: '5px 14px', border: m.id === activeMonthId ? '0.5px solid var(--border2)' : '0.5px solid transparent', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: m.id === activeMonthId ? 500 : 400, background: m.id === activeMonthId ? 'var(--surface)' : 'transparent', color: m.id === activeMonthId ? 'var(--text)' : 'var(--muted)' }}>
              {m.name}
            </button>
          ))}
          {addingMonth ? (
            <input autoFocus value={newMonthName} onChange={e => setNewMonthName(e.target.value)}
              placeholder={MONTHS_NAMES[months.length % 12]}
              onKeyDown={e => { if (e.key === 'Enter') createMonth(); if (e.key === 'Escape') setAddingMonth(false) }}
              onBlur={() => newMonthName.trim() ? createMonth() : setAddingMonth(false)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--acc)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 110, outline: 'none' }} />
          ) : (
            <button onClick={() => setAddingMonth(true)}
              style={{ padding: '5px 10px', border: '0.5px dashed var(--border2)', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit' }}>
              + Month
            </button>
          )}
        </div>
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, gap: 2 }}>
          {(['CZK', 'EUR'] as const).map(c => (
            <button key={c} onClick={() => setCur(c)} style={{ padding: '4px 11px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: cur === c ? 500 : 400, background: cur === c ? 'var(--surface)' : 'transparent', color: cur === c ? 'var(--text)' : 'var(--muted)' }}>{c}</button>
          ))}
        </div>
      </div>

      {!activeMonthId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
          Click <strong style={{ color: 'var(--text)' }}>+ Month</strong> to start
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 256px', gap: 16, alignItems: 'start' }}>

          {/* Main table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* CASH IN */}
            <div className="card" data-type="in">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Cash in</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--green)' }}>{fmt(totalIn)}</span>
              </div>
              {/* Col headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 44px', padding: '5px 0', background: 'var(--surface2)', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 14px' }}>Description</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 10px', borderLeft: '0.5px solid var(--border)' }}>Account</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 14px 0 10px', textAlign: 'right', borderLeft: '0.5px solid var(--border)' }}>Amount</span>
                <span />
              </div>
              {inRows.map(row => <RowLine key={row.id} row={row} type="in" />)}
              <button onClick={() => addRow('in')} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--faint)', borderTop: inRows.length > 0 ? '0.5px solid var(--border)' : 'none', textAlign: 'left' }}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--green)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}>
                + Add row <span style={{ fontSize: 10, opacity: .5, marginLeft: 2 }}>or press Enter in any field</span>
              </button>
            </div>

            {/* CASH OUT */}
            <div className="card" data-type="out">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Cash out</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--red)' }}>{fmt(totalOut)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 44px', padding: '5px 0', background: 'var(--surface2)', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 14px' }}>Description</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 10px', borderLeft: '0.5px solid var(--border)' }}>Account</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 14px 0 10px', textAlign: 'right', borderLeft: '0.5px solid var(--border)' }}>Amount</span>
                <span />
              </div>
              {outRows.map(row => <RowLine key={row.id} row={row} type="out" />)}
              <button onClick={() => addRow('out')} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--faint)', borderTop: outRows.length > 0 ? '0.5px solid var(--border)' : 'none', textAlign: 'left' }}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--red)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}>
                + Add row <span style={{ fontSize: 10, opacity: .5, marginLeft: 2 }}>or press Enter in any field</span>
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>

            {/* Net */}
            <div className="card" style={{ padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{activeMonth?.name} — net</div>
              <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{net >= 0 ? 'surplus' : 'deficit'}</div>
            </div>

            {/* Breakdown */}
            <div className="card">
              <div className="card-head"><span className="card-title">Breakdown</span></div>
              <div style={{ padding: '6px 0' }}>
                {[
                  { label: 'Cash in', val: totalIn, col: 'var(--green)' },
                  { label: 'Cash out', val: totalOut, col: 'var(--red)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                    <span style={{ fontWeight: 500, color: r.col }}>{fmt(r.val)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 6px', fontSize: 13, fontWeight: 500, borderTop: '0.5px solid var(--border)', marginTop: 2 }}>
                  <span>Net</span>
                  <span style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Notes & balances</span>
                <button onClick={addNote} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontFamily: 'inherit', padding: '2px 4px' }}>+ Add</button>
              </div>
              {mNotes.length === 0 ? (
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
                  Add current balances or notes
                </div>
              ) : mNotes.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderTop: '0.5px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
                  <input className="note-label-inp" defaultValue={n.label} placeholder="Label"
                    onBlur={e => updateNote(n.id, 'label', e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }} />
                  <input key={cur + n.id} type="number"
                    defaultValue={n.amount > 0 ? (cur === 'CZK' ? Math.round(n.amount) : +(n.amount / EUR_CZK).toFixed(2)) : ''}
                    placeholder="0"
                    onBlur={e => {
                      const v = parseFloat(e.target.value) || 0
                      updateNote(n.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK))
                    }}
                    style={{ width: 72, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text)', outline: 'none', textAlign: 'right' }} />
                  <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 2 }}>✕</button>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  )
}
