import type { AppState } from '../models/state'
import type { Sport, StageId } from '../models/common'
import type { RecoveryCheckIn } from '../models/health'
import type { Workout, WorkoutResult } from '../models/training'
import { addDaysISO, formatDate, mondayOf, type ISODate } from '@/lib/dates'
import { avg, round5, sum } from '@/lib/utils'

export type CoreSport = 'swim' | 'bike' | 'run' | 'strength' | 'recovery'

/** Brick counts toward bike and run for distribution; mobility/rehab roll into recovery for the weekly view. */
export function coreSportOf(sport: Sport): CoreSport {
  switch (sport) {
    case 'swim':
      return 'swim'
    case 'bike':
    case 'brick':
      return 'bike'
    case 'run':
      return 'run'
    case 'strength':
      return 'strength'
    default:
      return 'recovery'
  }
}

export const CORE_SPORTS: CoreSport[] = ['swim', 'bike', 'run', 'strength', 'recovery']

export function resultFor(state: Pick<AppState, 'results'>, workoutId: string): WorkoutResult | undefined {
  return state.results.find((r) => r.workoutId === workoutId)
}

export function workoutsOnDate(workouts: Workout[], date: ISODate): Workout[] {
  return workouts.filter((w) => w.date === date).sort((a, b) => (a.sport === 'rehab' ? 1 : 0) - (b.sport === 'rehab' ? 1 : 0))
}

export function weekWorkouts(workouts: Workout[], weekStart: ISODate): Workout[] {
  return workouts.filter((w) => w.weekStart === weekStart)
}

export interface SportCount {
  sport: CoreSport
  planned: number
  completed: number
}

export function weeklySportCounts(workouts: Workout[], weekStart: ISODate): SportCount[] {
  const ws = weekWorkouts(workouts, weekStart).filter((w) => w.status !== 'skipped')
  return CORE_SPORTS.map((sport) => {
    const list = ws.filter((w) => coreSportOf(w.sport) === sport)
    return { sport, planned: list.length, completed: list.filter((w) => w.status === 'completed').length }
  })
}

export interface WeekStats {
  weekStart: ISODate
  label: string
  plannedMin: number
  completedMin: number
  plannedSessions: number
  completedSessions: number
  skippedSessions: number
  completionRate: number | null
  minutesBySport: Record<'swim' | 'bike' | 'run', number>
}

export function weekStats(state: Pick<AppState, 'workouts' | 'results'>, weekStart: ISODate, today: ISODate): WeekStats {
  const ws = weekWorkouts(state.workouts, weekStart).filter((w) => w.sport !== 'rehab')
  const resultMap = new Map(state.results.map((r) => [r.workoutId, r]))
  const planned = ws.filter((w) => w.status !== 'skipped')
  const completed = ws.filter((w) => w.status === 'completed')
  const due = planned.filter((w) => w.date <= today || w.status === 'completed')
  const minutesBySport = { swim: 0, bike: 0, run: 0 }
  let completedMin = 0
  for (const w of completed) {
    const r = resultMap.get(w.id)
    const m = r?.actualDurationMin ?? w.durationMin
    completedMin += m
    if (w.sport === 'swim') minutesBySport.swim += m
    else if (w.sport === 'bike') minutesBySport.bike += m
    else if (w.sport === 'run') minutesBySport.run += m
    else if (w.sport === 'brick') {
      minutesBySport.bike += Math.round(m * 0.7)
      minutesBySport.run += Math.round(m * 0.3)
    }
  }
  return {
    weekStart,
    label: formatDate(weekStart, 'd MMM'),
    plannedMin: sum(planned.map((w) => w.durationMin)),
    completedMin,
    plannedSessions: planned.length,
    completedSessions: completed.length,
    skippedSessions: ws.filter((w) => w.status === 'skipped').length,
    completionRate: due.length ? completed.length / due.length : null,
    minutesBySport,
  }
}

export function recentWeekStats(state: Pick<AppState, 'workouts' | 'results'>, today: ISODate, weeks: number, includeCurrent = true): WeekStats[] {
  const cur = mondayOf(today)
  const out: WeekStats[] = []
  const first = includeCurrent ? weeks - 1 : weeks
  for (let i = first; i >= (includeCurrent ? 0 : 1); i--) out.push(weekStats(state, addDaysISO(cur, -7 * i), today))
  return out
}

export function consistencyTrend(stats: WeekStats[]): { label: string; rate: number | null }[] {
  return stats.map((s) => ({ label: s.label, rate: s.completionRate === null ? null : Math.round(s.completionRate * 100) }))
}

export interface LongSessionPoint {
  label: string
  bike: number | null
  run: number | null
  swim: number | null
}

/** Longest completed session per sport per week (minutes; swim in minutes too for a common axis). */
export function longSessionProgression(state: Pick<AppState, 'workouts' | 'results'>, today: ISODate, weeks: number): LongSessionPoint[] {
  const resultMap = new Map(state.results.map((r) => [r.workoutId, r]))
  return recentWeekStats(state, today, weeks).map((s) => {
    const completed = weekWorkouts(state.workouts, s.weekStart).filter((w) => w.status === 'completed')
    const longest = (sport: Sport) => {
      const mins = completed.filter((w) => w.sport === sport || (w.sport === 'brick' && sport !== 'swim')).map((w) => {
        const m = resultMap.get(w.id)?.actualDurationMin ?? w.durationMin
        return w.sport === 'brick' ? Math.round(m * (sport === 'bike' ? 0.7 : 0.3)) : m
      })
      return mins.length ? Math.max(...mins) : null
    }
    return { label: s.label, bike: longest('bike'), run: longest('run'), swim: longest('swim') }
  })
}

export function recoveryTrend(checkIns: RecoveryCheckIn[], today: ISODate, days: number) {
  const from = addDaysISO(today, -(days - 1))
  return checkIns
    .filter((c) => c.date >= from && c.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((c) => ({
      date: c.date,
      label: formatDate(c.date, 'd MMM'),
      readiness: c.readiness,
      fatigue: c.fatigue,
      soreness: c.soreness,
      mood: c.mood,
      sleepHours: c.sleepHours,
      sleepQuality: c.sleepQuality,
      restingHr: c.restingHr ?? null,
    }))
}

export interface TrendExplanation {
  headline: string
  points: string[]
}

/** Plain-language explanation. Deliberately avoids any diagnostic claim. */
export function explainRecovery(checkIns: RecoveryCheckIn[], today: ISODate): TrendExplanation {
  const last7 = checkIns.filter((c) => c.date > addDaysISO(today, -7) && c.date <= today)
  const prev7 = checkIns.filter((c) => c.date > addDaysISO(today, -14) && c.date <= addDaysISO(today, -7))
  if (last7.length < 3) return { headline: 'Not enough check-ins yet', points: ['Log at least 3 check-ins in a week to see trends.'] }
  const points: string[] = []
  const f = avg(last7.map((c) => c.fatigue)) as number
  const sl = avg(last7.map((c) => c.sleepHours)) as number
  const rd = avg(last7.map((c) => c.readiness)) as number
  points.push(`Average sleep ${sl.toFixed(1)} h, fatigue ${f.toFixed(1)}/5, readiness ${rd.toFixed(1)}/5 over ${last7.length} check-ins.`)
  if (prev7.length >= 3) {
    const pf = avg(prev7.map((c) => c.fatigue)) as number
    const delta = f - pf
    if (delta >= 0.5) points.push(`Fatigue is higher than the week before (${pf.toFixed(1)} → ${f.toFixed(1)}). This often follows a heavier training block — consider easier sessions and more sleep.`)
    else if (delta <= -0.5) points.push(`Fatigue has eased compared with the week before (${pf.toFixed(1)} → ${f.toFixed(1)}).`)
    else points.push('Fatigue is similar to the week before.')
  }
  if (sl < 6.5) points.push('Sleep has been short. Sleep is one of the most useful recovery levers you control.')
  points.push('These are self-reported trends. They are not a diagnosis, and wearable numbers cannot diagnose overtraining or any condition.')
  const headline = f >= 4 ? 'Fatigue is running high' : rd >= 4 ? 'Feeling ready' : 'Recovery looks steady'
  return { headline, points }
}

export function stageProgress(state: Pick<AppState, 'plan' | 'workouts'>, today: ISODate) {
  const plan = state.plan
  if (!plan) return null
  const stageWeeks = plan.weeks.filter((w) => w.stage === plan.currentStage)
  const elapsed = stageWeeks.filter((w) => addDaysISO(w.weekStart, 6) < today).length
  const total = stageWeeks.length
  const keyDue = state.workouts.filter((w) => w.stage === plan.currentStage && w.isKey && w.date < today)
  const keyDone = keyDue.filter((w) => w.status === 'completed')
  return {
    elapsedWeeks: elapsed,
    totalWeeks: total,
    pct: total ? Math.min(100, Math.round((elapsed / total) * 100)) : 0,
    keyDue: keyDue.length,
    keyDone: keyDone.length,
  }
}

export interface Milestone {
  id: string
  stage: StageId
  label: string
  detail: string
  done: boolean
  /** The condition that decides this milestone. */
  condition: string
}

/** Milestones are derived from the plan's prerequisites and the athlete's observed capacity. */
export function milestonesFor(state: AppState): Milestone[] {
  const plan = state.plan
  const athlete = state.athlete
  if (!plan || !athlete) return []
  const byId = new Map(state.workouts.map((w) => [w.id, w]))
  let swim = athlete.baseline.comfortableSwimM
  let bike = athlete.baseline.comfortableBikeMin
  let run = athlete.baseline.comfortableRunMin
  for (const r of state.results) {
    const w = byId.get(r.workoutId)
    if (!w || r.rpe > 7) continue
    if (w.sport === 'swim' && r.actualDistanceM) swim = Math.max(swim, r.actualDistanceM)
    if (w.sport === 'bike') bike = Math.max(bike, r.actualDurationMin)
    if (w.sport === 'run') run = Math.max(run, r.actualDurationMin)
  }
  return plan.prerequisites
    .filter((p) => p.gating)
    .map((p) => {
      let done = p.met
      let current = p.current
      if (p.id.endsWith('-swim')) {
        const req = parseInt(p.required, 10)
        done = swim >= req
        current = `${swim} m`
      } else if (p.id.endsWith('-bike')) {
        const req = parseInt(p.required, 10)
        done = bike >= req
        current = `${bike} min`
      } else if (p.id.endsWith('-run')) {
        const req = parseInt(p.required, 10)
        done = run >= req
        current = `${run} min`
      }
      return { id: p.id, stage: p.stage, label: p.label, detail: `Now: ${current} · Needed: ${p.required}`, done, condition: p.required }
    })
}

export function nextMilestone(state: AppState): Milestone | null {
  const plan = state.plan
  if (!plan) return null
  const all = milestonesFor(state)
  const nextStageId = (['A', 'B', 'C', 'D'] as StageId[])[(['A', 'B', 'C', 'D'] as StageId[]).indexOf(plan.currentStage) + 1]
  return all.find((m) => !m.done && m.stage === nextStageId) ?? all.find((m) => !m.done) ?? null
}

/** The next date the athlete has a planned, non-skipped session today or later. */
export function nextWorkout(workouts: Workout[], today: ISODate): Workout | undefined {
  return workouts.filter((w) => w.status === 'planned' && w.date >= today && w.sport !== 'rehab').sort((a, b) => (a.date < b.date ? -1 : 1))[0]
}

export function missedWorkouts(workouts: Workout[], today: ISODate, days = 7): Workout[] {
  const from = addDaysISO(today, -days)
  return workouts.filter((w) => w.status === 'planned' && w.date < today && w.date >= from && w.sport !== 'rehab')
}

export function totalCompletedMinutes(state: Pick<AppState, 'results'>): number {
  return round5(sum(state.results.map((r) => r.actualDurationMin)))
}
