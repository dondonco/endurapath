import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Button } from './ui'
import { cn } from '@/lib/utils'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <RadixDialog.Content
          className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-2xl shadow-black/60', width)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-base font-semibold text-fg">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg" aria-label="Close dialog">
              <X className="size-5" />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

interface ConfirmOptions {
  title: string
  body: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}
type Confirm = (o: ConfirmOptions) => Promise<boolean>
const Ctx = createContext<Confirm | null>(null)

/** Promise-based confirmation, used before every destructive action. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback<Confirm>((o) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const value = useMemo(() => confirm, [confirm])
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={Boolean(state)} onOpenChange={(o) => !o && close(false)} title={state?.title ?? ''} size="sm">
        <div className="space-y-5">
          <div className="text-sm text-muted">{state?.body}</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useConfirm(): Confirm {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return v
}
