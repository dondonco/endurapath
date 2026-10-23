import { Activity, Bike, Dumbbell, Footprints, HeartPulse, Layers, Stethoscope, Waves, Wind, type LucideIcon } from 'lucide-react'
import type { IntensityLevel, Sport } from '@/domain/models/common'
import type { Workout } from '@/domain/models/training'
import { formatDistance, formatDuration, formatPace, type UnitSystem } from '@/lib/units'
import { Badge } from '@/components/shared/ui'
import { cn } from '@/lib/utils'

export const SPORT_META: Record<Sport, { icon: LucideIcon; color: string; label: string }> = {
  swim: { icon: Waves, color: 'text-swim', label: 'Swim' },
  bike: { icon: Bike, color: 'text-bike', label: 'Bike' },
  run: { icon: Footprints, color: 'text-run', label: 'Run' },
  brick: { icon: Layers, color: 'text-brick', label: 'Brick' },
  strength: { icon: Dumbbell, color: 'text-strength', label: 'Strength' },
  mobility: { icon: Wind, color: 'text-recovery', label: 'Mobility' },
  recovery: { icon: HeartPulse, color: 'text-recovery', label: 'Recovery' },
  rehab: { icon: Stethoscope, color: 'text-rehab', label: 'Rehab' },
}

export const SPORT_BG: Record<Sport, string> = {
  swim: 'bg-swim',
  bike: 'bg-bike',
  run: 'bg-run',
  brick: 'bg-brick',
  strength: 'bg-strength',
  mobility: 'bg-recovery',
  recovery: 'bg-recovery',
  rehab: 'bg-rehab',
}

export function SportIcon({ sport, className }: { sport: Sport; className?: string }) {
  const m = SPORT_META[sport] ?? { icon: Activity, color: 'text-muted' }
  return <m.icon className={cn('size-4', m.color, className)} aria-hidden />
}

const INTENSITY_TONE: Record<IntensityLevel, 'neutral' | 'info' | 'warn' | 'danger'> = { recovery: 'neutral', easy: 'info', moderate: 'warn', hard: 'danger' }

export function IntensityBadge({ intensity }: { intensity: IntensityLevel }) {
  return <Badge tone={INTENSITY_TONE[intensity]}>{intensity}</Badge>
}

export function StatusBadge({ w, today }: { w: Workout; today: string }) {
  if (w.status === 'completed') return <Badge tone="accent">Completed</Badge>
  if (w.status === 'skipped') return <Badge tone="neutral">Skipped</Badge>
  if (w.date < today) return <Badge tone="warn">Not logged</Badge>
  if (w.modified) return <Badge tone="secondary">Modified</Badge>
  return <Badge tone="neutral">Planned</Badge>
}

/** Intensity target string using RPE first, then any metrics the athlete actually provided. */
export function targetSummary(w: Workout, units: UnitSystem): string {
  const t = w.target
  const parts = [`RPE ${t.rpe[0]}–${t.rpe[1]}`]
  if (t.heartRateBpm) parts.push(`HR ${t.heartRateBpm[0]}–${t.heartRateBpm[1]} bpm`)
  if (t.paceSecPerKm) parts.push(`${formatPace(t.paceSecPerKm[1], units)}–${formatPace(t.paceSecPerKm[0], units)}`)
  if (t.powerWatts) parts.push(`${t.powerWatts[0]}–${t.powerWatts[1]} W`)
  return parts.join(' · ')
}

export function workoutMeta(w: Workout, units: UnitSystem): string {
  const parts = [formatDuration(w.durationMin)]
  if (w.distanceM) parts.push(formatDistance(w.distanceM, w.sport === 'brick' ? 'bike' : w.sport, units))
  return parts.join(' · ')
}
