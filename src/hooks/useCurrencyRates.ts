'use client'
import { useState, useEffect } from 'react'

export interface Rates {
  EUR_CZK: number; USD_CZK: number; VND_CZK: number
  loading: boolean; lastUpdated: string
}
const FALLBACK: Rates = { EUR_CZK:24.5, USD_CZK:22.8, VND_CZK:0.000895, loading:false, lastUpdated:'fallback' }
let cached: Rates | null = null
let cacheTime = 0

export function useCurrencyRates(): Rates {
  const [rates, setRates] = useState<Rates>(cached || { ...FALLBACK, loading: true })
  useEffect(() => {
    if (cached && Date.now() - cacheTime < 1800000) { setRates(cached); return }
    fetch('https://api.exchangerate-api.com/v4/latest/CZK')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) {
          const r: Rates = {
            EUR_CZK: 1 / (data.rates.EUR || 1/24.5),
            USD_CZK: 1 / (data.rates.USD || 1/22.8),
            VND_CZK: 1 / (data.rates.VND || 1/0.000895),
            loading: false,
            lastUpdated: new Date().toLocaleTimeString()
          }
          cached = r; cacheTime = Date.now(); setRates(r)
        }
      })
      .catch(() => setRates({ ...FALLBACK, loading: false }))
  }, [])
  return rates
}

export function toCZKr(amount: number, cur: string, r: Rates): number {
  if (!amount) return 0
  if (cur === 'CZK') return amount
  if (cur === 'EUR') return amount * r.EUR_CZK
  if (cur === 'USD') return amount * r.USD_CZK
  if (cur === 'VND') return amount * r.VND_CZK
  return amount
}

export function fromCZKr(czk: number, cur: string, r: Rates): number {
  if (!czk) return 0
  if (cur === 'CZK') return czk
  if (cur === 'EUR') return czk / r.EUR_CZK
  if (cur === 'USD') return czk / r.USD_CZK
  if (cur === 'VND') return czk / r.VND_CZK
  return czk
}

export function fmtR(czk: number, cur: string, r: Rates): string {
  const v = fromCZKr(czk, cur, r)
  if (cur === 'VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  if (cur === 'CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (cur === 'EUR') return '€' + v.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 })
  if (cur === 'USD') return '$' + v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
  return v.toFixed(2)
}
