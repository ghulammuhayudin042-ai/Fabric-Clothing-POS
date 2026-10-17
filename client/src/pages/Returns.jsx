import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuScanBarcode, LuCamera, LuUndo2, LuArrowLeftRight, LuReceipt, LuPrinter, LuSearch } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { M, Q, cleanName, dt, wholeUnit } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, Field, SearchBox, useToast, Loading, Empty, Modal } from '../components/ui.jsx';
import CameraScanner from '../components/CameraScanner.jsx';
import InvoiceModal from '../components/InvoiceModal.jsx';
import { useWedgeScanner, beep } from '../lib/scan.js';

export default function Returns({ settings }) {
  const toast = useToast();
  const sales = useAsync(() => api('sales'), []);
  const [q, setQ] = useState(''), [inv, setInv] = useState(null), [cam, setCam] = useState(false), [view, setView] = useState(null);

  const open = useCallback(async (id) => { try { setInv(await api('invoice?id=' + id)); } catch (e) { toast(e.message, 'err'); } }, [toast]);
  const find = useCallback((code) => {
    const c = String(code).trim().toLowerCase(); const s = (sales.data || []).find((x) => x.invoice_no.toLowerCase() === c || x.invoice_no.toLowerCase().endsWith(c.replace(/^0+/, '').padStart(1, '0')) && /^\d+$/.test(c));
    if (s) { beep(true); open(s.id); } else { beep(false); toast(`No invoice matches "${code}"`, 'err'); }
  }, [sales.data, open, toast]);
  useWedgeScanner(find, { enabled: !cam && !inv });
  const rows = useMemo(() => (sales.data || []).filter((s) => (s.invoice_no + (s.customer || '')).toLowerCase().includes(q.toLowerCase())), [sales.data, q]);

  if (inv) return <Process inv={inv} settings={settings} onBack={() => { setInv(null); sales.reload(); }} onPrint={setView} view={view} closeView={() => setView(null)} />;
  return (
    <>
      <PageHead title="Returns & exchange" sub="Scan the barcode on the customer's receipt, or pick an invoice below">
        <button className="btn" onClick={() => setCam(true)}><LuCamera /> Scan receipt</button></PageHead>
      <div className="card flush">
        <div className="card-h"><SearchBox value={q} onChange={setQ} placeholder="Invoice number or customer — Enter to open" data-testid="invoice-search" onKeyDown={(e) => { if (e.key === 'Enter' && q) find(q); }} /><LuScanBarcode style={{ color: 'var(--ink3)' }} /></div>
        {sales.loading ? <Loading /> : <Table rows={rows.slice(0, 100)} onRow={(s) => open(s.id)} empty={{ title: 'No invoices found' }} cols={[
          { h: 'Invoice', f: (s) => <b>{s.invoice_no}</b> }, { h: 'Date', f: (s) => dt(s.ts) }, { h: 'Customer', f: (s) => cleanName(s.customer) || 'Walk-in' },
          { h: 'Total', num: true, f: (s) => M(s.total) }, { h: '', f: () => <span className="btn sm ghost"><LuUndo2 /> Return / exchange</span> }]} />}
      </div>
      {cam && <CameraScanner onScan={find} onClose={() => setCam(false)} title="Scan receipt barcode" />}
    </>
  );
}

function Process({ inv, settings, onBack, onPrint, view, closeView }) {
  const toast = useToast();
  const [mode, setMode] = useState('return'), [qty, setQty] = useState({}), [reason, setReason] = useState(''), [refundMode, setRefundMode] = useState('cash'), [restock, setRestock] = useState(true);
  const [cur, setCur] = useState(inv), [newCode, setNewCode] = useState(''), [newItem, setNewItem] = useState(null), [newQty, setNewQty] = useState('1'), [extra, setExtra] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null);

  const reloadInv = async () => setCur(await api('invoice?id=' + inv.id));
  const sel = Object.entries(qty).filter(([, v]) => parseFloat(v) > 0).map(([saleItemId, q]) => ({ saleItemId: +saleItemId, qty: q }));
  const refundEst = sel.reduce((s, x) => { const i = cur.items.find((y) => y.id === x.saleItemId); return s + Math.round(i.line_total * Math.round(parseFloat(x.qty) * 1000) / i.qty); }, 0);

  const findNew = async (code) => { const r = (await api('products?barcode=' + encodeURIComponent(code)))[0]; if (r) { setNewItem(r); beep(true); } else { beep(false); toast(`No product "${code}"`, 'err'); } };
  useWedgeScanner(findNew, { enabled: mode === 'exchange' });

  const run = async () => {
    if (!sel.length) return toast('Enter the quantity being returned', 'err');
    setBusy(true);
    try {
      if (mode === 'return') { const r = await api('returns', { saleId: cur.id, items: sel, reason, restock, refundMode }); setRes({ text: `Return recorded — refund ${M(r.cashOut)}${r.offset ? `, ${M(r.offset)} offset against unpaid balance` : ''}` }); }
      else {
        if (!newItem) throw new Error('Scan or choose the new item first');
        const r = await api('exchange', { saleId: cur.id, returned: sel, reason, newItems: [{ productId: newItem.id, qty: newQty }], payments: parseFloat(extra) > 0 ? [{ method: 'cash', amount: extra }] : [] });
        setRes({ text: `Exchange done — new invoice ${r.invoiceNo}${r.balanceDue ? `, customer pays ${M(r.balanceDue)} more` : ''}${r.cashBack ? `, cash back ${M(r.cashBack)}` : ''}`, saleId: r.saleId });
      }
      setQty({}); await reloadInv();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title={`Invoice ${cur.invoice_no}`} sub={`${dt(cur.ts)} · ${cleanName(cur.customer) || 'Walk-in'} · total ${M(cur.total)}`}>
        <button className="btn" onClick={() => onPrint(cur.id)}><LuPrinter /> Print copy</button><button className="btn" onClick={onBack}>Back to invoices</button></PageHead>
      {res && <div className="alert info" style={{ marginBottom: 14 }} data-testid="return-result"><LuReceipt /><span>{res.text}</span><span className="sp" />{res.saleId && <button className="btn sm" onClick={() => onPrint(res.saleId)}>Print new invoice</button>}</div>}
      <div className="seg" style={{ marginBottom: 14 }}><button className={mode === 'return' ? 'on' : ''} onClick={() => setMode('return')}><LuUndo2 style={{ verticalAlign: -3 }} /> Return &amp; refund</button><button className={mode === 'exchange' ? 'on' : ''} onClick={() => setMode('exchange')} data-testid="mode-exchange"><LuArrowLeftRight style={{ verticalAlign: -3 }} /> Exchange</button></div>
      <div className="grid g21">
        <div className="card flush">
          <div className="card-h"><h3>Items on this invoice</h3></div>
          <Table rows={cur.items} cols={[
            { h: 'Item', f: (i) => <div><b>{cleanName(i.name)}</b><div className="muted small">{M(i.unit_price)} / {i.unit}</div></div> },
            { h: 'Sold', num: true, f: (i) => `${Q(i.qty)} ${i.unit}` }, { h: 'Returned', num: true, f: (i) => (i.returned_qty ? <Badge tone="amber">{Q(i.returned_qty)}</Badge> : '—') },
            { h: 'Return now', num: true, f: (i) => { const left = i.qty - i.returned_qty; return left <= 0 ? <Badge>Fully returned</Badge> : <div className="row end" style={{ flexWrap: 'nowrap' }}><input className="input sm" style={{ width: 84, textAlign: 'right' }} placeholder={`max ${Q(left)}`} value={qty[i.id] || ''} inputMode="decimal" data-testid={`ret-${i.id}`} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /><button className="btn sm" onClick={() => setQty({ ...qty, [i.id]: Q(left) })}>All</button></div>; } }]} />
        </div>
        <div className="card">
          <h3>{mode === 'return' ? 'Refund' : 'Exchange for'}</h3>
          <div className="form" style={{ gridTemplateColumns: '1fr' }}>
            <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong size, defect" data-testid="return-reason" /></Field>
            {mode === 'return' ? <>
              <Field label="Refund by"><select className="input" value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>{['cash', 'bank', 'easypaisa', 'jazzcash'].map((m) => <option key={m}>{m}</option>)}</select></Field>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put items back into stock</label></> : <>
              <Field label="New item (scan or type barcode/SKU)"><input className="input" data-scan-target="true" value={newCode} onChange={(e) => setNewCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { findNew(newCode); setNewCode(''); } }} data-testid="exchange-code" /></Field>
              {newItem && <div className="alert info"><b>{cleanName(newItem.name)}</b><span className="sp" />{M(newItem.sale_price)}/{newItem.unit}</div>}
              <Field label="Quantity"><input className="input" value={newQty} inputMode="decimal" onChange={(e) => setNewQty(e.target.value)} data-testid="exchange-qty" /></Field>
              <Field label="Extra cash from customer (PKR)"><input className="input" value={extra} inputMode="decimal" onChange={(e) => setExtra(e.target.value)} /></Field></>}
          </div>
          <div className="sumrow total mt"><span>{mode === 'return' ? 'Refund value' : 'Credit value'}</span><span className="mono">{M(refundEst)}</span></div>
          <button className="btn primary lg block mt" disabled={busy || !sel.length} onClick={run} data-testid="process-return">{mode === 'return' ? <><LuUndo2 /> Process return</> : <><LuArrowLeftRight /> Complete exchange</>}</button>
        </div>
      </div>
      {view && <InvoiceModal saleId={view} defaultSize={settings.receipt_size} onClose={closeView} />}
    </>
  );
}
