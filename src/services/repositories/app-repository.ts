import type { AppState, MedicalData } from '@/domain/models/state'

/**
 * Storage port. The prototype ships a browser-storage adapter; a production build would implement this
 * interface against an authenticated, server-authorised API (see README → "Connecting a real backend").
 */
export interface AppRepository {
  readonly kind: 'local-browser' | 'memory' | 'remote'
  load(): AppState | null
  save(state: AppState): void
  clear(): void
}

export const GENERAL_KEY = 'endurapath.v1.general'
export const MEDICAL_KEY = 'endurapath.v1.medical'

type Stored = Omit<AppState, 'medical'>

/**
 * localStorage adapter. LIMITATIONS (documented, not hidden):
 *  - Data is stored unencrypted in the browser profile; any script on this origin can read it.
 *  - It is NOT secure medical-data storage and must not hold real health information in production.
 *  - No sync, no backup, no audit log, no retention policy; clearing site data deletes everything.
 * Medical data is kept under a separate key so it can be wiped or gated independently of training data.
 */
export class LocalStorageRepository implements AppRepository {
  readonly kind = 'local-browser' as const
  private readonly storage: Storage
  constructor(storage: Storage = globalThis.localStorage) {
    this.storage = storage
  }

  load(): AppState | null {
    try {
      const general = this.storage.getItem(GENERAL_KEY)
      if (!general) return null
      const parsed = JSON.parse(general) as Stored
      const medicalRaw = this.storage.getItem(MEDICAL_KEY)
      const medical: MedicalData = medicalRaw
        ? (JSON.parse(medicalRaw) as MedicalData)
        : { restrictions: [], symptoms: [], rehabPlans: [], rehabLogs: [] }
      return { ...parsed, medical }
    } catch {
      return null
    }
  }

  save(state: AppState): void {
    const { medical, ...general } = state
    this.storage.setItem(GENERAL_KEY, JSON.stringify(general))
    this.storage.setItem(MEDICAL_KEY, JSON.stringify(medical))
  }

  clear(): void {
    this.storage.removeItem(GENERAL_KEY)
    this.storage.removeItem(MEDICAL_KEY)
  }
}

export class MemoryRepository implements AppRepository {
  readonly kind = 'memory' as const
  private state: AppState | null = null
  load(): AppState | null {
    return this.state
  }
  save(state: AppState): void {
    this.state = state
  }
  clear(): void {
    this.state = null
  }
}
