import { useMemo, useState } from 'react';
import { LuPlus, LuHandCoins, LuBookOpen, LuReceipt, LuUsers } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { M, cleanName, dt } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, Modal, Field, SearchBox, useToast, Loading, Stat, Empty } from '../components/ui.jsx';
import InvoiceModal from '../components/InvoiceModal.jsx';

export default function Customers({ settings }) {
  const { data, loading, reload } = useAsync(() => api('customers'), []);
  const [q, setQ] = useState(''), [form, setForm] = useState(false), [led, setLed] = useState(null), [only, setOnly] = useState(false);
  const rows = useMemo(() => (data || []).filter((c) => (!only || c.balance > 0) && (cleanName(c.name) + (c.phone || '')).toLowerCase().includes(q.toLowerCase())), [data, q, only]);
  const owed = (data || []).reduce((s, c) => s + Math.max(c.balance, 0), 0);
  return (
    <>
      <PageHead title="Customers & udhaar" sub="Accounts, credit limits and payments received"><button className="btn primary" onClick={() => setForm(true)} data-testid="new-customer"><LuPlus /> New customer</button></PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat icon={<LuUsers />} label="Customers" value={(data || []).length} />
        <Stat icon={<LuHandCoins />} label="Total udhaar to collect" value={M(owed)} tone="amber" />
        <Stat icon={<LuReceipt />} label="Customers with balance" value={(data || []).filter((c) => c.balance > 0).length} tone="red" />
      </div>
      <div className="card flush">
        <div className="card-h"><SearchBox value={q} onChange={setQ} placeholder="Search name or phone" /><label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only with balance</label></div>
        {loading ? <Loading /> : <Table rows={rows} onRow={setLed} empty={{ title: 'No customers found' }} cols={[
          { h: 'Customer', f: (c) => <div><b>{cleanName(c.name)}</b><div className="muted small">{c.phone || '—'}{c.address ? ` · ${c.address}` : ''}</div></div> },
          { h: 'Credit limit', num: true, f: (c) => (c.credit_limit ? M(c.credit_limit) : '—') },
          { h: 'Balance', num: true, f: (c) => (c.balance > 0 ? <b style={{ color: 'var(--bad)' }}>{M(c.balance)}</b> : c.balance < 0 ? <b style={{ color: 'var(--good)' }}>{M(-c.balance)} advance</b> : <span className="muted">Clear</span>) },
          { h: 'Credit used', f: (c) => c.credit_limit ? <div style={{ minWidth: 110 }}><div className="bar"><i style={{ width: Math.min(100, Math.max(0, (c.balance / c.credit_limit) * 100)) + '%', background: c.balance / c.credit_limit > 0.85 ? 'var(--bad)' : undefined }} /></div></div> : '' },
          { h: '', f: () => <span className="btn sm ghost"><LuBookOpen /> Ledger</span> }]} />}
      </div>
      {form && <CustomerForm onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />}
      {led && <Ledger c={led} settings={settings} onClose={() => { setLed(null); reload(); }} />}
    </>
  );
}

function CustomerForm({ onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState({ name: '', phone: '', address: '', credit_limit: '', opening_balance: '' });
  const save = async () => { try { await api('customers', f); toast('Customer added'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New customer" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name} onClick={save} data-testid="save-customer">Save customer</button></>}>
      <div className="form"><Field label="Name *" className="wide"><input className="input" autoFocus value={f.name} onChange={s('name')} data-testid="cust-name" /></Field><Field label="Phone"><input className="input" value={f.phone} onChange={s('phone')} /></Field><Field label="Address"><input className="input" value={f.address} onChange={s('address')} /></Field>
        <Field label="Credit limit (PKR)"><input className="input" inputMode="decimal" value={f.credit_limit} onChange={s('credit_limit')} /></Field><Field label="Opening balance (PKR)"><input className="input" inputMode="decimal" value={f.opening_balance} onChange={s('opening_balance')} /></Field></div>
    </Modal>
  );
}

function Ledger({ c, settings, onClose }) {
  const toast = useToast(); const { data, loading, reload } = useAsync(() => api('ledger?id=' + c.id), [c.id]);
  const [amt, setAmt] = useState(''), [method, setMethod] = useState('cash'), [inv, setInv] = useState(null);
  const pay = async () => { try { const r = await api('ledger-payment', { customerId: c.id, amount: amt, method }); toast(`Payment received · balance now ${M(r.balance)}`); setAmt(''); reload(); } catch (e) { toast(e.message, 'err'); } };
  const entries = useMemo(() => !data ? [] : [
    ...data.sales.map((s) => ({ ts: s.ts, kind: 'Invoice', label: s.invoice_no, debit: s.total, credit: 0, saleId: s.id })),
    ...data.payments.filter((p) => p.kind === 'ledger').map((p) => ({ ts: p.ts, kind: 'Payment', label: p.method, debit: 0, credit: p.amount })),
    ...data.payments.filter((p) => p.kind === 'sale').map((p) => ({ ts: p.ts, kind: 'Paid at sale', label: p.method, debit: 0, credit: p.amount })),
    ...data.payments.filter((p) => p.kind === 'refund').map((p) => ({ ts: p.ts, kind: 'Refund', label: p.method, debit: -p.amount, credit: 0 })),
  ].sort((a, b) => String(a.ts).localeCompare(String(b.ts))), [data]);
  return (
    <Modal title={`${cleanName(c.name)} — ledger`} size="wide" onClose={onClose}>
      {loading ? <Loading /> : <>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="card" style={{ padding: '10px 16px' }}><div className="muted small">Balance</div><div style={{ fontSize: 22, fontWeight: 800, color: data.balance > 0 ? 'var(--bad)' : 'var(--good)' }} data-testid="ledger-balance">{M(data.balance)}</div></div>
          <span className="sp" />
          <select className="input" style={{ width: 120 }} value={method} onChange={(e) => setMethod(e.target.value)}>{['cash', 'bank', 'easypaisa', 'jazzcash', 'card'].map((m) => <option key={m}>{m}</option>)}</select>
          <input className="input" style={{ width: 140 }} placeholder="Amount (PKR)" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} data-testid="ledger-amount" />
          <button className="btn primary" disabled={!amt} onClick={pay} data-testid="ledger-pay"><LuHandCoins /> Receive payment</button>
        </div>
        {c.phone || c.address ? <p className="muted small" style={{ marginTop: 0 }}>{c.phone} {c.address}</p> : null}
        <Table rows={entries} empty={{ title: 'No transactions yet' }} onRow={(e) => e.saleId && setInv(e.saleId)} cols={[
          { h: 'Date', f: (e) => dt(e.ts) }, { h: 'Type', f: (e) => <Badge tone={e.kind === 'Invoice' ? 'blue' : e.kind === 'Refund' ? 'amber' : 'green'}>{e.kind}</Badge> }, { h: 'Details', f: (e) => <span style={{ textTransform: e.kind === 'Invoice' ? 'none' : 'capitalize' }}>{e.label}</span> },
          { h: 'Billed', num: true, f: (e) => (e.debit ? M(e.debit) : '') }, { h: 'Received', num: true, f: (e) => (e.credit ? M(e.credit) : '') }]} />
      </>}
      {inv && <InvoiceModal saleId={inv} defaultSize={settings?.receipt_size} onClose={() => setInv(null)} />}
    </Modal>
  );
}
