import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/app/store'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { WidgetBoundary } from '@/components/shared/route-error'
import { Badge } from '@/components/shared/ui'
import { CHART_COLORS, ChartCard, NoChartData, axisProps, legendStyle, tooltipStyle } from '@/components/charts/chart-kit'
import { consistencyTrend, longSessionProgression, milestonesFor, recentWeekStats, recoveryTrend } from '@/domain/analytics/selectors'
import { GOAL_LABELS } from '@/domain/models/common'
import { formatDate } from '@/lib/dates'

const WEEKS = 12

function Charts() {
  const { state, today } = useApp()
  const sample = state.isSampleData
  const stats = useMemo(() => recentWeekStats(state, today, WEEKS), [state, today])
  const period = `${stats[0]?.label} – ${stats[stats.length - 1]?.label} (${WEEKS} weeks)`

  const duration = stats.map((s) => ({ week: s.label, Planned: +(s.plannedMin / 60).toFixed(1), Completed: +(s.completedMin / 60).toFixed(1) }))
  const sessions = stats.map((s) => ({ week: s.label, Planned: s.plannedSessions, Completed: s.completedSessions }))
  const consistency = consistencyTrend(stats).map((c) => ({ week: c.label, Completion: c.rate }))
  const longs = longSessionProgression(state, today, WEEKS).map((l) => ({ week: l.label, Bike: l.bike, Run: l.run, Swim: l.swim }))
  const recovery = recoveryTrend(state.checkIns, today, 28)

  const totals = stats.reduce((a, s) => ({ swim: a.swim + s.minutesBySport.swim, bike: a.bike + s.minutesBySport.bike, run: a.run + s.minutesBySport.run }), { swim: 0, bike: 0, run: 0 })
  const dist = [
    { name: 'Swim', value: totals.swim, color: CHART_COLORS.swim },
    { name: 'Bike', value: totals.bike, color: CHART_COLORS.bike },
    { name: 'Run', value: totals.run, color: CHART_COLORS.run },
  ].filter((d) => d.value > 0)
  const distTotal = dist.reduce((a, d) => a + d.value, 0)

  const milestones = milestonesFor(state)
  const doneCount = milestones.filter((m) => m.done).length
  const races = state.events.filter((e) => e.status === 'completed' && e.result).sort((a, b) => (a.date < b.date ? -1 : 1))

  const hasAny = stats.some((s) => s.plannedSessions > 0)
  if (!hasAny) return <NoChartData message="No training data in this period yet." />

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <WidgetBoundary label="Weekly duration chart">
        <ChartCard
          title="Weekly training duration"
          description="Hours planned vs hours completed per week."
          period={period}
          sample={sample}
          limitation="Completed hours come from the durations you logged. Weeks without logged sessions show zero, which may reflect missing logs rather than missed training. Current week is still in progress."
          summary={`Planned and completed training hours for each of the last ${WEEKS} weeks.`}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={duration} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} unit=" h" />
                <Tooltip {...tooltipStyle} />
                <Legend {...legendStyle} />
                <Bar dataKey="Planned" fill={CHART_COLORS.planned} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Completed" fill={CHART_COLORS.accent} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </WidgetBoundary>

      <WidgetBoundary label="Sessions chart">
        <ChartCard title="Planned vs completed sessions" description="Session counts per week (skipped sessions excluded)." period={period} sample={sample} limitation="A skipped session is removed from 'planned' so honest rest decisions are not counted against you." summary="Number of planned and completed sessions each week.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessions} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend {...legendStyle} />
                <Bar dataKey="Planned" fill={CHART_COLORS.planned} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Completed" fill={CHART_COLORS.secondary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </WidgetBoundary>

      <WidgetBoundary label="Sport distribution chart">
        <ChartCard
          title="Swim · bike · run distribution"
          description="Share of completed time by sport."
          period={period}
          sample={sample}
          limitation="Strength and recovery are not included. Brick sessions are split 70% bike / 30% run for this view. Distribution is not a target — it depends on your goal and limiters."
          summary={dist.length ? `Share of completed time: ${dist.map((d) => `${d.name} ${Math.round((d.value / distTotal) * 100)}%`).join(', ')}.` : 'No completed swim, bike or run time yet.'}
        >
          {dist.length ? (
            <div className="grid items-center gap-2 sm:grid-cols-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                      {dist.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => `${(Number(v) / 60).toFixed(1)} h`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 px-3 pb-3 text-sm">
                {dist.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="size-3 rounded-sm" style={{ background: d.color }} aria-hidden /> {d.name}
                    </span>
                    <span className="tabular-nums text-muted">
                      {(d.value / 60).toFixed(1)} h · {Math.round((d.value / distTotal) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <NoChartData message="Complete swim, bike or run sessions to see the split." />
          )}
        </ChartCard>
      </WidgetBoundary>

      <WidgetBoundary label="Long session chart">
        <ChartCard title="Long-session progression" description="Longest completed session per sport each week, in minutes." period={period} sample={sample} limitation="Gaps mean no session of that sport was completed that week. A longer session is not automatically better; recovery weeks are expected to dip." summary="Longest completed bike, run and swim session per week in minutes.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={longs} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} unit=" m" />
                <Tooltip {...tooltipStyle} />
                <Legend {...legendStyle} />
                <Line type="monotone" dataKey="Bike" stroke={CHART_COLORS.bike} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Run" stroke={CHART_COLORS.run} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Swim" stroke={CHART_COLORS.swim} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </WidgetBoundary>

      <WidgetBoundary label="Recovery trend chart">
        <ChartCard
          title="Subjective recovery trend"
          description="Self-reported readiness, fatigue and soreness (1–5)."
          period="Last 28 days"
          sample={sample}
          limitation="Self-reported scores only. These are trend aids, not measurements of health, and cannot diagnose overtraining or any condition."
          summary={recovery.length ? `${recovery.length} check-ins over the last 28 days.` : 'No check-ins in the last 28 days.'}
        >
          {recovery.length >= 2 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recovery} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                  <Tooltip {...tooltipStyle} />
                  <Legend {...legendStyle} />
                  <Line type="monotone" dataKey="readiness" name="Readiness" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={CHART_COLORS.warn} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="soreness" name="Soreness" stroke={CHART_COLORS.danger} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <NoChartData message="Log at least two check-ins to see a trend." />
          )}
        </ChartCard>
      </WidgetBoundary>

      <WidgetBoundary label="Consistency chart">
        <ChartCard title="Training consistency" description="Share of due sessions completed each week." period={period} sample={sample} limitation="Counts sessions dated on or before today. Weeks with nothing due are left blank. Consistency is a planning input, never a pass/fail score." summary="Weekly completion rate of due sessions as a percentage.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={consistency} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} unit="%" />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="Completion" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </WidgetBoundary>

      <section className="rounded-xl border border-line bg-surface xl:col-span-1" aria-labelledby="ms-h">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h3 id="ms-h" className="text-sm font-semibold">
            Milestone completion
          </h3>
          <span className="text-xs text-muted">
            {doneCount} of {milestones.length} capacity milestones met
          </span>
        </div>
        {milestones.length === 0 ? (
          <p className="p-5 text-sm text-muted">No outstanding capacity milestones.</p>
        ) : (
          <ul className="divide-y divide-line">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="min-w-0">
                  <span className="block truncate text-fg">{m.label}</span>
                  <span className="text-xs text-muted">{m.detail}</span>
                </span>
                <Badge tone={m.done ? 'accent' : 'neutral'}>{m.done ? 'Met' : `Stage ${m.stage}`}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted sm:px-5">Only sessions that felt manageable (RPE ≤ 7) count toward capacity.</p>
      </section>

      <section className="rounded-xl border border-line bg-surface" aria-labelledby="race-h">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h3 id="race-h" className="text-sm font-semibold">
            Race history
          </h3>
          {sample && <span className="rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">Sample data</span>}
        </div>
        {races.length === 0 ? (
          <p className="p-5 text-sm text-muted">No completed races recorded. Add results under Events — they are self-entered; nothing is synced from race organisers.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Completed races with self-entered finish times</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Race</th>
                  <th scope="col" className="px-2 py-2 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2 font-medium">Distance</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {races.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg sm:px-5">
                      {r.name}
                    </th>
                    <td className="px-2 py-2.5 text-muted">{formatDate(r.date, 'd MMM yyyy')}</td>
                    <td className="px-2 py-2.5 text-muted">{GOAL_LABELS[r.category]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">{r.result?.finishTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted sm:px-5">Self-entered results. Different courses and conditions make times hard to compare.</p>
      </section>
    </div>
  )
}

export function PerformancePage() {
  return (
    <RequireOnboarded>
      <PageIntro title="Performance & progression">
        Every chart shows the period it covers and its limits. {' '}
        Numbers come from the sessions and check-ins stored on this device — nothing is invented.
      </PageIntro>
      <Charts />
      <SafetyFooter />
    </RequireOnboarded>
  )
}
