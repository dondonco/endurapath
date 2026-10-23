import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RouteError, NotFound } from '@/components/shared/route-error'
import { Spinner } from '@/components/shared/ui'

/** Route-level code splitting keeps the initial bundle (and the Recharts payload) small. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    HydrateFallback: () => <Spinner label="Loading EnduraPath" />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', lazy: async () => ({ Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage }) },
      { path: 'onboarding', lazy: async () => ({ Component: (await import('@/features/onboarding/OnboardingPage')).OnboardingPage }) },
      { path: 'roadmap', lazy: async () => ({ Component: (await import('@/features/roadmap/RoadmapPage')).RoadmapPage }) },
      { path: 'training', lazy: async () => ({ Component: (await import('@/features/training/TrainingPage')).TrainingPage }) },
      { path: 'training/:workoutId', lazy: async () => ({ Component: (await import('@/features/training/WorkoutDetailPage')).WorkoutDetailPage }) },
      { path: 'performance', lazy: async () => ({ Component: (await import('@/features/performance/PerformancePage')).PerformancePage }) },
      { path: 'nutrition', lazy: async () => ({ Component: (await import('@/features/nutrition/NutritionPage')).NutritionPage }) },
      { path: 'recovery', lazy: async () => ({ Component: (await import('@/features/recovery/RecoveryPage')).RecoveryPage }) },
      { path: 'rehab', lazy: async () => ({ Component: (await import('@/features/rehab/RehabPage')).RehabPage }) },
      { path: 'experts', lazy: async () => ({ Component: (await import('@/features/experts/ExpertsPage')).ExpertsPage }) },
      { path: 'experts/:personaId', lazy: async () => ({ Component: (await import('@/features/experts/PersonaPage')).PersonaPage }) },
      { path: 'events', lazy: async () => ({ Component: (await import('@/features/events/EventsPage')).EventsPage }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).SettingsPage }) },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
