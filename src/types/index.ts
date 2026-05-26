
export type Currency = 'CZK' | 'EUR' | 'USD' | 'VND'

const RATES: Record<string, number> = { CZK: 1, EUR: 24.5, USD: 22.8, VND: 0.000895 }

export function toCZK(amount: number, cur: Currency): number {
  return amount * (RATES[cur] || 1)
}
export function fromCZK(czk: number, cur: Currency): number {
  return czk / (RATES[cur] || 1)
}
export function toEUR(amount: number, cur: Currency): number {
  return toCZK(amount, cur) / 24.5
}

export function fmtCZK(czk: number): string {
  return Math.round(czk).toLocaleString('cs-CZ') + ' Kč'
}
export function fmtCur(czk: number, cur: Currency): string {
  const v = fromCZK(czk, cur)
  if (cur === 'CZK') return Math.round(v).toLocaleString('cs-CZ') + ' Kč'
  if (cur === 'EUR') return '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'USD') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'VND') return Math.round(v).toLocaleString('vi-VN') + ' ₫'
  return v.toFixed(2)
}
export function fmtDisplay(amount: number, cur: string): string {
  if (cur === 'CZK') return Math.round(amount).toLocaleString('cs-CZ') + ' Kč'
  if (cur === 'EUR') return '€' + Number(amount).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'USD') return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'VND') return Math.round(amount).toLocaleString('vi-VN') + ' ₫'
  return amount + ' ' + cur
}
export function fmtDate(s: string): string {
  if (!s) return ''
  return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
export function today(): string { return new Date().toISOString().split('T')[0] }

export const EXPENSE_CATS = [
  'Groceries','Restaurants','Transport','Household','Travel',
  'Entertainment','Health','Utilities','Shopping','Gifts','Other'
]
export const CAT_EMOJI: Record<string, string> = {
  Groceries:'🛒', Restaurants:'🍽️', Transport:'🚌', Household:'🏠',
  Travel:'✈️', Entertainment:'🎬', Health:'💊', Utilities:'⚡',
  Shopping:'🛍️', Gifts:'🎁', Other:'📦',
  Flights:'✈️', Accommodation:'🏨', Activities:'🎡',
  'Food & Drinks':'🍽️', 'Car Rental':'🚗'
}
export const TRIP_CATS = [
  'Flights','Accommodation','Food & Drinks','Transport',
  'Car Rental','Activities','Entertainment','Shopping','Health','Other'
]
export const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
export const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec']

// DB types
export interface HHEntry {
  id: string; household_id: string
  type: 'income' | 'expense'
  description: string
  amount_czk: number
  display_amount: number
  display_currency: string
  category: string
  person: string
  date: string
  source: string  // 'manual' | 'trip' | 'business'
  source_id?: string
  created_at: string
}
export interface Trip {
  id: string; household_id: string; name: string
  budget_czk: number; budget_currency: string
  date_from?: string; date_to?: string; created_at: string
}
export interface TripExpense {
  id: string; trip_id: string; household_id: string
  description: string; amount_czk: number
  display_amount: number; display_currency: string
  category: string; date: string
}
export interface BizSale {
  id: string; household_id: string
  date: string; customer: string; watch_name: string
  revenue_czk: number; revenue_cur: string
  watch_cost_czk: number; watch_cost_cur: string
  shipping_czk: number; shipping_cur: string
  ads_czk: number; ads_cur: string
  notes: string
}
export interface BizInventory {
  id: string; household_id: string
  watch_name: string; brand: string; model: string
  purchase_czk: number; purchase_cur: string
  asking_czk: number; asking_cur: string
  status: string; notes: string; date_purchased: string
}
