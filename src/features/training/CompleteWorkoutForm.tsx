import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/shared/ui'
import { Checkbox, Field, ScaleInput, TextArea, TextInput } from '@/components/forms/controls'
import { workoutResultSchema, type WorkoutResultInput } from '@/domain/validation/schemas'
import type { Workout } from '@/domain/models/training'

const FEELING = ['', 'Poor', 'Below average', 'Okay', 'Good', 'Great']

/** Records the actual result of a planned session. Used on the dashboard and the workout detail page. */
export function CompleteWorkoutForm({ workout, onSubmit, onCancel }: { workout: Workout; onSubmit: (v: WorkoutResultInput) => void; onCancel?: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkoutResultInput>({
    resolver: zodResolver(workoutResultSchema),
    defaultValues: { actualDurationMin: workout.durationMin, rpe: undefined, symptomsNoted: false, notes: '' },
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label={`Record result for ${workout.title}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Actual duration (minutes)" required error={errors.actualDurationMin?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" min={1} aria-describedby={describedBy} aria-invalid={invalid} {...register('actualDurationMin', { valueAsNumber: true })} />}
        </Field>
        <Field label="Actual distance (metres, optional)" error={errors.actualDistanceM?.message} hint="Leave blank if you did not track it.">
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" min={0} aria-describedby={describedBy} aria-invalid={invalid} {...register('actualDistanceM', { valueAsNumber: true })} />}
        </Field>
      </div>
      <Field label="Perceived effort (RPE 1–10)" required error={errors.rpe?.message} hint={`Planned: RPE ${workout.target.rpe[0]}–${workout.target.rpe[1]}. 1 = very easy, 10 = maximal.`}>
        {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" min={1} max={10} aria-describedby={describedBy} aria-invalid={invalid} {...register('rpe', { valueAsNumber: true })} />}
      </Field>
      <Controller
        control={control}
        name="feeling"
        render={({ field }) => <ScaleInput name="feeling" legend="How did it feel? (optional)" value={field.value} onChange={field.onChange} low={FEELING[1]} high={FEELING[5]} />}
      />
      <Field label="Notes (optional)" error={errors.notes?.message}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} placeholder="Conditions, fueling, anything worth remembering" {...register('notes')} />}
      </Field>
      <Controller
        control={control}
        name="symptomsNoted"
        render={({ field }) => <Checkbox checked={Boolean(field.value)} onChange={field.onChange} label="I noticed pain or symptoms during or after this session" hint="You will be pointed to symptom reporting. This does not diagnose anything." />}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary">
          Save result
        </Button>
      </div>
    </form>
  )
}
