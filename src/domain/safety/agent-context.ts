import type { PersonaId } from '@/domain/models/common'
import type { AppState } from '@/domain/models/state'
import { activeRestrictions } from '@/domain/safety/restrictions'
import { weekStats, nextWorkout } from '@/domain/analytics/selectors'
import { mondayOf, type ISODate } from '@/lib/dates'

/**
 * Permission-controlled slice of athlete data that a persona may read.
 * Each persona only receives the fields its role needs (data minimisation), and the medical subtree is
 * exposed ONLY to the two clinical personas. This is the single choke point for agent data access.
 */
export type ContextScope =
  | 'goals'
  | 'phase'
  | 'race'
  | 'workouts'
  | 'recovery'
  | 'nutrition'
  | 'restrictions'
  | 'symptoms'
  | 'rehab'
  | 'planChanges'

export const PERSONA_SCOPES: Record<PersonaId, ContextScope[]> = {
  atlas: ['goals', 'phase', 'race', 'workouts', 'recovery', 'restrictions', 'planChanges', 'nutrition'],
  fuelwise: ['goals', 'phase', 'race', 'workouts', 'nutrition', 'recovery', 'restrictions'],
  meridian: ['goals', 'phase', 'race', 'workouts', 'recovery', 'restrictions', 'symptoms', 'rehab', 'planChanges'],
  motionlab: ['goals', 'phase', 'workouts', 'restrictions', 'rehab', 'symptoms', 'planChanges'],
}

export const SCOPE_LABELS: Record<ContextScope, string> = {
  goals: 'Athlete goals',
  phase: 'Current training phase',
  race: 'Upcoming race',
  workouts: 'Planned & completed workouts',
  recovery: 'Recovery logs',
  nutrition: 'Nutrition preferences',
  restrictions: 'Approved restrictions',
  symptoms: 'Symptom reports',
  rehab: 'Rehabilitation plan',
  planChanges: 'Recent plan changes',
}

export interface AthleteContext {
  scopes: ContextScope[]
  asOf: ISODate
  goals?: { name: string; goal: string; intent: string; stage: string; units: string }
  phase?: { stage: string; phase: string | null; week: number | null; recoveryWeek: boolean }
  race?: { name: string; date: string; category: string; daysToGo: number } | null
  workouts?: {
    today: { title: string; sport: string; durationMin: number; intensity: string; status: string } | null
    next: { title: string; date: string } | null
    thisWeek: { plannedSessions: number; completedSessions: number; plannedMin: number; completedMin: number }
    missedRecently: number
  }
  recovery?: { avgFatigue: number | null; avgSleep: number | null; avgReadiness: number | null; checkIns7d: number; todayLogged: boolean }
  nutrition?: {
    dietary: string[]
    allergies: string[]
    targets: { carbsPerHour: string; fluid: string; source: string; setBy?: string }
    recentToleranceAvg: number | null
    logs42d: number
  }
  restrictions?: { title: string; effect: string; source: string; clinician?: string }[]
  symptoms?: { area: string; level: string; severity: number; trend: string; reviewed: boolean }[]
  rehab?: { title: string; approvedBy: string; sample: boolean; exercises: number; nextReview: string; sessions7d: number } | null
  planChanges?: { summary: string; reason: string; at: string }[]
}

const avgOf = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

export function buildAthleteContext(state: AppState, persona: PersonaId, today: ISODate): AthleteContext | null {
  if (!state.athlete || !state.plan) return null
  const scopes = PERSONA_SCOPES[persona]
  const has = (s: ContextScope) => scopes.includes(s)
  const a = state.athlete
  const plan = state.plan
  const ctx: AthleteContext = { scopes, asOf: today }
  const monday = mondayOf(today)

  if (has('goals')) ctx.goals = { name: a.displayName, goal: a.goal.type, intent: a.goal.intent, stage: plan.currentStage, units: a.units }
  if (has('phase')) {
    const wk = plan.weeks.find((w) => w.weekStart === monday)
    ctx.phase = { stage: plan.currentStage, phase: wk?.phaseType ?? null, week: wk?.weekInStage ?? null, recoveryWeek: wk?.isRecoveryWeek ?? false }
  }
  if (has('race')) {
    const e = state.events.filter((x) => x.status === 'planned' && x.date >= today).sort((x, y) => (x.date < y.date ? -1 : 1))[0]
    ctx.race = e ? { name: e.name, date: e.date, category: e.category, daysToGo: Math.round((new Date(e.date).getTime() - new Date(today).getTime()) / 86400000) } : null
  }
  if (has('workouts')) {
    const t = state.workouts.find((w) => w.date === today && w.sport !== 'rehab')
    const n = nextWorkout(state.workouts, today)
    const ws = weekStats(state, monday, today)
    ctx.workouts = {
      today: t ? { title: t.title, sport: t.sport, durationMin: t.durationMin, intensity: t.intensity, status: t.status } : null,
      next: n ? { title: n.title, date: n.date } : null,
      thisWeek: { plannedSessions: ws.plannedSessions, completedSessions: ws.completedSessions, plannedMin: ws.plannedMin, completedMin: ws.completedMin },
      missedRecently: state.workouts.filter((w) => w.status === 'planned' && w.date < today && w.date >= mondayOf(today) && w.sport !== 'rehab').length,
    }
  }
  if (has('recovery')) {
    const last7 = state.checkIns.filter((c) => c.date <= today && new Date(c.date).getTime() > new Date(today).getTime() - 7 * 86400000)
    ctx.recovery = {
      avgFatigue: avgOf(last7.map((c) => c.fatigue)),
      avgSleep: avgOf(last7.map((c) => c.sleepHours)),
      avgReadiness: avgOf(last7.map((c) => c.readiness)),
      checkIns7d: last7.length,
      todayLogged: state.checkIns.some((c) => c.date === today),
    }
  }
  if (has('nutrition') && state.nutrition) {
    const t = state.nutrition.targets
    ctx.nutrition = {
      dietary: a.preferences.dietary,
      allergies: a.preferences.allergies,
      targets: { carbsPerHour: `${t.carbsPerHour.min}–${t.carbsPerHour.max} g/h`, fluid: `${t.fluidMlPerHour.min}–${t.fluidMlPerHour.max} ml/h (reference)`, source: t.source, setBy: t.setBy },
      recentToleranceAvg: avgOf(state.fuelingLogs.slice(0, 8).map((l) => l.tolerance)),
      logs42d: state.fuelingLogs.length,
    }
  }
  if (has('restrictions'))
    ctx.restrictions = activeRestrictions(state.medical.restrictions).map((r) => ({
      title: r.title,
      effect: r.effect.pauseAllTraining ? 'All training paused' : [r.effect.blockedSports.length ? `no ${r.effect.blockedSports.join('/')}` : '', r.effect.maxIntensity ? `max ${r.effect.maxIntensity}` : '', r.effect.maxDurationMin ? `≤ ${r.effect.maxDurationMin} min` : ''].filter(Boolean).join(', ') || 'monitor',
      source: r.source,
      clinician: r.clinicianName,
    }))
  if (has('symptoms'))
    ctx.symptoms = state.medical.symptoms.slice(0, 3).map((s) => ({ area: s.bodyArea, level: s.triage.level, severity: s.severity, trend: s.trend, reviewed: s.clinicianReviewed }))
  if (has('rehab')) {
    const p = state.medical.rehabPlans.find((x) => x.status === 'active')
    ctx.rehab = p
      ? { title: p.title, approvedBy: p.approvedBy, sample: p.isSample, exercises: p.exercises.length, nextReview: p.reviewDate, sessions7d: state.medical.rehabLogs.filter((l) => new Date(l.date).getTime() > new Date(today).getTime() - 7 * 86400000).length }
      : null
  }
  if (has('planChanges')) ctx.planChanges = state.changes.slice(0, 4).map((c) => ({ summary: c.summary, reason: c.reason, at: c.at }))
  return ctx
}
