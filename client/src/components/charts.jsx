import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { M, Mshort } from '../lib/fmt.js';

// Categorical colours in fixed order (validated reference palette, colour-blind safe on adjacent pairs)
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
const AX = { fontSize: 12, fill: '#7b879c' };

const Tip = ({ active, payload, label, money = true, fmtLabel }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e9f4', borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 24px rgba(15,27,51,.14)', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{fmtLabel ? fmtLabel(label) : label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#47546b' }}>
          <i style={{ width: 9, height: 9, borderRadius: 3, background: p.color || p.payload?.fill, display: 'inline-block' }} />
          <span>{p.name}</span><b style={{ marginLeft: 'auto', paddingLeft: 14, color: '#0f1b33' }}>{p.payload?._fmt?.[p.dataKey] ?? (money ? M(p.value) : p.value)}</b>
        </div>
      ))}
    </div>
  );
};

/** Sales / profit over time. Series: [{key,name}] drawn as thin lines over soft areas on ONE shared axis. */
export function TrendChart({ data, series, height = 290 }) {
  return (
    <div className="chartbox" style={{ height }} data-testid="trend-chart">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>{series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.22} /><stop offset="100%" stopColor={SERIES[i]} stopOpacity={0.02} /></linearGradient>
          ))}</defs>
          <CartesianGrid stroke="#e9eef8" vertical={false} />
          <XAxis dataKey="label" tick={AX} tickLine={false} axisLine={{ stroke: '#e3e9f4' }} minTickGap={22} />
          <YAxis tick={AX} tickLine={false} axisLine={false} width={66} tickFormatter={(v) => Mshort(v)} />
          <Tooltip content={<Tip />} cursor={{ stroke: '#b6c6e6' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12.5, paddingTop: 6 }} />
          {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars: one hue, direct value labels. */
export function HBars({ data, height = 260, color = SERIES[0], money = true, valueKey = 'value' }) {
  return (
    <div className="chartbox" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={9}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={130} tick={{ ...AX, fill: '#47546b' }} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip money={money} />} cursor={{ fill: '#f1f5fd' }} />
          <Bar dataKey={valueKey} name="Amount" fill={color} radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fontSize: 12, fill: '#47546b', formatter: (v) => (money ? Mshort(v) : v) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VBars({ data, height = 240, color = SERIES[0], money = true, valueKey = 'value', xKey = 'label', name = 'Sales' }) {
  return (
    <div className="chartbox" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e9eef8" vertical={false} />
          <XAxis dataKey={xKey} tick={AX} tickLine={false} axisLine={{ stroke: '#e3e9f4' }} minTickGap={8} />
          <YAxis tick={AX} tickLine={false} axisLine={false} width={money ? 66 : 34} tickFormatter={(v) => (money ? Mshort(v) : v)} />
          <Tooltip content={<Tip money={money} />} cursor={{ fill: '#f1f5fd' }} />
          <Bar dataKey={valueKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a legend that carries every value, so colour is never the only cue. */
export function Donut({ data, height = 220 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div>
      <div style={{ height }} data-testid="donut">
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<Tip />} />
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {data.map((d, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={d.label} className="row" style={{ gap: 8, fontSize: 13 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: SERIES[i % SERIES.length] }} /><span style={{ textTransform: 'capitalize' }}>{d.label}</span>
            <span className="sp" /><b className="mono">{M(d.value)}</b><span className="muted small" style={{ width: 40, textAlign: 'right' }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
