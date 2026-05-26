import type { Metadata } from 'next'
import ToastProvider from '@/components/ToastProvider'
import './globals.css'
export const metadata: Metadata = { title: 'Together', description: 'Joint finance tracker' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<ToastProvider /></body></html>
}
