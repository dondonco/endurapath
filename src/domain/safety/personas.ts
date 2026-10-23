import type { PersonaId } from '@/domain/models/common'

export interface PersonaDefinition {
  id: PersonaId
  name: string
  role: string
  initials: string
  /** Tailwind-free colour token (CSS var) used by the UI. */
  color: string
  tone: string
  bio: string
  responsibilities: string[]
  boundaries: string[]
  starters: string[]
  /** Short label shown on every message from this persona. */
  disclosure: string
}

const SIM = 'Simulated assistant — not a person, not a live AI model.'

export const PERSONAS: Record<PersonaId, PersonaDefinition> = {
  atlas: {
    id: 'atlas',
    name: 'Coach Atlas',
    role: 'Head Triathlon Coach',
    initials: 'CA',
    color: 'var(--color-accent)',
    tone: 'Calm, analytical, motivating and realistic.',
    bio: 'Coordinates your whole plan: periodisation, weekly structure, intensity and race preparation.',
    responsibilities: [
      'Periodisation and weekly training plans',
      'Swim, bike, run, brick and strength scheduling',
      'Training intensity and workout execution',
      'Race preparation and progression recommendations',
      'Adjustments for availability, missed sessions and fatigue',
    ],
    boundaries: ['Does not give nutrition prescriptions, medical advice or rehabilitation instructions — those go to FuelWise, Dr. Meridian and MotionLab.'],
    starters: ['What is my focus this week?', 'I missed a session — what now?', 'Am I ready to move up a stage?', 'How should I pace a long ride?'],
    disclosure: SIM,
  },
  fuelwise: {
    id: 'fuelwise',
    name: 'FuelWise',
    role: 'Sports Nutritionist',
    initials: 'FW',
    color: 'var(--color-secondary)',
    tone: 'Practical, evidence-informed and nonjudgmental.',
    bio: 'Helps you fuel training, recover well and rehearse race-day nutrition — without diet culture.',
    responsibilities: [
      'Daily nutrition guidance',
      'Pre-, during- and post-workout fueling',
      'Hydration and electrolyte planning',
      'Recovery nutrition',
      'Long-session fueling practice and race-day nutrition preparation',
    ],
    boundaries: ['General educational guidance only; no precise individual prescriptions without a qualified professional. No supplement claims, no restrictive dieting.'],
    starters: ['What should I eat before my next session?', 'How do I practise race-day fueling?', 'Hydration tips for long rides?', 'Best recovery snack ideas?'],
    disclosure: SIM,
  },
  meridian: {
    id: 'meridian',
    name: 'Dr. Meridian',
    role: 'Sports Medicine & Rehabilitation Assistant',
    initials: 'DM',
    color: 'var(--color-danger)',
    tone: 'Precise, cautious, compassionate and clear about uncertainty.',
    bio: 'Helps you recognise warning signs, organise symptom information and coordinate return-to-sport review with real clinicians.',
    responsibilities: [
      'Symptom intake and escalation',
      'Education about clinical warning signs',
      'Organising information for professional assessment',
      'Communicating clinician-provided restrictions',
      'Coordinating return-to-sport review',
    ],
    boundaries: [
      'Not a licensed physician. Cannot diagnose, prescribe treatment or clear you to return to sport.',
      'Clearance only ever comes from a qualified clinician.',
    ],
    starters: ['I have a new pain — what should I do?', 'What are the warning signs I should not ignore?', 'Help me prepare for my appointment', 'What are my current restrictions?'],
    disclosure: SIM,
  },
  motionlab: {
    id: 'motionlab',
    name: 'MotionLab',
    role: 'Sports Physical Therapy Assistant',
    initials: 'ML',
    color: 'var(--color-strength)',
    tone: 'Patient, educational and supportive.',
    bio: 'Shows your clinician-approved exercises, tracks adherence and symptoms, and summarises progress for your care team.',
    responsibilities: [
      'Displaying clinician-approved exercise plans',
      'Exercise adherence and symptom tracking',
      'Movement-quality education',
      'Appropriate modifications within established restrictions',
      'Functional progress summaries for the care team',
    ],
    boundaries: ['Cannot diagnose injuries or invent a rehab protocol for an undiagnosed problem. Works only within a plan a clinician has approved.'],
    starters: ['What are my rehab exercises today?', 'Summarise my progress for my physio', 'How should a calf raise feel?', 'My exercise felt painful — what now?'],
    disclosure: SIM,
  },
}

export const PERSONA_LIST: PersonaDefinition[] = [PERSONAS.atlas, PERSONAS.fuelwise, PERSONAS.meridian, PERSONAS.motionlab]

export function isPersonaId(v: string | undefined): v is PersonaId {
  return v === 'atlas' || v === 'fuelwise' || v === 'meridian' || v === 'motionlab'
}
