'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const EUR_CZK = 24.5

interface Month { id: string; name: string; sort_order: number }
interface Row { id: string; month_id: string; type: string; description: string; account: string; amount: number; highlight: string }
interface Note { id: string; month_id: string; label: string; amount: number; color: string }

export default function CashflowClient({ householdId }: { householdId: string }) {
  const [months, setMonths] = useState<Month[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cur, setCur] = useState<'CZK' | 'EUR'>('CZK')
  const [newMonth, setNewMonth] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const [m, r, n] = await Promise.all([
      supabase.from('cashflow_months').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('cashflow_rows').select('*').eq('household_id', householdId),
      supabase.from('cashflow_highlights').select('*').eq('household_id', householdId),
    ])
    if (m.data) { setMonths(m.data); if (!activeId && m.data.length > 0) setActiveId(m.data[0].id) }
    if (r.data) setRows(r.data)
    if (n.data) setNotes(n.data)
  }

  function fmt(n: number) {
    const v = cur === 'CZK' ? n : n / EUR_CZK
    return cur === 'CZK'
      ? Math.round(v).toLocaleString('cs-CZ') + ' Kč'
      : '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const mRows = rows.filter(r => r.month_id === activeId)
  const inRows = mRows.filter(r => r.type === 'in')
  const outRows = mRows.filter(r => r.type === 'out')
  const totalIn = inRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalOut = outRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const net = totalIn - totalOut
  const mNotes = notes.filter(n => n.month_id === activeId)
  const active = months.find(m => m.id === activeId)

  async function createMonth() {
    const name = newMonth.trim()
    if (!name) return
    const { data } = await supabase.from('cashflow_months')
      .insert({ household_id: householdId, name, sort_order: months.length })
      .select().single()
    if (data) {
      setMonths(p => [...p, data])
      setActiveId(data.id)
      setNewMonth('')
      setShowAdd(false)
    }
  }

  async function deleteMonth(id: string) {
    await supabase.from('cashflow_months').delete().eq('id', id)
    const next = months.find(m => m.id !== id)
    setMonths(p => p.filter(m => m.id !== id))
    setRows(p => p.filter(r => r.month_id !== id))
    setNotes(p => p.filter(n => n.month_id !== id))
    setActiveId(next?.id || null)
  }

  async function addRow(type: string) {
    if (!activeId) return
    const { data } = await supabase.from('cashflow_rows')
      .insert({ month_id: activeId, household_id: householdId, type, description: '', account: '', amount: 0, highlight: '' })
      .select().single()
    if (data) setRows(p => [...p, data])
  }

  async function saveRow(id: string, field: string, val: string | number) {
    const updated = rows.map(r => r.id === id ? { ...r, [field]: val } : r)
    setRows(updated)
    await supabase.from('cashflow_rows').update({ [field]: val }).eq('id', id)

    // Mirror to main expenses/contributions when row is complete
    const row = updated.find(r => r.id === id)
    if (!row || !row.description || !row.amount || row.amount <= 0) return
    const active = months.find(m => m.id === activeId)
    const monthName = active?.name || 'Cashflow'

    if (row.type === 'out') {
      // Write to expenses — upsert by cashflow row id stored in description prefix
      const existing = await supabase.from('expenses')
        .select('id').eq('household_id', householdId)
        .eq('description', '[' + monthName + '] ' + row.description).maybeSingle()
      const today = new Date().toISOString().split('T')[0]
      if (existing.data) {
        await supabase.from('expenses').update({ amount: row.amount, amount_eur: row.amount / 24.5, description: '[' + monthName + '] ' + row.description }).eq('id', existing.data.id)
      } else {
        await supabase.from('expenses').insert({ household_id: householdId, description: '[' + monthName + '] ' + row.description, amount: row.amount, currency: 'CZK', amount_eur: row.amount / 24.5, category: 'Other', paid_by: 'joint', date: today })
      }
    } else if (row.type === 'in') {
      // Write to contributions
      const existing = await supabase.from('contributions')
        .select('id').eq('household_id', householdId)
        .eq('note', '[' + monthName + '] ' + row.description).maybeSingle()
      const today = new Date().toISOString().split('T')[0]
      if (existing.data) {
        await supabase.from('contributions').update({ amount: row.amount, amount_eur: row.amount / 24.5 }).eq('id', existing.data.id)
      } else {
        await supabase.from('contributions').insert({ household_id: householdId, person: 'joint', amount: row.amount, currency: 'CZK', amount_eur: row.amount / 24.5, date: today, note: '[' + monthName + '] ' + row.description })
      }
    }
  }

  async function deleteRow(id: string) {
    // Find the row before deleting so we can clean up mirrors
    const row = rows.find(r => r.id === id)
    const active = months.find(m => m.id === activeId)
    const monthName = active?.name || 'Cashflow'

    setRows(p => p.filter(r => r.id !== id))
    await supabase.from('cashflow_rows').delete().eq('id', id)

    // Remove mirrored records
    if (row?.description) {
      if (row.type === 'out') {
        await supabase.from('expenses').delete().eq('household_id', householdId).eq('description', '[' + monthName + '] ' + row.description)
      } else if (row.type === 'in') {
        await supabase.from('contributions').delete().eq('household_id', householdId).eq('note', '[' + monthName + '] ' + row.description)
      }
    }
  }

  async function cycleHL(row: Row) {
    const c = ['', '#f5a623', '#4fd896', '#5badee']
    const next = c[(c.indexOf(row.highlight) + 1) % c.length]
    await saveRow(row.id, 'highlight', next)
  }

  async function addNote() {
    if (!activeId) return
    const { data } = await supabase.from('cashflow_highlights')
      .insert({ month_id: activeId, household_id: householdId, label: '', amount: 0, color: '#f5a623' })
      .select().single()
    if (data) setNotes(p => [...p, data])
  }

  async function saveNote(id: string, field: string, val: string | number) {
    setNotes(p => p.map(n => n.id === id ? { ...n, [field]: val } : n))
    await supabase.from('cashflow_highlights').update({ [field]: val }).eq('id', id)
  }

  async function deleteNote(id: string) {
    setNotes(p => p.filter(n => n.id !== id))
    await supabase.from('cashflow_highlights').delete().eq('id', id)
  }

  function hlBg(h: string) {
    const m: Record<string, string> = { '#f5a623': 'rgba(245,166,35,.09)', '#4fd896': 'rgba(79,216,150,.09)', '#5badee': 'rgba(91,173,238,.09)' }
    return m[h] || ''
  }

  const s = {
    cell: { background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%', padding: '8px 12px' } as React.CSSProperties,
  }

  function Table({ type, rowList }: { type: string; rowList: Row[] }) {
    const isIn = type === 'in'
    return (
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isIn ? 'var(--green)' : 'var(--red)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{isIn ? 'Cash in' : 'Cash out'}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: isIn ? 'var(--green)' : 'var(--red)' }}>
            {fmt(isIn ? totalIn : totalOut)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 40px', background: 'var(--surface2)', borderBottom: '0.5px solid var(--border)' }}>
          {['Description', 'Account', 'Amount', ''].map((h, i) => (
            <div key={i} style={{ padding: '5px 12px', fontSize: 11, color: 'var(--muted)', borderLeft: i > 0 ? '0.5px solid var(--border)' : 'none', textAlign: i === 2 ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>

        {rowList.map(row => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 40px', borderBottom: '0.5px solid var(--border)', background: hlBg(row.highlight), borderLeft: row.highlight ? `3px solid ${row.highlight}` : '3px solid transparent' }}>
            <input
              defaultValue={row.description}
              placeholder="Description"
              onBlur={e => saveRow(row.id, 'description', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRow(type)}
              style={{ ...s.cell }}
            />
            <input
              defaultValue={row.account}
              placeholder="Account"
              onBlur={e => saveRow(row.id, 'account', e.target.value)}
              style={{ ...s.cell, fontSize: 12, color: 'var(--muted)', borderLeft: '0.5px solid var(--border)' }}
            />
            <input
              key={cur + row.id}
              type="number"
              defaultValue={row.amount > 0 ? (cur === 'CZK' ? Math.round(row.amount) : +(row.amount / EUR_CZK).toFixed(2)) : ''}
              placeholder="0"
              onBlur={e => {
                const v = parseFloat(e.target.value) || 0
                saveRow(row.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK))
              }}
              onKeyDown={e => e.key === 'Enter' && addRow(type)}
              style={{ ...s.cell, textAlign: 'right', fontWeight: 500, color: isIn ? 'var(--green)' : 'var(--red)', borderLeft: '0.5px solid var(--border)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, borderLeft: '0.5px solid var(--border)' }}>
              <button onClick={() => cycleHL(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.highlight || 'var(--faint)', border: '1.5px solid var(--border2)', display: 'inline-block' }} />
              </button>
              <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12 }}>✕</button>
            </div>
          </div>
        ))}

        <button
          onClick={() => addRow(type)}
          style={{ width: '100%', padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--muted)', textAlign: 'left', borderTop: rowList.length > 0 ? '0.5px solid var(--border)' : 'none' }}
        >
          + Add row
        </button>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {months.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={() => setActiveId(m.id)}
                style={{ padding: '5px 12px', border: m.id === activeId ? '0.5px solid var(--border2)' : '0.5px solid transparent', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: m.id === activeId ? 500 : 400, background: m.id === activeId ? 'var(--surface)' : 'transparent', color: m.id === activeId ? 'var(--text)' : 'var(--muted)' }}>
                {m.name}
              </button>
              {m.id === activeId && (
                <button onClick={() => deleteMonth(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 11, padding: '0 2px' }} title="Delete month">✕</button>
              )}
            </div>
          ))}
          {showAdd ? (
            <input
              autoFocus
              value={newMonth}
              onChange={e => setNewMonth(e.target.value)}
              placeholder="Month name"
              onKeyDown={e => { if (e.key === 'Enter') createMonth(); if (e.key === 'Escape') { setShowAdd(false); setNewMonth('') } }}
              onBlur={() => { if (newMonth.trim()) createMonth(); else setShowAdd(false) }}
              style={{ padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--acc)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 110, outline: 'none' }}
            />
          ) : (
            <button onClick={() => setShowAdd(true)} style={{ padding: '5px 10px', border: '0.5px dashed var(--border2)', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit' }}>
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

      {!activeId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
          Click <strong style={{ color: 'var(--text)' }}>+ Month</strong> to start
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 256px', gap: 16, alignItems: 'start' }}>
          <div>
            <Table type="in" rowList={inRows} />
            <Table type="out" rowList={outRows} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
            <div className="card" style={{ padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{active?.name} — net</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{net >= 0 ? 'surplus' : 'deficit'}</div>
            </div>

            <div className="card">
              <div className="card-head"><span className="card-title">Summary</span></div>
              <div style={{ padding: '6px 0' }}>
                {[{ l: 'Cash in', v: totalIn, c: 'var(--green)' }, { l: 'Cash out', v: totalOut, c: 'var(--red)' }].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{r.l}</span>
                    <span style={{ fontWeight: 500, color: r.c }}>{fmt(r.v)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, fontWeight: 500, borderTop: '0.5px solid var(--border)' }}>
                  <span>Net</span>
                  <span style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <span className="card-title">Notes & balances</span>
                <button onClick={addNote} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontFamily: 'inherit' }}>+ Add</button>
              </div>
              {mNotes.length === 0 ? (
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>Current balances, targets…</div>
              ) : mNotes.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderTop: '0.5px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
                  <input defaultValue={n.label} placeholder="Label" onBlur={e => saveNote(n.id, 'label', e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', minWidth: 0 }} />
                  <input key={cur + n.id} type="number" defaultValue={n.amount > 0 ? (cur === 'CZK' ? Math.round(n.amount) : +(n.amount / EUR_CZK).toFixed(2)) : ''}
                    placeholder="0" onBlur={e => { const v = parseFloat(e.target.value) || 0; saveNote(n.id, 'amount', cur === 'CZK' ? v : Math.round(v * EUR_CZK)) }}
                    style={{ width: 72, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text)', outline: 'none', textAlign: 'right' }} />
                  <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
