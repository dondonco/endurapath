import { useApp } from '@/app/store'
import type { UnitSystem } from '@/lib/units'

/** The athlete's preferred unit system (metric until a profile exists). */
export function useUnits(): UnitSystem {
  return useApp().state.athlete?.units ?? 'metric'
}
