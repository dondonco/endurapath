import type { IntensityLevel, Sport } from '../models/common'
import type { FuelingGuidance } from '../models/training'
import type { FuelingTargets } from '../models/health'

/**
 * General educational fueling templates. These are NOT individualised prescriptions.
 * Carbohydrate ranges follow widely used sports-nutrition consensus bands; hydration is deliberately
 * expressed as "drink to thirst" with a reference range only when a professional supplied one.
 */
export const GENERAL_FUELING_TARGETS: Omit<FuelingTargets, 'effectiveFrom'> = {
  carbsPerHour: { min: 30, max: 60 },
  fluidMlPerHour: { min: 400, max: 800 },
  sodiumNote: 'Sodium needs vary a lot between people and conditions. Try electrolyte options in training before race day.',
  source: 'general-education',
}

const NO_FUEL_SPORTS: Sport[] = ['mobility', 'recovery', 'rehab']

export function carbsRangeForDuration(durationMin: number, intensity: IntensityLevel): { min: number; max: number } | undefined {
  if (durationMin < 60) return undefined
  if (durationMin < 90) return intensity === 'hard' ? { min: 30, max: 45 } : { min: 0, max: 30 }
  if (durationMin < 150) return { min: 30, max: 60 }
  return { min: 60, max: 90 }
}

const FLUID_NOTE =
  'Drink to thirst and conditions. Needs vary with heat, sweat rate and intensity — do not force fluids beyond comfort.'

export function buildFueling(
  sport: Sport,
  durationMin: number,
  intensity: IntensityLevel,
  targets?: FuelingTargets,
): FuelingGuidance | undefined {
  if (NO_FUEL_SPORTS.includes(sport)) return undefined

  if (sport === 'strength') {
    return {
      level: 'minimal',
      summary: 'Normal meals are enough. Include some protein and carbohydrate afterwards.',
      before: 'A light snack 1–2 h before if you feel hungry. Avoid training on a very empty stomach if you feel shaky.',
      during: 'Water as needed.',
      after: 'A meal with protein and carbohydrate within a few hours.',
      fluidNote: FLUID_NOTE,
      source: 'general-education',
    }
  }

  const professional = targets?.source === 'professional'
  const base = carbsRangeForDuration(durationMin, intensity)
  const usingTargets = targets && durationMin >= 75
  const carbs = usingTargets ? targets.carbsPerHour : base
  const source: FuelingGuidance['source'] = usingTargets && professional ? 'professional' : 'general-education'

  const refFluid =
    usingTargets && targets
      ? ` Reference range ${professional ? `from ${targets.setBy ?? 'your professional'}` : '(general template)'}: ${targets.fluidMlPerHour.min}–${targets.fluidMlPerHour.max} ml/h — adjust for thirst, heat and comfort.`
      : ''

  if (durationMin < 45) {
    return {
      level: 'none',
      summary: 'Short session — water is enough. No in-session carbohydrate needed.',
      before: 'Eat normally. A small carbohydrate snack 60–90 min before if you train early and feel hungry.',
      during: 'Water to thirst.',
      after: 'Your next normal meal with carbohydrate and protein is fine.',
      fluidNote: FLUID_NOTE,
      source: 'general-education',
    }
  }

  if (!carbs || (carbs.max === 0)) {
    return {
      level: 'minimal',
      summary: 'Moderate session — a good pre-session meal and water cover most athletes.',
      before: 'Carbohydrate-based meal or snack 1–3 h before.',
      during: 'Water to thirst. Optional small carbohydrate (e.g. a few sips of sports drink) if it feels good.',
      after: 'Carbohydrate plus protein within a couple of hours.',
      fluidNote: FLUID_NOTE + refFluid,
      source: 'general-education',
    }
  }

  const structured = durationMin >= 150 || (durationMin >= 90 && intensity !== 'easy' && intensity !== 'recovery')
  return {
    level: structured ? 'structured' : 'practice',
    summary: structured
      ? `Long session — treat it as fueling practice. Aim around ${carbs.min}–${carbs.max} g carbohydrate per hour using race-day products.`
      : `Practice session — try around ${carbs.min}–${carbs.max} g carbohydrate per hour and note how your stomach feels.`,
    before: 'Familiar carbohydrate-rich meal 2–3 h before, plus a small top-up snack if you need it. Nothing new on a key session.',
    during: `Start fueling early (first 20–30 min) and take small amounts regularly. Build up toward the upper end only if it sits well.${
      durationMin >= 150 ? ' Mixed carbohydrate sources can improve tolerance at higher intakes.' : ''
    }`,
    after: 'Carbohydrate plus about 20–30 g protein within an hour or two, then a normal meal. Rehydrate with fluid and some salt-containing food.',
    carbsPerHour: carbs,
    fluidNote: FLUID_NOTE + refFluid,
    source,
  }
}

export function plannedCarbsG(g: FuelingGuidance | undefined, durationMin: number): number | undefined {
  if (!g?.carbsPerHour) return undefined
  const mid = (g.carbsPerHour.min + g.carbsPerHour.max) / 2
  return Math.round((mid * durationMin) / 60 / 5) * 5
}
