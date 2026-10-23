import type { AthleteAvailability } from '../models/athlete'
import type { IntensityLevel, Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type { ClinicalRestriction } from '../models/health'
import type {
  AdjustmentProposal,
  PlanChange,
  PlanChangeDetail,
  PlanChangeKind,
  ProposedChange,
  Workout,
  WorkoutResult,
  WorkoutSnapshot,
} from '../models/training'
import { isSportBlocked } from '../safety/restrictions'
import { checkDateAvailable } from './availability'
import { INTENSITY_RANK } from './config'
import { eventConstraintFor, snapshotOf } from './sessions'
import { addDaysISO, daysBetween, formatDate, mondayOf, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'

export interface ScheduleContext {
  availability: Pick<AthleteAvailability, 'trainingDays' | 'restDay' | 'unavailable' | 'maxHoursPerWeek'>
  events: RaceEvent[]
  restrictions: ClinicalRestriction[]
  workouts: Workout[]
  today: ISODate
}

export interface MoveEvaluation {
  ok: boolean
  blockers: string[]
  warnings: string[]
}

type IdFactory = (prefix: string) => string

export function isDemanding(w: Pick<Workout, 'intensity' | 'kind'>): boolean {
  return w.intensity === 'hard' || w.kind === 'brick' || w.kind === 'bike-long' || w.kind === 'run-long' || w.kind === 'bike-race-pace'
}

export function isHard(w: Pick<Workout, 'intensity'>): boolean {
  return w.intensity === 'hard'
}

function weekMinutes(workouts: Workout[], weekStart: ISODate, excludeId?: string): number {
  return workouts
    .filter((w) => w.weekStart === weekStart && w.status !== 'skipped' && w.sport !== 'rehab' && w.id !== excludeId)
    .reduce((s, w) => s + w.durationMin, 0)
}

/** Whether (and how safely) a planned workout may move to `toDate`. Pure; never mutates. */
export function evaluateMove(workout: Workout, toDate: ISODate, ctx: ScheduleContext, ignoreIds: string[] = []): MoveEvaluation {
  const blockers: string[] = []
  const warnings: string[] = []
  if (workout.status !== 'planned') blockers.push('Only planned sessions can be moved — completed and skipped sessions stay as a record.')
  if (toDate < ctx.today) blockers.push('Sessions cannot be moved into the past.')
  if (toDate === workout.date) blockers.push('This session is already on that date.')

  const isRehab = workout.sport === 'rehab'
  const avail = checkDateAvailable(toDate, ctx.availability, ctx.events, { allowNonTrainingDay: isRehab })
  if (!avail.ok) blockers.push(avail.reason)

  if (!isRehab && isSportBlocked(workout.sport, ctx.restrictions))
    blockers.push('An active clinical restriction does not allow this type of session.')

  const c = eventConstraintFor(toDate, ctx.events)
  if (c.maxIntensity && INTENSITY_RANK[workout.intensity] > INTENSITY_RANK[c.maxIntensity])
    blockers.push(`${c.reason}: only ${c.maxIntensity} sessions are appropriate around this date.`)

  const others = ctx.workouts.filter((w) => w.id !== workout.id && !ignoreIds.includes(w.id) && w.status !== 'skipped')
  const sameDay = others.filter((w) => w.date === toDate && w.sport !== 'rehab')
  const before = others.filter((w) => w.date === addDaysISO(toDate, -1) && w.sport !== 'rehab')
  const after = others.filter((w) => w.date === addDaysISO(toDate, 1) && w.sport !== 'rehab')

  if (!isRehab && isDemanding(workout)) {
    if (sameDay.some(isDemanding)) blockers.push('Another demanding session is already on that date.')
    if (isHard(workout) && [...before, ...after].some(isHard)) blockers.push('That would put two hard sessions on consecutive days — recovery between hard efforts is required.')
    else if ([...before, ...after].some(isDemanding)) warnings.push('This puts two demanding sessions on back-to-back days. Consider keeping an easy day between them.')
  }
  if (!isRehab && sameDay.length > 0 && !sameDay.some(isDemanding)) warnings.push('There is already a session on that date — you would be training twice that day.')

  const target = workout.weekStart
  const toWeek = mondayOf(toDate)
  if (!isRehab && toWeek !== target) {
    warnings.push('Moving to a different week changes that week’s structure and training load.')
    const mins = weekMinutes(ctx.workouts, toWeek, workout.id) + workout.durationMin
    if (mins > ctx.availability.maxHoursPerWeek * 60 * 1.1) blockers.push(`That week would exceed your ${ctx.availability.maxHoursPerWeek} h/week limit.`)
  }
  return { ok: blockers.length === 0, blockers, warnings }
}

export function evaluateSwap(a: Workout, b: Workout, ctx: ScheduleContext): MoveEvaluation {
  const blockers: string[] = []
  const warnings: string[] = []
  const ignore = [a.id, b.id]
  if (a.status !== 'planned' || b.status !== 'planned') blockers.push('Both sessions must still be planned.')
  const one = evaluateMove({ ...a, status: 'planned' }, b.date, { ...ctx, workouts: ctx.workouts.filter((w) => !ignore.includes(w.id)) })
  const two = evaluateMove({ ...b, status: 'planned' }, a.date, { ...ctx, workouts: ctx.workouts.filter((w) => !ignore.includes(w.id)) })
  const filter = (m: string) => !m.includes('already on that date')
  blockers.push(...one.blockers.filter(filter), ...two.blockers.filter(filter))
  warnings.push(...one.warnings, ...two.warnings)
  // Adjacency between the two swapped sessions themselves.
  const gap = Math.abs(daysBetween(a.date, b.date))
  if (gap === 1 && isHard(a) && isHard(b)) blockers.push('Swapping would leave two hard sessions on consecutive days.')
  return { ok: blockers.length === 0, blockers: Array.from(new Set(blockers)), warnings: Array.from(new Set(warnings)) }
}

/* ------------------------------ Change helpers ------------------------------ */

function makeChange(
  planId: string,
  kind: PlanChangeKind,
  summary: string,
  reason: string,
  by: PlanChange['initiatedBy'],
  workoutIds: string[],
  details: PlanChangeDetail[],
  now: Timestamp,
  mk: IdFactory,
): PlanChange {
  return { id: mk('chg'), createdAt: now, updatedAt: now, planId, kind, summary, reason, initiatedBy: by, workoutIds, details, at: now }
}

export interface OpResult {
  workouts: Workout[]
  change: PlanChange
}

export type OpError = { error: string }

function replace(workouts: Workout[], updated: Workout[]): Workout[] {
  const map = new Map(updated.map((w) => [w.id, w]))
  return workouts.map((w) => map.get(w.id) ?? w)
}

export function rescheduleWorkout(
  workouts: Workout[],
  id: string,
  toDate: ISODate,
  reason: string,
  ctx: ScheduleContext,
  now: Timestamp,
  mk: IdFactory = newId,
): OpResult | OpError {
  const w = workouts.find((x) => x.id === id)
  if (!w) return { error: 'Workout not found.' }
  const ev = evaluateMove(w, toDate, { ...ctx, workouts })
  if (!ev.ok) return { error: ev.blockers[0] }
  const moved: Workout = {
    ...w,
    date: toDate,
    weekStart: mondayOf(toDate),
    modified: true,
    updatedAt: now,
  }
  const change = makeChange(
    w.planId,
    'reschedule',
    `Moved “${w.title}” from ${formatDate(w.date)} to ${formatDate(toDate)}`,
    reason || 'Athlete rescheduled to fit their week',
    'athlete',
    [id],
    [{ workoutId: id, field: 'date', from: w.date, to: toDate }],
    now,
    mk,
  )
  return { workouts: replace(workouts, [moved]), change }
}

export function swapWorkouts(
  workouts: Workout[],
  idA: string,
  idB: string,
  reason: string,
  ctx: ScheduleContext,
  now: Timestamp,
  mk: IdFactory = newId,
): OpResult | OpError {
  const a = workouts.find((x) => x.id === idA)
  const b = workouts.find((x) => x.id === idB)
  if (!a || !b) return { error: 'Workout not found.' }
  const ev = evaluateSwap(a, b, { ...ctx, workouts })
  if (!ev.ok) return { error: ev.blockers[0] }
  const ws = mondayOf
  const na: Workout = { ...a, date: b.date, weekStart: ws(b.date), modified: true, updatedAt: now }
  const nb: Workout = { ...b, date: a.date, weekStart: ws(a.date), modified: true, updatedAt: now }
  const change = makeChange(
    a.planId,
    'swap',
    `Swapped “${a.title}” (${formatDate(a.date)}) with “${b.title}” (${formatDate(b.date)})`,
    reason || 'Athlete swapped sessions to fit their week',
    'athlete',
    [idA, idB],
    [
      { workoutId: idA, field: 'date', from: a.date, to: b.date },
      { workoutId: idB, field: 'date', from: b.date, to: a.date },
    ],
    now,
    mk,
  )
  return { workouts: replace(workouts, [na, nb]), change }
}

export function skipWorkout(workouts: Workout[], id: string, reason: string, now: Timestamp, mk: IdFactory = newId): OpResult | OpError {
  const w = workouts.find((x) => x.id === id)
  if (!w) return { error: 'Workout not found.' }
  if (w.status !== 'planned') return { error: 'Only planned sessions can be skipped.' }
  if (reason.trim().length < 3) return { error: 'Add a short reason so the plan can learn from it.' }
  const updated: Workout = { ...w, status: 'skipped', statusReason: reason.trim(), updatedAt: now }
  const change = makeChange(
    w.planId,
    'skip',
    `Skipped “${w.title}” (${formatDate(w.date)})`,
    reason.trim(),
    'athlete',
    [id],
    [{ workoutId: id, field: 'status', from: 'planned', to: 'skipped' }],
    now,
    mk,
  )
  return { workouts: replace(workouts, [updated]), change }
}

/** Replaces a missed session with a genuine recovery session. The original is preserved on the workout. */
export function replaceWithRecovery(
  workouts: Workout[],
  id: string,
  reason: string,
  build: (w: Workout) => Workout,
  now: Timestamp,
  mk: IdFactory = newId,
): OpResult | OpError {
  const w = workouts.find((x) => x.id === id)
  if (!w) return { error: 'Workout not found.' }
  if (w.status !== 'planned') return { error: 'Only planned sessions can be replaced.' }
  if (reason.trim().length < 3) return { error: 'Add a short reason so the plan can learn from it.' }
  const original: WorkoutSnapshot = w.originalSnapshot ?? snapshotOf(w)
  const replaced: Workout = {
    ...build(w),
    originalSnapshot: original,
    modified: true,
    statusReason: reason.trim(),
    updatedAt: now,
  }
  const change = makeChange(
    w.planId,
    'replace-with-recovery',
    `Replaced “${w.title}” with a recovery session`,
    reason.trim(),
    'athlete',
    [id],
    [
      { workoutId: id, field: 'title', from: w.title, to: replaced.title },
      { workoutId: id, field: 'durationMin', from: String(w.durationMin), to: String(replaced.durationMin) },
    ],
    now,
    mk,
  )
  return { workouts: replace(workouts, [replaced]), change }
}

export interface SchedulingFieldEdit {
  timeOfDay?: Workout['timeOfDay']
  durationMin?: number
  date?: ISODate
}

/** Only scheduling fields are editable by the athlete. Session content and intensity remain engine-owned. */
export function editSchedulingFields(
  workouts: Workout[],
  id: string,
  edit: SchedulingFieldEdit,
  reason: string,
  ctx: ScheduleContext,
  now: Timestamp,
  mk: IdFactory = newId,
): OpResult | OpError {
  const w = workouts.find((x) => x.id === id)
  if (!w) return { error: 'Workout not found.' }
  if (w.status !== 'planned') return { error: 'Completed and skipped sessions cannot be edited.' }
  let list = workouts
  const details: PlanChangeDetail[] = []
  let current = w
  if (edit.date && edit.date !== w.date) {
    const res = rescheduleWorkout(list, id, edit.date, reason, ctx, now, mk)
    if ('error' in res) return res
    list = res.workouts
    current = list.find((x) => x.id === id) as Workout
    details.push({ workoutId: id, field: 'date', from: w.date, to: edit.date })
  }
  if (edit.timeOfDay && edit.timeOfDay !== w.timeOfDay) {
    details.push({ workoutId: id, field: 'timeOfDay', from: w.timeOfDay ?? 'unset', to: edit.timeOfDay })
    current = { ...current, timeOfDay: edit.timeOfDay, modified: true, updatedAt: now }
  }
  if (edit.durationMin && edit.durationMin !== w.durationMin) {
    if (edit.durationMin > w.durationMin * 1.25 + 5) return { error: 'Duration can be shortened freely but only extended by ~25%. Ask Coach Atlas for a plan adjustment for larger changes.' }
    if (edit.durationMin < 10) return { error: 'Sessions shorter than 10 minutes are not useful — skip the session instead.' }
    details.push({ workoutId: id, field: 'durationMin', from: String(w.durationMin), to: String(edit.durationMin) })
    current = { ...current, durationMin: edit.durationMin, modified: true, updatedAt: now }
  }
  if (!details.length) return { error: 'Nothing to change.' }
  const change = makeChange(w.planId, 'edit', `Edited scheduling for “${w.title}”`, reason || 'Athlete edited scheduling fields', 'athlete', [id], details, now, mk)
  return { workouts: replace(list, [current]), change }
}

/* ------------------------------ Completion ------------------------------ */

export interface CompleteInput {
  actualDurationMin: number
  actualDistanceM?: number
  rpe: number
  feeling?: number
  notes?: string
  symptomsNoted: boolean
}

export function completeWorkout(
  workouts: Workout[],
  results: WorkoutResult[],
  id: string,
  input: CompleteInput,
  completedOn: ISODate,
  now: Timestamp,
  mk: IdFactory = newId,
): { workouts: Workout[]; results: WorkoutResult[]; result: WorkoutResult } | OpError {
  const w = workouts.find((x) => x.id === id)
  if (!w) return { error: 'Workout not found.' }
  if (results.some((r) => r.workoutId === id)) return { error: 'This session already has a recorded result.' }
  if (w.status === 'skipped') return { error: 'Skipped sessions cannot be completed. Restore the session first.' }
  const result: WorkoutResult = {
    id: mk('res'),
    createdAt: now,
    updatedAt: now,
    workoutId: id,
    completedOn,
    actualDurationMin: input.actualDurationMin,
    actualDistanceM: input.actualDistanceM,
    rpe: input.rpe,
    feeling: input.feeling,
    notes: input.notes,
    symptomsNoted: input.symptomsNoted,
    planned: { ...snapshotOf(w), stage: w.stage, kind: w.kind },
  }
  return {
    workouts: replace(workouts, [{ ...w, status: 'completed', updatedAt: now }]),
    results: [...results, result],
    result,
  }
}

/* ------------------------------ Missed-session proposals ------------------------------ */

export type MissedChoice = 'skip' | 'replace-with-recovery' | 'request-adjustment'

export function missedKeySessionsRecently(workouts: Workout[], today: ISODate, days = 14): number {
  const from = addDaysISO(today, -days)
  return workouts.filter((w) => w.status === 'skipped' && w.isKey && w.date >= from && w.date <= today).length
}

function nextSafeDay(w: Workout, ctx: ScheduleContext): ISODate | null {
  for (let i = 1; i <= 6; i++) {
    const d = addDaysISO(w.date, i)
    if (d < ctx.today) continue
    const ev = evaluateMove({ ...w, status: 'planned' }, d, ctx)
    if (ev.ok && ev.warnings.every((m) => !m.includes('back-to-back'))) return d
  }
  return null
}

/**
 * Builds a transparent proposal for a missed session. Deliberately never "makes up" lost work by stacking it:
 * easy sessions are simply let go; a missed key session may move only to a genuinely safe day, in an eased form.
 */
export function proposeMissedAdjustment(missed: Workout, ctx: ScheduleContext): AdjustmentProposal {
  const rationale: string[] = []
  const changes: ProposedChange[] = []
  const recent = missedKeySessionsRecently(ctx.workouts, ctx.today) + (missed.isKey && missed.status !== 'skipped' ? 1 : 0)

  if (!missed.isKey && !isDemanding(missed)) {
    rationale.push('This was a supporting session. Letting it go costs little; fitness is built from consistency, not from catching up.')
    changes.push({ workoutId: missed.id, kind: 'skip', description: `Skip “${missed.title}” without replacing it.` })
  } else {
    rationale.push('Missed key sessions are not added on top of later days: stacking load raises injury and fatigue risk.')
    const day = nextSafeDay(missed, { ...ctx, workouts: ctx.workouts })
    if (day) {
      const easier: IntensityLevel = missed.intensity === 'hard' ? 'moderate' : missed.intensity
      changes.push({
        workoutId: missed.id,
        kind: 'move',
        toDate: day,
        toIntensity: easier,
        toDurationMin: Math.round(missed.durationMin * 0.85),
        description: `Move to ${formatDate(day)} at ${easier} effort, ~15% shorter, because that day has recovery on both sides.`,
      })
      rationale.push(`${formatDate(day)} is the first day with no demanding neighbour sessions.`)
    } else {
      changes.push({ workoutId: missed.id, kind: 'skip', description: `No safe day this week — skip “${missed.title}” and continue the plan.` })
      rationale.push('No later day this week has enough recovery around it, so the session is let go rather than squeezed in.')
    }
  }

  let progression = { affected: false, note: 'No effect on your progression plan.' }
  if (recent >= 2) {
    progression = {
      affected: true,
      note: `${recent} key sessions missed in 14 days. The next readiness review will weigh consistency and may recommend holding the current stage.`,
    }
    const nextHard = ctx.workouts
      .filter((w) => w.status === 'planned' && w.date > missed.date && w.intensity === 'hard')
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
    if (nextHard) {
      changes.push({
        workoutId: nextHard.id,
        kind: 'downgrade',
        toIntensity: 'moderate',
        description: `Ease the next hard session (“${nextHard.title}”, ${formatDate(nextHard.date)}) to moderate while consistency rebuilds.`,
      })
      rationale.push('Several recent misses suggest life load is high — easing the next hard session protects the plan.')
    }
  }

  const delta = changes.reduce((s, c) => {
    if (c.kind === 'skip') return s - missed.durationMin
    if (c.kind === 'move' && c.toDurationMin) return s - (missed.durationMin - c.toDurationMin)
    return s
  }, 0)

  return {
    id: `prop_${missed.id}`,
    trigger: `Missed: ${missed.title} (${formatDate(missed.date)})`,
    summary: changes.map((c) => c.description).join(' '),
    rationale,
    changes,
    weeklyMinutesDelta: delta,
    progression,
  }
}

/** Applies an approved proposal. Each changed workout is logged individually in the change history. */
export function applyProposal(
  workouts: Workout[],
  proposal: AdjustmentProposal,
  reason: string,
  ctx: ScheduleContext,
  buildDowngrade: (w: Workout, to: IntensityLevel, durationMin?: number) => Workout,
  now: Timestamp,
  mk: IdFactory = newId,
): { workouts: Workout[]; changes: PlanChange[] } | OpError {
  let list = workouts
  const changes: PlanChange[] = []
  for (const c of proposal.changes) {
    const w = list.find((x) => x.id === c.workoutId)
    if (!w) continue
    if (c.kind === 'skip') {
      const res = skipWorkout(list, w.id, reason || 'Plan adjustment: ' + proposal.trigger, now, mk)
      if ('error' in res) return res
      list = res.workouts
      changes.push({ ...res.change, kind: 'adjustment-applied', initiatedBy: 'plan-engine' })
    } else if (c.kind === 'move' && c.toDate) {
      const downgraded = c.toIntensity && c.toIntensity !== w.intensity ? buildDowngrade(w, c.toIntensity, c.toDurationMin) : w
      const base = downgraded === w ? list : replace(list, [{ ...downgraded, modified: true }])
      const res = rescheduleWorkout(base, w.id, c.toDate, reason || proposal.trigger, { ...ctx, workouts: base }, now, mk)
      if ('error' in res) return res
      list = res.workouts
      changes.push({ ...res.change, kind: 'adjustment-applied', initiatedBy: 'plan-engine', summary: `${res.change.summary} (adjusted: ${c.description})` })
    } else if ((c.kind === 'downgrade' || c.kind === 'shorten') && c.toIntensity) {
      const d = buildDowngrade(w, c.toIntensity, c.toDurationMin)
      list = replace(list, [{ ...d, modified: true, updatedAt: now }])
      changes.push(
        makeChange(
          w.planId,
          'adjustment-applied',
          `Eased “${w.title}” to ${c.toIntensity}`,
          reason || proposal.trigger,
          'plan-engine',
          [w.id],
          [{ workoutId: w.id, field: 'intensity', from: w.intensity, to: c.toIntensity }],
          now,
          mk,
        ),
      )
    }
  }
  return { workouts: list, changes }
}

export { makeChange }
