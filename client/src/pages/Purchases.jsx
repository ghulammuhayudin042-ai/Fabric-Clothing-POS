import { useState } from 'react';
import { LuScanBarcode, LuCamera, LuPlus, LuTrash2, LuTruck, LuPackagePlus, LuUndo2, LuHandCoins, LuBuilding2 } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { M, Q, cleanName, dt, wholeUnit } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, Modal, Field, SearchBox, useToast, Loading, Empty } from '../components/ui.jsx';
import CameraScanner from '../components/CameraScanner.jsx';
import { useWedgeScanner, beep } from '../lib/scan.js';

export default function Purchases() {
  const [tab, setTab] = useState('receive');
  return (
    <>
      <PageHead title="Purchases & suppliers" sub="Receive stock, create fabric rolls and track what you owe" />
      <div className="tabs">
        {[['receive', 'Receive stock', LuPackagePlus], ['history', 'Purchase history', LuTruck], ['suppliers', 'Suppliers', LuBuilding2]].map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`ptab-${k}`}><I />{l}</button>)}
      </div>
      {tab === 'receive' && <Receive done={() => setTab('history')} />}
      {tab === 'history' && <History />}
      {tab === 'suppliers' && <Suppliers />}
    </>
  );
}

function Receive({ done }) {
  const toast = useToast();
  const sups = useAsync(() => api('suppliers'), []);
  const [sup, setSup] = useState(''), [ref, setRef] = useState(''), [paid, setPaid] = useState('');
  const [lines, setLines] = useState([]), [q, setQ] = useState(''), [res, setRes] = useState([]), [cam, setCam] = useState(false), [busy, setBusy] = useState(false);

  const add = (p) => setLines((l) => (l.find((x) => x.p.id === p.id) ? l : [...l, { p, qty: '', cost: (p.cost_price / 100).toFixed(2), roll: '' }]));
  const lookup = async (code) => {
    const r = await api('products?barcode=' + encodeURIComponent(code));
    if (r[0] && !r[0].is_suit) { add(r[0]); beep(true); toast(`${cleanName(r[0].name)} added`, 'info'); } else { beep(false); toast(r[0] ? 'Suit sets are not purchased — add the fabric instead' : `No product with barcode "${code}"`, 'err'); }
  };
  useWedgeScanner(lookup, { enabled: !cam });
  const search = async (v) => { setQ(v); setRes(v.length > 1 ? (await api('products?' + qs({ q: v }))).filter((p) => !p.is_suit).slice(0, 8) : []); };
  const set = (i, k, v) => setLines((l) => l.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const total = lines.reduce((s, x) => s + Math.round((parseFloat(x.qty) || 0) * 1000 * Math.round((parseFloat(x.cost) || 0) * 100) / 1000), 0);

  const save = async () => {
    if (!lines.length) return toast('Add at least one item', 'err');
    if (lines.some((x) => !(parseFloat(x.qty) > 0))) return toast('Enter a quantity for every item', 'err');
    setBusy(true);
    try {
      const r = await api('purchases', { supplierId: sup ? +sup : null, refNo: ref || null, paid: paid || '0', items: lines.map((x) => ({ productId: x.p.id, qty: x.qty, unitCost: x.cost || '0', rollCode: x.roll || undefined })) });
      toast(`Stock received · ${M(r.total)}`); setLines([]); setRef(''); setPaid(''); done();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="grid g21">
      <div className="card flush">
        <div className="card-h"><LuScanBarcode style={{ color: 'var(--blue2)', fontSize: 18 }} /><h3>Items received</h3><span className="sp" /><button className="btn sm" onClick={() => setCam(true)}><LuCamera /> Camera scan</button></div>
        <div style={{ padding: 16, position: 'relative' }}>
          <SearchBox value={q} onChange={search} placeholder="Search item to add — or just scan its barcode" data-testid="purchase-search" />
          {res.length > 0 && <div className="card flush" style={{ position: 'absolute', zIndex: 5, left: 16, right: 16, top: 62, maxHeight: 280, overflow: 'auto' }}>{res.map((p) => <button key={p.id} className="nav" style={{ color: 'var(--ink)', borderRadius: 0 }} onClick={() => { add(p); setQ(''); setRes([]); }}><b>{cleanName(p.name)}</b><span className="muted small">{p.sku}</span></button>)}</div>}
        </div>
        {!lines.length ? <Empty icon={<LuPackagePlus />} title="No items yet">Scan or search to add what arrived from the supplier.</Empty> : (
          <div className="tablewrap"><table data-testid="purchase-lines"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Cost / unit (PKR)</th><th>Roll code</th><th className="num">Amount</th><th /></tr></thead><tbody>
            {lines.map((x, i) => (
              <tr key={x.p.id}><td><b>{cleanName(x.p.name)}</b><div className="muted small">{x.p.sku} · in stock {Q(x.p.stock)} {x.p.unit}</div></td>
                <td className="num"><input className="input sm" style={{ width: 90, textAlign: 'right' }} value={x.qty} onChange={(e) => set(i, 'qty', e.target.value)} inputMode="decimal" data-testid={`pq-${i}`} aria-label="Quantity" /> <span className="muted small">{x.p.unit}</span></td>
                <td className="num"><input className="input sm" style={{ width: 100, textAlign: 'right' }} value={x.cost} onChange={(e) => set(i, 'cost', e.target.value)} inputMode="decimal" data-testid={`pc-${i}`} aria-label="Cost" /></td>
                <td>{x.p.unit === 'm' || x.p.unit === 'yd' ? <input className="input sm" style={{ width: 120 }} placeholder="e.g. R-101" value={x.roll} onChange={(e) => set(i, 'roll', e.target.value)} data-testid={`pr-${i}`} aria-label="Roll code" /> : <span className="muted small">—</span>}</td>
                <td className="num">{M(Math.round((parseFloat(x.qty) || 0) * 1000 * Math.round((parseFloat(x.cost) || 0) * 100) / 1000))}</td>
                <td><button className="btn ghost sm" onClick={() => setLines(lines.filter((_, n) => n !== i))} aria-label="Remove"><LuTrash2 /></button></td></tr>))}
          </tbody></table></div>)}
      </div>
      <div className="card">
        <h3><LuTruck /> Supplier bill</h3>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Supplier"><select className="input" value={sup} onChange={(e) => setSup(e.target.value)} data-testid="supplier-select"><option value="">— none —</option>{(sups.data || []).map((s) => <option key={s.id} value={s.id}>{cleanName(s.name)}</option>)}</select></Field>
          <Field label="Bill / reference no."><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Paid now (PKR)"><input className="input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} data-testid="paid-now" /></Field>
        </div>
        <div className="sumrow total mt"><span>Bill total</span><span className="mono">{M(total)}</span></div>
        <div className="muted small">Unpaid: {M(Math.max(total - Math.round((parseFloat(paid) || 0) * 100), 0))}</div>
        <button className="btn primary lg block mt" onClick={save} disabled={busy || !lines.length} data-testid="save-purchase"><LuPackagePlus /> Receive stock</button>
        <p className="muted small">Cost is averaged with existing stock. Enter a roll code to track that bolt separately.</p>
      </div>
      {cam && <CameraScanner continuous onScan={lookup} onClose={() => setCam(false)} title="Scan received items" />}
    </div>
  );
}

function History() {
  const { data, loading, reload } = useAsync(() => api('purchases'), []);
  const [open, setOpen] = useState(null);
  return (
    <div className="card flush">
      {loading ? <Loading /> : <Table rows={data || []} onRow={setOpen} empty={{ title: 'No purchases yet' }} cols={[
        { h: 'Date', f: (p) => dt(p.ts) }, { h: 'Supplier', f: (p) => cleanName(p.supplier) || '—' }, { h: 'Reference', f: (p) => p.ref_no || '—' },
        { h: 'Total', num: true, f: (p) => <b>{M(p.total)}</b> }, { h: 'Paid', num: true, f: (p) => M(p.paid) },
        { h: 'Status', f: (p) => (p.paid >= p.total ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Owing {M(p.total - p.paid)}</Badge>) }]} />}
      {open && <PurchaseModal p={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function PurchaseModal({ p, onClose }) {
  const toast = useToast(); const { data, reload } = useAsync(() => api('purchase-items?id=' + p.id), [p.id]); const [r, setR] = useState({});
  const ret = async () => {
    const items = Object.entries(r).filter(([, v]) => parseFloat(v) > 0).map(([purchaseItemId, qty]) => ({ purchaseItemId: +purchaseItemId, qty }));
    if (!items.length) return toast('Enter a quantity to return', 'err');
    try { const x = await api('purchase-return', { purchaseId: p.id, items }); toast(`Returned to supplier · ${M(x.amount)}`); setR({}); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Purchase ${p.ref_no || '#' + p.id}`} size="wide" onClose={onClose} footer={<button className="btn" onClick={ret}><LuUndo2 /> Return selected to supplier</button>}>
      <Table rows={data || []} empty={{ title: 'No lines' }} cols={[{ h: 'Item', f: (i) => <b>{cleanName(i.name)}</b> }, { h: 'Received', num: true, f: (i) => Q(i.qty) }, { h: 'Cost', num: true, f: (i) => M(i.unit_cost) }, { h: 'Returned', num: true, f: (i) => Q(i.returned_qty) },
        { h: 'Return qty', num: true, f: (i) => <input className="input sm" style={{ width: 80, textAlign: 'right' }} value={r[i.id] || ''} onChange={(e) => setR({ ...r, [i.id]: e.target.value })} inputMode="decimal" /> }]} />
    </Modal>
  );
}

function Suppliers() {
  const toast = useToast(); const { data, loading, reload } = useAsync(() => api('suppliers'), []); const [add, setAdd] = useState(false), [pay, setPay] = useState(null);
  return (
    <>
      <div className="row end" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setAdd(true)}><LuPlus /> Add supplier</button></div>
      <div className="card flush">{loading ? <Loading /> : <Table rows={data || []} empty={{ title: 'No suppliers yet' }} cols={[
        { h: 'Supplier', f: (s) => <b>{cleanName(s.name)}</b> }, { h: 'Phone', f: (s) => s.phone || '—' }, { h: 'Address', f: (s) => s.address || '—' },
        { h: 'You owe', num: true, f: (s) => (s.balance > 0 ? <b style={{ color: 'var(--bad)' }}>{M(s.balance)}</b> : <span className="muted">{M(s.balance)}</span>) },
        { h: '', f: (s) => <button className="btn sm" onClick={() => setPay(s)}><LuHandCoins /> Pay</button> }]} />}</div>
      {add && <SupplierForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); reload(); }} />}
      {pay && <PayModal s={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} toast={toast} />}
    </>
  );
}
function SupplierForm({ onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState({ name: '', phone: '', address: '' });
  const save = async () => { try { await api('suppliers', f); toast('Supplier added'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return <Modal title="New supplier" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name} onClick={save}>Save supplier</button></>}>
    <div className="form"><Field label="Name" className="wide"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Address"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field></div></Modal>;
}
function PayModal({ s, onClose, onSaved, toast }) {
  const [a, setA] = useState(''), [r, setR] = useState('');
  const save = async () => { try { await api('supplier-payment', { supplierId: s.id, amount: a, reference: r }); toast('Payment recorded'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return <Modal title={`Pay ${cleanName(s.name)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!a} onClick={save}>Record payment</button></>}>
    <p className="muted" style={{ marginTop: 0 }}>Currently owed: <b>{M(s.balance)}</b></p><div className="form"><Field label="Amount (PKR)"><input className="input" autoFocus inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Reference"><input className="input" value={r} onChange={(e) => setR(e.target.value)} /></Field></div></Modal>;
}
