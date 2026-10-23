import type { PersonaId } from '@/domain/models/common'
import type { PersonaMessage, TriageLevel } from '@/domain/models/health'
import type { AthleteContext } from '@/domain/safety/agent-context'

export interface PersonaRequest {
  personaId: PersonaId
  message: string
  history: Pick<PersonaMessage, 'role' | 'text'>[]
  /** Already scoped to what this persona is permitted to see. */
  context: AthleteContext | null
}

export interface PersonaReply {
  text: string
  source: 'simulated' | 'live-ai'
  safetyLevel?: TriageLevel
  actions?: { label: string; to: string }[]
}

/**
 * Port for any assistant implementation. The prototype ships ONE provider (`SimulatedPersonaProvider`).
 * To connect a real model, implement this interface on the server side, enforce the same persona
 * boundaries in the system prompt, apply `PERSONA_SCOPES` before building the prompt, and keep
 * `isLive` truthful. The UI labels replies from `source`, never from assumptions.
 */
export interface PersonaProvider {
  readonly id: string
  readonly label: string
  /** True only when a real model produced the reply. */
  readonly isLive: boolean
  reply(req: PersonaRequest): Promise<PersonaReply>
}
