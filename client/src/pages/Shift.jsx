import { useState } from 'react';
import { LuClock3, LuLockOpen, LuLock, LuBanknote } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { M, dt } from '../lib/fmt.js';
import { useAsync, PageHead, Field, useToast, Loading, Stat } from '../components/ui.jsx';

export default function Shift() {
  const toast = useToast(); const { data, loading, reload } = useAsync(() => api('shift'), []);
  const [cash, setCash] = useState(''), [res, setRes] = useState(null);
  const act = async (p) => { try { const r = await api(p, { cash }); if (p === 'shift-close') { setRes(r); toast('Shift closed'); } else toast('Shift opened'); setCash(''); reload(); } catch (e) { toast(e.message, 'err'); } };
  if (loading) return <Loading />;
  return (
    <>
      <PageHead title="Cash shift" sub="Count the drawer when you start and finish — the system shows any difference" />
      <div className="grid g2">
        <div className="card">
          {data ? <>
            <h3><LuLockOpen /> Shift is open</h3><p className="muted">Opened {dt(data.opened_at)} with {M(data.opening_cash)}</p>
            <Field label="Cash counted in drawer now (PKR)"><input className="input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} data-testid="close-cash" /></Field>
            <button className="btn primary lg block mt" onClick={() => act('shift-close')} data-testid="close-shift"><LuLock /> Close shift</button></> : <>
            <h3><LuClock3 /> No shift open</h3><p className="muted">Enter the opening cash in the drawer to begin.</p>
            <Field label="Opening cash (PKR)"><input className="input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} data-testid="open-cash" /></Field>
            <button className="btn primary lg block mt" onClick={() => act('shift-open')} data-testid="open-shift"><LuLockOpen /> Open shift</button></>}
        </div>
        {res && <div className="grid" style={{ alignContent: 'start' }} data-testid="shift-result">
          <Stat icon={<LuBanknote />} label="Expected cash" value={M(res.expected)} /><Stat icon={<LuBanknote />} label="Counted" value={M(res.counted)} tone="blue" />
          <Stat icon={<LuBanknote />} label={res.difference === 0 ? 'Drawer is exact' : res.difference > 0 ? 'Over' : 'Short'} value={M(res.difference)} tone={res.difference === 0 ? 'green' : 'red'} /></div>}
      </div>
    </>
  );
}
