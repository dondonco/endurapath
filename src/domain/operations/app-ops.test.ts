import { beforeEach, describe, expect, it } from 'vitest'
import {
  addRestrictionOp,
  completeWorkoutOp,
  isError,
  proposeAdjustment,
  applyAdjustmentOp,
  replaceWithRecoveryOp,
  rescheduleOp,
  resolveRestrictionOp,
  restoreSkippedOp,
  skipOp,
  swapOp,
  editSchedulingOp,
  reportSymptomOp,
  acceptProgressionOp,
  runReadinessOp,
  eraseAllDataOp,
  saveEventOp,
  type OpResult,
} from '@/domain/operations/app-ops'
import type { AppState } from '@/domain/models/state'
import type { Workout } from '@/domain/models/training'
import { addDaysISO, dayIndex } from '@/lib/dates'
import { env, makeAthlete, makeAvailability, makeState, resetIds, TODAY } from '@/test/fixtures'

const ok = (r: OpResult): AppState => {
  if (isError(r)) throw new Error(`Expected success but got: ${r.error}`)
  return r
}

/** Future planned session that is easy and not key, ideal for move tests. */
function futureEasy(s: AppState, after = TODAY): Workout {
  const w = s.workouts.find((x) => x.status === 'planned' && x.date > addDaysISO(after, 1) && x.intensity !== 'hard' && x.sport !== 'rehab' && x.kind !== 'bike-long' && x.kind !== 'brick')
  if (!w) throw new Error('no future easy workout')
  return w
}

beforeEach(() => resetIds())

describe('workout completion and history preservation', () => {
  it('records a result separately and marks the workout completed', () => {
    const s = makeState()
    const w = s.workouts[0]
    const next = ok(completeWorkoutOp(s, w.id, { actualDurationMin: 42, rpe: 5, symptomsNoted: false }, env()))
    expect(next.workouts.find((x) => x.id === w.id)?.status).toBe('completed')
    expect(next.results).toHaveLength(1)
    expect(next.results[0]).toMatchObject({ workoutId: w.id, actualDurationMin: 42, rpe: 5 })
    expect(next.results[0].planned.title).toBe(w.title)
  })

  it('refuses to record a second result for the same workout', () => {
    const s = makeState()
    const w = s.workouts[0]
    const once = ok(completeWorkoutOp(s, w.id, { actualDurationMin: 30, rpe: 4, symptomsNoted: false }, env()))
    expect(isError(completeWorkoutOp(once, w.id, { actualDurationMin: 30, rpe: 4, symptomsNoted: false }, env()))).toBe(true)
  })

  it('refuses to complete a skipped workout', () => {
    const s = makeState()
    const w = futureEasy(s)
    const skipped = ok(skipOp(s, w.id, 'Travelling for work', env()))
    expect(isError(completeWorkoutOp(skipped, w.id, { actualDurationMin: 30, rpe: 4, symptomsNoted: false }, env()))).toBe(true)
  })

  it('keeps the planned snapshot in the result when the workout is later edited', () => {
    const s = makeState()
    const w = s.workouts[0]
    const done = ok(completeWorkoutOp(s, w.id, { actualDurationMin: 40, rpe: 5, symptomsNoted: false }, env()))
    const snapshot = structuredClone(done.results[0].planned)
    const edited = { ...done, workouts: done.workouts.map((x) => (x.id === w.id ? { ...x, title: 'Renamed', durationMin: 999 } : x)) }
    expect(edited.results[0].planned).toEqual(snapshot)
  })

  it('raises a safety notification when symptoms are noted', () => {
    const s = makeState()
    const next = ok(completeWorkoutOp(s, s.workouts[0].id, { actualDurationMin: 30, rpe: 4, symptomsNoted: true }, env()))
    expect(next.notifications.some((n) => n.kind === 'safety')).toBe(true)
  })
})

describe('workout rescheduling', () => {
  it('moves a planned workout, flags it modified and logs the change with a reason', () => {
    const s = makeState()
    const w = futureEasy(s)
    const free = [1, 2, 3, 4, 5, 6, 7].map((n) => addDaysISO(w.date, n)).find((d) => !s.workouts.some((x) => x.date === d) && makeAvailability().trainingDays.includes(dayIndex(d)) && dayIndex(d) !== 4)
    expect(free).toBeDefined()
    const next = ok(rescheduleOp(s, w.id, free as string, 'Meeting clash', env()))
    const moved = next.workouts.find((x) => x.id === w.id)!
    expect(moved.date).toBe(free)
    expect(moved.modified).toBe(true)
    expect(moved.originalDate).toBe(w.originalDate)
    expect(next.changes[0]).toMatchObject({ kind: 'reschedule', reason: 'Meeting clash' })
  })

  it('never moves a session into the past', () => {
    const s = makeState()
    const w = futureEasy(s)
    expect(isError(rescheduleOp(s, w.id, addDaysISO(TODAY, -1), 'x', env()))).toBe(true)
  })

  it('never moves a completed session, so history stays intact', () => {
    const s = makeState()
    const w = s.workouts[0]
    const done = ok(completeWorkoutOp(s, w.id, { actualDurationMin: 30, rpe: 4, symptomsNoted: false }, env()))
    expect(isError(rescheduleOp(done, w.id, addDaysISO(w.date, 7), 'x', env()))).toBe(true)
    expect(done.workouts.find((x) => x.id === w.id)?.date).toBe(w.date)
  })

  it('refuses a rest day or a non-training day', () => {
    const s = makeState({ availability: makeAvailability({ trainingDays: [0, 1, 2, 3, 5, 6], restDay: 4 }) })
    const w = futureEasy(s)
    const friday = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => addDaysISO(TODAY, n)).find((d) => dayIndex(d) === 4)!
    expect(isError(rescheduleOp(s, w.id, friday, 'x', env()))).toBe(true)
  })

  it('does not put two hard sessions on consecutive days', () => {
    const s = makeState()
    const a = futureEasy(s)
    const hardBefore: Workout = { ...a, id: 'wo_hard1', date: addDaysISO(a.date, 3), weekStart: a.weekStart, intensity: 'hard', kind: 'run-intervals' }
    const hardMove: Workout = { ...a, id: 'wo_hard2', intensity: 'hard', kind: 'run-intervals' }
    const state = { ...s, workouts: [...s.workouts.filter((w) => w.id !== a.id), hardBefore, hardMove] }
    const target = addDaysISO(hardBefore.date, 1)
    const res = rescheduleOp(state, hardMove.id, target, 'x', env())
    expect(isError(res)).toBe(true)
  })

  it('swaps two planned sessions and preserves both records', () => {
    const s = makeState()
    const easy = s.workouts.filter((w) => w.status === 'planned' && w.date > TODAY && w.intensity === 'easy' && !w.isKey && w.sport !== 'rehab')
    const [a, b] = [easy[0], easy.find((w) => w.date !== easy[0].date && Math.abs(new Date(w.date).getTime() - new Date(easy[0].date).getTime()) > 2 * 86400000)!]
    const next = ok(swapOp(s, a.id, b.id, 'Better fit', env()))
    expect(next.workouts.find((w) => w.id === a.id)?.date).toBe(b.date)
    expect(next.workouts.find((w) => w.id === b.id)?.date).toBe(a.date)
    expect(next.workouts).toHaveLength(s.workouts.length)
    expect(next.changes[0].kind).toBe('swap')
  })

  it('edits only scheduling fields and caps extensions', () => {
    const s = makeState()
    const w = futureEasy(s)
    const shortened = ok(editSchedulingOp(s, w.id, { durationMin: Math.max(15, w.durationMin - 10) }, 'Short on time', env()))
    expect(shortened.workouts.find((x) => x.id === w.id)?.durationMin).toBe(Math.max(15, w.durationMin - 10))
    expect(isError(editSchedulingOp(s, w.id, { durationMin: w.durationMin * 3 }, 'x', env()))).toBe(true)
  })
})

describe('missed sessions', () => {
  it('skips with a recorded reason and keeps the record', () => {
    const s = makeState()
    const w = futureEasy(s)
    const next = ok(skipOp(s, w.id, 'Sick child at home', env()))
    const skipped = next.workouts.find((x) => x.id === w.id)!
    expect(skipped.status).toBe('skipped')
    expect(skipped.statusReason).toBe('Sick child at home')
    expect(next.workouts).toHaveLength(s.workouts.length)
  })

  it('requires a reason', () => {
    const s = makeState()
    expect(isError(skipOp(s, futureEasy(s).id, ' ', env()))).toBe(true)
  })

  it('can restore a skipped future session', () => {
    const s = makeState()
    const w = futureEasy(s)
    const skipped = ok(skipOp(s, w.id, 'Travelling', env()))
    expect(ok(restoreSkippedOp(skipped, w.id, env())).workouts.find((x) => x.id === w.id)?.status).toBe('planned')
  })

  it('replaces a demanding session with a genuine recovery session and keeps the original', () => {
    const s = makeState()
    const w = s.workouts.find((x) => x.status === 'planned' && x.date > TODAY && x.durationMin >= 45 && x.sport !== 'rehab')!
    const next = ok(replaceWithRecoveryOp(s, w.id, 'Poor sleep all week', env()))
    const r = next.workouts.find((x) => x.id === w.id)!
    expect(r.intensity).toBe('recovery')
    expect(r.durationMin).toBeLessThan(w.durationMin)
    expect(r.originalSnapshot?.title).toBe(w.title)
  })

  it('previews an adjustment without changing anything, and a missed key session is never auto-stacked onto the next day', () => {
    const s = makeState()
    const key = s.workouts.find((x) => x.isKey && x.date > TODAY)!
    const proposal = proposeAdjustment(s, key.id, env())
    if (isError(proposal)) throw new Error(proposal.error)
    expect(proposal.rationale.length).toBeGreaterThan(0)
    expect(s.workouts.find((x) => x.id === key.id)?.date).toBe(key.date)
    // No proposed move may land on a day that already holds a demanding session.
    for (const c of proposal.changes.filter((c) => c.kind === 'move' && c.toDate)) {
      const clash = s.workouts.filter((x) => x.date === c.toDate && x.id !== key.id && (x.intensity === 'hard' || x.isKey))
      expect(clash).toHaveLength(0)
    }
    const applied = ok(applyAdjustmentOp(s, proposal, 'Accepted Atlas proposal', env()))
    expect(applied.changes.length).toBeGreaterThan(s.changes.length)
    expect(applied.workouts).toHaveLength(s.workouts.length)
  })
})

describe('clinical restrictions', () => {
  const restriction = {
    title: 'No running',
    description: 'Clinician advised no running',
    source: 'clinician' as const,
    clinicianName: 'Dr. Test',
    severity: 'modify' as const,
    blockedSports: ['run'],
    maxIntensity: 'none' as const,
    reviewDate: '',
  }

  it('adapts future sessions and logs a safety-rule change, without touching completed history', () => {
    const s = makeState()
    const first = s.workouts[0]
    const done = ok(completeWorkoutOp(s, first.id, { actualDurationMin: 30, rpe: 4, symptomsNoted: false }, env()))
    const next = ok(addRestrictionOp(done, restriction, env()))
    expect(next.workouts.find((w) => w.id === first.id)?.status).toBe('completed')
    expect(next.results).toHaveLength(1)
    const futureRuns = next.workouts.filter((w) => w.status === 'planned' && w.date >= TODAY && (w.sport === 'run' || w.sport === 'brick'))
    expect(futureRuns).toHaveLength(0)
    expect(next.changes.some((c) => c.initiatedBy === 'safety-rule')).toBe(true)
    expect(next.notifications.some((n) => n.kind === 'safety')).toBe(true)
  })

  it('is not removed automatically: only an explicit, named, unverified resolution lifts it', () => {
    const s = ok(addRestrictionOp(makeState(), restriction, env()))
    const id = s.medical.restrictions[0].id
    expect(s.medical.restrictions[0].status).toBe('active')
    expect(isError(resolveRestrictionOp(s, id, '', 'ok', env()))).toBe(true)
    expect(isError(resolveRestrictionOp(s, id, 'Dr. Test', '', env()))).toBe(true)
    const lifted = ok(resolveRestrictionOp(s, id, 'Dr. Test', 'Cleared for easy running', env()))
    const r = lifted.medical.restrictions[0]
    expect(r.status).toBe('resolved')
    expect(r.resolution?.verified).toBe(false)
    expect(lifted.changes[0].kind).toBe('plan-regenerated')
  })

  it('a pause restriction leaves no non-rehab training scheduled', () => {
    const s = ok(addRestrictionOp(makeState(), { ...restriction, title: 'Pause', severity: 'pause', blockedSports: [] }, env()))
    expect(s.workouts.filter((w) => w.status === 'planned' && w.date >= TODAY && w.sport !== 'rehab')).toHaveLength(0)
  })

  it('refuses to restore a skipped session while training is paused', () => {
    const base = makeState()
    const w = futureEasy(base)
    const skipped = ok(skipOp(base, w.id, 'Travelling', env()))
    const paused = ok(addRestrictionOp(skipped, { ...restriction, title: 'Pause', severity: 'pause', blockedSports: [] }, env()))
    expect(isError(restoreSkippedOp(paused, w.id, env()))).toBe(true)
  })
})

describe('symptom reporting workflow', () => {
  const base = { bodyArea: 'Knee', symptom: 'Sharp pain on running', severity: 3, onset: 'today' as const, trend: 'same' as const, duringTraining: true, atRest: false, redFlags: [] as string[] }

  it('holds training and escalates for an emergency red flag', () => {
    const res = reportSymptomOp(makeState(), { ...base, redFlags: ['Chest pain, pressure or tightness'] }, env())
    if (isError(res)) throw new Error(res.error)
    expect(res.report.triage.level).toBe('emergency')
    expect(res.state.medical.restrictions.some((r) => r.effect.pauseAllTraining && r.status === 'active')).toBe(true)
    expect(res.state.workouts.filter((w) => w.status === 'planned' && w.date >= TODAY && w.sport !== 'rehab')).toHaveLength(0)
    expect(res.state.notifications[0].severity).toBe('critical')
  })

  it('monitors a mild symptom without restricting training', () => {
    const res = reportSymptomOp(makeState(), { ...base, severity: 1, duringTraining: false }, env())
    if (isError(res)) throw new Error(res.error)
    expect(res.report.triage.level).toBe('monitor')
    expect(res.state.medical.restrictions).toHaveLength(0)
  })

  it('does not add a second pause for repeated reports', () => {
    const first = reportSymptomOp(makeState(), { ...base, redFlags: ['Fainting or near-fainting'] }, env())
    if (isError(first)) throw new Error(first.error)
    const second = reportSymptomOp(first.state, { ...base, redFlags: ['Fainting or near-fainting'] }, env())
    if (isError(second)) throw new Error(second.error)
    expect(second.state.medical.restrictions.filter((r) => r.effect.pauseAllTraining)).toHaveLength(1)
  })
})

describe('readiness and progression operations', () => {
  it('will not accept progression without a fresh recommendation', () => {
    expect(isError(acceptProgressionOp(makeState(), env()))).toBe(true)
  })

  it('records an assessment without changing the plan', () => {
    const s = makeState()
    const res = runReadinessOp(s, env())
    if (isError(res)) throw new Error(res.error)
    expect(res.state.assessments).toHaveLength(1)
    expect(res.state.plan).toBe(s.plan)
  })

  it('blocks progression while a restriction is active, even if an earlier assessment recommended it', () => {
    const s = makeState()
    const forged: AppState = {
      ...s,
      medical: { ...s.medical, restrictions: [{ id: 'r', createdAt: '', updatedAt: '', title: 'Hold', description: '', source: 'clinician', clinicianName: 'Dr', severity: 'modify', effect: { blockedSports: [] }, status: 'active' }] },
      assessments: [{ id: 'a', createdAt: '', updatedAt: '', stage: 'A', nextStage: 'B', outcome: 'progress', score: 99, confidence: 'high', factors: [], gates: [], overrides: [], reasons: [], nextSteps: [], asOf: TODAY }],
    }
    const res = acceptProgressionOp(forged, env())
    expect(isError(res)).toBe(true)
  })
})

describe('events and data erasure', () => {
  it('keeps exactly one primary (A) race and logs the plan change', () => {
    let s = makeState()
    const input = (name: string, date: string, priority: 'A' | 'B') => ({ name, date, location: 'Lake', category: 'sprint' as const, swimM: 750, bikeKm: 20, runKm: 5, priority })
    s = ok(saveEventOp(s, input('First A', '2026-07-12', 'A'), env()))
    s = ok(saveEventOp(s, input('Second A', '2026-08-23', 'A'), env()))
    expect(s.events.filter((e) => e.priority === 'A')).toHaveLength(1)
    expect(s.events.find((e) => e.name === 'First A')?.priority).toBe('B')
    expect(s.plan?.primaryEventId).toBe(s.events.find((e) => e.name === 'Second A')?.id)
    expect(s.changes.some((c) => c.kind === 'plan-regenerated')).toBe(true)
    expect(s.events[0].checklist.length).toBeGreaterThan(0)
  })

  it('erase-all returns a clean, un-onboarded state', () => {
    const s = eraseAllDataOp(env())
    expect(s.onboarded).toBe(false)
    expect(s.athlete).toBeNull()
    expect(s.workouts).toHaveLength(0)
    expect(s.medical.restrictions).toHaveLength(0)
  })
})

describe('older-athlete caution', () => {
  it('uses more frequent recovery weeks for cautious profiles', () => {
    const normal = makeState({ athlete: makeAthlete({ ageRange: '25-34' }, { consistency: 'regular' }) })
    const cautious = makeState({ athlete: makeAthlete({ ageRange: '65+' }, { consistency: 'regular' }) })
    const count = (s: AppState) => s.plan!.weeks.filter((w) => w.isRecoveryWeek).length / s.plan!.weeks.length
    expect(count(cautious)).toBeGreaterThanOrEqual(count(normal))
  })
})
