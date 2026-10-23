import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const controlClass =
  'w-full rounded-lg border border-line bg-base px-3 text-sm text-fg placeholder:text-muted/70 transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 aria-[invalid=true]:border-danger'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/** Accessible label + control + hint + error wiring. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-accent" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...p }, ref) {
  return <input ref={ref} className={cn(controlClass, 'h-10', className)} {...p} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(controlClass, 'min-h-[84px] py-2', className)} {...p} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(controlClass, 'h-10 appearance-none bg-[length:16px] pr-8', className)} {...p} />
})

export interface Option<T extends string | number> {
  value: T
  label: string
  hint?: string
}

/** Radio-group presented as large selectable tiles (single choice). Fully keyboard accessible. */
export function ChoiceGroup<T extends string | number>({
  legend,
  value,
  onChange,
  options,
  error,
  columns = 2,
  name,
}: {
  legend: string
  value: T | undefined
  onChange: (v: T) => void
  options: Option<T>[]
  error?: string
  columns?: 1 | 2 | 3 | 4
  name: string
}) {
  const cols = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[columns]
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-fg">{legend}</legend>
      <div className={cn('grid gap-2', cols)}>
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label
              key={String(o.value)}
              className={cn(
                'flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
                checked ? 'border-accent bg-accent/10 text-fg' : 'border-line bg-base text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              <input type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(o.value)} />
              <span className="font-medium text-fg">{o.label}</span>
              {o.hint && <span className="mt-0.5 text-xs text-muted">{o.hint}</span>}
            </label>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** Multi-select chips (checkbox semantics). */
export function ChipGroup<T extends string | number>({
  legend,
  values,
  onChange,
  options,
  error,
  hint,
}: {
  legend: string
  values: T[]
  onChange: (v: T[]) => void
  options: Option<T>[]
  error?: string
  hint?: string
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-fg">{legend}</legend>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = values.includes(o.value)
          return (
            <label
              key={String(o.value)}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
                checked ? 'border-accent bg-accent/12 text-accent' : 'border-line bg-base text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => onChange(checked ? values.filter((v) => v !== o.value) : [...values, o.value])}
              />
              {o.label}
            </label>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** 1–5 scale with labelled anchors, used for check-ins. */
export function ScaleInput({
  legend,
  value,
  onChange,
  low,
  high,
  error,
  name,
}: {
  legend: string
  value: number | undefined
  onChange: (n: number) => void
  low: string
  high: string
  error?: string
  name: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-fg">{legend}</legend>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={cn(
              'flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
              value === n ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-base text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === n} onChange={() => onChange(n)} aria-label={`${legend}: ${n} of 5`} />
            {n}
          </label>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>1 · {low}</span>
        <span>5 · {high}</span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export function Checkbox({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong bg-base accent-[#C7F36B]" />
      <label htmlFor={id} className="cursor-pointer text-sm text-fg">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  )
}
