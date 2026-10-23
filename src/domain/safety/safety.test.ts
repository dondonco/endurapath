import { describe, expect, it } from 'vitest'
import { messageNeedsEmergencyEscalation, triageSymptom, EMERGENCY_RED_FLAGS, URGENT_RED_FLAGS } from '@/domain/safety/triage'
import { activeRestrictions, combinedEffect, describeEffect, hasTrainingPause, isSportBlocked, validateRestrictionResolution } from '@/domain/safety/restrictions'
import { buildAthleteContext, PERSONA_SCOPES } from '@/domain/safety/agent-context'
import { PERSONA_LIST, PERSONAS, isPersonaId } from '@/domain/safety/personas'
import { simulatedProvider } from '@/services/ai/simulated-provider'
import { makeRestriction, makeState, TODAY } from '@/test/fixtures'

const base = { severity: 2, trend: 'same' as const, atRest: false, duringTraining: false, onset: 'today' as const, redFlags: [] as string[] }

describe('symptom triage', () => {
  it('escalates any emergency red flag to emergency and holds training', () => {
    for (const flag of EMERGENCY_RED_FLAGS) {
      const t = triageSymptom({ ...base, redFlags: [flag] })
      expect(t.level).toBe('emergency')
      expect(t.holdTraining).toBe(true)
      expect(t.guidance.join(' ')).toMatch(/emergency number/i)
    }
  })

  it('escalates any urgent red flag to urgent and holds training', () => {
    for (const flag of URGENT_RED_FLAGS) {
      const t = triageSymptom({ ...base, redFlags: [flag] })
      expect(t.level).toBe('urgent')
      expect(t.holdTraining).toBe(true)
    }
  })

  it('treats severe or rapidly worsening symptoms as urgent', () => {
    expect(triageSymptom({ ...base, severity: 8 }).level).toBe('urgent')
    expect(triageSymptom({ ...base, severity: 5, trend: 'worsening' }).level).toBe('urgent')
  })

  it('recommends professional assessment for persistent or resting symptoms without holding training', () => {
    const t = triageSymptom({ ...base, severity: 4, atRest: true })
    expect(t.level).toBe('professional-assessment')
    expect(t.holdTraining).toBe(false)
    expect(t.requiresClinicalReview).toBe(true)
    expect(triageSymptom({ ...base, severity: 3, onset: 'week-plus' }).level).toBe('professional-assessment')
  })

  it('monitors mild symptoms with no flags', () => {
    expect(triageSymptom(base).level).toBe('monitor')
  })

  it('never states a diagnosis', () => {
    for (const input of [base, { ...base, severity: 9 }, { ...base, redFlags: [EMERGENCY_RED_FLAGS[0]] as string[] }]) {
      const t = triageSymptom(input)
      expect(`${t.headline} ${t.guidance.join(' ')}`).not.toMatch(/you (likely |probably )?(have|are suffering from) (a |an )?(stress fracture|sprain|strain|tendin|tear|injury|fracture)|diagnos(is|ed) (is|as|with)/i)
    }
  })

  it('detects emergency phrases in free text', () => {
    expect(messageNeedsEmergencyEscalation('I have chest pain when I run')).toBe(true)
    expect(messageNeedsEmergencyEscalation('I fainted after the ride')).toBe(true)
    expect(messageNeedsEmergencyEscalation('My legs feel heavy today')).toBe(false)
  })
})

describe('restriction rules', () => {
  it('combines active restrictions into the most conservative effect', () => {
    const e = combinedEffect([
      makeRestriction({ id: 'a', effect: { blockedSports: ['run'], maxIntensity: 'moderate', maxDurationMin: 60 } }),
      makeRestriction({ id: 'b', effect: { blockedSports: ['swim'], maxIntensity: 'easy', maxDurationMin: 45 } }),
      makeRestriction({ id: 'c', status: 'resolved', effect: { blockedSports: ['bike'], pauseAllTraining: true } }),
    ])
    expect(e.blockedSports.sort()).toEqual(['run', 'swim'])
    expect(e.maxIntensity).toBe('easy')
    expect(e.maxDurationMin).toBe(45)
    expect(e.pauseAllTraining).toBeUndefined()
  })

  it('blocks bricks when running or cycling is blocked, but always allows rehab', () => {
    expect(isSportBlocked('brick', [makeRestriction({ effect: { blockedSports: ['run'] } })])).toBe(true)
    expect(isSportBlocked('rehab', [makeRestriction({ effect: { blockedSports: ['run'] } })])).toBe(false)
    expect(isSportBlocked('swim', [makeRestriction({ effect: { blockedSports: ['run'] } })])).toBe(false)
  })

  it('a pause blocks everything except rehab', () => {
    const r = [makeRestriction({ severity: 'pause', effect: { blockedSports: [], pauseAllTraining: true } })]
    expect(hasTrainingPause(r)).toBe(true)
    expect(isSportBlocked('swim', r)).toBe(true)
    expect(isSportBlocked('rehab', r)).toBe(false)
    expect(describeEffect(r[0].effect)).toMatch(/paused/i)
  })

  it('only lists active restrictions', () => {
    expect(activeRestrictions([makeRestriction(), makeRestriction({ id: 'x', status: 'resolved' })])).toHaveLength(1)
  })

  it('requires a named clinician and a note to record a restriction as lifted', () => {
    expect(validateRestrictionResolution({ restrictionId: 'r', clinicianName: '', note: 'fine' }).ok).toBe(false)
    expect(validateRestrictionResolution({ restrictionId: 'r', clinicianName: 'Dr X', note: '' }).ok).toBe(false)
    expect(validateRestrictionResolution({ restrictionId: 'r', clinicianName: 'Dr X', note: 'Cleared for easy runs' }).ok).toBe(true)
  })
})

describe('shared agent context and persona scopes', () => {
  const state = {
    ...makeState({ restrictions: [makeRestriction()] }),
    medical: { restrictions: [makeRestriction()], symptoms: [], rehabPlans: [], rehabLogs: [] },
  }

  it('gives every persona the approved restrictions', () => {
    for (const p of PERSONA_LIST) expect(buildAthleteContext(state, p.id, TODAY)?.restrictions?.length).toBe(1)
  })

  it('shares medical subtrees (symptoms, rehab) only with the two clinical personas', () => {
    expect(PERSONA_SCOPES.atlas).not.toContain('symptoms')
    expect(PERSONA_SCOPES.atlas).not.toContain('rehab')
    expect(PERSONA_SCOPES.fuelwise).not.toContain('symptoms')
    expect(PERSONA_SCOPES.fuelwise).not.toContain('rehab')
    expect(PERSONA_SCOPES.meridian).toEqual(expect.arrayContaining(['symptoms', 'rehab']))
    expect(PERSONA_SCOPES.motionlab).toEqual(expect.arrayContaining(['symptoms', 'rehab']))
    expect(buildAthleteContext(state, 'atlas', TODAY)).not.toHaveProperty('symptoms')
    expect(buildAthleteContext(state, 'fuelwise', TODAY)).not.toHaveProperty('rehab')
  })

  it('only exposes nutrition preferences to personas that need them', () => {
    expect(PERSONA_SCOPES.meridian).not.toContain('nutrition')
    expect(PERSONA_SCOPES.motionlab).not.toContain('nutrition')
  })

  it('returns null when there is no athlete', () => {
    expect(buildAthleteContext({ ...state, athlete: null }, 'atlas', TODAY)).toBeNull()
  })

  it('defines four distinct personas with boundaries and a simulated disclosure', () => {
    expect(PERSONA_LIST).toHaveLength(4)
    expect(new Set(PERSONA_LIST.map((p) => p.name)).size).toBe(4)
    for (const p of PERSONA_LIST) {
      expect(p.boundaries.length).toBeGreaterThan(0)
      expect(p.disclosure).toMatch(/simulated/i)
    }
    expect(isPersonaId('atlas')).toBe(true)
    expect(isPersonaId('nobody')).toBe(false)
    expect(PERSONAS.meridian.boundaries.join(' ')).toMatch(/cannot|does not|not/i)
  })
})

describe('simulated persona replies', () => {
  const ctx = (p: 'atlas' | 'fuelwise' | 'meridian' | 'motionlab') => buildAthleteContext(makeState(), p, TODAY)
  const ask = (personaId: 'atlas' | 'fuelwise' | 'meridian' | 'motionlab', message: string) => simulatedProvider.reply({ personaId, message, history: [], context: ctx(personaId) })

  it('is honest that it is simulated and not live', async () => {
    expect(simulatedProvider.isLive).toBe(false)
    for (const p of PERSONA_LIST) {
      const r = await ask(p.id, 'hello')
      expect(r.source).toBe('simulated')
      expect(r.text).toMatch(/simulated/i)
    }
  })

  it('Dr. Meridian refuses to clear the athlete to return to sport', async () => {
    const r = await ask('meridian', 'Am I cleared to run again?')
    expect(r.text).toMatch(/cannot clear you/i)
    expect(r.text).toMatch(/not a licensed physician/i)
  })

  it('Dr. Meridian does not diagnose', async () => {
    const r = await ask('meridian', 'My knee hurts, what do I have?')
    expect(r.text).toMatch(/can.t diagnose/i)
    expect(r.safetyLevel).toBe('professional-assessment')
  })

  it('MotionLab will not invent a rehab protocol', async () => {
    const r = await ask('motionlab', 'Please design a program for my sore hip')
    expect(r.text).toMatch(/can.t diagnose|design a rehabilitation protocol/i)
  })

  it('routes out-of-scope questions to the right persona', async () => {
    expect((await ask('atlas', 'What should I eat before a race?')).actions?.[0].to).toBe('/experts/fuelwise')
    expect((await ask('fuelwise', 'Design my interval workout')).actions?.[0].to).toBe('/experts/atlas')
    expect((await ask('atlas', 'My ankle is swollen')).actions?.[0].to).toBe('/experts/meridian')
  })

  it('FuelWise discourages restrictive diets and forced fluids', async () => {
    expect((await ask('fuelwise', 'Should I do a detox to lose weight?')).text).toMatch(/do not recommend restrictive diets/i)
    expect((await ask('fuelwise', 'How much should I drink?')).text).toMatch(/drink to thirst/i)
  })

  it('escalates emergency language in every persona', async () => {
    for (const p of PERSONA_LIST) {
      const r = await ask(p.id, 'I have chest pain right now')
      expect(r.safetyLevel).toBe('emergency')
      expect(r.text).toMatch(/emergency number/i)
    }
  })

  it('responds to self-harm language with crisis guidance', async () => {
    const r = await ask('atlas', 'I want to end my life')
    expect(r.safetyLevel).toBe('emergency')
    expect(r.text).toMatch(/crisis|emergency/i)
  })
})
