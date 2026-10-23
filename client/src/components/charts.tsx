import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Resolve CSS custom properties to concrete colors (and re-resolve when the theme changes). */
export function useTokens() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    return (v: string) => (v.startsWith('var(') ? s.getPropertyValue(v.slice(4, -1)).trim() : v);
  };
  const [resolve, setResolve] = useState(() => read());
  useEffect(() => {
    const update = () => setResolve(() => read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => { mo.disconnect(); mq.removeEventListener('change', update); };
  }, []);
  return resolve;
}

interface TipPayload { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
export function ChartTooltip({ active, payload, label, labelFormatter, valueSuffix = '' }: { active?: boolean; payload?: TipPayload[]; label?: ReactNode; labelFormatter?: (l: ReactNode) => ReactNode; valueSuffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-pop min-w-36 rounded-2xl px-3.5 py-2.5 text-xs">
      <div className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="tnum font-medium text-ink">{typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}{valueSuffix}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (c: (v: string) => string) => ({
  stroke: c('var(--axis)'), tickLine: false, axisLine: false, tick: { fill: c('var(--muted)'), fontSize: 11 }, tickMargin: 8,
});

export interface SeriesDef { key: string; name: string; color: string }

/** Smooth curves with a soft gradient wash beneath each line (trend charts). */
export function LinesChart({ data, x, series, height = 260, xFormatter }: { data: object[]; x: string; series: SeriesDef[]; height?: number; xFormatter?: (v: string) => string }) {
  const c = useTokens();
  const uid = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c(s.color)} stopOpacity={0.32} />
              <stop offset="100%" stopColor={c(s.color)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={c('var(--hairline)')} />
        <XAxis dataKey={x} {...axisProps(c)} tickFormatter={xFormatter} />
        <YAxis {...axisProps(c)} allowDecimals={false} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => (xFormatter ? xFormatter(String(l)) : l)} />} cursor={{ stroke: c('var(--axis)'), strokeWidth: 1 }} />
        <Legend iconType="circle" iconSize={8} itemSorter={null} wrapperStyle={{ paddingTop: 8 }} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={c(s.color)} strokeWidth={2.5} fill={`url(#g-${uid}-${s.key})`}
            dot={false} activeDot={{ r: 6, stroke: c('var(--panel-solid)'), strokeWidth: 3, fill: c(s.color) }} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({ data, x, series, height = 260, stacked, horizontal, xFormatter, valueSuffix, onClick, line, yMax }: {
  data: object[]; x: string; series: SeriesDef[]; height?: number; stacked?: boolean; horizontal?: boolean;
  xFormatter?: (v: string) => string; valueSuffix?: string; onClick?: (row: Record<string, unknown>) => void; line?: SeriesDef; yMax?: number;
}) {
  const c = useTokens();
  const Chart = line ? ComposedChart : BarChart;
  const radius = (i: number): [number, number, number, number] => {
    if (stacked && i !== series.length - 1) return [0, 0, 0, 0];
    return horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0];
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 0 : -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={c('var(--hairline)')} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps(c)} axisLine={false} allowDecimals={false} domain={yMax ? [0, yMax] : undefined} />
            <YAxis type="category" dataKey={x} {...axisProps(c)} width={64} tickFormatter={xFormatter} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axisProps(c)} tickFormatter={xFormatter} interval={0} />
            <YAxis {...axisProps(c)} axisLine={false} allowDecimals={false} domain={yMax ? [0, yMax] : undefined} />
          </>
        )}
        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} labelFormatter={(l) => (xFormatter ? xFormatter(String(l)) : l)} />} cursor={{ fill: c('var(--surface-2)'), radius: 8 }} />
        {(series.length > 1 || line) && <Legend iconType="circle" iconSize={8} itemSorter={null} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={c(s.color)} stackId={stacked ? 'a' : undefined} radius={radius(i)}
            stroke={stacked ? c('var(--panel-solid)') : undefined} strokeWidth={stacked ? 1.5 : 0} maxBarSize={horizontal ? 16 : 30} isAnimationActive={false}
            onClick={onClick ? (d: unknown) => onClick((d as { payload: Record<string, unknown> }).payload) : undefined} style={onClick ? { cursor: 'pointer' } : undefined} />
        ))}
        {line && <Line type="monotone" dataKey={line.key} name={line.name} stroke={c(line.color)} strokeWidth={2} dot={false} isAnimationActive={false} />}
      </Chart>
    </ResponsiveContainer>
  );
}

export function Legendish({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
      {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}
