import type { SymptomReportInput } from '../validation/schemas'
import type { TriageLevel } from '../models/health'

export const EMERGENCY_RED_FLAGS = [
  'Chest pain, pressure or tightness',
  'Fainting or near-fainting',
  'Severe shortness of breath at rest',
  'Irregular or racing heartbeat that does not settle',
  'Sudden severe headache, confusion or weakness on one side',
  'Coughing or vomiting blood',
] as const

export const URGENT_RED_FLAGS = [
  'Numbness, tingling or loss of strength in a limb',
  'Inability to bear weight or use a limb after an injury',
  'Visible deformity or a "pop" with immediate swelling',
  'Calf pain with swelling, warmth or redness',
  'Fever with joint pain or swelling',
  'Loss of bladder or bowel control',
  'Heat illness signs: confusion, cessation of sweating, severe nausea',
] as const

export const ALL_RED_FLAGS: readonly string[] = [...EMERGENCY_RED_FLAGS, ...URGENT_RED_FLAGS]

export interface TriageResult {
  level: TriageLevel
  reasons: string[]
  headline: string
  guidance: string[]
  /** Training must stop (or stay stopped) until a clinician has reviewed. */
  holdTraining: boolean
  /** Whether Dr. Meridian should flag a clinical review in the readiness engine. */
  requiresClinicalReview: boolean
}

const EMERGENCY_SET = new Set<string>(EMERGENCY_RED_FLAGS)
const URGENT_SET = new Set<string>(URGENT_RED_FLAGS)

/**
 * Deterministic, conservative symptom triage. This is a rule-based safety net — it does not diagnose.
 * It deliberately errs toward recommending assessment.
 */
export function triageSymptom(input: Pick<SymptomReportInput, 'severity' | 'trend' | 'atRest' | 'duringTraining' | 'onset' | 'redFlags'>): TriageResult {
  const reasons: string[] = []
  const flags = input.redFlags ?? []
  const severity = Number(input.severity)

  const emergency = flags.filter((f) => EMERGENCY_SET.has(f))
  const urgent = flags.filter((f) => URGENT_SET.has(f))

  if (emergency.length) {
    return {
      level: 'emergency',
      reasons: emergency,
      headline: 'Seek emergency medical care now',
      guidance: [
        'Stop training immediately.',
        'Call your local emergency number (for example 911, 999 or 112) or go to the nearest emergency department.',
        'Do not drive yourself if you feel faint or unwell.',
      ],
      holdTraining: true,
      requiresClinicalReview: true,
    }
  }

  if (urgent.length) {
    return {
      level: 'urgent',
      reasons: urgent,
      headline: 'Get urgent medical assessment today',
      guidance: [
        'Stop training and avoid loading the affected area.',
        'Contact urgent care, your doctor or an emergency service today.',
        'If symptoms rapidly worsen, treat this as an emergency.',
      ],
      holdTraining: true,
      requiresClinicalReview: true,
    }
  }

  if (severity >= 8) reasons.push(`Severity reported as ${severity}/10`)
  if (input.trend === 'worsening') reasons.push('Symptoms are getting worse')
  if (input.atRest && severity >= 4) reasons.push('Symptoms present at rest')
  if (input.onset === 'week-plus' && severity >= 3) reasons.push('Symptoms have persisted for a week or more')
  if (severity >= 6 && input.duringTraining) reasons.push('Moderate-to-severe symptoms during training')

  if (severity >= 8 || (input.trend === 'worsening' && severity >= 5)) {
    return {
      level: 'urgent',
      reasons,
      headline: 'Arrange a prompt professional assessment',
      guidance: [
        'Pause training that provokes the symptom until you have been assessed.',
        'Book an appointment with a sports medicine clinician, physiotherapist or your doctor as soon as possible.',
        'If anything on the red-flag list appears, seek emergency care.',
      ],
      holdTraining: true,
      requiresClinicalReview: true,
    }
  }

  if (reasons.length) {
    return {
      level: 'professional-assessment',
      reasons,
      headline: 'A professional assessment is recommended',
      guidance: [
        'Reduce or modify sessions that provoke the symptom while you arrange an assessment.',
        'Note what makes it better or worse so you can describe it clearly.',
        'EnduraPath cannot tell you what is wrong or when it is safe to resume full training.',
      ],
      holdTraining: false,
      requiresClinicalReview: true,
    }
  }

  return {
    level: 'monitor',
    reasons: ['Mild symptom without red flags'],
    headline: 'Monitor and keep logging',
    guidance: [
      'Keep the plan flexible: ease off any session that makes the symptom worse.',
      'If it persists beyond a week, worsens, or appears at rest, request a professional assessment.',
      'Log how it feels after each session.',
    ],
    holdTraining: false,
    requiresClinicalReview: false,
  }
}

export const TRIAGE_LABELS: Record<TriageLevel, string> = {
  emergency: 'Emergency — seek care now',
  urgent: 'Urgent assessment',
  'professional-assessment': 'Assessment recommended',
  monitor: 'Monitor',
}

/** Escalation text shown whenever a free-text message mentions an emergency-type phrase. */
const EMERGENCY_PATTERNS: RegExp[] = [
  /chest (pain|pressure|tight)/i,
  /\b(faint|fainted|passed out|blacked out)\b/i,
  /can'?t breathe|short(ness)? of breath/i,
  /heart (is )?(racing|pounding)|irregular heart/i,
  /\b(suicid|self[- ]harm|kill myself|end my life)\w*/i,
  /vomit(ing)? blood|cough(ing)? (up )?blood/i,
  /(numb|tingling).*(arm|leg|face)|face droop|slurred speech/i,
]

export function messageNeedsEmergencyEscalation(text: string): boolean {
  return EMERGENCY_PATTERNS.some((re) => re.test(text))
}

export const SELF_HARM_PATTERN = /\b(suicid|self[- ]harm|kill myself|end my life)\w*/i
