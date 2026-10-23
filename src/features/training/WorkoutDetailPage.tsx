import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Droplets, Flame, Timer } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, Notice } from '@/components/shared/ui'
import { RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { IntensityBadge, SportIcon, StatusBadge, SPORT_META, targetSummary, workoutMeta } from '@/components/shared/workout-bits'
import { PHASE_LABELS } from '@/domain/models/common'
import { resultFor } from '@/domain/analytics/selectors'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatDistance, formatDuration } from '@/lib/units'
import { useUnits } from '@/hooks/use-units'
import { WorkoutActions } from './WorkoutActions'
import { ChangeHistory } from './TrainingPage'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <p className="whitespace-pre-line text-sm text-fg">{children}</p>
    </section>
  )
}

function DetailContent() {
  const { workoutId } = useParams()
  const { state, today } = useApp()
  const units = useUnits()
  const w = state.workouts.find((x) => x.id === workoutId)
  const result = w ? resultFor(state, w.id) : undefined
  const changes = useMemo(() => state.changes.filter((c) => (w ? c.workoutIds.includes(w.id) : false)), [state.changes, w])
  const phase = w ? state.plan?.phases.find((p) => p.id === w.phaseId) : undefined
  const logs = w ? state.fuelingLogs.filter((l) => l.workoutId === w.id) : []

  if (!w)
    return (
      <EmptyState
        title="Workout not found"
        body="It may have been removed when the plan was rebuilt. Completed sessions are always kept — check the calendar."
        action={
          <LinkButton to="/training" variant="outline" size="sm">
            Back to calendar
          </LinkButton>
        }
      />
    )

  const meta = SPORT_META[w.sport]
  const pl = result?.planned

  return (
    <div className="space-y-6">
      <Link to="/training" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Calendar
      </Link>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-elevated">
                <SportIcon sport={w.sport} className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">{w.title}</h2>
                <p className="text-sm text-muted">
                  {meta.label} · {formatDate(w.date, 'EEEE d MMMM yyyy')} · {workoutMeta(w, units)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <IntensityBadge intensity={w.intensity} />
              <StatusBadge w={w} today={today} />
              {w.isKey && <Badge tone="accent">Key session</Badge>}
              {w.modified && <Badge tone="secondary">Modified</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted">
            Stage {w.stage} · {PHASE_LABELS[w.phaseType]} phase{phase ? ` (${phase.focus})` : ''}
            {w.originalDate !== w.date ? ` · originally ${formatDate(w.originalDate)}` : ''}
          </p>
          {w.restrictionNote && (
            <Notice tone="warn" title="Shaped by a clinical restriction">
              <p>{w.restrictionNote}</p>
            </Notice>
          )}
          {w.status === 'skipped' && w.statusReason && <Notice tone="info">Skipped — {w.statusReason}</Notice>}
          {w.originalSnapshot && (
            <Notice tone="info" title="Changed from the original plan">
              <p>
                Originally “{w.originalSnapshot.title}” — {formatDuration(w.originalSnapshot.durationMin)}, {w.originalSnapshot.intensity}, {formatDate(w.originalSnapshot.date)}.
              </p>
            </Notice>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Session" icon={<Timer className="size-4" />} />
            <CardBody className="space-y-5">
              <div className="rounded-lg border border-line bg-base p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Intensity target</p>
                <p className="mt-1 text-sm font-medium text-fg">{targetSummary(w, units)}</p>
                <p className="mt-0.5 text-sm text-muted">{w.target.description}</p>
                {w.target.zone && <p className="mt-0.5 text-xs text-muted">Zone: {w.target.zone}</p>}
              </div>
              <Block title="Purpose">{w.purpose}</Block>
              <Block title="Warm-up">{w.warmup}</Block>
              <Block title="Main set">{w.mainSet}</Block>
              <Block title="Cool-down">{w.cooldown}</Block>
              <Block title="Coaching notes">{w.coachingNotes}</Block>
              <p className="text-xs text-muted">Coach Atlas (simulated rules) wrote this session from your plan. It is general training guidance, not medical advice.</p>
            </CardBody>
          </Card>

          {w.fueling && w.fueling.level !== 'none' && (
            <Card>
              <CardHeader title="Fueling guidance" icon={<Flame className="size-4" />} action={<Badge tone={w.fueling.source === 'professional' ? 'secondary' : 'neutral'}>{w.fueling.source === 'professional' ? 'Set by a professional' : 'General education'}</Badge>} />
              <CardBody className="space-y-4">
                <p className="text-sm text-fg">{w.fueling.summary}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Block title="Before">{w.fueling.before}</Block>
                  <Block title="During">{w.fueling.during}</Block>
                  <Block title="After">{w.fueling.after}</Block>
                </div>
                {w.fueling.carbsPerHour && (
                  <p className="text-sm text-muted">
                    Reference carbohydrate range: <strong className="text-fg">{w.fueling.carbsPerHour.min}–{w.fueling.carbsPerHour.max} g/h</strong>
                  </p>
                )}
                <p className="flex items-start gap-2 text-sm text-muted">
                  <Droplets className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden /> {w.fueling.fluidNote}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <Link to="/nutrition" className="text-accent hover:underline">
                    Log fueling for this session
                  </Link>
                  {logs.length > 0 && <span>{logs.length} fueling log{logs.length > 1 ? 's' : ''} recorded</span>}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Change history for this session" />
            <ChangeHistory changes={changes} limit={6} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={w.status === 'completed' ? 'Your result' : 'Actions'} />
            <CardBody className="space-y-4">
              {result ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Planned</dt>
                    <dd className="font-medium">{formatDuration(pl?.durationMin ?? w.durationMin)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Actual</dt>
                    <dd className="font-medium text-accent">{formatDuration(result.actualDurationMin)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Perceived effort</dt>
                    <dd className="font-medium">RPE {result.rpe}/10</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Feeling</dt>
                    <dd className="font-medium">{result.feeling ? `${result.feeling}/5` : '—'}</dd>
                  </div>
                  {result.actualDistanceM ? (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">Distance</dt>
                      <dd className="font-medium">{formatDistance(result.actualDistanceM, w.sport === 'brick' ? 'bike' : w.sport, units)}</dd>
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <dt className="text-xs text-muted">Completed</dt>
                    <dd>{formatDate(result.completedOn, 'EEE d MMM yyyy')}</dd>
                  </div>
                  {result.notes && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">Notes</dt>
                      <dd className="text-muted">{result.notes}</dd>
                    </div>
                  )}
                  {result.symptomsNoted && (
                    <div className="col-span-2">
                      <Notice tone="warn">
                        <p>
                          You noted symptoms.{' '}
                          <Link to="/rehab" className="text-accent underline">
                            Report them
                          </Link>
                          .
                        </p>
                      </Notice>
                    </div>
                  )}
                </dl>
              ) : null}
              <WorkoutActions workout={w} />
              <p className="text-[11px] text-muted">Last updated {formatDateTime(w.updatedAt)}</p>
            </CardBody>
          </Card>
        </div>
      </div>
      <SafetyFooter />
    </div>
  )
}

export function WorkoutDetailPage() {
  return (
    <RequireOnboarded>
      <DetailContent />
    </RequireOnboarded>
  )
}
