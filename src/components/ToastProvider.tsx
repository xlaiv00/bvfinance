'use client'
import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'undo'
  undoFn?: () => void
}

let addToastFn: ((t: Omit<Toast, 'id'>) => void) | null = null

export function toast(message: string, type: Toast['type'] = 'success', undoFn?: () => void) {
  if (addToastFn) addToastFn({ message, type, undoFn })
}

export default function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])
  let counter = 0

  addToastFn = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++counter
    setToasts(p => [...p, { ...t, id }])
    if (t.type !== 'undo') {
      setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 3000)
    } else {
      setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 6000)
    }
  }, [])

  function dismiss(id: number) {
    setToasts(p => p.filter(x => x.id !== id))
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'var(--red)' : '#1c1b26',
          border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.3)',
          animation: 'slideIn .15s ease',
          minWidth: 240, maxWidth: 360,
        }}>
          <span style={{ fontSize: 13, color: '#eeedf5', flex: 1 }}>{t.message}</span>
          {t.undoFn && (
            <button onClick={() => { t.undoFn!(); dismiss(t.id) }}
              style={{ background: 'rgba(124,111,247,.2)', border: '0.5px solid rgba(124,111,247,.4)', color: '#7c6ff7', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Undo
            </button>
          )}
          <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 15, padding: 0 }}>✕</button>
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  )
}
