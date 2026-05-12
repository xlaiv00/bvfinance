'use client'
import { useState } from 'react'
import { fmtAmount, fmtRaw, fmtDate, MONTHS, MONTHS_S, CAT_EMOJI, type Expense, type Contribution, type SavingsGoal, type SavingsDeposit, type Trip, type Currency } from '@/types'

interface Props {
  householdId: string
  expenses: Expense[]
  contributions: Contribution[]
  goals: SavingsGoal[]
  deposits: SavingsDeposit[]
  trips: Trip[]
  myName: string
  partnerName: string
}

function getYears(arrs: { date?: string; created_at?: string }[][]) {
  const ys: number[] = [new Date().getFullYear()]
  arrs.flat().forEach(x => {
    const d = x.date || x.created_at
    if (d) { const y = new Date(d).getFullYear(); if (!ys.includes(y)) ys.push(y) }
  })
  return ys.sort()
}
function filterMonth<T extends { date: string }>(arr: T[], m: number, y: number) {
  return arr.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d.getMonth() === m && d.getFullYear() === y })
}
function filterYear<T extends { date: string }>(arr: T[], y: number) {
  return arr.filter(x => new Date(x.date + 'T12:00:00').getFullYear() === y)
}
function activeMonthsOf(arr: { date: string }[], year: number) {
  const months: number[] = []
  arr.filter(x => new Date(x.date + 'T12:00:00').getFullYear() === year)
    .forEach(x => { const m = new Date(x.date + 'T12:00:00').getMonth(); if (!months.includes(m)) months.push(m) })
  return months
}

export default function DashboardClient({ expenses, contributions, goals, deposits, trips, myName, partnerName }: Props) {
  const [cur, setCur] = useState<Currency>('EUR')
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month')

  const years = getYears([expenses, contributions])
  const actMonths = activeMonthsOf([...expenses, ...contributions], selYear)

  const exps = viewMode === 'year' ? filterYear(expenses, selYear) : filterMonth(expenses, selMonth, selYear)
  const cons = viewMode === 'year' ? filterYear(contributions, selYear) : filterMonth(contributions, selMonth, selYear)

  const allConEUR = contributions.reduce((s, x) => s + x.amount_eur, 0)
  const allExpEUR = expenses.reduce((s, x) => s + x.amount_eur, 0)
  const conEUR = cons.reduce((s, x) => s + x.amount_eur, 0)
  const expEUR = exps.reduce((s, x) => s + x.amount_eur, 0)
  const netEUR = conEUR - expEUR
  const lbl = viewMode === 'year' ? String(selYear) : MONTHS[selMonth] + ' ' + selYear
  const f = (eur: number) => fmtAmount(eur, cur)

  const cats: Record<string, number> = {}
  exps.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount_eur })
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCat = topCats[0]?.[1] || 1

  const youSpent = exps.filter(e => e.paid_by === 'you').reduce((s, e) => s + e.amount_eur, 0)
  const partnerSpent = exps.filter(e => e.paid_by === 'partner').reduce((s, e) => s + e.amount_eur, 0)
  const sharedSpent = exps.filter(e => e.paid_by === 'joint').reduce((s, e) => s + e.amount_eur, 0)

  const totalSaved = deposits.reduce((s, d) => s + d.amount_eur, 0)
  const totalGoalTarget = goals.reduce((s, g) => s + g.target_eur, 0)

  const monthlyData = MONTHS_S.map((m, i) => ({
    m, label: MONTHS[i],
    exp: filterMonth(expenses, i, selYear).reduce((s, x) => s + x.amount_eur, 0),
    con: filterMonth(contributions, i, selYear).reduce((s, x) => s + x.amount_eur, 0),
  }))
  const maxBar = Math.max(...monthlyData.map(d => Math.max(d.exp, d.con)), 1)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>Overview</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{lbl}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="cur-toggle">
            <button className={`cur-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
            <button className={`cur-btn ${viewMode === 'year' ? 'active' : ''}`} onClick={() => setViewMode('year')}>Year</button>
          </div>
          <div className="cur-toggle">
            <button className={`cur-btn ${cur === 'EUR' ? 'active' : ''}`} onClick={() => setCur('EUR')}>EUR</button>
            <button className={`cur-btn ${cur === 'CZK' ? 'active' : ''}`} onClick={() => setCur('CZK')}>CZK</button>
          </div>
        </div>
      </div>

      <div className="year-row">
        {years.map(y => (
          <button key={y} className={`yr-btn ${y === selYear ? 'active' : ''}`} onClick={() => setSelYear(y)}>{y}</button>
        ))}
      </div>

      {viewMode === 'month' ? (
        <div className="timeline">
          {MONTHS_S.map((m, i) => (
            <button key={i} onClick={() => setSelMonth(i)}
              className={`tl-btn ${i === selMonth ? 'active' : ''} ${actMonths.includes(i) ? 'has-data' : ''}`}>
              <span className="tl-m">{m}</span>
              <span className="tl-dot">●</span>
            </button>
          ))}
        </div>
      ) : <div style={{ marginBottom: 22 }} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="stat s-acc">
          <div className="stat-lbl">Joint balance</div>
          <div className="stat-val acc">{f(allConEUR - allExpEUR)}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat s-green">
          <div className="stat-lbl">Contributed</div>
          <div className="stat-val green">{f(conEUR)}</div>
          <div className="stat-sub">{lbl}</div>
        </div>
        <div className="stat s-red">
          <div className="stat-lbl">Spent</div>
          <div className="stat-val red">{f(expEUR)}</div>
          <div className="stat-sub">{lbl}</div>
        </div>
        <div className={`stat ${netEUR >= 0 ? 's-green' : 's-red'}`}>
          <div className="stat-lbl">Net</div>
          <div className={`stat-val ${netEUR >= 0 ? 'green' : 'red'}`}>{netEUR >= 0 ? '+' : ''}{f(netEUR)}</div>
          <div className="stat-sub">In minus Out</div>
        </div>
      </div>

      {viewMode === 'year' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <span className="card-title">Month by month — {selYear}</span>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--green)', borderRadius: 2, marginRight: 4 }} />Contributed</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--red)', borderRadius: 2, marginRight: 4 }} />Spent</span>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90, marginBottom: 8 }}>
                {monthlyData.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%' }}>
                    <div style={{ flex: 1, background: 'var(--green)', opacity: .75, borderRadius: '3px 3px 0 0', height: d.con > 0 ? Math.max(Math.round(d.con / maxBar * 100), 3) + '%' : '2px' }} />
                    <div style={{ flex: 1, background: 'var(--red)', opacity: .75, borderRadius: '3px 3px 0 0', height: d.exp > 0 ? Math.max(Math.round(d.exp / maxBar * 100), 3) + '%' : '2px' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {monthlyData.map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{d.m}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><span className="card-title">Monthly breakdown</span><span className="card-meta">{selYear}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['Month', 'Contributed', 'Spent', 'Net'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Month' ? 'left' : 'right', color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((d, i) => {
                    const hasData = d.exp > 0 || d.con > 0
                    const net = d.con - d.exp
                    return (
                      <tr key={i} style={{ borderBottom: '0.5px solid var(--border)', opacity: hasData ? 1 : 0.3 }}>
                        <td style={{ padding: '8px 16px', fontWeight: 500 }}>{d.label}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--green)' }}>{d.con > 0 ? '+' + f(d.con) : '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--red)' }}>{d.exp > 0 ? f(d.exp) : '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {hasData ? (net >= 0 ? '+' : '') + f(net) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--border2)', background: 'var(--surface2)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>Total {selYear}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>+{f(conEUR)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{f(expEUR)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: netEUR >= 0 ? 'var(--green)' : 'var(--red)' }}>{netEUR >= 0 ? '+' : ''}{f(netEUR)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="grid2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent expenses</span>
            <span className="card-meta">{exps.length} {viewMode === 'year' ? 'this year' : 'this month'}</span>
          </div>
          <div className="card-body">
            {exps.length === 0 ? <div className="empty">No expenses for {lbl}</div> :
              [...exps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(e => (
                <div key={e.id} className="tx">
                  <div className="tx-icon">{CAT_EMOJI[e.category] || '📦'}</div>
                  <div className="tx-info">
                    <div className="tx-name">{e.description}</div>
                    <div className="tx-meta">{e.category} · {e.paid_by === 'you' ? myName : e.paid_by === 'partner' ? partnerName : 'Joint'}</div>
                  </div>
                  <div className="tx-date">{fmtDate(e.date)}</div>
                  <div className="tx-amt neg">{fmtRaw(e.amount, e.currency)}</div>
                </div>
              ))
            }
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">By category</span><span className="card-meta">{lbl}</span></div>
          <div className="card-body">
            {topCats.length === 0 ? <div className="empty">No data for {lbl}</div> :
              topCats.map(([cat, eur]) => (
                <div key={cat} style={{ marginBottom: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>{CAT_EMOJI[cat] || ''} {cat}</span>
                    <span style={{ fontWeight: 500 }}>{f(eur)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: Math.round(eur / maxCat * 100) + '%', background: 'var(--acc)' }} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Who paid</span><span className="card-meta">{lbl}</span></div>
          <div className="card-body">
            {expEUR === 0 ? <div className="empty">No expenses for {lbl}</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{myName}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--acc)' }}>{f(youSpent + sharedSpent / 2)}</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{partnerName}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--blue)' }}>{f(partnerSpent + sharedSpent / 2)}</div>
                  </div>
                </div>
                {[
                  { label: `🧾 ${myName} paid`, val: youSpent, color: 'var(--acc)' },
                  { label: '🤝 Shared / Joint', val: sharedSpent, color: 'var(--green)' },
                  { label: `🤲 ${partnerName} paid`, val: partnerSpent, color: 'var(--blue)' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: row.color }}>{f(row.val)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Savings goals</span><span className="card-meta">{goals.length} goals</span></div>
          <div className="card-body">
            {goals.length === 0 ? <div className="empty">No savings goals yet</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Total saved</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--green)' }}>{f(totalSaved)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>All targets</div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>{f(totalGoalTarget)}</div>
                  </div>
                </div>
                {goals.slice(0, 4).map(g => {
                  const saved = deposits.filter(d => d.goal_id === g.id).reduce((s, d) => s + d.amount_eur, 0)
                  const pct = Math.min(Math.round(saved / g.target_eur * 100), 100)
                  return (
                    <div key={g.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{g.emoji} {g.name}</span>
                        <span style={{ color: 'var(--muted)' }}>{f(saved)} / {f(g.target_eur)}</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: pct + '%', background: 'var(--green)' }} />
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {trips.length > 0 && (
        <div className="card">
          <div className="card-head"><span className="card-title">Trips</span><span className="card-meta">{trips.length} planned</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {trips.slice(0, 3).map(t => (
                <div key={t.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>✈️ {t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    {t.date_from ? fmtDate(t.date_from) : ''}{t.date_from && t.date_to ? ' → ' : ''}{t.date_to ? fmtDate(t.date_to) : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>Budget: {f(t.budget_eur)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
