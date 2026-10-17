import { useState } from 'react';
import { LuPlus, LuWallet } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { M, dt, cleanName } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Field, Modal, Stat, useToast, Loading } from '../components/ui.jsx';

export default function Expenses() {
  const toast = useToast(); const { data, loading, reload } = useAsync(() => api('expenses'), []); const [open, setOpen] = useState(false), [f, setF] = useState({ title: '', amount: '' });
  const save = async () => { try { await api('expenses', f); toast('Expense saved'); setOpen(false); setF({ title: '', amount: '' }); reload(); } catch (e) { toast(e.message, 'err'); } };
  const total = (data || []).reduce((s, x) => s + x.amount, 0), month = (data || []).filter((x) => String(x.ts).slice(0, 7) === new Date().toLocaleDateString('en-CA').slice(0, 7)).reduce((s, x) => s + x.amount, 0);
  return (
    <>
      <PageHead title="Expenses" sub="Rent, bills, salaries and daily shop spending"><button className="btn primary" onClick={() => setOpen(true)} data-testid="new-expense"><LuPlus /> Add expense</button></PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}><Stat icon={<LuWallet />} label="This month" value={M(month)} tone="red" /><Stat icon={<LuWallet />} label="Listed total (latest 200)" value={M(total)} tone="amber" /></div>
      <div className="card flush">{loading ? <Loading /> : <Table rows={data || []} empty={{ title: 'No expenses recorded' }} cols={[{ h: 'Date', f: (x) => dt(x.ts) }, { h: 'Expense', f: (x) => <b>{cleanName(x.title)}</b> }, { h: 'Amount', num: true, f: (x) => M(x.amount) }]} />}</div>
      {open && <Modal title="Add expense" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!f.title || !f.amount} onClick={save} data-testid="save-expense">Save expense</button></>}>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}><Field label="What was it for?"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="exp-title" /></Field><Field label="Amount (PKR)"><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="exp-amount" /></Field></div></Modal>}
    </>
  );
}
