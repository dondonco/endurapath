import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  text: string
}

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TONES: Record<Kind, string> = {
  success: 'border-accent/40 text-accent',
  error: 'border-danger/50 text-danger',
  info: 'border-secondary/40 text-secondary',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = ++idRef.current
      setItems((l) => [...l.slice(-3), { id, kind, text }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-elevated px-4 py-3 text-sm shadow-lg shadow-black/40', TONES[t.kind])}>
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1 text-fg">{t.text}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss notification">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used inside <ToastProvider>')
  return v
}
