import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { dt } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, SearchBox, Loading } from '../components/ui.jsx';

const tone = (a) => (/FAIL|OVERRIDE|DAMAGE/.test(a) ? 'red' : /RETURN|EXCHANGE/.test(a) ? 'amber' : /SALE|PURCHASE/.test(a) ? 'blue' : 'gray');
export default function Audit() {
  const { data, loading } = useAsync(() => api('audit'), []); const [q, setQ] = useState('');
  const rows = useMemo(() => (data || []).filter((a) => `${a.action} ${a.username} ${a.detail}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <>
      <PageHead title="Audit log" sub="Latest 300 important actions: sales, returns, overrides, logins" />
      <div className="card flush"><div className="card-h"><SearchBox value={q} onChange={setQ} placeholder="Filter by action, user or detail" /></div>
        {loading ? <Loading /> : <Table rows={rows} empty={{ title: 'No matching entries' }} cols={[{ h: 'When', f: (a) => dt(a.ts) }, { h: 'User', f: (a) => a.username || '—' }, { h: 'Action', f: (a) => <Badge tone={tone(a.action)}>{a.action}</Badge> }, { h: 'Record', f: (a) => (a.record_type ? `${a.record_type} #${a.record_id ?? ''}` : '') }, { h: 'Detail', f: (a) => <span className="muted small mono">{a.detail || ''}</span> }]} />}</div>
    </>
  );
}
