'use client'
import { MONTHS_S } from '@/types'

interface Props {
  selYear: number
  selMonth: number
  years: number[]
  activeMonths: number[]
  onYearChange: (y: number) => void
  onMonthChange: (m: number) => void
}

export default function Timeline({ selYear, selMonth, years, activeMonths, onYearChange, onMonthChange }: Props) {
  return (
    <>
      <div className="year-row">
        {years.map(y => (
          <button key={y} className={`yr-btn ${y === selYear ? 'active' : ''}`}
            onClick={() => onYearChange(y)}>{y}</button>
        ))}
      </div>
      <div className="timeline">
        {MONTHS_S.map((m, i) => (
          <button key={i} onClick={() => onMonthChange(i)}
            className={`tl-btn ${i === selMonth ? 'active' : ''} ${activeMonths.includes(i) ? 'has-data' : ''}`}>
            <span className="tl-m">{m}</span>
            <span className="tl-dot">●</span>
          </button>
        ))}
      </div>
    </>
  )
}
