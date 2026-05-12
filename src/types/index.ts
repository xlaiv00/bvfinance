export type Currency = 'EUR' | 'CZK'
export const EUR_CZK = 24.5

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
  Utilities: '⚡', Other: '📦', Flights: '✈️', Hotels: '🏨',
  Accommodation: '🏨', Food: '🍜', 'Food & Drinks': '🍽️', Activities: '🎡',
  Shopping: '🛍️', 'Car Rental': '🚗', Insurance: '🛡️',
}

export function toEUR(amount: number, currency: Currency): number {
  return currency === 'CZK' ? amount / EUR_CZK : amount
}

export function fmtAmount(eur: number, displayCurrency: Currency): string {
  if (displayCurrency === 'CZK') {
    return 'Kč\u202f' + Math.round(eur * EUR_CZK).toLocaleString('cs-CZ')
  }
  return '€' + eur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtRaw(amount: number, currency: Currency): string {
  if (currency === 'CZK') return 'Kč\u202f' + Math.round(amount).toLocaleString('cs-CZ')
  return '€' + Number(amount).toFixed(2)
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

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
export const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec']

export interface Household {
  id: string
  name: string
  invite_code: string
}

export interface Expense {
  id: string
  household_id: string
  description: string
  amount: number
  currency: Currency
  amount_eur: number
  date: string
  category: string
  paid_by: string
  created_at: string
}

export interface Contribution {
  id: string
  household_id: string
  person: string
  amount: number
  currency: Currency
  amount_eur: number
  date: string
  note?: string
  created_at: string
}

export interface SavingsGoal {
  id: string
  household_id: string
  name: string
  target_amount: number
  currency: Currency
  target_eur: number
  emoji: string
  created_at: string
}

export interface SavingsDeposit {
  id: string
  goal_id: string
  household_id: string
  amount: number
  currency: Currency
  amount_eur: number
  date: string
  deposited_by: string
  created_at: string
}

export interface Trip {
  id: string
  household_id: string
  name: string
  budget: number
  currency: Currency
  budget_eur: number
  date_from?: string
  date_to?: string
  created_at: string
}

export interface TripExpense {
  id: string
  trip_id: string
  household_id: string
  description: string
  amount: number
  currency: Currency
  amount_eur: number
  category: string
  date: string
  created_at: string
}
