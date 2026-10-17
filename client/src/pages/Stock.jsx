import { useState } from 'react';
import { LuSlidersHorizontal, LuArrowDownToLine, LuArrowUpFromLine, LuScanBarcode } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { Q, cleanName, dt } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, Modal, Field, useToast, Loading } from '../components/ui.jsx';
import { useWedgeScanner, beep } from '../lib/scan.js';

const TONE = { sale: 'blue', purchase: 'green', return: 'amber', adjustment: 'gray', damage: 'red', opening: 'gray', transfer: 'gray' };

export default function Stock({ can }) {
  const toast = useToast();
  const prods = useAsync(() => api('products?q='), []);
  const [pid, setPid] = useState(''), [adj, setAdj] = useState(false);
  const { data, loading, reload } = useAsync(() => api('movements?' + qs({ productId: pid })), [pid]);
  useWedgeScanner(async (code) => { const r = (await api('products?barcode=' + encodeURIComponent(code)))[0]; if (r) { setPid(String(r.id)); beep(true); } else { beep(false); toast(`No product "${code}"`, 'err'); } }, { enabled: !adj });
  return (
    <>
      <PageHead title="Stock movements" sub="Every purchase, sale, return and adjustment — scan an item to see its history">
        <button className="btn primary" onClick={() => setAdj(true)} data-testid="new-adjustment"><LuSlidersHorizontal /> Adjust stock</button></PageHead>
      <div className="card flush">
        <div className="card-h"><LuScanBarcode style={{ color: 'var(--ink3)' }} /><select className="input" style={{ maxWidth: 360 }} value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Product"><option value="">All products</option>{(prods.data || []).filter((p) => !p.is_suit).map((p) => <option key={p.id} value={p.id}>{cleanName(p.name)} ({p.sku})</option>)}</select></div>
        {loading ? <Loading /> : <Table rows={data || []} empty={{ title: 'No movements yet' }} cols={[
          { h: 'When', f: (m) => dt(m.ts) }, { h: 'Item', f: (m) => <b>{cleanName(m.name)}</b> }, { h: 'Type', f: (m) => <Badge tone={TONE[m.type]}>{m.type}</Badge> },
          { h: 'Change', num: true, f: (m) => <b style={{ color: m.qty < 0 ? 'var(--bad)' : 'var(--good)' }}>{m.qty < 0 ? <LuArrowUpFromLine style={{ verticalAlign: -2 }} /> : <LuArrowDownToLine style={{ verticalAlign: -2 }} />} {m.qty > 0 ? '+' : ''}{Q(m.qty)}</b> },
          { h: 'Source', f: (m) => (m.source_type ? `${m.source_type} #${m.source_id ?? ''}` : '—') }, { h: 'Note', f: (m) => m.note || '' }]} />}
      </div>
      {adj && <Adjust prods={(prods.data || []).filter((p) => !p.is_suit)} onClose={() => setAdj(false)} onSaved={() => { setAdj(false); reload(); prods.reload(); }} />}
    </>
  );
}

function Adjust({ prods, onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState({ productId: '', qty: '', type: 'adjustment', note: '', rollId: '' });
  const rolls = useAsync(() => api('rolls'), []); const mine = (rolls.data || []).filter((r) => String(r.product_id) === String(f.productId));
  const save = async () => { try { const r = await api('adjust', { ...f, productId: +f.productId, rollId: f.rollId ? +f.rollId : null }); toast(`Stock updated — now ${Q(r.stock)}`); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal title="Adjust stock" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.productId || !f.qty} onClick={save} data-testid="save-adjust">Save adjustment</button></>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <Field label="Item"><select className="input" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value, rollId: '' })} data-testid="adj-product"><option value="">Choose…</option>{prods.map((p) => <option key={p.id} value={p.id}>{cleanName(p.name)} — {Q(p.stock)} {p.unit}</option>)}</select></Field>
        <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="adjustment">Correction (count)</option><option value="damage">Damaged / lost</option></select></Field>
        <Field label="Quantity (use − for removing, e.g. -2.5)"><input className="input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} data-testid="adj-qty" /></Field>
        {mine.length > 0 && <Field label="Roll (optional)"><select className="input" value={f.rollId} onChange={(e) => setF({ ...f, rollId: e.target.value })}><option value="">Shared stock</option>{mine.map((r) => <option key={r.id} value={r.id}>{r.roll_code} — {Q(r.remaining_length)} left</option>)}</select></Field>}
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Why is this change needed?" /></Field>
      </div>
    </Modal>
  );
}
