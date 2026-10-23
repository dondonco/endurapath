import type { IntensityLevel, PhaseType, Sport, StageId } from '../models/common'
import type { IntensityTarget } from '../models/training'
import { round5 } from '@/lib/utils'

export type SessionKind =
  | 'swim-technique'
  | 'swim-endurance'
  | 'swim-intervals'
  | 'swim-openwater'
  | 'bike-easy'
  | 'bike-long'
  | 'bike-tempo'
  | 'bike-intervals'
  | 'bike-race-pace'
  | 'run-easy'
  | 'run-walk'
  | 'run-long'
  | 'run-tempo'
  | 'run-intervals'
  | 'brick'
  | 'strength'
  | 'mobility'
  | 'recovery'
  | 'rehab'
  | 'assess-swim'
  | 'assess-bike'
  | 'assess-run'

export interface SessionSpec {
  sport: Sport
  kind: SessionKind
  durationMin: number
  intensity: IntensityLevel
  phase: PhaseType
  stage: StageId
}

/** What we know about pace — estimated from experience unless the athlete supplied real numbers. */
export interface ContentContext {
  swimMPerMin: number
  bikeKmPerHour: number
  runKmPerHour: number
  maxHr?: number
  runThresholdSecPerKm?: number
  bikeFtpWatts?: number
  /** True when the athlete has a pool; otherwise swim copy mentions open water / alternatives. */
  hasPool: boolean
  hasGym: boolean
}

export interface SessionContent {
  title: string
  purpose: string
  warmup: string
  mainSet: string
  cooldown: string
  coachingNotes: string
  target: IntensityTarget
  distanceM?: number
}

const RPE: Record<IntensityLevel, [number, number]> = {
  recovery: [1, 2],
  easy: [2, 3],
  moderate: [5, 6],
  hard: [7, 8],
}

const TALK: Record<IntensityLevel, string> = {
  recovery: 'Very easy — you could chat in full sentences without effort.',
  easy: 'Conversational — full sentences, breathing relaxed (talk test).',
  moderate: 'Steady — short sentences, controlled breathing; comfortably hard.',
  hard: 'Hard but controlled — a few words at a time; you finish knowing you could do a little more.',
}

function range(v: number, lo: number, hi: number): [number, number] {
  return [Math.round(v * lo), Math.round(v * hi)]
}

/** Optional metrics are attached only when the athlete provided the underlying data. */
export function intensityTarget(sport: Sport, intensity: IntensityLevel, ctx: ContentContext): IntensityTarget {
  const t: IntensityTarget = { rpe: RPE[intensity], description: TALK[intensity] }
  const hrPct: Record<IntensityLevel, [number, number]> = {
    recovery: [0.5, 0.6],
    easy: [0.6, 0.72],
    moderate: [0.75, 0.84],
    hard: [0.85, 0.92],
  }
  if (ctx.maxHr && (sport === 'run' || sport === 'bike' || sport === 'brick' || sport === 'swim')) {
    t.heartRateBpm = range(ctx.maxHr, ...hrPct[intensity])
    t.zone = { recovery: 'Z1', easy: 'Z2', moderate: 'Z3', hard: 'Z4' }[intensity]
  }
  if (ctx.runThresholdSecPerKm && (sport === 'run' || sport === 'brick')) {
    const f: Record<IntensityLevel, [number, number]> = {
      recovery: [1.35, 1.5],
      easy: [1.18, 1.32],
      moderate: [1.04, 1.12],
      hard: [0.97, 1.03],
    }
    t.paceSecPerKm = [Math.round(ctx.runThresholdSecPerKm * f[intensity][0]), Math.round(ctx.runThresholdSecPerKm * f[intensity][1])]
  }
  if (ctx.bikeFtpWatts && (sport === 'bike' || sport === 'brick')) {
    const f: Record<IntensityLevel, [number, number]> = {
      recovery: [0.4, 0.55],
      easy: [0.56, 0.75],
      moderate: [0.76, 0.9],
      hard: [0.91, 1.05],
    }
    t.powerWatts = range(ctx.bikeFtpWatts, ...f[intensity])
  }
  return t
}

function swimDistance(durationMin: number, ctx: ContentContext, fraction = 0.8): number {
  return Math.max(100, Math.round((durationMin * fraction * ctx.swimMPerMin) / 25) * 25)
}
function bikeDistance(durationMin: number, ctx: ContentContext, fraction = 0.9): number {
  return Math.round(((durationMin * fraction) / 60) * ctx.bikeKmPerHour * 1000)
}
function runDistance(durationMin: number, ctx: ContentContext, fraction = 0.9): number {
  return Math.round(((durationMin * fraction) / 60) * ctx.runKmPerHour * 1000)
}

const WARM_SWIM = '200–300 m easy mixed strokes, then 4 × 25 m drill / kick with 15 s rest.'
const COOL_SWIM = '100–200 m very easy swim, focus on long strokes and relaxed breathing.'
const WARM_BIKE = '10 min easy spinning, gradually raising cadence; 3 × 20 s higher cadence with 40 s easy.'
const COOL_BIKE = '5–10 min very easy spinning, then gentle stretching of hips, quads and calves.'
const WARM_RUN = '5–10 min brisk walk or very easy jog, then leg swings, skips and 3 × 15 s relaxed strides.'
const COOL_RUN = '5 min easy jog or walk, then light calf and hip stretches.'

function intervalsCount(durationMin: number, fixed: number, blockMin: number, restMin: number): number {
  return Math.max(2, Math.floor((durationMin - fixed) / (blockMin + restMin)))
}

export function buildContent(spec: SessionSpec, ctx: ContentContext): SessionContent {
  const { sport, kind, durationMin: d, intensity, phase } = spec
  const target = intensityTarget(sport, intensity, ctx)
  const beginner = spec.stage === 'A'
  const phaseNote =
    phase === 'taper'
      ? ' This is a taper session: keep it crisp, finish fresh and resist adding extra.'
      : phase === 'recovery'
        ? ' This is a recovery-week session — absorbing training matters more than pushing.'
        : ''

  switch (kind) {
    case 'swim-technique': {
      const dist = swimDistance(d, ctx, 0.65)
      return {
        title: beginner ? 'Swim skills & comfort' : 'Swim technique focus',
        purpose: 'Build smooth, efficient swimming and breathing control. Technique is the biggest lever in the water.',
        warmup: WARM_SWIM,
        mainSet: `6–8 × 50 m drill/swim by 25 (catch-up, fingertip drag), 15–20 s rest. Then 4 × 100 m relaxed swim, focus on exhaling underwater, 20 s rest.`,
        cooldown: COOL_SWIM,
        coachingNotes: `Rest as much as you need between repeats — quality over volume.${ctx.hasPool ? '' : ' No pool access recorded: if you cannot get to a pool, do a shorter easy open-water practice only where it is safe and supervised.'}${phaseNote}`,
        target,
        distanceM: dist,
      }
    }
    case 'swim-endurance': {
      const dist = swimDistance(d, ctx, 0.8)
      return {
        title: 'Aerobic swim',
        purpose: 'Extend comfortable continuous swimming so the swim leg feels controlled, not frantic.',
        warmup: WARM_SWIM,
        mainSet: `Continuous or long repeats: ${d >= 45 ? '3 × 400 m' : '2 × 300 m'} at an easy steady effort, 30 s rest. Breathe every 3 strokes where comfortable.`,
        cooldown: COOL_SWIM,
        coachingNotes: `Aim to finish feeling you could swim a further 200 m. Count strokes per length and try to keep them stable.${phaseNote}`,
        target,
        distanceM: dist,
      }
    }
    case 'swim-intervals': {
      const dist = swimDistance(d, ctx, 0.85)
      const reps = intervalsCount(d, 15, 3, 1)
      return {
        title: 'Swim threshold intervals',
        purpose: 'Improve sustainable swim speed with controlled, repeatable hard efforts.',
        warmup: WARM_SWIM,
        mainSet: `${Math.min(reps, 8)} × 100 m at a comfortably-hard steady effort (RPE 7), 20 s rest. Hold the same time on every repeat.`,
        cooldown: COOL_SWIM,
        coachingNotes: `If your times fade by more than ~5 s across the set, you started too fast.${phaseNote}`,
        target,
        distanceM: dist,
      }
    }
    case 'swim-openwater': {
      const dist = swimDistance(d, ctx, 0.75)
      return {
        title: 'Open-water skills',
        purpose: 'Practise sighting, calm breathing and straight-line swimming in open water.',
        warmup: 'Enter calmly, float and acclimatise for 3–5 min. 200 m easy swimming.',
        mainSet: 'Swim in 4–6 × 4-minute blocks easy, sighting every 8–10 strokes. Include 2 short practice starts and turns around a buoy.',
        cooldown: '3–5 min very easy swimming close to the shore.',
        coachingNotes: `Only swim open water with a buddy, a tow float and in conditions you have checked (water temperature, currents, visibility). Skip it if conditions are uncertain — a pool session is a fine substitute.${phaseNote}`,
        target,
        distanceM: dist,
      }
    }
    case 'bike-easy': {
      return {
        title: beginner ? 'Easy ride — build comfort' : 'Easy aerobic ride',
        purpose: 'Build aerobic base and bike comfort with low stress on the body.',
        warmup: WARM_BIKE,
        mainSet: `Ride steady and easy for ${Math.max(10, d - 15)} min. Keep cadence smooth (80–95 rpm) and stay relaxed through shoulders and hands.`,
        cooldown: COOL_BIKE,
        coachingNotes: `If you feel you are working too hard to chat, shift down and soften the effort.${phaseNote}`,
        target,
        distanceM: bikeDistance(d, ctx, 0.9),
      }
    }
    case 'bike-long': {
      return {
        title: d >= 180 ? 'Long ride — endurance & fueling' : 'Long aerobic ride',
        purpose: 'Build the endurance that carries you through the bike leg and practise eating and drinking while riding.',
        warmup: '15 min very easy spinning, building gently.',
        mainSet: `Steady aerobic riding for ${Math.max(20, d - 25)} min, mostly in the easy range${d >= 120 ? ', with 2 × 10 min at a steadier effort (RPE 4–5) in the second half' : ''}. Practise your fueling plan from the first 20 min.`,
        cooldown: '10 min easy spinning and a snack within 30 min of finishing.',
        coachingNotes: `Rehearse race-day products and note stomach tolerance in the fueling log. Plan a safe, familiar route, carry identification and tell someone your route.${phaseNote}`,
        target,
        distanceM: bikeDistance(d, ctx, 0.92),
      }
    }
    case 'bike-tempo': {
      const block = d >= 75 ? 15 : 10
      return {
        title: 'Steady tempo ride',
        purpose: 'Improve your ability to hold a controlled, steady effort — the pacing skill triathlon rewards most.',
        warmup: WARM_BIKE,
        mainSet: `${d >= 75 ? 3 : 2} × ${block} min at a steady comfortably-hard effort (RPE 5–6), 5 min easy between blocks.`,
        cooldown: COOL_BIKE,
        coachingNotes: `Keep the effort even; the last block should feel the same as the first.${phaseNote}`,
        target,
        distanceM: bikeDistance(d, ctx, 0.9),
      }
    }
    case 'bike-intervals': {
      const reps = Math.min(6, intervalsCount(d, 25, 4, 3))
      return {
        title: 'Bike intervals',
        purpose: 'Raise sustainable power with short, well-recovered hard efforts.',
        warmup: WARM_BIKE,
        mainSet: `${reps} × 4 min at a hard but controlled effort (RPE 7–8), 3 min easy spinning between efforts.`,
        cooldown: COOL_BIKE,
        coachingNotes: `Stop the set early if form or control falls apart — one quality interval beats three sloppy ones.${phaseNote}`,
        target,
        distanceM: bikeDistance(d, ctx, 0.85),
      }
    }
    case 'bike-race-pace': {
      return {
        title: 'Race-pace ride',
        purpose: 'Rehearse goal race effort, aero position, nutrition and pacing on the bike.',
        warmup: '15 min progressive easy spinning.',
        mainSet: `${Math.max(2, Math.floor((d - 30) / 20))} × ${d >= 150 ? 30 : 20} min at planned race effort (RPE 5–6), 5–10 min easy between. Eat and drink exactly as planned for race day.`,
        cooldown: '10 min easy spinning.',
        coachingNotes: `Race effort should feel almost too easy early. Practise the first-hour restraint you will need on the day.${phaseNote}`,
        target,
        distanceM: bikeDistance(d, ctx, 0.9),
      }
    }
    case 'run-walk': {
      const runMin = Math.max(1, Math.min(4, Math.round((d - 10) / 12)))
      return {
        title: 'Run-walk intervals',
        purpose: 'Build running endurance gradually while keeping impact load manageable.',
        warmup: '5 min brisk walk, then 2 min very easy jog.',
        mainSet: `Repeat for ${Math.max(10, d - 10)} min: jog ${runMin} min easily, walk 1–2 min. Keep every jog conversational.`,
        cooldown: '5 min easy walk and light calf stretches.',
        coachingNotes: `Walking is part of the plan, not a failure. If a niggle appears that changes how you move, stop and log it.${phaseNote}`,
        target,
        distanceM: runDistance(d, ctx, 0.8),
      }
    }
    case 'run-easy': {
      return {
        title: 'Easy aerobic run',
        purpose: 'Build aerobic base and durability at an effort that is easy to recover from.',
        warmup: WARM_RUN,
        mainSet: `Run ${Math.max(10, d - 10)} min easy and conversational on flat or rolling terrain. Add 4 × 15 s relaxed strides at the end if you feel good.`,
        cooldown: COOL_RUN,
        coachingNotes: `Most of your running should feel like this. Slow down if breathing gets laboured.${phaseNote}`,
        target,
        distanceM: runDistance(d, ctx, 0.88),
      }
    }
    case 'run-long': {
      return {
        title: d >= 90 ? 'Long run — durability' : 'Long run',
        purpose: 'Build the muscular and aerobic endurance that supports the run leg, including after the bike.',
        warmup: '10 min walk/easy jog.',
        mainSet: `Steady easy running for ${Math.max(20, d - 15)} min. Walk the aid-station-style breaks you plan to use on race day and practise taking fuel.`,
        cooldown: '5–10 min easy walk and a recovery snack.',
        coachingNotes: `Keep the pace honest-easy. Long-run quality is judged by how you feel the next day, not by pace.${phaseNote}`,
        target,
        distanceM: runDistance(d, ctx, 0.9),
      }
    }
    case 'run-tempo': {
      const block = d >= 60 ? 15 : 10
      return {
        title: 'Steady tempo run',
        purpose: 'Improve your ability to hold a controlled, comfortably-hard pace.',
        warmup: WARM_RUN,
        mainSet: `${d >= 60 ? 2 : 1} × ${block} min at steady comfortably-hard effort (RPE 6), with 3 min easy jog between.`,
        cooldown: COOL_RUN,
        coachingNotes: `Run by effort, not by watch. You should finish able to speak a few words.${phaseNote}`,
        target,
        distanceM: runDistance(d, ctx, 0.88),
      }
    }
    case 'run-intervals': {
      const reps = Math.min(8, intervalsCount(d, 20, 3, 2))
      return {
        title: 'Run intervals',
        purpose: 'Develop speed and running economy with short efforts and full-enough recovery.',
        warmup: WARM_RUN,
        mainSet: `${reps} × 3 min hard but controlled (RPE 7–8), 2 min easy jog between.`,
        cooldown: COOL_RUN,
        coachingNotes: `Keep every rep the same pace. If your calves or Achilles feel unusually tight, convert to an easy run.${phaseNote}`,
        target,
        distanceM: runDistance(d, ctx, 0.8),
      }
    }
    case 'brick': {
      const bikeMin = Math.round(d * 0.75)
      const runMin = d - bikeMin
      return {
        title: 'Brick: bike → run',
        purpose: 'Practise the bike-to-run transition so your legs adapt to the heavy, wobbly feeling off the bike.',
        warmup: '10 min easy spinning.',
        mainSet: `Bike ${bikeMin - 10} min steady (RPE 4–5), then rack the bike (practise a fast, calm transition) and run ${runMin} min at easy-to-steady effort. Start the run slower than feels natural for the first 3 min.`,
        cooldown: '5 min easy walk and stretching.',
        coachingNotes: `Lay out your transition kit exactly as on race day. Count the minutes it takes — then shave a little.${phaseNote}`,
        target,
        distanceM: bikeDistance(bikeMin, ctx, 0.9) + runDistance(runMin, ctx, 0.85),
      }
    }
    case 'strength': {
      return {
        title: 'Strength & stability',
        purpose: 'Build resilience for swimming, cycling and running with controlled general strength work.',
        warmup: '5 min easy cardio, then bodyweight squats, glute bridges and band walks.',
        mainSet: ctx.hasGym
          ? `2–3 sets of 8–12 reps: squat or leg press, hip hinge / deadlift pattern, single-leg step-up, push-up variation, row, plank (30–45 s), side plank. Keep 2–3 reps in reserve.`
          : `No gym recorded — bodyweight, bands or a pair of dumbbells at home. 2–3 sets of 8–12 reps: squat, glute bridge, single-leg step-up, push-up variation, band row, plank (30–45 s), side plank. Keep 2–3 reps in reserve.`,
        cooldown: 'Light stretching and slow nasal breathing for 3–5 min.',
        coachingNotes: `Choose loads you can control with good form. Reduce the volume in the week before a key race.${phaseNote}`,
        target: { rpe: [5, 6], description: 'Controlled effort with 2–3 reps left in reserve. Stop any exercise that causes sharp pain.' },
      }
    }
    case 'mobility': {
      return {
        title: 'Mobility & movement prep',
        purpose: 'Maintain range of motion and tissue comfort between harder days.',
        warmup: '2 min easy movement.',
        mainSet: 'Flow through hips, thoracic spine, shoulders and ankles: 90/90 hips, thoracic rotations, thread-the-needle, world’s greatest stretch, calf and hamstring mobility. 30–60 s per position.',
        cooldown: '2 min slow breathing.',
        coachingNotes: `Move within comfortable range. This is not a stretching-to-pain session.${phaseNote}`,
        target: { rpe: [1, 2], description: 'Very easy — gentle movement, no strain.' },
      }
    }
    case 'recovery': {
      return {
        title: 'Active recovery',
        purpose: 'Promote circulation and freshness without adding training stress. Rest is part of the plan.',
        warmup: '5 min easy movement.',
        mainSet: `Choose one: easy spin, relaxed walk, or easy pool float/swim for ${Math.max(15, d - 10)} min at a truly easy effort.`,
        cooldown: '5 min stretching or breathing.',
        coachingNotes: `If you feel flat, a full rest day is a perfectly good swap. Never turn a recovery day into a workout.${phaseNote}`,
        target,
      }
    }
    case 'rehab': {
      return {
        title: 'Clinician-approved rehab session',
        purpose: 'Complete the exercises your clinician approved. Follow their instructions and stop rules.',
        warmup: 'Warm up as instructed by your clinician.',
        mainSet: 'See the Rehab section for the exact exercises, sets, repetitions and stop rules. Log symptoms before, during and after.',
        cooldown: 'Cool down as instructed by your clinician.',
        coachingNotes: 'This session is defined by your approved plan; EnduraPath does not alter the exercises. Contact your clinician if symptoms change.',
        target: { rpe: [2, 4], description: 'Follow your clinician’s guidance for effort and pain limits.' },
      }
    }
    case 'assess-swim': {
      return {
        title: 'Baseline check: comfortable swim',
        purpose: 'Learn your current swim comfort. No stopwatch required — this tells us what to build from.',
        warmup: WARM_SWIM,
        mainSet: 'Swim continuously (rest at the wall when needed) for 15 min at an easy, comfortable effort. Note total distance and how many rests you took.',
        cooldown: COOL_SWIM,
        coachingNotes: 'This is not a test of speed. Record distance and how it felt; EnduraPath uses it to refine future swim sessions.',
        target: { rpe: [3, 4], description: 'Comfortable and sustainable.' },
        distanceM: swimDistance(d, ctx, 0.8),
      }
    }
    case 'assess-bike': {
      return {
        title: 'Baseline check: steady ride',
        purpose: 'Learn your comfortable steady-riding capacity using effort only — no power meter required.',
        warmup: WARM_BIKE,
        mainSet: 'Ride 30 min at a steady effort that feels like RPE 5 (you could speak in short sentences). Note distance and any discomfort.',
        cooldown: COOL_BIKE,
        coachingNotes: 'If you have a heart-rate monitor, note your average, but it is optional. Choose a flat, safe route.',
        target: { rpe: [4, 5], description: 'Steady and sustainable.' },
        distanceM: bikeDistance(d, ctx, 0.9),
      }
    }
    case 'assess-run': {
      return {
        title: 'Baseline check: talk-test run',
        purpose: 'Learn your current running comfort using the talk test — no GPS watch needed.',
        warmup: WARM_RUN,
        mainSet: 'Run or run-walk for 20 min at a pace where you can talk in full sentences. Note how many minutes you ran without walking.',
        cooldown: COOL_RUN,
        coachingNotes: 'Any new pain that changes your stride is a reason to stop and log a symptom report.',
        target: { rpe: [3, 4], description: 'Conversational pace.' },
        distanceM: runDistance(d, ctx, 0.85),
      }
    }
  }
}

/** Duration rounding helper re-exported for the generator. */
export { round5 }
