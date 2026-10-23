import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemoState } from '@/data/demo/demo-athlete'
import type { AppState } from '@/domain/models/state'
import { SCHEMA_VERSION } from '@/domain/models/state'
import { ensureHorizonOp, isError, type Env, type OpError } from '@/domain/operations/app-ops'
import { toISODate, type ISODate } from '@/lib/dates'
import { LocalStorageRepository, type AppRepository } from '@/services/repositories/app-repository'
import { useToast } from './toast'

export interface AppStore {
  state: AppState
  today: ISODate
  repository: AppRepository
  storageError: string | null
  /** Runs a pure operation against the latest state. Errors are returned (and optionally toasted), never thrown. */
  run: <T extends AppState | OpError>(op: (s: AppState, env: Env) => T, opts?: { toastError?: boolean; success?: string }) => T
  /** For operations returning extra data alongside the new state. */
  runWith: <R extends { state: AppState }>(op: (s: AppState, env: Env) => R | OpError, opts?: { toastError?: boolean; success?: string }) => R | OpError
  replaceState: (next: AppState) => void
  loadSample: () => void
  env: () => Env
}

const Ctx = createContext<AppStore | null>(null)

function clock(): Env {
  const d = new Date()
  return { now: d.toISOString(), today: toISODate(d) }
}

function initialState(repo: AppRepository): AppState {
  const loaded = repo.load()
  const { now, today } = clock()
  if (loaded && loaded.schemaVersion === SCHEMA_VERSION) return ensureHorizonOp(loaded, { now, today })
  return buildDemoState(today, now)
}

export function AppStoreProvider({ children, repository, initial }: { children: ReactNode; repository?: AppRepository; initial?: AppState }) {
  const repo = useMemo<AppRepository>(() => repository ?? new LocalStorageRepository(), [repository])
  const [state, setState] = useState<AppState>(() => initial ?? initialState(repo))
  const stateRef = useRef(state)
  const [storageError, setStorageError] = useState<string | null>(null)
  const toast = useToast()
  const [today, setToday] = useState<ISODate>(() => clock().today)

  useEffect(() => {
    stateRef.current = state
    try {
      repo.save(state)
      setStorageError(null)
    } catch {
      setStorageError('Browser storage is full or unavailable, so your latest changes may not be saved.')
    }
  }, [state, repo])

  // Roll the "today" clock over at midnight and when the tab regains focus.
  useEffect(() => {
    const tick = () => {
      const t = clock()
      setToday((prev) => {
        if (prev === t.today) return prev
        setState((s) => ensureHorizonOp(s, t))
        return t.today
      })
    }
    const id = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const commit = useCallback((next: AppState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const run = useCallback<AppStore['run']>(
    (op, opts) => {
      const env = clock()
      const res = op(stateRef.current, env)
      if (isError(res)) {
        if (opts?.toastError !== false) toast.error(res.error)
        return res
      }
      commit(res as AppState)
      if (opts?.success) toast.success(opts.success)
      return res
    },
    [commit, toast],
  )

  const runWith = useCallback<AppStore['runWith']>(
    (op, opts) => {
      const env = clock()
      const res = op(stateRef.current, env)
      if (isError(res)) {
        if (opts?.toastError !== false) toast.error(res.error)
        return res
      }
      commit(res.state)
      if (opts?.success) toast.success(opts.success)
      return res
    },
    [commit, toast],
  )

  const loadSample = useCallback(() => {
    const e = clock()
    commit(buildDemoState(e.today, e.now))
  }, [commit])

  const value = useMemo<AppStore>(
    () => ({ state, today, repository: repo, storageError, run, runWith, replaceState: commit, loadSample, env: clock }),
    [state, today, repo, storageError, run, runWith, commit, loadSample],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppStore {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside <AppStoreProvider>')
  return v
}
