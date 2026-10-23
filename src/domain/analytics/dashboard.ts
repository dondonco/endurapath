import type { AppState } from '../models/state'
import type { PersonaId } from '../models/common'
import { activeRestrictions, describeEffect, hasTrainingPause } from '../safety/restrictions'
import { missedWorkouts, nextWorkout, weekStats } from './selectors'
import { addDaysISO, daysBetween, formatDate, mondayOf, type ISODate } from '@/lib/dates'

export interface DashboardAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  body: string
  link?: { to: string; label: string }
}

/** Derived entirely from stored state — nothing here is decorative. */
export function buildAlerts(state: AppState, today: ISODate): DashboardAlert[] {
  const out: DashboardAlert[] = []
  const active = activeRestrictions(state.medical.restrictions)

  if (hasTrainingPause(state.medical.restrictions))
    out.push({ id: 'pause', severity: 'critical', title: 'Training is paused', body: 'An active restriction pauses all training except approved rehabilitation. It stays in place until you record that a clinician has reviewed it.', link: { to: '/rehab', label: 'Review restrictions' } })
  for (const r of active.filter((x) => !x.effect.pauseAllTraining))
    out.push({ id: `res-${r.id}`, severity: 'warning', title: `Restriction: ${r.title}`, body: `${describeEffect(r.effect)}${r.source === 'clinician' && r.clinicianName ? ` · set by ${r.clinicianName}` : ' · athlete-reported'}. This takes precedence over performance goals.`, link: { to: '/rehab', label: 'Open rehab' } })

  const urgent = state.medical.symptoms.filter((s) => !s.clinicianReviewed && (s.triage.level === 'urgent' || s.triage.level === 'emergency'))
  if (urgent.length)
    out.push({ id: 'symptom-unreviewed', severity: 'critical', title: 'Symptom report awaiting professional review', body: `${urgent.length} report${urgent.length > 1 ? 's' : ''} triaged as ${urgent[0]?.triage.level}. Seek assessment from a qualified clinician.`, link: { to: '/rehab', label: 'Open symptom reports' } })

  const missed = missedWorkouts(state.workouts, today, 5)
  if (missed.length)
    out.push({ id: 'missed', severity: 'warning', title: `${missed.length} session${missed.length > 1 ? 's' : ''} not logged`, body: `${missed.map((m) => m.title).slice(0, 2).join(', ')}${missed.length > 2 ? '…' : ''}. Log, skip or request an adjustment — missed work is never stacked on later days.`, link: { to: `/training/${missed[0]?.id}`, label: 'Handle now' } })

  if (!state.checkIns.some((c) => c.date === today))
    out.push({ id: 'checkin', severity: 'info', title: 'Today’s recovery check-in is incomplete', body: 'A 30-second check-in keeps your readiness review accurate.', link: { to: '/recovery', label: 'Check in' } })

  const race = state.events.filter((e) => e.status === 'planned' && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  if (race) {
    const d = daysBetween(today, race.date)
    if (d <= 42)
      out.push({ id: `race-${race.id}`, severity: d <= 14 ? 'warning' : 'info', title: `${race.name} in ${d} day${d === 1 ? '' : 's'}`, body: `${race.priority}-priority race on ${formatDate(race.date)}. ${race.checklist.filter((c) => !c.done).length} checklist items still open.`, link: { to: '/events', label: 'Race preparation' } })
  }

  const recentChanges = state.changes.filter((c) => c.kind !== 'plan-created' && c.at.slice(0, 10) >= addDaysISO(today, -3))
  if (recentChanges.length)
    out.push({ id: 'changes', severity: 'info', title: `${recentChanges.length} recent schedule change${recentChanges.length > 1 ? 's' : ''}`, body: recentChanges[0]?.summary ?? '', link: { to: '/training', label: 'View change history' } })

  return out
}

export interface TeamUpdate {
  persona: PersonaId
  text: string
  link?: { to: string; label: string }
}

/** One data-derived note per persona, each within that persona's remit. Rendered with a "simulated" label. */
export function buildTeamUpdates(state: AppState, today: ISODate): TeamUpdate[] {
  const out: TeamUpdate[] = []
  const plan = state.plan
  const monday = mondayOf(today)

  // Coach Atlas
  if (plan) {
    const wk = plan.weeks.find((w) => w.weekStart === monday)
    const ws = weekStats(state, monday, today)
    const base = `Stage ${plan.currentStage}, week ${wk?.weekInStage ?? '–'}${wk?.isRecoveryWeek ? ' (recovery week — keep it easy)' : ''}: ${ws.completedSessions} of ${ws.plannedSessions} sessions done so far.`
    const missed = missedWorkouts(state.workouts, today, 5).length
    out.push({ persona: 'atlas', text: missed ? `${base} ${missed} session${missed > 1 ? 's were' : ' was'} missed — I won’t stack them; let’s look at an adjustment.` : `${base} Consistency beats catching up.`, link: { to: '/training', label: 'Open calendar' } })
  }

  // FuelWise
  const nextFueled = state.workouts.filter((w) => w.status === 'planned' && w.date >= today && w.fueling && (w.fueling.level === 'structured' || w.fueling.level === 'practice')).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  out.push(
    nextFueled
      ? { persona: 'fuelwise', text: `${nextFueled.title} on ${formatDate(nextFueled.date)} is a fueling-practice session. ${nextFueled.fueling?.summary}`, link: { to: '/nutrition', label: 'Fueling plan' } }
      : { persona: 'fuelwise', text: 'No long fueling-practice sessions are coming up. Regular meals and drinking to thirst are enough for now.', link: { to: '/nutrition', label: 'Open nutrition' } },
  )

  // Dr. Meridian
  const active = activeRestrictions(state.medical.restrictions)
  const unreviewed = state.medical.symptoms.filter((s) => !s.clinicianReviewed && s.triage.level !== 'monitor')
  out.push(
    active.length || unreviewed.length
      ? { persona: 'meridian', text: `${active.length} active restriction${active.length === 1 ? '' : 's'} and ${unreviewed.length} symptom report${unreviewed.length === 1 ? '' : 's'} awaiting professional review. I can’t diagnose or clear you — your clinician decides.`, link: { to: '/rehab', label: 'Review' } }
      : { persona: 'meridian', text: 'No active restrictions or open symptom reports. Report new pain or symptoms early — don’t train through them.', link: { to: '/rehab', label: 'Symptom report' } },
  )

  // MotionLab
  const rehab = state.medical.rehabPlans.find((p) => p.status === 'active')
  if (rehab) {
    const from = addDaysISO(today, -7)
    const done = state.medical.rehabLogs.filter((l) => l.planId === rehab.id && l.date > from).length
    const target = rehab.exercises.reduce((s, e) => s + e.frequencyPerWeek, 0)
    out.push({ persona: 'motionlab', text: `${rehab.title}: ${done} exercise log${done === 1 ? '' : 's'} this week against about ${target} prescribed. Stay within the clinician’s plan.`, link: { to: '/rehab', label: 'Open exercises' } })
  } else {
    out.push({ persona: 'motionlab', text: 'No clinician-approved exercise plan is on file. I can only show plans a clinician has approved.', link: { to: '/rehab', label: 'Open rehab' } })
  }
  return out
}

export function todaysSessions(state: AppState, today: ISODate) {
  const list = state.workouts.filter((w) => w.date === today && w.sport !== 'rehab' && w.status !== 'skipped')
  return { list, next: list.length ? undefined : nextWorkout(state.workouts, today) }
}
