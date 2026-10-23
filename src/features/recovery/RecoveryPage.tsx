import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Notice, Stat } from '@/components/shared/ui'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { WidgetBoundary } from '@/components/shared/route-error'
import { CHART_COLORS, ChartCard, NoChartData, axisProps, legendStyle, tooltipStyle } from '@/components/charts/chart-kit'
import { addCheckInOp, isError } from '@/domain/operations/app-ops'
import { explainRecovery, recoveryTrend } from '@/domain/analytics/selectors'
import { formatDate } from '@/lib/dates'
import { CheckInForm } from '@/features/recovery/CheckInForm'

function RecoveryContent() {
  const { state, today, run } = useApp()
  const [editDate, setEditDate] = useState(today)
  const existing = state.checkIns.find((c) => c.date === editDate)
  const explanation = useMemo(() => explainRecovery(state.checkIns, today), [state.checkIns, today])
  const trend = useMemo(() => recoveryTrend(state.checkIns, today, 28), [state.checkIns, today])
  const sleepTrend = trend.map((t) => ({ label: t.label, Sleep: t.sleepHours, 'Sleep quality': t.sleepQuality }))
  const hrData = trend.filter((t) => t.restingHr !== null).map((t) => ({ label: t.label, 'Resting HR': t.restingHr }))
  const last = state.checkIns[state.checkIns.length - 1]
  const history = [...state.checkIns].reverse().slice(0, 14)
  const daysBack = (n: number) => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Recovery">
        Recovery is part of the plan. Check in briefly each day — your answers feed trends and readiness reviews. They are self-reported and <strong className="text-fg">never a diagnosis</strong>.
      </PageIntro>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={existing ? `Check-in for ${formatDate(editDate)}` : `New check-in for ${formatDate(editDate)}`}
            subtitle={existing ? 'A check-in exists for this date — saving updates it.' : 'Takes about 30 seconds.'}
            action={
              <div className="flex gap-1.5">
                {[0, 1, 2].map((n) => (
                  <Button key={n} size="sm" variant={editDate === daysBack(n) ? 'primary' : 'outline'} onClick={() => setEditDate(daysBack(n))}>
                    {n === 0 ? 'Today' : n === 1 ? 'Yesterday' : formatDate(daysBack(n), 'EEE')}
                  </Button>
                ))}
              </div>
            }
          />
          <CardBody>
            <CheckInForm
              key={editDate + (existing?.updatedAt ?? '')}
              date={editDate}
              existing={existing}
              onSubmit={(v) => {
                const res = run((s, e) => addCheckInOp(s, v, e), { success: 'Check-in saved. Trends updated.' })
                if (!isError(res)) setEditDate(today)
              }}
            />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What your trend says" subtitle="Plain-language, last 7 days" />
            <CardBody className="space-y-3">
              <p className="text-base font-semibold text-fg">{explanation.headline}</p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                {explanation.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="grid grid-cols-2 gap-4">
              <Stat label="Check-ins (28 d)" value={trend.length} />
              <Stat label="Last check-in" value={last ? formatDate(last.date, 'd MMM') : '—'} />
            </CardBody>
          </Card>
          <Notice tone="warn" title="When to get help">
            <p>Fatigue that doesn’t lift with rest, unusual breathlessness, chest discomfort, dizziness or fainting, or low mood that persists should be discussed with a clinician. Use the symptom report in Rehab for anything concerning.</p>
          </Notice>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <WidgetBoundary label="Recovery trend">
          <ChartCard title="Readiness, fatigue, soreness & mood" description="1–5 self-reported scales." period="Last 28 days" sample={state.isSampleData} limitation="Self-reported trend aid only. Not a measurement of health or overtraining." summary={`${trend.length} check-ins plotted over 28 days.`}>
            {trend.length >= 2 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip {...tooltipStyle} />
                    <Legend {...legendStyle} />
                    <Line type="monotone" dataKey="readiness" name="Readiness" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={CHART_COLORS.warn} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="soreness" name="Soreness" stroke={CHART_COLORS.danger} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="mood" name="Mood" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData message="Log at least two check-ins to see a trend." />
            )}
          </ChartCard>
        </WidgetBoundary>
        <WidgetBoundary label="Sleep trend">
          <ChartCard title="Sleep" description="Hours slept and subjective quality." period="Last 28 days" sample={state.isSampleData} limitation="Hours are self-entered. Needs vary between people; there is no single right number." summary="Sleep duration and quality across recent check-ins.">
            {sleepTrend.length >= 2 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sleepTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} domain={[0, 10]} />
                    <Tooltip {...tooltipStyle} />
                    <Legend {...legendStyle} />
                    <Line type="monotone" dataKey="Sleep" name="Sleep (h)" stroke={CHART_COLORS.swim} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Sleep quality" name="Quality (1–5)" stroke={CHART_COLORS.strength} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData />
            )}
          </ChartCard>
        </WidgetBoundary>
      </div>

      {hrData.length >= 2 && (
        <WidgetBoundary label="Resting heart rate">
          <ChartCard title="Resting heart rate (optional)" description="Only the check-ins where you entered a value." period="Last 28 days" sample={state.isSampleData} limitation="Resting heart rate varies with sleep, stress, illness, caffeine and heat. Wearable-derived values cannot diagnose overtraining or any medical condition." summary="Resting heart rate where logged.">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hrData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} domain={['dataMin - 3', 'dataMax + 3']} unit=" bpm" />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="Resting HR" stroke={CHART_COLORS.danger} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </WidgetBoundary>
      )}

      <Card>
        <CardHeader title="Recent check-ins" />
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No check-ins yet" body="Your first check-in unlocks trends and a fuller readiness review." />
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Recent recovery check-ins</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="px-5 py-2 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2 font-medium">Sleep</th>
                  <th scope="col" className="px-2 py-2 font-medium">Fatigue</th>
                  <th scope="col" className="px-2 py-2 font-medium">Soreness</th>
                  <th scope="col" className="px-2 py-2 font-medium">Mood</th>
                  <th scope="col" className="px-2 py-2 font-medium">Readiness</th>
                  <th scope="col" className="px-5 py-2"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5 text-fg">{formatDate(c.date)}</td>
                    <td className="px-2 py-2.5 tabular-nums text-muted">{c.sleepHours} h · {c.sleepQuality}/5</td>
                    <td className="px-2 py-2.5 tabular-nums">{c.fatigue >= 4 ? <Badge tone="warn">{c.fatigue}/5</Badge> : `${c.fatigue}/5`}</td>
                    <td className="px-2 py-2.5 tabular-nums text-muted">{c.soreness}/5</td>
                    <td className="px-2 py-2.5 tabular-nums text-muted">{c.mood}/5</td>
                    <td className="px-2 py-2.5 tabular-nums text-muted">{c.readiness}/5</td>
                    <td className="px-5 py-2.5 text-right">
                      <Button size="sm" variant="ghost" aria-label={`Edit check-in for ${formatDate(c.date)}`} onClick={() => { setEditDate(c.date); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SafetyFooter />
    </div>
  )
}

export function RecoveryPage() {
  return (
    <RequireOnboarded>
      <RecoveryContent />
    </RequireOnboarded>
  )
}
