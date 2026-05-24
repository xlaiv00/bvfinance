'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtAmount, fmtRaw, fmtDate, toEUR, todayStr, type Trip, type TripExpense, type Currency } from '@/types'

const TRIP_CATS = [
  { value: 'Flights', emoji: '✈️' },
  { value: 'Accommodation', emoji: '🏨' },
  { value: 'Food & Drinks', emoji: '🍽️' },
  { value: 'Restaurants', emoji: '🍜' },
  { value: 'Groceries', emoji: '🛒' },
  { value: 'Transport', emoji: '🚌' },
  { value: 'Car Rental', emoji: '🚗' },
  { value: 'Activities', emoji: '🎡' },
  { value: 'Entertainment', emoji: '🎬' },
  { value: 'Shopping', emoji: '🛍️' },
  { value: 'Health', emoji: '💊' },
  { value: 'Insurance', emoji: '🛡️' },
  { value: 'Other', emoji: '📦' },
]

const CAT_COLORS: Record<string, string> = {
  Flights: '#5badee', Accommodation: '#7c6ff7', 'Food & Drinks': '#f5a623',
  Restaurants: '#f5a623', Groceries: '#4fd896', Transport: '#00b4d8',
  'Car Rental': '#00b4d8', Activities: '#9b5de5', Entertainment: '#f72585',
  Shopping: '#f06375', Health: '#06d6a0', Insurance: '#888', Other: '#555',
}

const TO_MAIN_CAT: Record<string, string> = {
  Flights: 'Travel', Accommodation: 'Household', 'Food & Drinks': 'Restaurants',
  Restaurants: 'Restaurants', Groceries: 'Groceries', Transport: 'Transport',
  'Car Rental': 'Transport', Activities: 'Entertainment', Entertainment: 'Entertainment',
  Shopping: 'Shopping', Health: 'Health', Insurance: 'Other', Other: 'Other',
}

function catEmoji(cat: string) {
  return TRIP_CATS.find(c => c.value === cat)?.emoji || '📦'
}

interface FormState {
  desc: string; amt: string; cur: Currency; cat: string; date: string; who: string
}

interface Props {
  householdId: string
  trips: Trip[]
  tripExpenses: TripExpense[]
  myName: string
  partnerName: string
}

export default function TripsClient({ householdId, trips: init, tripExpenses: initExp, myName, partnerName }: Props) {
  const [trips, setTrips] = useState(init)
  const [allExp, setAllExp] = useState(initExp)
  const [cur, setCur] = useState<Currency>('EUR')
  const [openId, setOpenId] = useState<string | null>(null)
  const [tabMap, setTabMap] = useState<Record<string, string>>({})
  const [budgetEditId, setBudgetEditId] = useState<string | null>(null)
  const [budgetVal, setBudgetVal] = useState('')
  const [loading, setLoading] = useState(false)

  // New trip form
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [tripCur, setTripCur] = useState<Currency>('EUR')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Per-trip expense forms
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const defaultForm = (): FormState => ({ desc: '', amt: '', cur: 'EUR', cat: 'Food & Drinks', date: todayStr(), who: 'joint' })
  const getForm = (id: string) => forms[id] || defaultForm()
  const patchForm = (id: string, p: Partial<FormState>) => setForms(prev => ({ ...prev, [id]: { ...getForm(id), ...p } }))

  const supabase = createClient()
  const f = (eur: number) => fmtAmount(eur, cur)
  const getTab = (id: string) => tabMap[id] || 'overview'
  const setTab = (id: string, t: string) => setTabMap(prev => ({ ...prev, [id]: t }))

  async function createTrip() {
    if (!name || !budget) return
    setLoading(true)
    const b = parseFloat(budget)
    const { data, error } = await supabase.from('trips').insert({
      household_id: householdId,
      name, budget: b, currency: tripCur, budget_eur: toEUR(b, tripCur),
      date_from: dateFrom || null, date_to: dateTo || null,
    }).select().single()
    if (!error && data) {
      setTrips(prev => [data, ...prev])
      setOpenId(data.id)
      setTab(data.id, 'expenses')
      setName(''); setBudget(''); setDateFrom(''); setDateTo('')
    }
    setLoading(false)
  }

  async function updateBudget(tripId: string, tripCurrency: Currency) {
    const b = parseFloat(budgetVal)
    if (!b || b <= 0) { setBudgetEditId(null); return }
    const { data } = await supabase.from('trips')
      .update({ budget: b, budget_eur: toEUR(b, tripCurrency) })
      .eq('id', tripId).select().single()
    if (data) setTrips(prev => prev.map(t => t.id === tripId ? { ...t, budget: b, budget_eur: toEUR(b, tripCurrency) } : t))
    setBudgetEditId(null); setBudgetVal('')
  }

  async function addExpense(tripId: string, tripName: string) {
    const form = getForm(tripId)
    if (!form.desc.trim() || !form.amt || parseFloat(form.amt) <= 0) return
    setLoading(true)
    const a = parseFloat(form.amt)
    const aEUR = toEUR(a, form.cur)

    // Save to trip_expenses
    const { data: teData, error: teErr } = await supabase.from('trip_expenses').insert({
      trip_id: tripId,
      household_id: householdId,
      description: form.desc.trim(),
      amount: a,
      currency: form.cur,
      amount_eur: aEUR,
      category: form.cat,
      date: form.date,
    }).select().single()

    if (!teErr && teData) {
      setAllExp(prev => [teData, ...prev])

      // Mirror to main expenses table
      const mainCat = TO_MAIN_CAT[form.cat] || 'Other'
      await supabase.from('expenses').insert({
        household_id: householdId,
        description: '[' + tripName + '] ' + form.desc.trim(),
        amount: a,
        currency: form.cur,
        amount_eur: aEUR,
        category: mainCat,
        paid_by: form.who,
        date: form.date,
      })

      patchForm(tripId, { desc: '', amt: '' })
    }
    setLoading(false)
  }

  async function deleteTrip(id: string) {
    // Get all trip expenses first so we can clean up mirrored main expenses
    const trip = trips.find(t => t.id === id)
    const tripExps = allExp.filter(e => e.trip_id === id)
    
    // Delete mirrored entries from main expenses table
    if (trip && tripExps.length > 0) {
      for (const exp of tripExps) {
        await supabase.from('expenses')
          .delete()
          .eq('household_id', householdId)
          .eq('description', '[' + trip.name + '] ' + exp.description)
          .eq('date', exp.date)
      }
    }
    
    // Delete the trip itself (cascades to trip_expenses in DB)
    await supabase.from('trips').delete().eq('id', id)
    setTrips(prev => prev.filter(t => t.id !== id))
    setAllExp(prev => prev.filter(e => e.trip_id !== id))
    if (openId === id) setOpenId(null)
    toast(`Trip "${trip?.name}" deleted — expenses removed from dashboard`, 'success')
  }

  async function deleteExpense(exp: TripExpense, tripName: string) {
    // Remove from trip_expenses
    await supabase.from('trip_expenses').delete().eq('id', exp.id)
    // Remove mirrored entry from main expenses
    await supabase.from('expenses')
      .delete()
      .eq('household_id', householdId)
      .eq('description', '[' + tripName + '] ' + exp.description)
      .eq('date', exp.date)
      .eq('amount', exp.amount)
    setAllExp(prev => prev.filter(e => e.id !== exp.id))
    toast('Expense deleted', 'success')
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div className="cur-toggle">
          <button className={`cur-btn ${cur === 'EUR' ? 'active' : ''}`} onClick={() => setCur('EUR')}>EUR</button>
          <button className={`cur-btn ${cur === 'CZK' ? 'active' : ''}`} onClick={() => setCur('CZK')}>CZK</button>
        </div>
      </div>

      {/* Create trip */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-title">Plan a trip</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="fg w"><label>Destination</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Japan 2025" /></div>
            <div className="fg m"><label>Budget</label><input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="3000" min="0" /></div>
            <div className="fg s"><label>Currency</label>
              <select value={tripCur} onChange={e => setTripCur(e.target.value as Currency)}>
                <option value="EUR">EUR</option><option value="CZK">CZK</option>
              </select>
            </div>
            <div className="fg"><label>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div className="fg"><label>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            <button className="add-btn" onClick={createTrip} disabled={loading}>Create</button>
          </div>
        </div>
      </div>

      {trips.length === 0 && <div className="empty">No trips yet — create one above</div>}

      {trips.map(trip => {
        const exps = allExp.filter(e => e.trip_id === trip.id).sort((a, b) => b.date.localeCompare(a.date))
        const spentEUR = exps.reduce((s, e) => s + e.amount_eur, 0)
        const remaining = trip.budget_eur - spentEUR
        const pct = Math.min(trip.budget_eur > 0 ? Math.round(spentEUR / trip.budget_eur * 100) : 0, 100)
        const isOpen = openId === trip.id
        const tab = getTab(trip.id)
        const form = getForm(trip.id)
        const isEditBudget = budgetEditId === trip.id

        const days = trip.date_from && trip.date_to
          ? Math.max(1, Math.round((new Date(trip.date_to).getTime() - new Date(trip.date_from).getTime()) / 86400000) + 1)
          : null
        const dailyAvg = days && spentEUR > 0 ? spentEUR / days : null

        const catMap: Record<string, number> = {}
        exps.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount_eur })
        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
        const maxCatVal = sortedCats[0]?.[1] || 1

        return (
          <div key={trip.id} className="card" style={{ marginBottom: 14 }}>

            {/* Trip header */}
            <div className="card-head">
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpenId(isOpen ? null : trip.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="card-title">✈️ {trip.name}</span>
                  {days && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 20 }}>
                      {days} days
                    </span>
                  )}
                </div>
                {(trip.date_from || trip.date_to) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {trip.date_from ? fmtDate(trip.date_from) : ''}
                    {trip.date_from && trip.date_to ? ' → ' : ''}
                    {trip.date_to ? fmtDate(trip.date_to) : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`chip ${pct > 90 ? 'ch-r' : pct > 70 ? 'ch-a' : 'ch-b'}`}>
                  {f(spentEUR)} / {f(trip.budget_eur)}
                </span>
                <button
                  style={{ background: 'var(--surface2)', border: '0.5px solid var(--border2)', color: 'var(--text)', borderRadius: 7, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => setOpenId(isOpen ? null : trip.id)}>
                  {isOpen ? 'Close' : 'Open'}
                </button>
                <button className="del-btn" style={{ opacity: 1 }} onClick={() => deleteTrip(trip.id)}>🗑</button>
              </div>
            </div>

            {/* Budget progress bar + editable */}
            <div style={{ padding: '0 16px 14px' }}>
              <div className="bar-track" style={{ height: 6 }}>
                <div className="bar-fill" style={{
                  width: pct + '%',
                  background: pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--gold)' : 'var(--blue)'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11 }}>
                <span style={{ color: 'var(--muted)' }}>{pct}% spent</span>

                {isEditBudget ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={budgetVal}
                      onChange={e => setBudgetVal(e.target.value)}
                      autoFocus
                      placeholder={String(trip.budget)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updateBudget(trip.id, trip.currency)
                        if (e.key === 'Escape') { setBudgetEditId(null); setBudgetVal('') }
                      }}
                      style={{ width: 100, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={() => updateBudget(trip.id, trip.currency)}
                      style={{ fontSize: 11, background: 'var(--acc2)', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Save
                    </button>
                    <button
                      onClick={() => { setBudgetEditId(null); setBudgetVal('') }}
                      style={{ fontSize: 11, background: 'transparent', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setBudgetEditId(trip.id); setBudgetVal(String(trip.budget)) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                      color: remaining >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                    <span>{remaining >= 0 ? f(remaining) + ' remaining' : f(Math.abs(remaining)) + ' over budget'}</span>
                    <span style={{ color: 'var(--faint)', textDecoration: 'underline dotted' }}>edit budget</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ borderTop: '0.5px solid var(--border)' }}>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)' }}>
                  {[['overview', '📊 Overview'], ['expenses', '🧾 Expenses']].map(([key, label]) => (
                    <button key={key} onClick={() => setTab(trip.id, key)} style={{
                      flex: 1, padding: '10px 0', border: 'none', background: 'none',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      color: tab === key ? 'var(--text)' : 'var(--muted)',
                      borderBottom: tab === key ? '2px solid var(--acc)' : '2px solid transparent',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* OVERVIEW TAB */}
                {tab === 'overview' && (
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
                      {[
                        { label: 'Total spent', val: f(spentEUR), color: 'var(--red)' },
                        { label: 'Remaining', val: f(Math.abs(remaining)), color: remaining >= 0 ? 'var(--green)' : 'var(--red)' },
                        { label: days ? 'Daily avg' : 'Transactions', val: dailyAvg ? f(dailyAvg) : String(exps.length), color: 'var(--blue)' },
                      ].map(s => (
                        <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    {sortedCats.length === 0 ? (
                      <div className="empty" style={{ padding: '20px 0' }}>
                        No expenses yet — go to the Expenses tab to add some
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                          Spending by category
                        </div>
                        {sortedCats.map(([cat, eur]) => (
                          <div key={cat} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{catEmoji(cat)} {cat}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(eur / spentEUR * 100)}%</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: CAT_COLORS[cat] || 'var(--text)' }}>{f(eur)}</span>
                              </div>
                            </div>
                            <div style={{ height: 6, background: 'var(--faint)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: Math.round(eur / maxCatVal * 100) + '%', background: CAT_COLORS[cat] || 'var(--acc)' }} />
                            </div>
                          </div>
                        ))}
                        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {sortedCats.map(([cat, eur]) => (
                            <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', borderRadius: 20, padding: '3px 10px', fontSize: 11 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLORS[cat] || 'var(--acc)', display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ color: 'var(--muted)' }}>{cat}</span>
                              <span style={{ fontWeight: 500 }}>{f(eur)}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* EXPENSES TAB */}
                {tab === 'expenses' && (
                  <div style={{ padding: 16 }}>

                    {/* Add expense form */}
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 10 }}>Add expense to {trip.name}</div>
                      <div className="form-row">
                        <div className="fg w">
                          <label>Description</label>
                          <input
                            value={form.desc}
                            onChange={e => patchForm(trip.id, { desc: e.target.value })}
                            placeholder="e.g. Dinner at restaurant"
                            onKeyDown={e => e.key === 'Enter' && addExpense(trip.id, trip.name)}
                          />
                        </div>
                        <div className="fg m">
                          <label>Amount</label>
                          <input type="number" value={form.amt} onChange={e => patchForm(trip.id, { amt: e.target.value })} placeholder="0.00" min="0" step="0.01" />
                        </div>
                        <div className="fg s">
                          <label>Currency</label>
                          <select value={form.cur} onChange={e => patchForm(trip.id, { cur: e.target.value as Currency })}>
                            <option value="EUR">EUR</option>
                            <option value="CZK">CZK</option>
                          </select>
                        </div>
                        <div className="fg m">
                          <label>Category</label>
                          <select value={form.cat} onChange={e => patchForm(trip.id, { cat: e.target.value })}>
                            {TRIP_CATS.map(c => (
                              <option key={c.value} value={c.value}>{c.emoji} {c.value}</option>
                            ))}
                          </select>
                        </div>
                        <div className="fg m">
                          <label>Paid by</label>
                          <select value={form.who} onChange={e => patchForm(trip.id, { who: e.target.value })}>
                            <option value="you">{myName}</option>
                            <option value="partner">{partnerName}</option>
                            <option value="joint">Joint</option>
                          </select>
                        </div>
                        <div className="fg">
                          <label>Date</label>
                          <input type="date" value={form.date} onChange={e => patchForm(trip.id, { date: e.target.value })} />
                        </div>
                        <button className="add-btn" onClick={() => addExpense(trip.id, trip.name)} disabled={loading}>
                          Add
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                        ✓ Trip expenses are automatically added to the main Expenses & Dashboard
                      </div>
                    </div>

                    {/* Expense list grouped by date */}
                    {exps.length === 0 ? (
                      <div className="empty">No expenses yet — add one above</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12, color: 'var(--muted)' }}>
                          <span>{exps.length} transactions</span>
                          <span style={{ fontWeight: 600, color: 'var(--red)' }}>{f(spentEUR)} total</span>
                        </div>
                        {Object.entries(
                          exps.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc }, {} as Record<string, TripExpense[]>)
                        ).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayExps]) => (
                          <div key={date} style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 4, borderBottom: '0.5px solid var(--border)' }}>
                              <span>{fmtDate(date)}</span>
                              <span>{f(dayExps.reduce((s, e) => s + e.amount_eur, 0))}</span>
                            </div>
                            {dayExps.map(exp => (
                              <div key={exp.id} className="tx">
                                <div className="tx-icon" style={{ background: (CAT_COLORS[exp.category] || '#555') + '22', fontSize: 15 }}>
                                  {catEmoji(exp.category)}
                                </div>
                                <div className="tx-info">
                                  <div className="tx-name">{exp.description}</div>
                                  <div className="tx-meta" style={{ color: CAT_COLORS[exp.category] || 'var(--muted)' }}>
                                    {exp.category}
                                  </div>
                                </div>
                                <div className="tx-date">{fmtDate(exp.date)}</div>
                                <div className="tx-amt neg">{fmtRaw(exp.amount, exp.currency)}</div>
                                <button className="del-btn" onClick={() => deleteExpense(exp, trip.name)}>✕</button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
