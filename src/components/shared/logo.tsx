import { cn } from '@/lib/utils'

/** Abstract forward path: a swim wave, a bike climb and a run line resolving into one forward arrow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden fill="none">
      <rect width="32" height="32" rx="8" fill="#131B24" stroke="#263444" />
      <path d="M5 22c3.2 0 3.2-3 6.4-3s3.2 3 6.4 3 3.2-3 4.8-3" stroke="#56D6C9" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 14.5 12 8l5 5 8-6.5" stroke="#C7F36B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m22.5 6 3.4.5-.7 3.3" stroke="#C7F36B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <p className="text-[17px] font-semibold tracking-tight text-fg">
            Endura<span className="text-accent">Path</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted">Every distance. One journey.</p>
        </div>
      )}
    </div>
  )
}
