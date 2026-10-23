import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, CardBody, LinkButton, Notice } from '@/components/shared/ui'
import { useApp } from '@/app/store'
import { Dumbbell } from 'lucide-react'

export function PageIntro({ title, children, actions }: { title?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Shown on any page that needs a plan when the user has no athlete yet (e.g. after erasing data). */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { state, loadSample } = useApp()
  if (state.onboarded && state.athlete && state.plan && state.availability) return <>{children}</>
  return (
    <Card className="mx-auto mt-8 max-w-xl">
      <CardBody className="space-y-4 text-center">
        <Dumbbell className="mx-auto size-8 text-accent" aria-hidden />
        <h2 className="text-lg font-semibold">Let’s build your plan</h2>
        <p className="text-sm text-muted">There is no athlete profile on this device yet. Complete onboarding to generate a personalised, progression-based plan — or explore with clearly labelled sample data.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton to="/onboarding" variant="primary">
            Start onboarding
          </LinkButton>
          <Button variant="outline" onClick={loadSample}>
            Load sample athlete
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

export function SafetyFooter({ children }: { children?: ReactNode }) {
  return (
    <Notice tone="info" className="mt-8">
      {children ?? (
        <p>
          EnduraPath provides general educational guidance and <strong>simulated</strong> assistant responses. It is not medical care and cannot diagnose, treat or clear you to train or race. For concerning symptoms see{' '}
          <Link to="/rehab" className="text-accent underline underline-offset-2">
            Rehab & restrictions
          </Link>
          ; in an emergency call your local emergency number.
        </p>
      )}
    </Notice>
  )
}
