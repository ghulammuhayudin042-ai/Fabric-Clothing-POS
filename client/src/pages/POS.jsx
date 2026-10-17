import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuScanBarcode, LuCamera, LuPlus, LuMinus, LuTrash2, LuPause, LuPlay, LuShoppingCart, LuCheck, LuPrinter, LuBan, LuTriangleAlert, LuUserPlus, LuBanknote, LuCreditCard, LuLandmark, LuSmartphone, LuSearch } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { M, Q, cleanName, wholeUnit, cashStr, esc } from '../lib/fmt.js';
import { useAsync, Modal, Field, Empty, SearchBox, Badge, Table, useToast } from '../components/ui.jsx';
import CameraScanner from '../components/CameraScanner.jsx';
import InvoiceModal from '../components/InvoiceModal.jsx';
import { useWedgeScanner, beep } from '../lib/scan.js';

const METHODS = ['cash', 'card', 'bank', 'easypaisa', 'jazzcash'];
const lineMilli = (qty) => Math.round((parseFloat(qty) || 0) * 1000);
const toPaisa = (v) => Math.round((parseFloat(v) || 0) * 100);

export default function POS({ user, settings, can }) {
  const toast = useToast();
  const [cart, setCart] = useState([]);
  const [q, setQ] = useState(''), [cat, setCat] = useState('');
  const [scan, setScan] = useState('');
  const [cust, setCust] = useState(''), [billDisc, setBillDisc] = useState('');
  const [pays, setPays] = useState([{ method: 'cash', amount: '' }]);
  const [cam, setCam] = useState(false), [done, setDone] = useState(null), [view, setView] = useState(null);
  const [override, setOverride] = useState(null), [held, setHeld] = useState(null), [newCust, setNewCust] = useState(false);
  const [busy, setBusy] = useState(false), [token, setToken] = useState(() => crypto.randomUUID()), [lastScan, setLastScan] = useState(null);
  const scanRef = useRef();

  const prods = useAsync(() => api('products?' + qs({ q, cat })), [q, cat]);
  const meta = useAsync(async () => { const [cats, custs, rolls] = await Promise.all([api('categories'), api('customers'), api('rolls')]); return { cats, custs, rolls }; }, []);
  const list = prods.data || [];
  const rolls = meta.data?.rolls || [];

  const avail = (p) => (p.is_suit ? p.avail : p.stock);
  const add = useCallback((p, qty = '1') => {
    if (p.is_suit && p.avail === 0) { beep(false); return toast(`${cleanName(p.name)}: components are out of stock`, 'err'); }
    setCart((c) => {
      const i = c.findIndex((x) => x.p.id === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: String(+(parseFloat(n[i].qty) + parseFloat(qty)).toFixed(3)) }; return n; }
      return [...c, { p, qty, discount: '', rollId: '' }];
    });
  }, [toast]);

  // barcode / SKU lookup – used by the scan box, the USB scanner (global) and the camera
  const lookup = useCallback(async (code) => {
    const c = String(code).trim(); if (!c) return;
    try {
      const r = await api('products?barcode=' + encodeURIComponent(c));
      if (r[0]) { add(r[0]); beep(true); setLastScan({ ok: true, text: `${cleanName(r[0].name)} added` }); }
      else { beep(false); setLastScan({ ok: false, text: `No product with barcode "${c}"` }); toast(`No product with barcode "${c}"`, 'err'); }
    } catch (e) { toast(e.message, 'err'); }
  }, [add, toast]);
  useWedgeScanner(lookup, { enabled: !cam && !done && !override && !held && !newCust });
  useEffect(() => { scanRef.current?.focus(); }, [done]);

  const taxOn = settings.tax_enabled === '1', rateBp = +settings.tax_rate_bp || 0;
  const t = useMemo(() => {
    const lines = cart.map((x) => { const gross = Math.round(lineMilli(x.qty) * x.p.sale_price / 1000), disc = toPaisa(x.discount); return { gross, disc, total: Math.max(gross - disc, 0) }; });
    const subtotal = lines.reduce((s, l) => s + l.total, 0), bd = Math.min(toPaisa(billDisc), subtotal), taxable = subtotal - bd, tax = taxOn ? Math.round(taxable * rateBp / 10000) : 0;
    return { lines, subtotal, bd, tax, total: taxable + tax };
  }, [cart, billDisc, taxOn, rateBp]);
  const paid = pays.reduce((s, p) => s + toPaisa(p.amount), 0);
  const due = Math.max(t.total - paid, 0), change = Math.max(paid - t.total, 0);

  const setLine = (i, patch) => setCart((c) => c.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const bump = (i, d) => setCart((c) => c.map((x, k) => { if (k !== i) return x; const step = wholeUnit(x.p.unit) ? 1 : 0.5, n = +(parseFloat(x.qty || 0) + d * step).toFixed(3); return { ...x, qty: String(Math.max(n, step)) }; }));
  const clear = () => { setCart([]); setPays([{ method: 'cash', amount: '' }]); setBillDisc(''); setCust(''); setToken(crypto.randomUUID()); };

  const problems = cart.map((x) => { const m = lineMilli(x.qty); if (!m) return 'Enter a quantity'; if (wholeUnit(x.p.unit) && m % 1000) return `${cleanName(x.p.name)} is sold in whole ${x.p.unit}`; return null; }).filter(Boolean);

  const checkout = async (ov) => {
    setBusy(true);
    try {
      const payments = pays.filter((p) => toPaisa(p.amount) > 0).map((p) => ({ method: p.method, amount: p.amount }));
      const body = { customerId: cust ? +cust : null, billDiscount: String(billDisc || '0'), clientToken: token, payments, override: ov || undefined,
        items: cart.map((x) => ({ productId: x.p.id, qty: String(x.qty), discount: String(x.discount || '0'), rollId: x.rollId ? +x.rollId : undefined })) };
      const r = await api('sales', body);
      setOverride(null); setDone({ ...r, total: t.total }); beep(true); clear(); prods.reload(); meta.reload();
    } catch (e) {
      if (/Insufficient stock/.test(e.message) && can('override')) { setOverride({ msg: e.message }); }
      else if (/Insufficient stock/.test(e.message)) toast(e.message + ' — ask a manager to approve.', 'err');
      else toast(e.message, 'err');
    } finally { setBusy(false); }
  };
  const startCheckout = () => {
    if (!cart.length) return toast('Cart is empty', 'err');
    if (problems.length) return toast(problems[0], 'err');
    if (due > 0 && !cust) return toast('Walk-in sales must be paid in full. Choose a customer to sell on credit (udhaar).', 'err');
    checkout();
  };

  const hold = async () => {
    if (!cart.length) return toast('Cart is empty', 'err');
    const label = (cust && meta.data.custs.find((c) => String(c.id) === cust)?.name) || `Held ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    try { await api('hold', { label: cleanName(label), payload: { customer: cust, items: cart.map((x) => ({ barcode: x.p.barcode || x.p.sku, qty: x.qty, discount: x.discount, rollId: x.rollId })) } }); clear(); toast('Sale put on hold'); } catch (e) { toast(e.message, 'err'); }
  };
  const resume = async (h) => {
    try {
      const pl = JSON.parse(h.payload), items = [];
      for (const it of pl.items) { const p = (await api('products?barcode=' + encodeURIComponent(it.barcode)))[0]; if (p) items.push({ p, qty: it.qty, discount: it.discount || '', rollId: it.rollId || '' }); }
      setCart(items); setCust(pl.customer || ''); await api('held-delete', { id: h.id }); setHeld(null); toast(`Resumed "${h.label}"`);
    } catch (e) { toast(e.message, 'err'); }
  };

  const custName = (id) => cleanName(meta.data?.custs.find((c) => String(c.id) === String(id))?.name || '');
  const selCust = meta.data?.custs.find((c) => String(c.id) === cust);

  return (
    <div className="pos" data-testid="pos">
      <div className="pos-left">
        <div className="scanbar">
          <LuScanBarcode className="scan-ic" />
          <input ref={scanRef} data-scan-target="true" data-testid="scan-input" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode or type SKU, then press Enter"
            onKeyDown={(e) => { if (e.key === 'Enter') { lookup(scan); setScan(''); } }} aria-label="Scan barcode" />
          <button className="btn" onClick={() => setCam(true)} data-testid="open-camera"><LuCamera /> Camera</button>
        </div>
        <div className="scanstate"><span className="dot" style={{ background: lastScan && !lastScan.ok ? '#ff8b8b' : undefined }} /><span style={{ color: lastScan && !lastScan.ok ? 'var(--bad)' : 'var(--ink3)' }} data-testid="scan-status">{lastScan ? lastScan.text : 'USB scanner ready — just scan, no need to click anywhere'}</span></div>
        <div className="row"><SearchBox value={q} onChange={setQ} placeholder="Search fabric, kurta, SKU…" data-testid="search" />
          <div className="chips" style={{ maxWidth: '55%' }}><button className={`chip ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>All</button>{(meta.data?.cats || []).map((c) => <button key={c.id} className={`chip ${String(cat) === String(c.id) ? 'on' : ''}`} onClick={() => setCat(String(c.id))}>{c.name}</button>)}</div></div>
        <div className="pgrid" style={{ flex: 1 }} data-testid="product-grid">
          {list.map((p) => { const a = avail(p), out = a !== null && a <= 0; return (
            <button key={p.id} className={`pcard ${out ? 'out' : ''}`} onClick={() => add(p)} data-testid="product-card">
              <span className="pn">{cleanName(p.name)}</span>
              <span className="pp">{M(p.sale_price)}<span className="muted small"> / {p.unit}</span></span>
              <span className="ps"><span>{p.is_suit ? 'Set' : p.sku}</span><span style={{ color: out ? 'var(--bad)' : a !== null && !p.is_suit && p.stock <= p.reorder_level ? 'var(--warn)' : undefined, fontWeight: 600 }}>{a === null ? '' : out ? 'Out' : `${Q(a)} ${p.unit}`}</span></span>
            </button>); })}
          {!list.length && !prods.loading && <div style={{ gridColumn: '1/-1' }}><Empty icon={<LuSearch />} title="No products found">Try another name, or scan the barcode.</Empty></div>}
        </div>
      </div>

      <div className="pos-right">
        <div className="card flush cart">
          <div className="card-h"><LuShoppingCart style={{ fontSize: 18, color: 'var(--blue2)' }} /><h3>Cart</h3><Badge tone="blue">{cart.length} item{cart.length !== 1 ? 's' : ''}</Badge><span className="sp" />
            <button className="btn sm" onClick={async () => { setHeld(await api('held')); }} data-testid="resume-btn"><LuPlay /> Held</button>
            <button className="btn sm" onClick={hold} disabled={!cart.length} data-testid="hold-btn"><LuPause /> Hold</button>
            <button className="btn sm danger" onClick={clear} disabled={!cart.length} aria-label="Clear cart"><LuTrash2 /></button></div>
          <div className="cart-list" data-testid="cart">
            {!cart.length && <Empty icon={<LuScanBarcode />} title="Scan an item to begin">Barcode scans and product taps land here.</Empty>}
            {cart.map((x, i) => {
              const myRolls = rolls.filter((r) => r.product_id === x.p.id && r.remaining_length > 0);
              const over = !x.p.is_suit && lineMilli(x.qty) > x.p.stock;
              return (
                <div className="line" key={x.p.id} data-testid="cart-line">
                  <div><div className="nm">{cleanName(x.p.name)}</div><div className="muted small">{M(x.p.sale_price)} / {x.p.unit} {over && <Badge tone="amber" icon={<LuTriangleAlert />}>more than stock</Badge>}</div></div>
                  <div className="tot mono">{M(t.lines[i]?.total || 0)}</div>
                  <div className="qty">
                    <button className="btn iconbtn" onClick={() => bump(i, -1)} aria-label="Less"><LuMinus /></button>
                    <input className="input sm" data-testid="qty-input" inputMode="decimal" value={x.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" />
                    <button className="btn iconbtn" onClick={() => bump(i, 1)} aria-label="More"><LuPlus /></button><span className="muted small">{x.p.unit}</span>
                    <input className="input sm" style={{ width: 74 }} placeholder="Disc." inputMode="decimal" value={x.discount} onChange={(e) => setLine(i, { discount: e.target.value })} aria-label="Line discount" />
                  </div>
                  <div style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={() => setCart((c) => c.filter((_, k) => k !== i))} aria-label="Remove"><LuTrash2 /></button></div>
                  {myRolls.length > 0 && <select className="input sm" style={{ gridColumn: '1/-1' }} value={x.rollId} onChange={(e) => setLine(i, { rollId: e.target.value })} aria-label="Roll">
                    <option value="">Cut from shared stock</option>{myRolls.map((r) => <option key={r.id} value={r.id}>{r.roll_code} — {Q(r.remaining_length)} {x.p.unit} left</option>)}</select>}
                </div>); })}
          </div>
          <div className="sum">
            <div className="row" style={{ marginBottom: 8 }}>
              <select className="input sm" style={{ flex: 1 }} value={cust} onChange={(e) => setCust(e.target.value)} data-testid="customer-select" aria-label="Customer"><option value="">Walk-in customer</option>{(meta.data?.custs || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}{c.balance > 0 ? ` (owes ${M(c.balance)})` : ''}</option>)}</select>
              <button className="btn sm" onClick={() => setNewCust(true)} aria-label="New customer"><LuUserPlus /></button>
              <input className="input sm" style={{ width: 92 }} placeholder="Bill disc." inputMode="decimal" value={billDisc} onChange={(e) => setBillDisc(e.target.value)} data-testid="bill-discount" aria-label="Bill discount" />
            </div>
            <div className="sumrow"><span>Subtotal</span><span className="mono">{M(t.subtotal)}</span></div>
            {t.bd > 0 && <div className="sumrow"><span>Discount</span><span className="mono">-{M(t.bd)}</span></div>}
            {t.tax > 0 && <div className="sumrow"><span>Tax</span><span className="mono">{M(t.tax)}</span></div>}
            <div className="sumrow total"><span>Total</span><span className="mono" data-testid="grand-total">{M(t.total)}</span></div>
            <div style={{ marginTop: 8 }}>
              {pays.map((p, i) => (
                <div className="pay" key={i}>
                  <select className="input sm" value={p.method} onChange={(e) => setPays((a) => a.map((x, k) => (k === i ? { ...x, method: e.target.value } : x)))} aria-label="Payment method">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                  <input className="input sm" placeholder="Amount received" inputMode="decimal" value={p.amount} data-testid={`pay-amount-${i}`} onChange={(e) => setPays((a) => a.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount received" />
                  <button className="btn sm" onClick={() => setPays((a) => a.map((x, k) => (k === i ? { ...x, amount: cashStr(Math.max(t.total - (paid - toPaisa(x.amount)), 0)) } : x)))} data-testid={`exact-${i}`}>Exact</button>
                </div>))}
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button className="btn ghost sm" onClick={() => setPays((a) => [...a, { method: 'card', amount: '' }])}><LuPlus /> Split payment</button>
                <span className="small" data-testid="pay-status">{!cart.length ? '' : change > 0 ? <b style={{ color: 'var(--good)' }}>Change {M(change)}</b> : due > 0 ? <b style={{ color: 'var(--warn)' }}>{cust ? 'On credit' : 'Due'} {M(due)}</b> : <b style={{ color: 'var(--good)' }}>Paid in full</b>}</span>
              </div>
            </div>
            <button className="btn primary lg block" style={{ marginTop: 10 }} onClick={startCheckout} disabled={busy || !cart.length} data-testid="checkout"><LuCheck /> {busy ? 'Saving…' : `Complete sale · ${M(t.total)}`}</button>
            {selCust && due > 0 && <div className="muted small" style={{ marginTop: 6 }}>{custName(cust)} will owe {M(selCust.balance + due)} after this sale (limit {M(selCust.credit_limit)}).</div>}
          </div>
        </div>
      </div>

      {cam && <CameraScanner continuous title="Scan items with camera" onScan={lookup} onClose={() => setCam(false)} />}
      {done && (
        <Modal title="Sale completed" onClose={() => setDone(null)} footer={<><button className="btn" onClick={() => setDone(null)}>New sale</button><button className="btn primary" onClick={() => { setView(done.saleId); setDone(null); }} data-testid="print-invoice"><LuPrinter /> Print invoice</button></>}>
          <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
            <div className="stat" style={{ justifyContent: 'center' }}><div className="ic tone-green"><LuCheck /></div></div>
            <h2 style={{ margin: '10px 0 2px' }} data-testid="done-invoice">{done.invoiceNo}</h2><div className="muted">Total {M(done.total)}</div>
            {done.change > 0 && <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--good)', marginTop: 10 }}>Give change {M(done.change)}</div>}
            {done.balanceDue > 0 && <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--warn)', marginTop: 10 }}>Added to customer account: {M(done.balanceDue)}</div>}
          </div>
        </Modal>)}
      {view && <InvoiceModal saleId={view} defaultSize={settings.receipt_size} onClose={() => setView(null)} />}
      {override && <OverrideModal msg={override.msg} onClose={() => setOverride(null)} onOk={(o) => checkout(o)} />}
      {held && (
        <Modal title="Held sales" onClose={() => setHeld(null)}>
          {!held.length ? <Empty title="No held sales" /> : <Table cols={[{ h: 'Label', f: (h) => <b>{h.label}</b> }, { h: 'Held at', f: (h) => h.ts }, { h: '', f: (h) => <div className="row end"><button className="btn sm primary" onClick={() => resume(h)}>Resume</button><button className="btn sm danger" onClick={async () => { await api('held-delete', { id: h.id }); setHeld(await api('held')); }}><LuTrash2 /></button></div> }]} rows={held} />}
        </Modal>)}
      {newCust && <QuickCustomer onClose={() => setNewCust(false)} onSaved={async (id) => { await meta.reload(); setCust(String(id)); setNewCust(false); }} />}
    </div>
  );
}

function OverrideModal({ msg, onClose, onOk }) {
  const [u, setU] = useState(''), [p, setP] = useState('');
  return (
    <Modal title="Manager approval needed" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onOk({ username: u, password: p })} disabled={!u || !p}>Approve &amp; sell</button></>}>
      <div className="alert warn" style={{ marginBottom: 14 }}><LuBan />{msg}</div>
      <p className="muted" style={{ marginTop: 0 }}>Selling below zero stock must be approved by a manager or admin. This is recorded in the audit log.</p>
      <div className="form"><Field label="Manager username"><input className="input" value={u} onChange={(e) => setU(e.target.value)} autoFocus /></Field><Field label="Password"><input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} /></Field></div>
    </Modal>
  );
}

export function QuickCustomer({ onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState({ name: '', phone: '', credit_limit: '' });
  const save = async () => { try { const r = await api('customers', f); toast('Customer added'); onSaved(r.id); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal title="New customer" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!f.name} data-testid="save-customer">Save customer</button></>}>
      <div className="form"><Field label="Name" className="wide"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="cust-name" /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Credit limit (PKR)"><input className="input" inputMode="decimal" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} /></Field></div>
    </Modal>
  );
}
