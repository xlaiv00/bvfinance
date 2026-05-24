'use client'
import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'undo'
  undoFn?: () => void
}

let _addToast: ((t: Omit<Toast, 'id'>) => void) | null = null

export function toast(message: string, type: Toast['type'] = 'success', undoFn?: () => void) {
  if (_addToast) _addToast({ message, type, undoFn })
}

export default function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let id = 0
    _addToast = (t) => {
      const newId = ++id
      setToasts(p => [...p, { ...t, id: newId }])
      const timeout = t.undoFn ? 6000 : 3000
      setTimeout(() => setToasts(p => p.filter(x => x.id !== newId)), timeout)
    }
    return () => { _addToast = null }
  }, [])

  function dismiss(id: number) {
    setToasts(p => p.filter(x => x.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#1c1b26', border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          minWidth: 240, maxWidth: 360,
        }}>
          <span style={{ fontSize: 13, color: '#eeedf5', flex: 1, lineHeight: 1.4 }}>{t.message}</span>
          {t.undoFn && (
            <button onClick={() => { t.undoFn!(); dismiss(t.id) }}
              style={{ background: 'rgba(124,111,247,.2)', border: '0.5px solid rgba(124,111,247,.4)', color: '#7c6ff7', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Undo
            </button>
          )}
          <button onClick={() => dismiss(t.id)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
