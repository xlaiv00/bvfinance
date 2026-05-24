export type Currency = 'EUR' | 'CZK' | 'USD' | 'VND'

export const EXPENSE_CATEGORIES = [
  { value: 'Groceries', label: '🛒 Groceries' },
  { value: 'Restaurants', label: '🍽️ Restaurants' },
  { value: 'Transport', label: '🚌 Transport' },
  { value: 'Household', label: '🏠 Household' },
  { value: 'Travel', label: '✈️ Travel' },
  { value: 'Gifts', label: '🎁 Gifts' },
  { value: 'Entertainment', label: '🎬 Entertainment' },
  { value: 'Health', label: '💊 Health' },
  { value: 'Utilities', label: '⚡ Utilities' },
  { value: 'Shopping', label: '🛍️ Shopping' },
  { value: 'Other', label: '📦 Other' },
] as const

export const TRIP_CATEGORIES = [
  { value: 'Flights', label: '✈️ Flights' },
  { value: 'Accommodation', label: '🏨 Accommodation' },
  { value: 'Food & Drinks', label: '🍽️ Food & Drinks' },
  { value: 'Restaurants', label: '🍜 Restaurants' },
  { value: 'Groceries', label: '🛒 Groceries' },
  { value: 'Transport', label: '🚌 Transport' },
  { value: 'Car Rental', label: '🚗 Car Rental' },
  { value: 'Activities', label: '🎡 Activities' },
  { value: 'Entertainment', label: '🎬 Entertainment' },
  { value: 'Shopping', label: '🛍️ Shopping' },
  { value: 'Health', label: '💊 Health' },
  { value: 'Insurance', label: '🛡️ Insurance' },
  { value: 'Other', label: '📦 Other' },
] as const

export const CAT_EMOJI: Record<string, string> = {
  Groceries: '🛒', Restaurants: '🍽️', Transport: '🚌', Household: '🏠',
  Travel: '✈️', Gifts: '🎁', Entertainment: '🎬', Health: '💊',
  Utilities: '⚡', Other: '📦', Flights: '✈️', Accommodation: '🏨',
  'Food & Drinks': '🍽️', Activities: '🎡', Shopping: '🛍️',
  'Car Rental': '🚗', Insurance: '🛡️',
}

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const EUR_CZK = 24.5
const USD_CZK = 22.8
const VND_CZK = 0.000895

export function toEUR(amount: number, cur: Currency): number {
  if (cur === 'EUR') return amount
  if (cur === 'CZK') return amount / EUR_CZK
  if (cur === 'USD') return (amount * USD_CZK) / EUR_CZK
  if (cur === 'VND') return (amount * VND_CZK) / EUR_CZK
  return amount
}

export function fmtAmount(eur: number, cur: Currency): string {
  if (cur === 'EUR') return '€' + eur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'CZK') return Math.round(eur * EUR_CZK).toLocaleString('cs-CZ') + ' Kč'
  return '€' + eur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtRaw(amount: number, cur: string): string {
  if (cur === 'CZK') return Math.round(amount).toLocaleString('cs-CZ') + ' Kč'
  if (cur === 'EUR') return '€' + amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'USD') return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (cur === 'VND') return Math.round(amount).toLocaleString('vi-VN') + ' ₫'
  return amount + ' ' + cur
}

export function fmtDate(s: string): string {
  if (!s) return ''
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDateFull(s: string): string {
  if (!s) return ''
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function todayStr(): string { return new Date().toISOString().split('T')[0] }

export interface Expense {
  id: string; household_id: string; description: string
  amount: number; currency: string; amount_eur: number
  date: string; category: string; paid_by: string
}
export interface Contribution {
  id: string; household_id: string; person: string
  amount: number; currency: string; amount_eur: number
  date: string; note?: string
}
export interface SavingsGoal {
  id: string; household_id: string; name: string; emoji: string; target_eur: number
}
export interface SavingsDeposit {
  id: string; goal_id: string; amount_eur: number
}
export interface Trip {
  id: string; household_id: string; name: string
  budget: number; currency: string; budget_eur: number
  date_from?: string; date_to?: string; created_at: string
}
export interface TripExpense {
  id: string; trip_id: string; household_id: string
  description: string; amount: number; currency: string
  amount_eur: number; category: string; date: string
}
