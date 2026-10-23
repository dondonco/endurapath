import { RouterProvider } from 'react-router-dom'
import { useMemo, type ReactNode } from 'react'
import { ConfirmProvider } from '@/components/shared/dialog'
import { AppStoreProvider } from './store'
import { createRouter } from './router'
import { ToastProvider } from './toast'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppStoreProvider>{children}</AppStoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export function AppRoot() {
  const router = useMemo(() => createRouter(), [])
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
