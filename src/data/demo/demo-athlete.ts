import type { AthleteAvailability, AthleteProfile } from '@/domain/models/athlete'
import type { AppState } from '@/domain/models/state'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/domain/models/state'
import type { RaceEvent } from '@/domain/models/events'
import type {
  ClinicalRestriction,
  FuelingLog,
  RecoveryCheckIn,
  RehabLog,
  RehabilitationPlan,
  SymptomReport,
} from '@/domain/models/health'
import type { PlanChange, Workout, WorkoutResult } from '@/domain/models/training'
import { defaultChecklist } from '@/domain/events/checklist'
import { assessReadiness } from '@/domain/readiness/readiness'
import { GENERAL_FUELING_TARGETS, plannedCarbsG } from '@/domain/training-engine/fueling'
import { generatePlan } from '@/domain/training-engine/generator'
import { applyRestrictionsToFuture, scheduleRehabSessions } from '@/domain/training-engine/maintenance'
import { makeChange } from '@/domain/training-engine/scheduling'
import { snapshotOf } from '@/domain/training-engine/sessions'
import { triageSymptom } from '@/domain/safety/triage'
import { addDaysISO, mondayOf, type ISODate } from '@/lib/dates'
import { seededRandom } from '@/lib/ids'
import { round5 } from '@/lib/utils'

/** Deterministic IDs keep the sample data stable between loads. */
function demoIds() {
  const counts: Record<string, number> = {}
  return (prefix: string) => {
    counts[prefix] = (counts[prefix] ?? 0) + 1
    return `demo_${prefix}_${String(counts[prefix]).padStart(4, '0')}`
  }
}

const RPE_BY_INTENSITY = { recovery: 2, easy: 3, moderate: 5, hard: 7 } as const

const FEEL_NOTES = [
  'Legs felt heavy at first, settled after the warm-up.',
  'Controlled the effort well — finished feeling strong.',
  'Windy on the route; kept effort steady.',
  'Good rhythm today.',
  'Tired from work but glad I did it.',
  'Practised my fueling plan; stomach was fine.',
]

/**
 * Builds a clearly-labelled SAMPLE dataset: a fictional athlete aiming for an IRONMAN 70.3,
 * with eight weeks of seeded history. Nothing here is real athlete or clinical data.
 */
export function buildDemoState(today: ISODate, now: string): AppState {
  const mk = demoIds()
  const rand = seededRandom(70_3)
  const thisMonday = mondayOf(today)
  const planStart = addDaysISO(thisMonday, -8 * 7)

  const athlete: AthleteProfile = {
    id: 'demo_athlete',
    createdAt: now,
    updatedAt: now,
    displayName: 'Sam (sample athlete)',
    ageRange: '35-44',
    units: 'metric',
    generalExperience: 'intermediate',
    swimConfidence: 'comfortable',
    openWater: 'some',
    bikeExperience: 'intermediate',
    runExperience: 'intermediate',
    healthNotes: 'Sample note: occasional calf tightness after run intervals.',
    baseline: {
      swimSessionsPerWeek: 2,
      swimMetersPerWeek: 1800,
      comfortableSwimM: 800,
      bikeSessionsPerWeek: 2,
      bikeMinutesPerWeek: 150,
      comfortableBikeMin: 90,
      runSessionsPerWeek: 3,
      runMinutesPerWeek: 120,
      comfortableRunMin: 50,
      consistency: 'regular',
      recentRaces: [
        { id: 'demo_rr_1', name: 'Harbour Sprint Triathlon (sample)', category: 'sprint', finishTime: '1:24:10' },
        { id: 'demo_rr_2', name: 'Lakeside Olympic (sample)', category: 'olympic', finishTime: '2:41:35' },
      ],
      restingHr: 54,
      maxHr: 186,
      hasClinicianRestrictions: false,
    },
    goal: {
      type: 'half-ironman',
      preferredFormat: 'open-water',
      intent: 'finish-comfortably',
    },
    preferences: {
      dietary: ['omnivore'],
      allergies: ['Tree nuts'],
      equipment: ['Road bike', 'Indoor trainer', 'Resistance bands', 'Heart-rate strap'],
      sleepHoursTypical: 7.2,
      recoveryPattern: 'average',
      professionalSupport: ['physiotherapist'],
    },
    isDemo: true,
  }

  const availability: AthleteAvailability = {
    id: 'demo_availability',
    createdAt: now,
    updatedAt: now,
    athleteId: athlete.id,
    trainingDays: [0, 1, 2, 3, 5, 6],
    maxHoursPerWeek: 8,
    restDay: 4,
    constraints: 'Sample: school run on weekday mornings; long sessions on weekends.',
    access: { pool: true, bicycle: true, indoorTrainer: true, gym: true, safeRunRoutes: true },
    preferredTimes: ['early-morning', 'evening'],
    unavailable: [{ id: 'demo_una_1', start: addDaysISO(thisMonday, 5 * 7), end: addDaysISO(thisMonday, 5 * 7 + 4), reason: 'Sample: family holiday' }],
  }

  const eventDateA = addDaysISO(thisMonday, 44 * 7 + 5)
  const eventDateB = addDaysISO(thisMonday, 14 * 7 + 6)
  const events: RaceEvent[] = [
    {
      id: 'demo_evt_a',
      createdAt: now,
      updatedAt: now,
      name: 'Coastal 70.3 (sample event)',
      date: eventDateA,
      location: 'Sample coastline',
      category: 'half-ironman',
      swimM: 1900,
      bikeKm: 90,
      runKm: 21.1,
      priority: 'A',
      targetOutcome: 'Finish comfortably',
      notes: 'Sample event — not a real race. No registration data is synchronised.',
      checklist: defaultChecklist('half-ironman', mk).map((c, i) => ({ ...c, done: i < 3 })),
      status: 'planned',
    },
    {
      id: 'demo_evt_b',
      createdAt: now,
      updatedAt: now,
      name: 'City Olympic Tune-up (sample event)',
      date: eventDateB,
      location: 'Sample city',
      category: 'olympic',
      swimM: 1500,
      bikeKm: 40,
      runKm: 10,
      priority: 'B',
      targetOutcome: 'Practise pacing and nutrition',
      checklist: defaultChecklist('olympic', mk),
      status: 'planned',
    },
    {
      id: 'demo_evt_h1',
      createdAt: now,
      updatedAt: now,
      name: 'Lakeside Olympic (sample)',
      date: addDaysISO(thisMonday, -30 * 7),
      location: 'Sample lake',
      category: 'olympic',
      swimM: 1500,
      bikeKm: 40,
      runKm: 10,
      priority: 'B',
      targetOutcome: 'Finish',
      checklist: [],
      result: { finishTime: '2:41:35', notes: 'Sample result. Swim felt calm; run faded late.' },
      status: 'completed',
    },
    {
      id: 'demo_evt_h2',
      createdAt: now,
      updatedAt: now,
      name: 'Harbour Sprint Triathlon (sample)',
      date: addDaysISO(thisMonday, -52 * 7),
      location: 'Sample harbour',
      category: 'sprint',
      swimM: 750,
      bikeKm: 20,
      runKm: 5,
      priority: 'B',
      targetOutcome: 'First sprint',
      checklist: [],
      result: { finishTime: '1:24:10', notes: 'Sample result.' },
      status: 'completed',
    },
  ]

  // --- Generate the plan as it would have looked at the start of the 8-week history window. -----
  const generated = generatePlan({
    athlete,
    availability,
    events,
    restrictions: [],
    fuelingTargets: { ...GENERAL_FUELING_TARGETS, effectiveFrom: planStart },
    today,
    now,
    planStart,
    idFactory: mk,
  })

  const plan = generated.plan
  let workouts: Workout[] = generated.workouts
  const results: WorkoutResult[] = []
  const changes: PlanChange[] = []
  const fuelingLogs: FuelingLog[] = []

  changes.push(
    makeChange(plan.id, 'plan-created', 'Initial plan created from onboarding', `Starting in Stage ${plan.startStage} toward IRONMAN 70.3 (sample data)`, 'plan-engine', [], [], `${planStart}T07:00:00.000Z`, mk),
  )

  // --- Resolve the past: mostly completed, a few skipped, the latest one left "missed". -----------
  const past = workouts.filter((w) => w.date < today && w.sport !== 'rehab').sort((a, b) => (a.date < b.date ? -1 : 1))
  const lastTwoDays = new Set(past.filter((w) => w.date >= addDaysISO(today, -3)).map((w) => w.id))
  const missed = past.filter((w) => lastTwoDays.has(w.id) && !w.isKey).slice(-1)[0] ?? past[past.length - 1]
  const skipReasons = ['Work trip ran late', 'Child unwell — stayed home', 'Poor sleep; chose rest']

  // Deterministic skips (every 11th eligible session) so the sample always shows realistic missed-session history.
  let skipCount = 0
  let eligible = 0
  workouts = workouts.map((w) => {
    if (w.date >= today || w.sport === 'rehab') return w
    if (missed && w.id === missed.id) return w
    if (!w.isKey) eligible++
    if (!w.isKey && eligible % 11 === 5 && skipCount < 4) {
      const reason = skipReasons[skipCount % skipReasons.length]
      skipCount++
      changes.push(makeChange(plan.id, 'skip', `Skipped “${w.title}”`, reason, 'athlete', [w.id], [{ workoutId: w.id, field: 'status', from: 'planned', to: 'skipped' }], `${w.date}T18:00:00.000Z`, mk))
      return { ...w, status: 'skipped' as const, statusReason: reason }
    }
    const dur = Math.max(10, Math.round(w.durationMin * (0.9 + rand() * 0.18)))
    const dist = w.distanceM ? Math.round(w.distanceM * (0.94 + rand() * 0.12)) : undefined
    const rpe = Math.min(10, Math.max(1, RPE_BY_INTENSITY[w.intensity] + (rand() < 0.3 ? 1 : 0) + (rand() < 0.15 ? -1 : 0)))
    results.push({
      id: mk('res'),
      createdAt: `${w.date}T19:00:00.000Z`,
      updatedAt: `${w.date}T19:00:00.000Z`,
      workoutId: w.id,
      completedOn: w.date,
      actualDurationMin: dur,
      actualDistanceM: dist,
      rpe,
      feeling: rand() < 0.15 ? 2 : rand() < 0.5 ? 4 : 3,
      notes: rand() < 0.4 ? FEEL_NOTES[Math.floor(rand() * FEEL_NOTES.length)] : undefined,
      symptomsNoted: false,
      planned: { ...snapshotOf(w), stage: w.stage, kind: w.kind },
    })
    // Fueling log for long/structured sessions.
    if (w.fueling && (w.fueling.level === 'structured' || w.fueling.level === 'practice') && rand() < 0.7) {
      const planned = plannedCarbsG(w.fueling, w.durationMin)
      fuelingLogs.push({
        id: mk('fl'),
        createdAt: `${w.date}T20:00:00.000Z`,
        updatedAt: `${w.date}T20:00:00.000Z`,
        date: w.date,
        kind: 'training',
        workoutId: w.id,
        plannedCarbsG: planned,
        actualCarbsG: planned ? round5(planned * (0.7 + rand() * 0.35)) : undefined,
        plannedFluidMl: Math.round((w.durationMin / 60) * 600),
        actualFluidMl: Math.round(((w.durationMin / 60) * 600 * (0.75 + rand() * 0.3)) / 50) * 50,
        products: 'Sample: sports drink + gel',
        tolerance: rand() < 0.2 ? 3 : 4,
        giSymptoms: false,
        notes: undefined,
      })
    }
    return { ...w, status: 'completed' as const }
  })

  // --- Recovery check-ins over the last 21 days (sample, with a mild fatigue bump). ---------------
  const checkIns: RecoveryCheckIn[] = []
  for (let i = 20; i >= 0; i--) {
    if (i % 7 === 3 && i !== 0) continue
    const date = addDaysISO(today, -i)
    const fatigueBase = i >= 8 && i <= 12 ? 3.6 : 2.5
    const fatigue = Math.min(5, Math.max(1, Math.round(fatigueBase + (rand() - 0.5) * 1.6)))
    const sleepHours = Math.round((6.3 + rand() * 1.8) * 10) / 10
    checkIns.push({
      id: mk('ci'),
      createdAt: `${date}T07:00:00.000Z`,
      updatedAt: `${date}T07:00:00.000Z`,
      date,
      sleepHours,
      sleepQuality: Math.min(5, Math.max(1, Math.round(2.5 + (sleepHours - 6.3) * 0.9 + (rand() - 0.5)))),
      fatigue,
      soreness: Math.min(5, Math.max(1, fatigue + (rand() < 0.4 ? -1 : 0))),
      mood: Math.min(5, Math.max(1, Math.round(4.2 - (fatigue - 2.5) * 0.5 + (rand() - 0.5)))),
      readiness: Math.min(5, Math.max(1, Math.round(5 - fatigue * 0.6 + (rand() - 0.3)))),
      restingHr: Math.round(52 + (fatigue - 2) * 1.6 + rand() * 2),
    })
  }
  // Leave today's check-in blank so the dashboard shows an incomplete-check-in alert and the form is usable.
  const withoutToday = checkIns.filter((c) => c.date !== today)

  // --- Sample medical scenario: a clinician-provided restriction and an approved rehab plan. -------
  const symptomDate = addDaysISO(today, -9)
  const symptomTriage = triageSymptom({ severity: 4, trend: 'improving', atRest: false, duringTraining: true, onset: 'few-days', redFlags: [] })
  const symptom: SymptomReport = {
    id: mk('sym'),
    createdAt: `${symptomDate}T20:00:00.000Z`,
    updatedAt: `${symptomDate}T20:00:00.000Z`,
    reportedAt: `${symptomDate}T20:00:00.000Z`,
    bodyArea: 'Left calf / Achilles',
    symptom: 'Tightness and mild ache after run intervals (sample report)',
    severity: 4,
    onset: 'few-days',
    trend: 'improving',
    duringTraining: true,
    atRest: false,
    redFlags: [],
    notes: 'Sample data for demonstration only.',
    triage: { level: symptomTriage.level, reasons: symptomTriage.reasons },
    clinicianReviewed: true,
  }

  const restriction: ClinicalRestriction = {
    id: 'demo_restriction_1',
    createdAt: `${addDaysISO(today, -7)}T10:00:00.000Z`,
    updatedAt: `${addDaysISO(today, -7)}T10:00:00.000Z`,
    title: 'No hard efforts (sample)',
    description: 'Sample clinician restriction: no hard efforts (intervals, hill work or race-pace blocks) in any sport; steady training is fine. Complete the rehab programme. Review at the date shown.',
    source: 'clinician',
    clinicianName: 'Sample sports physician (demo)',
    severity: 'modify',
    effect: { blockedSports: [], maxIntensity: 'moderate', maxDurationMin: 90 },
    status: 'active',
    reviewDate: addDaysISO(today, 14),
  }

  const rehab: RehabilitationPlan = {
    id: 'demo_rehab_1',
    createdAt: `${addDaysISO(today, -7)}T10:00:00.000Z`,
    updatedAt: `${addDaysISO(today, -7)}T10:00:00.000Z`,
    title: 'Calf & Achilles loading (SAMPLE plan)',
    restrictionId: restriction.id,
    approvedBy: 'Sample sports physiotherapist (demo — not a real clinician)',
    approvedOn: addDaysISO(today, -7),
    reviewDate: addDaysISO(today, 14),
    status: 'active',
    isSample: true,
    exercises: [
      { id: 'demo_ex_1', name: 'Double-leg calf raise', sets: 3, reps: 12, frequencyPerWeek: 3, notes: 'Slow 3 s up, 3 s down. Full range on a flat floor.', cues: ['Tall posture', 'Even weight through both feet', 'Controlled lowering'], approvedModification: 'May hold a wall for balance.', stopIf: 'Sharp pain or pain above 4/10 that does not settle within 24 h' },
      { id: 'demo_ex_2', name: 'Single-leg calf isometric hold', sets: 4, holdSeconds: 30, frequencyPerWeek: 3, notes: 'Rise to the top and hold. Do not bounce.', cues: ['Stay tall', 'Smooth breathing'], stopIf: 'Sharp pain or pain above 4/10 that does not settle within 24 h' },
      { id: 'demo_ex_3', name: 'Single-leg balance', sets: 3, holdSeconds: 30, frequencyPerWeek: 3, notes: 'Eyes forward; soft knee.', cues: ['Level hips', 'Foot arch lifted'], stopIf: 'Any new sharp pain' },
      { id: 'demo_ex_4', name: 'Glute bridge', sets: 3, reps: 12, frequencyPerWeek: 3, notes: 'Drive through heels; squeeze at the top.', cues: ['Ribs down', 'Neutral spine'], stopIf: 'Back or hamstring cramping that does not settle' },
    ],
    referral: { status: 'attended', provider: 'Sample sports physiotherapist (demo)', date: addDaysISO(today, -7) },
    milestones: [
      { id: 'demo_ms_1', label: 'Pain-free walking and stairs', status: 'reviewed', reviewDate: addDaysISO(today, -3) },
      { id: 'demo_ms_2', label: 'Clinician review: easy running only', status: 'pending' },
      { id: 'demo_ms_3', label: 'Clinician review: return to run intervals', status: 'pending' },
    ],
  }

  const rehabLogs: RehabLog[] = []
  for (let i = 6; i >= 1; i -= 2) {
    const date = addDaysISO(today, -i)
    for (const ex of rehab.exercises.slice(0, 3)) {
      rehabLogs.push({
        id: mk('rl'),
        createdAt: `${date}T08:00:00.000Z`,
        updatedAt: `${date}T08:00:00.000Z`,
        planId: rehab.id,
        exerciseId: ex.id,
        date,
        setsDone: ex.sets,
        symptomBefore: 3,
        symptomDuring: i > 3 ? 3 : 2,
        symptomAfter: i > 3 ? 2 : 1,
        notes: i === 6 ? 'Sample: slightly tight at the start.' : undefined,
      })
    }
  }

  // Apply the restriction to future sessions exactly the way the live app would.
  const env = { athlete, availability, fuelingTargets: { ...GENERAL_FUELING_TARGETS, effectiveFrom: planStart }, today, now, mk }
  const applied = applyRestrictionsToFuture(workouts, [restriction], env)
  workouts = applied.workouts
  changes.push(...applied.changes.map((c) => ({ ...c, at: `${addDaysISO(today, -7)}T10:30:00.000Z`, createdAt: `${addDaysISO(today, -7)}T10:30:00.000Z` })))

  // Schedule the approved rehab sessions as their own session type.
  const rehabSessions = scheduleRehabSessions(rehab, plan.id, workouts, { athlete, availability, events, restrictions: [restriction], today, now, mk })
  workouts = [...workouts, ...rehabSessions]

  const base: AppState = {
    schemaVersion: SCHEMA_VERSION,
    onboarded: true,
    isSampleData: true,
    athlete,
    availability,
    plan,
    workouts,
    results,
    changes: changes.sort((a, b) => (a.at < b.at ? 1 : -1)),
    events,
    checkIns: withoutToday,
    nutrition: { id: 'demo_nutrition', createdAt: now, updatedAt: now, athleteId: athlete.id, targets: { ...GENERAL_FUELING_TARGETS, effectiveFrom: planStart }, hydrationReminders: true },
    fuelingLogs: fuelingLogs.sort((a, b) => (a.date < b.date ? 1 : -1)),
    messages: [],
    assessments: [],
    notifications: [
      { id: mk('ntf'), createdAt: now, updatedAt: now, kind: 'system', severity: 'info', title: 'You are viewing sample data', body: 'Everything here is fictional demo data. Start onboarding to build your own plan.', link: '/onboarding' },
    ],
    medical: { restrictions: [restriction], symptoms: [symptom], rehabPlans: [rehab], rehabLogs },
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: now,
  }

  const assessment = assessReadiness({
    athlete,
    availability,
    plan,
    workouts,
    results,
    checkIns: base.checkIns,
    fuelingLogs: base.fuelingLogs,
    events,
    restrictions: base.medical.restrictions,
    symptoms: base.medical.symptoms,
    today,
    now,
    idFactory: mk,
  })
  return { ...base, assessments: [assessment] }
}
