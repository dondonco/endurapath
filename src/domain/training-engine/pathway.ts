import type { AthleteAvailability, AthleteProfile } from '../models/athlete'
import type { StageId } from '../models/common'
import type { PathwayStage, Prerequisite } from '../models/training'
import { CONSISTENCY_RANK, DEFAULT_ENGINE_CONFIG, GOAL_TO_STAGE, STAGE_ORDER, stageRank, type EngineConfig } from './config'
import { clamp, sum } from '@/lib/utils'

/** Approximate swim pace used only to convert self-reported metres into minutes of volume. */
const SWIM_M_PER_MIN = 30

export function baselineWeeklyMinutes(b: AthleteProfile['baseline']): number {
  return Math.round(b.bikeMinutesPerWeek + b.runMinutesPerWeek + b.swimMetersPerWeek / SWIM_M_PER_MIN)
}

export function prerequisitesForStage(
  stage: StageId,
  athlete: AthleteProfile,
  availability: Pick<AthleteAvailability, 'maxHoursPerWeek'>,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
): Prerequisite[] {
  const req = config.entry[stage]
  const b = athlete.baseline
  const weekly = baselineWeeklyMinutes(b)
  const raceCats = b.recentRaces.map((r) => r.category)
  const list: Prerequisite[] = [
    {
      id: `${stage}-swim`,
      stage,
      label: 'Comfortable continuous swim',
      met: b.comfortableSwimM >= req.comfortableSwimM,
      current: `${b.comfortableSwimM} m`,
      required: `${req.comfortableSwimM} m`,
      gating: true,
    },
    {
      id: `${stage}-bike`,
      stage,
      label: 'Comfortable ride length',
      met: b.comfortableBikeMin >= req.comfortableBikeMin,
      current: `${b.comfortableBikeMin} min`,
      required: `${req.comfortableBikeMin} min`,
      gating: true,
    },
    {
      id: `${stage}-run`,
      stage,
      label: 'Comfortable continuous run',
      met: b.comfortableRunMin >= req.comfortableRunMin,
      current: `${b.comfortableRunMin} min`,
      required: `${req.comfortableRunMin} min`,
      gating: true,
    },
    {
      id: `${stage}-volume`,
      stage,
      label: 'Current weekly training',
      met: weekly >= req.weeklyMinutes,
      current: `${weekly} min/week`,
      required: `${req.weeklyMinutes} min/week`,
      gating: true,
    },
    {
      id: `${stage}-consistency`,
      stage,
      label: 'Recent consistency',
      met: CONSISTENCY_RANK[b.consistency] >= CONSISTENCY_RANK[req.consistency],
      current: b.consistency.replace('-', ' '),
      required: req.consistency.replace('-', ' '),
      gating: true,
    },
    {
      id: `${stage}-time`,
      stage,
      label: 'Practical weekly time available',
      met: availability.maxHoursPerWeek >= req.hoursAvailable,
      current: `${availability.maxHoursPerWeek} h/week`,
      required: `${req.hoursAvailable}+ h/week`,
      gating: false,
    },
  ]
  if (req.recommendedRaces.length) {
    list.push({
      id: `${stage}-races`,
      stage,
      label: 'Prior race experience (recommended)',
      met: req.recommendedRaces.some((r) => raceCats.includes(r)),
      current: raceCats.length ? raceCats.join(', ') : 'none recorded',
      required: `one of: ${req.recommendedRaces.join(', ')}`,
      gating: false,
    })
  }
  return list
}

export function determineStartStage(
  athlete: AthleteProfile,
  availability: Pick<AthleteAvailability, 'maxHoursPerWeek'>,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
): StageId {
  const goalStage = GOAL_TO_STAGE[athlete.goal.type]
  let start: StageId = 'A'
  for (const s of STAGE_ORDER.slice(1)) {
    if (stageRank(s) > stageRank(goalStage)) break
    const gating = prerequisitesForStage(s, athlete, availability, config).filter((p) => p.gating)
    if (gating.every((p) => p.met)) start = s
    else break
  }
  return start
}

/** Estimated range for a stage given how the baseline compares with that stage's typical starting load. */
export function estimateStageWeeks(
  stage: StageId,
  athlete: AthleteProfile,
  isStartStage: boolean,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
): { min: number; max: number } {
  const s = config.stages[stage]
  if (!isStartStage) return { min: s.minWeeks, max: s.maxWeeks }
  const weekly = baselineWeeklyMinutes(athlete.baseline)
  const ratio = clamp(weekly / s.startMinutes, 0.3, 1.3)
  const consistencyPenalty = CONSISTENCY_RANK[athlete.baseline.consistency] <= 1 ? 1.25 : 1
  const min = Math.round(s.minWeeks * (ratio >= 1 ? 0.9 : 1) * consistencyPenalty)
  const max = Math.round(s.maxWeeks * (1 + (1 - Math.min(ratio, 1)) * 0.5) * consistencyPenalty)
  return { min, max: Math.max(max, min) }
}

export interface PathwayResult {
  startStage: StageId
  goalStage: StageId
  pathway: PathwayStage[]
  prerequisites: Prerequisite[]
  total: { min: number; max: number }
  warnings: string[]
}

export function buildPathway(
  athlete: AthleteProfile,
  availability: Pick<AthleteAvailability, 'maxHoursPerWeek'>,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  startOverride?: StageId,
): PathwayResult {
  const goalStage = GOAL_TO_STAGE[athlete.goal.type]
  const baselineStart = determineStartStage(athlete, availability, config)
  const startStage = startOverride ?? baselineStart
  const warnings: string[] = []

  const pathway: PathwayStage[] = STAGE_ORDER.map((id) => {
    const s = config.stages[id]
    const rank = stageRank(id)
    const est = estimateStageWeeks(id, athlete, id === startStage, config)
    let status: PathwayStage['status']
    let reason: string
    if (rank < stageRank(startStage)) {
      status = startOverride ? 'completed' : 'not-needed'
      reason = startOverride
        ? 'Completed — you have progressed beyond this stage.'
        : 'Your reported baseline already meets the entry requirements for a later stage.'
    } else if (id === startStage) {
      status = 'current'
      reason =
        id === goalStage
          ? 'This stage matches your selected goal.'
          : baselineStart === id && stageRank(goalStage) > rank
            ? 'Your starting point based on your reported baseline.'
            : 'Prerequisites for the next stage are not yet met, so you begin here.'
    } else if (rank <= stageRank(goalStage)) {
      status = 'upcoming'
      reason = rank === stageRank(goalStage) ? 'Your selected goal stage.' : 'A prerequisite stage on the way to your goal.'
    } else {
      status = 'beyond-goal'
      reason = 'Beyond your current goal. Available later if you choose to continue.'
    }
    return {
      stage: id,
      label: s.label,
      minWeeks: s.minWeeks,
      maxWeeks: s.maxWeeks,
      estimatedMinWeeks: est.min,
      estimatedMaxWeeks: est.max,
      status,
      reason,
    }
  })

  const route = pathway.filter((p) => p.status === 'current' || p.status === 'upcoming')
  const total = {
    min: sum(route.map((p) => p.estimatedMinWeeks)),
    max: sum(route.map((p) => p.estimatedMaxWeeks)),
  }

  const prerequisites: Prerequisite[] = []
  for (const s of STAGE_ORDER) {
    if (stageRank(s) === 0) continue
    if (stageRank(s) <= stageRank(goalStage) || stageRank(s) === stageRank(startStage) + 1)
      prerequisites.push(...prerequisitesForStage(s, athlete, availability, config))
  }

  if (stageRank(goalStage) > stageRank(startStage))
    warnings.push(
      `Your goal is a later stage than your current baseline supports. EnduraPath starts you in ${config.stages[startStage].shortLabel} and builds toward your goal as prerequisites are met — progression is earned, not scheduled.`,
    )
  const goalReq = config.entry[goalStage]
  if (availability.maxHoursPerWeek < goalReq.hoursAvailable)
    warnings.push(
      `${athlete.goal.type === 'ironman' || athlete.goal.type === 'half-ironman' ? 'Long-distance' : 'Your'} goal typically calls for around ${goalReq.hoursAvailable}+ h/week; you listed ${availability.maxHoursPerWeek} h. Expect a longer preparation or a more conservative race goal.`,
    )
  if (athlete.baseline.hasClinicianRestrictions)
    warnings.push('You reported clinician-provided restrictions. These always take precedence over performance goals in your plan.')
  if (athlete.swimConfidence === 'learning' && stageRank(goalStage) >= 1)
    warnings.push('Swim confidence is the most common limiter for new triathletes. Consider coached swim lessons alongside this plan.')

  return { startStage, goalStage, pathway, prerequisites, total, warnings }
}
