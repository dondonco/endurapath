import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/shared/ui'
import { Field, ScaleInput, TextArea, TextInput } from '@/components/forms/controls'
import { recoveryCheckInSchema, type RecoveryCheckInInput } from '@/domain/validation/schemas'
import type { RecoveryCheckIn } from '@/domain/models/health'

/** Quick recovery check-in. If one exists for the date it is edited, never duplicated. */
export function CheckInForm({ date, existing, onSubmit, compact }: { date: string; existing?: RecoveryCheckIn; onSubmit: (v: RecoveryCheckInInput) => void; compact?: boolean }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RecoveryCheckInInput>({
    resolver: zodResolver(recoveryCheckInSchema),
    defaultValues: existing
      ? { date, sleepHours: existing.sleepHours, sleepQuality: existing.sleepQuality, fatigue: existing.fatigue, soreness: existing.soreness, mood: existing.mood, readiness: existing.readiness, restingHr: existing.restingHr, notes: existing.notes ?? '' }
      : { date, sleepHours: 7, notes: '' },
  })
  const scales: { name: 'sleepQuality' | 'fatigue' | 'soreness' | 'mood' | 'readiness'; legend: string; low: string; high: string }[] = [
    { name: 'sleepQuality', legend: 'Sleep quality', low: 'Poor', high: 'Excellent' },
    { name: 'fatigue', legend: 'Fatigue', low: 'Fresh', high: 'Very tired' },
    { name: 'soreness', legend: 'Muscle soreness', low: 'None', high: 'Severe' },
    { name: 'mood', legend: 'Mood', low: 'Low', high: 'Great' },
    { name: 'readiness', legend: 'Perceived readiness to train', low: 'Not ready', high: 'Fully ready' },
  ]
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label="Recovery check-in">
      <input type="hidden" {...register('date')} />
      <div className={compact ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4 sm:grid-cols-2'}>
        <Field label="Sleep last night (hours)" required error={errors.sleepHours?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" step="0.25" inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('sleepHours', { valueAsNumber: true })} />}
        </Field>
        <Field label="Resting heart rate (bpm, optional)" error={errors.restingHr?.message} hint="From a watch or a manual pulse count. A trend aid only — never a diagnosis.">
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('restingHr', { valueAsNumber: true })} />}
        </Field>
      </div>
      <div className={compact ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
        {scales.map((s) => (
          <Controller key={s.name} control={control} name={s.name} render={({ field }) => <ScaleInput name={`ci-${s.name}`} legend={s.legend} low={s.low} high={s.high} value={field.value} onChange={field.onChange} error={errors[s.name]?.message} />} />
        ))}
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('notes')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          {existing ? 'Update check-in' : 'Save check-in'}
        </Button>
      </div>
    </form>
  )
}
