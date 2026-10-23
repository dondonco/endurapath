import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Gauge, ShieldAlert, XCircle } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, LinkButton, Notice, ProgressBar } from '@/components/shared/ui'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { useConfirm } from '@/components/shared/dialog'
import { acceptProgressionOp, isError, runReadinessOp } from '@/domain/operations/app-ops'
import { milestonesFor, stageProgress } from '@/domain/analytics/selectors'
import { OUTCOME_LABELS, READINESS_DISCLAIMER } from '@/domain/readiness/readiness'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/training-engine/config'
import { activeRestrictions } from '@/domain/safety/restrictions'
import { PHASE_LABELS, STAGE_IDS, type StageId } from '@/domain/models/common'
import type { ReadinessAssessment, ReadinessOutcome } from '@/domain/models/health'
import { addDaysISO, formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const OUTCOME_TONE: Record<ReadinessOutcome, 'accent' | 'secondary' | 'warn' | 'danger'> = { progress: 'accent', continue: 'secondary', reduce: 'warn', 'clinical-review': 'danger' }
const STATUS_TONE = { completed: 'accent', current: 'accent', upcoming: 'secondary', 'not-needed': 'neutral', 'beyond-goal': 'neutral' } as const

function AssessmentView({ a, onAccept }: { a: ReadinessAssessment; onAccept?: () => void }) {
  const tone = OUTCOME_TONE[a.outcome]
  return (
    <div className="space-y-5" data-testid="assessment">
      <div className={cn('rounded-lg border p-4', tone === 'danger' ? 'border-danger/50 bg-danger/10' : tone === 'warn' ? 'border-warn/40 bg-warn/8' : 'border-accent/30 bg-accent/8')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{OUTCOME_LABELS[a.outcome]}</h3>
          <div className="flex items-center gap-2">
            <Badge tone={tone}>Score {a.score}/100</Badge>
            <Badge tone="neutral">Confidence: {a.confidence}</Badge>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Stage {a.stage}
          {a.nextStage ? ` → Stage ${a.nextStage}` : ''} · as of {formatDate(a.asOf, 'd MMM yyyy')}
        </p>
        {a.overrides.length > 0 && (
          <div className="mt-3 rounded-md border border-danger/40 bg-base/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <ShieldAlert className="size-4" aria-hidden /> A safety rule overrides the score
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {a.overrides.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3">
          <p className="text-sm font-medium text-fg">Why</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {a.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h4 className="mb-2 text-sm font-semibold">Gates (all must pass to progress)</h4>
          <ul className="space-y-2">
            {a.gates.map((g) => (
              <li key={g.id} className="flex gap-2.5 rounded-lg border border-line bg-base px-3 py-2">
                {g.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Passed" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Not passed" />}
                <div>
                  <p className="text-sm font-medium text-fg">{g.label}</p>
                  <p className="text-xs text-muted">{g.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="mb-2 text-sm font-semibold">Weighted factors</h4>
          <ul className="space-y-2.5">
            {a.factors.map((f) => (
              <li key={f.id} className="rounded-lg border border-line bg-base px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-fg">{f.label}</span>
                  <span className="tabular-nums text-muted">{f.score === null ? 'no data' : `${f.score}/100`} · weight {Math.round(f.weight * 100)}%</span>
                </div>
                <ProgressBar className="mt-1.5" value={f.score ?? 0} label={`${f.label} score`} tone={f.score === null ? 'warn' : 'accent'} />
                <p className="mt-1 text-xs text-muted">{f.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {a.nextSteps.length > 0 && (
        <section>
          <h4 className="mb-1 text-sm font-semibold">Suggested next steps</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
            {a.nextSteps.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {a.outcome === 'progress' && a.nextStage && onAccept && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/8 p-4">
          <p className="max-w-xl text-sm text-muted">Progression is your decision. Accepting rebuilds future sessions for Stage {a.nextStage}; everything you have completed stays in your history.</p>
          <Button variant="primary" onClick={onAccept}>
            Accept progression to Stage {a.nextStage}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">{READINESS_DISCLAIMER}</p>
    </div>
  )
}

function RoadmapContent() {
  const { state, today, runWith, run } = useApp()
  const confirm = useConfirm()
  const plan = state.plan!
  const [busy, setBusy] = useState(false)
  const latest = state.assessments[0]
  const [shown, setShown] = useState<ReadinessAssessment | null>(null)
  const assessment = shown ?? latest
  const milestones = useMemo(() => milestonesFor(state), [state])
  const prog = useMemo(() => stageProgress(state, today), [state, today])
  const restrictions = activeRestrictions(state.medical.restrictions)
  const phases = plan.phases.filter((p) => p.stage === plan.currentStage)
  const currentWeek = plan.weeks.find((w) => w.weekStart <= today && today <= addDaysISO(w.weekStart, 6))
  const cfg = DEFAULT_ENGINE_CONFIG

  const runReview = () => {
    setBusy(true)
    const res = runWith((s, e) => runReadinessOp(s, e), { success: 'Readiness review complete.' })
    if (!isError(res)) setShown(res.assessment)
    setBusy(false)
  }

  const accept = async () => {
    if (!assessment?.nextStage) return
    const ok = await confirm({
      title: `Move to Stage ${assessment.nextStage}?`,
      body: (
        <p>
          Your future sessions will be rebuilt for Stage {assessment.nextStage}. Completed sessions and results stay in your history. This decision is logged. You can still ask Coach Atlas to hold you back later.
        </p>
      ),
      confirmLabel: 'Accept progression',
      tone: 'primary',
    })
    if (ok) {
      const res = run((s, e) => acceptProgressionOp(s, e), { success: `Now on Stage ${assessment.nextStage}.` })
      if (!isError(res)) setShown(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Your progression roadmap">
        Progression is <strong className="text-fg">earned through consistent preparation</strong>, not by counting weeks. Preparation ranges are illustrative and configurable; you may need more time than shown.
      </PageIntro>

      {plan.warnings.length > 0 && (
        <Notice tone="warn" title="Plan notes">
          <ul className="list-disc space-y-1 pl-5">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <section aria-label="Stages" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGE_IDS.map((id: StageId) => {
          const p = plan.pathway.find((x) => x.stage === id)
          const s = cfg.stages[id]
          const isCurrent = id === plan.currentStage
          return (
            <Card key={id} className={cn(isCurrent && 'border-accent/60')}>
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Stage {id}</span>
                  <Badge tone={p ? STATUS_TONE[p.status] : 'neutral'}>{isCurrent ? 'current' : (p?.status ?? 'n/a').replace('-', ' ')}</Badge>
                </div>
                <h3 className="text-sm font-semibold">{s.label}</h3>
                <p className="text-xs text-muted">{s.description}</p>
                <p className="text-xs text-muted">
                  Illustrative range: {s.minWeeks}–{s.maxWeeks}+ weeks
                  {p && (p.status === 'current' || p.status === 'upcoming') && (
                    <>
                      <br />
                      <span className="text-fg">
                        Estimate for you: {p.estimatedMinWeeks}–{p.estimatedMaxWeeks}+ weeks
                      </span>
                    </>
                  )}
                </p>
                {p && <p className="text-xs text-muted">{p.reason}</p>}
              </CardBody>
            </Card>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`Stage ${plan.currentStage} — where you are`} subtitle={currentWeek ? `Week ${currentWeek.weekInStage} · ${PHASE_LABELS[currentWeek.phaseType]}${currentWeek.isRecoveryWeek ? ' (recovery week)' : ''}` : undefined} />
          <CardBody className="space-y-5">
            {prog && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>
                    {prog.elapsedWeeks} of {prog.totalWeeks} planned weeks elapsed
                  </span>
                  <span>
                    Key sessions: {prog.keyDone}/{prog.keyDue}
                  </span>
                </div>
                <ProgressBar value={prog.pct} label="Stage progress" />
              </div>
            )}
            <div>
              <h4 className="mb-2 text-sm font-semibold">Phases in this stage</h4>
              {phases.length === 0 ? (
                <p className="text-sm text-muted">No phases scheduled.</p>
              ) : (
                <ol className="space-y-1.5">
                  {phases.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-base px-3 py-2 text-sm">
                      <span className="font-medium">{PHASE_LABELS[p.type]}</span>
                      <span className="text-xs text-muted">
                        {formatDate(p.startDate, 'd MMM')} – {formatDate(p.endDate, 'd MMM')} · {p.weekCount} wk
                      </span>
                      <span className="w-full text-xs text-muted">{p.focus}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Prerequisite milestones for later stages</h4>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted">No further capacity milestones.</p>
              ) : (
                <ul className="space-y-1.5">
                  {milestones.map((m) => (
                    <li key={m.id} className="flex items-start gap-2.5 rounded-lg border border-line bg-base px-3 py-2">
                      {m.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Met" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Not yet met" />}
                      <div>
                        <p className="text-sm text-fg">
                          <span className="mr-2 text-xs text-muted">Stage {m.stage}</span>
                          {m.label}
                        </p>
                        <p className="text-xs text-muted">{m.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">Capacity counts only sessions that felt manageable (RPE ≤ 7), so one hard effort never "unlocks" a stage.</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Readiness review" subtitle="Transparent and explainable" icon={<Gauge className="size-4" />} />
          <CardBody className="space-y-4">
            <p className="text-sm text-muted">Checks consistency, completed prep sessions, comfortable capacity, recovery, symptoms and restrictions, fueling practice, available time and race requirements.</p>
            {restrictions.length > 0 && (
              <Notice tone="danger" title="Active restriction">
                <p>{restrictions.length} active restriction{restrictions.length > 1 ? 's' : ''} will take precedence over any score.</p>
              </Notice>
            )}
            <Button variant="primary" className="w-full" onClick={runReview} disabled={busy}>
              Run readiness review
            </Button>
            {latest && <p className="text-xs text-muted">Last run {formatDate(latest.asOf, 'd MMM yyyy')}. {state.assessments.length} review{state.assessments.length > 1 ? 's' : ''} on record.</p>}
            <div className="border-t border-line pt-3 text-xs text-muted">
              <p className="font-medium text-fg">Rule weights (configurable)</p>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(cfg.readiness.weights).map(([k, w]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k.replace(/-/g, ' ')}</span>
                    <span className="tabular-nums">{Math.round(w * 100)}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2">Progress needs a score ≥ {cfg.readiness.progressThreshold} <em>and</em> every gate.</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <section aria-label="Latest readiness review">
        {assessment ? (
          <Card>
            <CardHeader title="Readiness result" subtitle={assessment === latest ? 'Most recent review' : 'Review'} />
            <CardBody>
              <AssessmentView a={assessment} onAccept={assessment === latest ? accept : undefined} />
            </CardBody>
          </Card>
        ) : (
          <EmptyState icon={<Gauge className="size-6" />} title="No readiness review yet" body="Run a review to see whether to progress, continue, reduce load or seek clinical review — with every reason shown." />
        )}
      </section>

      {state.assessments.length > 1 && (
        <Card>
          <CardHeader title="Review history" />
          <ul className="divide-y divide-line">
            {state.assessments.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>{formatDate(a.asOf, 'd MMM yyyy')}</span>
                <span className="text-muted">Stage {a.stage}</span>
                <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABELS[a.outcome]}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setShown(a)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <LinkButton to="/training" variant="outline">
          Open calendar
        </LinkButton>
        <LinkButton to="/onboarding" variant="outline">
          Edit goal or availability
        </LinkButton>
      </div>
      <SafetyFooter />
    </div>
  )
}

export function RoadmapPage() {
  return (
    <RequireOnboarded>
      <RoadmapContent />
    </RequireOnboarded>
  )
}
