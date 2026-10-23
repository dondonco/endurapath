import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const CHART_COLORS = {
  swim: '#5AB8FF',
  bike: '#C7F36B',
  run: '#FFB26B',
  strength: '#B79CFF',
  recovery: '#93A0AE',
  accent: '#C7F36B',
  secondary: '#56D6C9',
  warn: '#F5B83D',
  danger: '#FF7A7A',
  grid: '#263444',
  axis: '#93A0AE',
  planned: '#34475C',
} as const

export const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.axis, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
} as const

export const tooltipStyle = {
  contentStyle: { background: '#1B2632', border: '1px solid #34475C', borderRadius: 8, fontSize: 12, color: '#F4F7FA' },
  labelStyle: { color: '#F4F7FA', fontWeight: 600 },
  itemStyle: { color: '#F4F7FA' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
} as const

export const legendStyle = { wrapperStyle: { fontSize: 12, color: '#93A0AE', paddingTop: 8 } } as const

/**
 * Wraps a chart with a title, plain-language description (screen-reader label), the period it covers,
 * and a limitations note — so no chart is shown without context.
 */
export function ChartCard({
  title,
  description,
  period,
  limitation,
  sample,
  children,
  className,
  summary,
}: {
  title: string
  description: string
  period: string
  limitation?: string
  sample?: boolean
  children: ReactNode
  className?: string
  /** Text alternative announced to assistive tech, summarising what the chart shows. */
  summary?: string
}) {
  return (
    <figure className={cn('rounded-xl border border-line bg-surface', className)}>
      <figcaption className="border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {sample && <span className="rounded-full border border-info/40 bg-info/10 px-2 py-0.5 font-medium text-info">Sample data</span>}
            <span>{period}</span>
          </div>
        </div>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </figcaption>
      <div className="px-2 pb-2 pt-4 sm:px-4" role="img" aria-label={summary ?? `${title}. ${description}`}>
        {children}
      </div>
      {limitation && <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-muted sm:px-5">{limitation}</p>}
    </figure>
  )
}

export function NoChartData({ message = 'Not enough data yet.' }: { message?: string }) {
  return <div className="flex h-48 items-center justify-center text-sm text-muted">{message}</div>
}
