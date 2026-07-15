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

const TREND_DATA = [
  { month: 'Jan', theft: 45, burglary: 28, cyber: 15 },
  { month: 'Feb', theft: 52, burglary: 30, cyber: 18 },
  { month: 'Mar', theft: 48, burglary: 25, cyber: 24 },
  { month: 'Apr', theft: 38, burglary: 22, cyber: 35 },
  { month: 'May', theft: 42, burglary: 18, cyber: 42 },
  { month: 'Jun', theft: 35, burglary: 15, cyber: 55 },
]

const PREDICTIVE_DATA = [
  { subject: 'Vehicle Theft', risk: 85, baseline: 50, fullMark: 100 },
  { subject: 'Burglary', risk: 40, baseline: 50, fullMark: 100 },
  { subject: 'Cyber Fraud', risk: 90, baseline: 50, fullMark: 100 },
  { subject: 'Assault', risk: 30, baseline: 50, fullMark: 100 },
  { subject: 'Narcotics', risk: 65, baseline: 50, fullMark: 100 },
]

export function CrimeTrendChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--hairline)" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
          <Tooltip
            contentStyle={{ borderRadius: '12px', border: '1px solid var(--hairline)', background: 'var(--surface)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
          <Line type="monotone" name="Vehicle Theft" dataKey="theft" stroke="var(--teal)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          <Line type="monotone" name="Burglary" dataKey="burglary" stroke="var(--amber)" strokeWidth={2} />
          <Line type="monotone" name="Cyber Crime" dataKey="cyber" stroke="var(--muted-foreground)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PredictiveRadarChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={PREDICTIVE_DATA}>
          <PolarGrid stroke="var(--hairline)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Predicted Risk" dataKey="risk" stroke="var(--danger)" fill="var(--danger)" fillOpacity={0.2} />
          <Radar name="Baseline Average" dataKey="baseline" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.1} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid var(--hairline)', background: 'var(--surface)' }} />
          <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
