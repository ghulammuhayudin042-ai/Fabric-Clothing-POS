import { useMemo, useState } from 'react';
import { LuRuler } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { Q, cleanName, M } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, SearchBox, Loading, ErrorBox } from '../components/ui.jsx';

export default function Rolls() {
  const { data, loading, error } = useAsync(() => api('rolls'), []);
  const [q, setQ] = useState(''), [show, setShow] = useState('open');
  const rows = useMemo(() => (data || []).filter((r) => (show === 'all' || (show === 'open' ? r.remaining_length > 0 : r.remaining_length <= 0)) && (cleanName(r.name) + r.roll_code).toLowerCase().includes(q.toLowerCase())), [data, q, show]);
  const totalLeft = rows.reduce((s, r) => s + r.remaining_length, 0);
  return (
    <>
      <PageHead title="Roll inventory" sub="Every roll with its received length and what is left to cut"><div className="seg">{[['open', 'In stock'], ['empty', 'Finished'], ['all', 'All']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div></PageHead>
      <div className="card flush">
        <div className="card-h"><SearchBox value={q} onChange={setQ} placeholder="Search roll code or fabric" /><span className="muted small"><LuRuler style={{ verticalAlign: -3 }} /> {rows.length} rolls · {Q(totalLeft)} m left</span></div>
        {loading ? <Loading /> : error ? <ErrorBox error={error} /> : <Table rows={rows} empty={{ title: 'No rolls', text: 'Receive a purchase with a roll code to create rolls.' }} cols={[
          { h: 'Roll', f: (r) => <b>{r.roll_code}</b> }, { h: 'Fabric', f: (r) => cleanName(r.name) },
          { h: 'Received', num: true, f: (r) => `${Q(r.initial_length)} m` }, { h: 'Remaining', num: true, f: (r) => <b>{Q(r.remaining_length)} m</b> },
          { h: 'Used', f: (r) => { const pct = Math.round(100 * (1 - r.remaining_length / r.initial_length)); return <div style={{ minWidth: 120 }}><div className="bar"><i style={{ width: pct + '%', background: pct > 85 ? 'var(--s2)' : undefined }} /></div><span className="muted small">{pct}% cut</span></div>; } },
          { h: 'Cost / m', num: true, f: (r) => M(r.cost_per_unit) },
          { h: 'Status', f: (r) => (r.remaining_length <= 0 ? <Badge>Finished</Badge> : r.remaining_length < r.initial_length * 0.15 ? <Badge tone="amber">Almost done</Badge> : <Badge tone="green">Open</Badge>) }]} />}
      </div>
    </>
  );
}
