import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 font-semibold',
  secondary: 'bg-elevated text-fg hover:bg-line border border-line',
  outline: 'border border-line-strong text-fg hover:bg-elevated',
  ghost: 'text-muted hover:text-fg hover:bg-elevated',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
}
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'size-10 justify-center',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string) {
  return cn('inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50', VARIANTS[variant], SIZES[size], extra)
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant, size, className, type = 'button', ...p }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...p} />
})

export function LinkButton({ variant, size, className, ...p }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-xl border border-line bg-surface', className)} {...p} />
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-accent">{icon}</div>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="max-w-full">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...p} />
}

type Tone = 'neutral' | 'accent' | 'secondary' | 'warn' | 'danger' | 'info'
const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-muted border-line',
  accent: 'bg-accent/12 text-accent border-accent/30',
  secondary: 'bg-secondary/12 text-secondary border-secondary/30',
  warn: 'bg-warn/12 text-warn border-warn/35',
  danger: 'bg-danger/12 text-danger border-danger/40',
  info: 'bg-info/12 text-info border-info/30',
}
export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5', TONES[tone], className)}>{children}</span>
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'danger' | 'accent'; title?: string; children: ReactNode; className?: string }) {
  const t = { info: 'border-info/30 bg-info/8', warn: 'border-warn/40 bg-warn/8', danger: 'border-danger/50 bg-danger/10', accent: 'border-accent/30 bg-accent/8' }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={cn('rounded-lg border px-4 py-3 text-sm', t, className)}>
      {title && <p className="mb-1 font-semibold text-fg">{title}</p>}
      <div className="space-y-1 text-muted [&_strong]:text-fg">{children}</div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {label}…
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'accent' | 'warn' | 'danger' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'accent' && 'text-accent', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function ProgressBar({ value, label, tone = 'accent', className }: { value: number; label: string; tone?: 'accent' | 'secondary' | 'warn'; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const bar = { accent: 'bg-accent', secondary: 'bg-secondary', warn: 'bg-warn' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn('h-2 w-full overflow-hidden rounded-full bg-elevated', className)}>
      <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${v}%` }} />
    </div>
  )
}
