import React from 'react';
import { Card, CardContent } from './ui/card';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DashboardMetricCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  value: string | number;
  trend: number;
  isLive?: boolean;
  data: { value: number }[];
  trendColor?: 'green' | 'red';
  sparklineColor?: string;
  iconBgColor?: string;
}

export function DashboardMetricCard({
  title,
  subtitle,
  icon,
  value,
  trend,
  isLive = true,
  data,
  trendColor = trend >= 0 ? 'green' : 'red',
  sparklineColor = trend >= 0 ? '#10b981' : '#f43f5e',
  iconBgColor = 'bg-slate-100',
}: DashboardMetricCardProps) {
  const isPositive = trend >= 0;

  return (
    <Card className="w-full max-w-sm overflow-hidden rounded-2xl border-slate-200 shadow-sm transition-all hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-slate-700", iconBgColor)}>
              {icon}
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                {title}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {subtitle}
              </p>
            </div>
          </div>
          {isLive && (
            <div className="flex items-center gap-1.5 pt-1">
              <Circle className={cn("h-2 w-2 fill-current", isPositive ? "text-teal-600" : "text-red-500")} />
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Live
              </span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-4xl font-extrabold text-slate-800 tracking-tight">
            {value}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
              trendColor === 'green'
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span>
              {isPositive ? '+' : ''}{trend}%
            </span>
          </div>

          <div className="h-10 w-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
