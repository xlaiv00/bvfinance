'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const EUR_CZK = 24.5

interface Month { id: string; name: string }
interface Group { id: string; month_id: string; type: string; name: string; sort_order: number }
interface Row { id: string; group_id: string; month_id: string; description: string; revolut: number; cash: number; wise: number; other: number; highlight: string; synced: boolean; sort_order: number }
interface Note { id: string; month_id: string; label: string; amount: number; color: string; bold: boolean }

export default function CashflowClient({ householdId }: { householdId: string }) {
  const [months, setMonths] = useState<Month[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cur, setCur] = useState<'CZK' | 'EUR'>('CZK')
  const [newMonth, setNewMonth] = useState('')
  const [showAddMonth, setShowAddMonth] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const [m, g, r, n] = await Promise.all([
      supabase.from('cashflow_months').select('*').eq('household_id', householdId).order('sort_order').order('created_at'),
      supabase.from('cf_groups').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('cf_rows').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('cf_notes').select('*').eq('household_id', householdId).order('sort_order'),
    ])
    if (m.data) { setMonths(m.data); if (m.data.length > 0) setActiveId(p => p || m.data![0].id) }
    if (g.data) setGroups(g.data)
    if (r.data) setRows(r.data)
    if (n.data) setNotes(n.data)
  }

  function fmt(n: number) {
    if (!n) return ''
    const v = cur === 'CZK' ? n : n / EUR_CZK
    return cur === 'CZK'
      ? Math.round(v).toLocaleString('cs-CZ') + ' Kč'
      : '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function fmtTotal(n: number) {
    const v = cur === 'CZK' ? n : n / EUR_CZK
    return cur === 'CZK'
      ? Math.round(v).toLocaleString('cs-CZ') + ' Kč'
      : '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function rowTotal(r: Row) { return (r.revolut||0) + (r.cash||0) + (r.wise||0) + (r.other||0) }
  function groupTotal(gid: string) { return rows.filter(r => r.group_id === gid).reduce((s,r) => s + rowTotal(r), 0) }

  const mGroups = groups.filter(g => g.month_id === activeId)
  const inGroups = mGroups.filter(g => g.type === 'in')
  const outGroups = mGroups.filter(g => g.type === 'out')
  const totalIn = inGroups.reduce((s, g) => s + groupTotal(g.id), 0)
  const totalOut = outGroups.reduce((s, g) => s + groupTotal(g.id), 0)
  const net = totalIn - totalOut
  const mNotes = notes.filter(n => n.month_id === activeId)
  const active = months.find(m => m.id === activeId)

  async function createMonth() {
    const name = newMonth.trim(); if (!name) return
    const { data } = await supabase.from('cashflow_months').insert({ household_id: householdId, name, sort_order: months.length }).select().single()
    if (data) {
      setMonths(p => [...p, data]); setActiveId(data.id)
      setNewMonth(''); setShowAddMonth(false)
      // auto-create default groups
      const defs = [
        { name: 'Cash in', type: 'in', sort_order: 0 },
        { name: 'Cost for business', type: 'out', sort_order: 1 },
        { name: 'Cost for life', type: 'out', sort_order: 2 },
        { name: 'Cost for travel', type: 'out', sort_order: 3 },
      ]
      const { data: gd } = await supabase.from('cf_groups').insert(defs.map(d => ({ ...d, month_id: data.id, household_id: householdId }))).select()
      if (gd) setGroups(p => [...p, ...gd])
    }
  }

  async function deleteMonth(id: string) {
    await supabase.from('cashflow_months').delete().eq('id', id)
    setMonths(p => p.filter(m => m.id !== id))
    setGroups(p => p.filter(g => g.month_id !== id))
    setRows(p => p.filter(r => r.month_id !== id))
    setNotes(p => p.filter(n => n.month_id !== id))
    setActiveId(months.find(m => m.id !== id)?.id || null)
  }

  async function addGroup(type: string) {
    if (!activeId) return
    const name = type === 'in' ? 'Cash in' : 'New section'
    const so = mGroups.filter(g => g.type === type).length + (type === 'out' ? inGroups.length : 0)
    const { data } = await supabase.from('cf_groups').insert({ month_id: activeId, household_id: householdId, type, name, sort_order: so }).select().single()
    if (data) setGroups(p => [...p, data])
  }

  async function updateGroup(id: string, name: string) {
    setGroups(p => p.map(g => g.id === id ? { ...g, name } : g))
    await supabase.from('cf_groups').update({ name }).eq('id', id)
  }

  async function deleteGroup(id: string) {
    await supabase.from('cf_groups').delete().eq('id', id)
    setGroups(p => p.filter(g => g.id !== id))
    setRows(p => p.filter(r => r.group_id !== id))
  }

  async function addRow(groupId: string) {
    if (!activeId) return
    const so = rows.filter(r => r.group_id === groupId).length
    const { data } = await supabase.from('cf_rows').insert({ group_id: groupId, month_id: activeId, household_id: householdId, description: '', revolut: 0, cash: 0, wise: 0, other: 0, highlight: '', synced: false, sort_order: so }).select().single()
    if (data) {
      setRows(p => [...p, data])
      setTimeout(() => { const els = document.querySelectorAll<HTMLInputElement>(`[data-group="${groupId}"] .desc-inp`); els[els.length-1]?.focus() }, 40)
    }
  }

  async function updateRow(id: string, field: string, val: string | number) {
    setRows(p => p.map(r => r.id === id ? { ...r, [field]: val } : r))
    await supabase.from('cf_rows').update({ [field]: val }).eq('id', id)
  }

  async function deleteRow(row: Row, groupType: string) {
    // Clean up any synced entry
    if (row.synced) {
      const total = (row.revolut||0)+(row.cash||0)+(row.wise||0)+(row.other||0)
      if (groupType === 'out') {
        await supabase.from('expenses').delete()
          .eq('household_id', householdId)
          .eq('description', '[CF] ' + row.description)
      } else {
        await supabase.from('contributions').delete()
          .eq('household_id', householdId)
          .eq('note', '[CF] ' + row.description)
      }
    }
    setRows(p => p.filter(r => r.id !== row.id))
    await supabase.from('cf_rows').delete().eq('id', row.id)
  }

  async function toggleSync(row: Row, groupType: string) {
    const newSynced = !row.synced
    const total = (row.revolut||0)+(row.cash||0)+(row.wise||0)+(row.other||0)
    setRows(p => p.map(r => r.id === row.id ? { ...r, synced: newSynced } : r))
    await supabase.from('cf_rows').update({ synced: newSynced }).eq('id', row.id)

    const today = new Date().toISOString().split('T')[0]
    if (newSynced) {
      if (groupType === 'out') {
        // Mirror to expenses
        await supabase.from('expenses').insert({
          household_id: householdId,
          description: '[CF] ' + (row.description || 'Cashflow expense'),
          amount: total, currency: 'CZK', amount_eur: total / EUR_CZK,
          category: 'Other', paid_by: 'joint', date: today,
        })
      } else {
        // Mirror to contributions
        await supabase.from('contributions').insert({
          household_id: householdId,
          person: 'you', amount: total, currency: 'CZK',
          amount_eur: total / EUR_CZK, date: today,
          note: '[CF] ' + (row.description || 'Cashflow income'),
        })
      }
    } else {
      if (groupType === 'out') {
        await supabase.from('expenses').delete()
          .eq('household_id', householdId)
          .eq('description', '[CF] ' + row.description)
      } else {
        await supabase.from('contributions').delete()
          .eq('household_id', householdId)
          .eq('note', '[CF] ' + row.description)
      }
    }
  }

  async function cycleHL(id: string, cur: string) {
    const c = ['', '#f5a623', '#4fd896', '#5badee']
    const next = c[(c.indexOf(cur) + 1) % c.length]
    updateRow(id, 'highlight', next)
  }

  async function addNote() {
    if (!activeId) return
    const { data } = await supabase.from('cf_notes').insert({ month_id: activeId, household_id: householdId, label: '', amount: 0, color: '#f5a623', bold: false, sort_order: mNotes.length }).select().single()
    if (data) { setNotes(p => [...p, data]); setTimeout(() => { const els = document.querySelectorAll<HTMLInputElement>('.note-inp'); els[els.length-1]?.focus() }, 40) }
  }

  async function updateNote(id: string, field: string, val: string | number | boolean) {
    setNotes(p => p.map(n => n.id === id ? { ...n, [field]: val } : n))
    await supabase.from('cf_notes').update({ [field]: val }).eq('id', id)
  }

  async function deleteNote(id: string) {
    setNotes(p => p.filter(n => n.id !== id))
    await supabase.from('cf_notes').delete().eq('id', id)
  }

  function hlBg(h: string) {
    const m: Record<string,string> = { '#f5a623':'rgba(245,166,35,.1)', '#4fd896':'rgba(79,216,150,.08)', '#5badee':'rgba(91,173,238,.08)' }
    return m[h] || ''
  }

  // shared cell input style
  const numCell: React.CSSProperties = { background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', width: '100%', textAlign: 'right', padding: '6px 8px' }
  const descCell: React.CSSProperties = { background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', outline: 'none', width: '100%', padding: '6px 10px' }

  // Column headers for the table
  const COL = '1fr 100px 100px 100px 100px 110px 52px 36px'

  function GroupSection({ g, isIn }: { g: Group; isIn: boolean }) {
    const gRows = rows.filter(r => r.group_id === g.id)
    const total = groupTotal(g.id)
    return (
      <div data-group={g.id} style={{ marginBottom: 0 }}>
        {/* Group header row */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, background: isIn ? 'rgba(79,216,150,.06)' : 'rgba(240,99,117,.06)', borderBottom: '0.5px solid var(--border)', borderTop: '0.5px solid var(--border)' }}>
          <div style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isIn ? 'var(--green)' : 'var(--red)', display: 'inline-block', flexShrink: 0 }} />
            <input
              defaultValue={g.name}
              onBlur={e => updateGroup(g.id, e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              style={{ background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', width: '100%' }}
            />
          </div>
          <div style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Revolut</div>
          <div style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Cash</div>
          <div style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Wise</div>
          <div style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Other</div>
          <div style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: isIn ? 'var(--green)' : 'var(--red)', alignSelf: 'center' }}>{fmtTotal(total)}</div>
          <div style={{ padding: '7px 4px', textAlign: 'center', fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }} title="Sync to dashboard">Dash</div>
          <button onClick={() => deleteGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 11, opacity: .4 }} onMouseOver={e => (e.currentTarget.style.opacity='1')} onMouseOut={e => (e.currentTarget.style.opacity='.4')}>✕</button>
        </div>

        {/* Rows */}
        {gRows.map(row => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: COL, borderBottom: '0.5px solid var(--border)', background: hlBg(row.highlight), borderLeft: row.highlight ? `3px solid ${row.highlight}` : '3px solid transparent' }}>
            <input className="desc-inp" defaultValue={row.description} placeholder="Description"
              onBlur={e => updateRow(row.id, 'description', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRow(g.id)}
              style={descCell} />
            {(['revolut','cash','wise','other'] as const).map(f => (
              <input key={f} type="number" defaultValue={(row[f] as number) > 0 ? (cur === 'CZK' ? Math.round(row[f] as number) : +((row[f] as number)/EUR_CZK).toFixed(2)) : ''}
                placeholder=""
                onBlur={e => { const v = parseFloat(e.target.value)||0; updateRow(row.id, f, cur==='CZK' ? v : Math.round(v*EUR_CZK)) }}
                onKeyDown={e => e.key === 'Enter' && addRow(g.id)}
                style={{ ...numCell, color: isIn ? 'var(--green)' : 'var(--muted)' }} />
            ))}
            <div style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, fontWeight: 500, color: isIn ? 'var(--green)' : rowTotal(row) > 0 ? 'var(--red)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {rowTotal(row) > 0 ? fmt(rowTotal(row)) : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => toggleSync(row, g.type)}
                title={row.synced ? 'Remove from dashboard' : 'Add to dashboard'}
                style={{ width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 0, background: row.synced ? 'var(--acc)' : 'var(--faint)', position: 'relative', transition: 'background .2s', display: 'block' }}>
                <span style={{ position: 'absolute', top: 2, left: row.synced ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <button onClick={() => cycleHL(row.id, row.highlight)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.highlight||'var(--faint)', border: '1.5px solid var(--border2)', display: 'inline-block' }} />
              </button>
              <button onClick={() => deleteRow(row, g.type)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 11, opacity: .4 }} onMouseOver={e => (e.currentTarget.style.opacity='1')} onMouseOut={e => (e.currentTarget.style.opacity='.4')}>✕</button>
            </div>
          </div>
        ))}

        {/* Add row button */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, borderBottom: '0.5px solid var(--border)' }}>
          <button onClick={() => addRow(g.id)} style={{ padding: '5px 10px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: 'var(--faint)', textAlign: 'left' }}
            onMouseOver={e => (e.currentTarget.style.color = isIn ? 'var(--green)' : 'var(--red)')} onMouseOut={e => (e.currentTarget.style.color='var(--faint)')}>
            + Add row
          </button>
          <div /><div /><div /><div />
          <div />
          <div />
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {months.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => setActiveId(m.id)}
                style={{ padding: '5px 14px', border: m.id === activeId ? '0.5px solid var(--border2)' : '0.5px solid transparent', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: m.id === activeId ? 500 : 400, background: m.id === activeId ? 'var(--surface)' : 'transparent', color: m.id === activeId ? 'var(--text)' : 'var(--muted)' }}>
                {m.name}
              </button>
              {m.id === activeId && (
                <button onClick={() => { if (confirm('Delete this month?')) deleteMonth(m.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 11, padding: '0 2px' }}>✕</button>
              )}
            </div>
          ))}
          {showAddMonth ? (
            <input autoFocus value={newMonth} onChange={e => setNewMonth(e.target.value)} placeholder="e.g. May"
              onKeyDown={e => { if (e.key === 'Enter') createMonth(); if (e.key === 'Escape') setShowAddMonth(false) }}
              onBlur={() => newMonth.trim() ? createMonth() : setShowAddMonth(false)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--acc)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 100, outline: 'none' }} />
          ) : (
            <button onClick={() => setShowAddMonth(true)} style={{ padding: '5px 10px', border: '0.5px dashed var(--border2)', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit' }}>+ Month</button>
          )}
        </div>
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, gap: 2 }}>
          {(['CZK','EUR'] as const).map(c => (
            <button key={c} onClick={() => setCur(c)} style={{ padding: '4px 11px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: cur===c?500:400, background: cur===c?'var(--surface)':'transparent', color: cur===c?'var(--text)':'var(--muted)' }}>{c}</button>
          ))}
        </div>
      </div>

      {!activeId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
          Click <strong style={{ color: 'var(--text)' }}>+ Month</strong> to start tracking
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

          {/* Main spreadsheet */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {/* Month label */}
            <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{active?.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => addGroup('in')} style={{ fontSize: 11, padding: '3px 10px', border: '0.5px solid rgba(79,216,150,.4)', borderRadius: 6, background: 'transparent', color: 'var(--green)', cursor: 'pointer', fontFamily: 'inherit' }}>+ Income group</button>
                <button onClick={() => addGroup('out')} style={{ fontSize: 11, padding: '3px 10px', border: '0.5px solid rgba(240,99,117,.4)', borderRadius: 6, background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>+ Expense group</button>
              </div>
            </div>

            {/* Income groups */}
            {inGroups.map(g => <GroupSection key={g.id} g={g} isIn={true} />)}

            {/* Total cash in */}
            {inGroups.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: COL, background: 'rgba(79,216,150,.08)', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>Total cash in</div>
                <div /><div /><div /><div />
                <div style={{ padding: '8px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{fmtTotal(totalIn)}</div>
                <div />
              </div>
            )}

            {/* Spacer */}
            {outGroups.length > 0 && <div style={{ height: 8, background: 'var(--surface2)', borderBottom: '0.5px solid var(--border)' }} />}

            {/* Expense groups */}
            {outGroups.map(g => <GroupSection key={g.id} g={g} isIn={false} />)}

            {/* Total cash out */}
            {outGroups.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: COL, background: 'rgba(240,99,117,.08)', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>Total cash out</div>
                <div /><div /><div /><div />
                <div style={{ padding: '8px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{fmtTotal(totalOut)}</div>
                <div />
              </div>
            )}

            {/* Empty state */}
            {mGroups.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Click <strong style={{ color: 'var(--green)' }}>+ Income group</strong> or <strong style={{ color: 'var(--red)' }}>+ Expense group</strong> to start
              </div>
            )}
          </div>

          {/* Right: Summary + Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>

            {/* Net */}
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{active?.name} — net</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTotal(net)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{net >= 0 ? 'surplus' : 'deficit'}</div>
            </div>

            {/* Summary */}
            <div className="card">
              <div className="card-head"><span className="card-title">Summary</span></div>
              <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Total cash in</span>
                  <span style={{ fontWeight: 600, color: 'var(--green)' }}>{fmtTotal(totalIn)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>Total cash out</span>
                  <span style={{ fontWeight: 600, color: 'var(--red)' }}>{fmtTotal(totalOut)}</span>
                </div>
                {/* Per group breakdown */}
                {mGroups.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 16px', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)', paddingLeft: g.type === 'out' ? 8 : 0 }}>↳ {g.name}</span>
                    <span style={{ color: g.type === 'in' ? 'var(--green)' : 'var(--muted)' }}>{fmtTotal(groupTotal(g.id))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, fontWeight: 600, borderTop: '0.5px solid var(--border)', marginTop: 4 }}>
                  <span>Net</span>
                  <span style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTotal(net)}</span>
                </div>
              </div>
            </div>

            {/* Notes — like the yellow highlighted cells in Excel */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Notes & balances</span>
                <button onClick={addNote} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontFamily: 'inherit' }}>+ Add</button>
              </div>
              {mNotes.length === 0 ? (
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>Add current balances or notes</div>
              ) : mNotes.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '0.5px solid var(--border)', background: n.color ? n.color + '18' : '', borderLeft: n.color ? `3px solid ${n.color}` : '3px solid transparent' }}>
                  <input className="note-inp" defaultValue={n.label} placeholder="Label"
                    onBlur={e => updateNote(n.id, 'label', e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: n.bold ? 600 : 400, color: 'var(--text)', outline: 'none', minWidth: 0 }} />
                  <input type="number" defaultValue={n.amount > 0 ? Math.round(n.amount) : ''} placeholder="0"
                    onBlur={e => updateNote(n.id, 'amount', parseFloat(e.target.value)||0)}
                    style={{ width: 80, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', textAlign: 'right' }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Kč</span>
                  <button onClick={() => updateNote(n.id, 'color', n.color === '#f5a623' ? '#4fd896' : n.color === '#4fd896' ? '' : '#f5a623')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: n.color||'var(--faint)', border: '1.5px solid var(--border2)', display: 'inline-block' }} />
                  </button>
                  <button onClick={() => updateNote(n.id, 'bold', !n.bold)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: n.bold ? 'var(--text)' : 'var(--faint)', fontSize: 12, fontWeight: 700, padding: 2 }}>B</button>
                  <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
