"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend
} from 'recharts'

export type TrendSeries = { key: string; label: string; color: string }
export type TrendDatum = Record<string, string | number>
export type ForecastAxis = { crimeType: string; risk: number }

export function CrimeTrendChart({ data = [], series = [] }: { data?: TrendDatum[]; series?: TrendSeries[] }) {
  if (data.length === 0 || series.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2">
        <p className="text-sm text-muted-foreground">No cases in the last 6 months to chart.</p>
      </div>
    )
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--hairline)" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: '12px', border: '1px solid var(--hairline)', background: 'var(--surface)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" name={s.label} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PredictiveRadarChart({ axes = [], baseline = 50 }: { axes?: ForecastAxis[]; baseline?: number }) {
  if (axes.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2">
        <p className="text-sm text-muted-foreground">Not enough recent cases for a risk forecast.</p>
      </div>
    )
  }
  const data = axes.map((a) => ({ subject: a.crimeType, risk: a.risk, baseline, fullMark: 100 }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="var(--hairline)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Velocity Risk" dataKey="risk" stroke="var(--danger)" fill="var(--danger)" fillOpacity={0.2} />
          <Radar name="Baseline" dataKey="baseline" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.1} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid var(--hairline)', background: 'var(--surface)' }} />
          <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
