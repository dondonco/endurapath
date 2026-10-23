import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ConfirmProvider } from '@/components/shared/dialog'
import { AppStoreProvider } from '@/app/store'
import { routes } from '@/app/router'
import { ToastProvider } from '@/app/toast'
import type { AppState } from '@/domain/models/state'
import { MemoryRepository } from '@/services/repositories/app-repository'
import { NOW } from './fixtures'

/** The store reads the real clock, so UI tests pin only `Date` to the fixture date (timers keep running). */
export function pinClock(now = NOW) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) })
}
export function unpinClock() {
  vi.useRealTimers()
}

/** Renders the real route tree with an in-memory repository, so nothing touches browser storage. */
export function renderApp(initial: AppState, path = '/dashboard') {
  const repository = new MemoryRepository()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(
    <ToastProvider>
      <ConfirmProvider>
        <AppStoreProvider repository={repository} initial={initial}>
          <RouterProvider router={router} />
        </AppStoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
  )
  return { ...utils, router, repository }
}
