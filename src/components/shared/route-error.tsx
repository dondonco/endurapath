import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Link, useRouteError } from 'react-router-dom'
import { Button, Card, CardBody, LinkButton } from './ui'

/** Generic copy only — details are logged to the console, never shown to the user. */
export function RouteError() {
  const err = useRouteError()
  console.error('Route error', err)
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardBody className="space-y-4 text-center">
          <AlertTriangle className="mx-auto size-8 text-warn" aria-hidden />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted">This page hit an unexpected problem. Your saved data was not changed.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <LinkButton to="/dashboard" variant="outline">
              Go to dashboard
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-semibold text-accent">404</p>
      <h2 className="mt-3 text-lg font-semibold">That page does not exist</h2>
      <p className="mt-1 text-sm text-muted">The link may be out of date.</p>
      <Link to="/dashboard" className="mt-5 inline-block text-sm text-accent underline underline-offset-2">
        Back to dashboard
      </Link>
    </div>
  )
}

interface BoundaryState {
  failed: boolean
}
/** Local boundary so one failing widget (e.g. a chart) never blanks the whole page. */
export class WidgetBoundary extends Component<{ children: ReactNode; label?: string }, BoundaryState> {
  override state: BoundaryState = { failed: false }
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Widget error', error, info.componentStack)
  }
  override render() {
    if (this.state.failed)
      return (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn/8 px-4 py-3 text-sm text-muted">
          {this.props.label ?? 'This section'} could not be displayed. The rest of the page still works.
        </div>
      )
    return this.props.children
  }
}
