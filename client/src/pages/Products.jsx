import { useState } from 'react';
import { LuPlus, LuScanBarcode, LuCamera, LuPencil, LuTags, LuPower, LuLayers, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { M, Q, cleanName, UNITS } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Badge, Modal, Field, SearchBox, useToast, Loading, ErrorBox } from '../components/ui.jsx';
import CameraScanner from '../components/CameraScanner.jsx';
import PrintPreview from '../components/PrintPreview.jsx';
import Barcode from '../components/Barcode.jsx';
import { labelsHtml } from '../lib/print.js';
import { useWedgeScanner, beep } from '../lib/scan.js';

export default function Products({ can }) {
  const toast = useToast();
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [inactive, setInactive] = useState(false);
  const [form, setForm] = useState(null), [edit, setEdit] = useState(null), [labels, setLabels] = useState(null), [cam, setCam] = useState(false), [pick, setPick] = useState([]);
  const meta = useAsync(async () => ({ cats: await api('categories'), sups: await api('suppliers') }), []);
  const { data, loading, error, reload } = useAsync(() => api('products?' + qs({ q, cat, all: inactive ? 1 : '' })), [q, cat, inactive]);

  const onScan = async (code) => {
    const r = await api('products?barcode=' + encodeURIComponent(code));
    if (r[0]) { beep(true); setQ(r[0].sku); toast(`Found ${cleanName(r[0].name)}`); } else { beep(false); toast(`No product with barcode "${code}"`, 'err'); }
  };
  useWedgeScanner(onScan, { enabled: !form && !edit && !labels && !cam });

  const toggle = async (p) => { try { await api('products/update', { id: p.id, active: !p.active }); toast(p.active ? 'Product hidden from sales' : 'Product active'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const rows = data || [];
  const togglePick = (p) => setPick((a) => (a.find((x) => x.id === p.id) ? a.filter((x) => x.id !== p.id) : [...a, { ...p, copies: 1 }]));

  return (
    <>
      <PageHead title="Products" sub="Fabrics, ready-made garments and suit sets">
        <button className="btn" onClick={() => setCam(true)}><LuCamera /> Scan</button>
        <button className="btn" disabled={!pick.length} onClick={() => setLabels(pick)} data-testid="labels-btn"><LuTags /> Barcode labels{pick.length ? ` (${pick.length})` : ''}</button>
        <button className="btn primary" onClick={() => setForm('new')} data-testid="new-product"><LuPlus /> New product</button>
      </PageHead>
      <div className="card flush">
        <div className="card-h">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, SKU or barcode — or scan" data-testid="product-search" />
          <select className="input" style={{ width: 190 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{(meta.data?.cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show hidden</label>
        </div>
        {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
          <Table rows={rows} empty={{ title: 'No products match', text: 'Add a product or change the filters.' }}
            cols={[
              { h: '', w: 34, f: (p) => <input type="checkbox" checked={!!pick.find((x) => x.id === p.id)} onChange={() => togglePick(p)} aria-label={`Select ${p.name}`} /> },
              { h: 'Product', f: (p) => <div><b>{cleanName(p.name)}</b><div className="muted small">{p.sku}{p.barcode && p.barcode !== p.sku ? ` · ${p.barcode}` : ''}{p.size ? ` · size ${p.size}` : ''}{p.color ? ` · ${p.color}` : ''}</div></div> },
              { h: 'Category', f: (p) => p.category || '—' },
              { h: 'Cost', num: true, f: (p) => (p.is_suit ? <span className="muted">from parts</span> : M(p.cost_price)) },
              { h: 'Price', num: true, f: (p) => <b>{M(p.sale_price)}</b> },
              { h: 'Stock', num: true, f: (p) => p.is_suit ? <span>{p.avail === null ? '—' : `${Q(p.avail)} sets`}</span> : <span style={{ color: p.stock <= p.reorder_level ? 'var(--bad)' : undefined, fontWeight: 600 }}>{Q(p.stock)} {p.unit}</span> },
              { h: 'Status', f: (p) => (!p.active ? <Badge>Hidden</Badge> : p.is_suit ? <Badge tone="violet">Suit set</Badge> : p.stock <= 0 ? <Badge tone="red">Out</Badge> : p.stock <= p.reorder_level ? <Badge tone="amber" icon={<LuTriangleAlert />}>Low</Badge> : <Badge tone="green">In stock</Badge>) },
              { h: '', f: (p) => <div className="row end" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm ghost" title="Print label" onClick={() => setLabels([{ ...p, copies: 1 }])}><LuScanBarcode /></button>
                <button className="btn sm ghost" title="Edit prices" onClick={() => setEdit(p)}><LuPencil /></button>
                <button className="btn sm ghost" title={p.active ? 'Hide' : 'Activate'} onClick={() => toggle(p)}><LuPower /></button></div> },
            ]} />)}
      </div>
      {form && <ProductForm cats={meta.data?.cats || []} sups={meta.data?.sups || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); meta.reload(); }} />}
      {edit && <EditModal p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {labels && <LabelModal items={labels} setItems={setLabels} onClose={() => setLabels(null)} />}
      {cam && <CameraScanner onScan={onScan} onClose={() => setCam(false)} />}
    </>
  );
}

const blank = { sku: '', name: '', barcode: '', category_id: '', brand: '', fabric: '', color: '', design: '', size: '', unit: 'm', cost_price: '', sale_price: '', wholesale_price: '', reorder_level: '', supplier_id: '' };

function ProductForm({ cats, sups, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState('single'); // single | sizes | suit
  const [f, setF] = useState(blank), [sizes, setSizes] = useState('S,M,L,XL'), [comps, setComps] = useState([{ sku: '', qty: '' }]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (mode === 'sizes') { await api('variants', { ...f, sizes: sizes.split(',').map((s) => s.trim()).filter(Boolean) }); }
      else if (mode === 'suit') { await api('products', { ...f, unit: 'suit', is_suit: true, components: comps.filter((c) => c.sku && c.qty) }); }
      else await api('products', f);
      toast('Product saved'); onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  const F = ({ k, label, ...r }) => <Field label={label}><input className="input" value={f[k]} onChange={set(k)} data-testid={`pf-${k}`} {...r} /></Field>;
  return (
    <Modal title="New product" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!f.sku || !f.name} data-testid="save-product">Save product</button></>}>
      <div className="seg" style={{ marginBottom: 16 }}>
        {[['single', 'Single item'], ['sizes', 'Sizes (S/M/L…)'], ['suit', 'Suit / set']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <div className="form">
        <F k="sku" label="SKU / code *" /><F k="name" label="Name *" />
        <F k="barcode" label="Barcode (blank = use SKU)" placeholder="Scan or type" />
        <Field label="Category"><select className="input" value={f.category_id} onChange={set('category_id')}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {mode !== 'suit' && <Field label="Sold by"><select className="input" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>}
        <F k="brand" label="Brand" /><F k="fabric" label="Fabric" /><F k="color" label="Colour" /><F k="design" label="Design" />
        {mode === 'single' && <F k="size" label="Size" />}
        {mode !== 'suit' && <F k="cost_price" label="Cost price (PKR)" inputMode="decimal" />}
        <F k="sale_price" label="Sale price (PKR) *" inputMode="decimal" /><F k="wholesale_price" label="Wholesale price" inputMode="decimal" />
        {mode !== 'suit' && <F k="reorder_level" label="Reorder level" inputMode="decimal" />}
        <Field label="Supplier"><select className="input" value={f.supplier_id} onChange={set('supplier_id')}><option value="">—</option>{sups.map((s) => <option key={s.id} value={s.id}>{cleanName(s.name)}</option>)}</select></Field>
        {mode === 'sizes' && <Field label="Sizes (comma separated)" className="wide"><input className="input" value={sizes} onChange={(e) => setSizes(e.target.value)} /><span className="muted small">One product, SKU and barcode is created per size (e.g. {f.sku || 'SKU'}-S, {f.sku || 'SKU'}-M).</span></Field>}
      </div>
      {mode === 'suit' && (
        <div className="card mt" style={{ background: '#f8faff' }}>
          <h3><LuLayers /> What goes into one suit?</h3>
          <p className="muted small" style={{ marginTop: -6 }}>Selling one suit deducts these quantities from the fabric stock automatically.</p>
          {comps.map((c, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <input className="input" style={{ flex: 1 }} placeholder="Fabric SKU (e.g. 1101)" value={c.sku} onChange={(e) => setComps(comps.map((x, k) => (k === i ? { ...x, sku: e.target.value } : x)))} />
              <input className="input" style={{ width: 120 }} placeholder="Meters" inputMode="decimal" value={c.qty} onChange={(e) => setComps(comps.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} />
              <button className="btn ghost iconbtn" onClick={() => setComps(comps.filter((_, k) => k !== i))}><LuTrash2 /></button>
            </div>))}
          <button className="btn sm" onClick={() => setComps([...comps, { sku: '', qty: '' }])}><LuPlus /> Add component</button>
        </div>)}
    </Modal>
  );
}

function EditModal({ p, onClose, onSaved }) {
  const toast = useToast(); const [price, setPrice] = useState((p.sale_price / 100).toFixed(2)), [ws, setWs] = useState(p.wholesale_price ? (p.wholesale_price / 100).toFixed(2) : ''), [re, setRe] = useState(String(p.reorder_level / 1000));
  const save = async () => { try { await api('products/update', { id: p.id, sale_price: price, wholesale_price: ws, reorder_level: re }); toast('Product updated'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal title={`Edit ${cleanName(p.name)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save changes</button></>}>
      <div className="form"><Field label="Sale price (PKR)"><input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Wholesale price"><input className="input" value={ws} onChange={(e) => setWs(e.target.value)} inputMode="decimal" /></Field>
        {!p.is_suit && <Field label="Reorder level"><input className="input" value={re} onChange={(e) => setRe(e.target.value)} inputMode="decimal" /></Field>}</div>
    </Modal>
  );
}

function LabelModal({ items, setItems, onClose }) {
  const [size, setSize] = useState('50x30'), [show, setShow] = useState(false);
  if (show) return <PrintPreview title="Barcode labels" html={labelsHtml(items, size)} onClose={() => setShow(false)} />;
  return (
    <Modal title="Print barcode labels" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => setShow(true)} data-testid="preview-labels">Preview labels</button></>}>
      <div className="row" style={{ marginBottom: 14 }}><span className="muted">Label size</span><div className="seg">{['40x25', '50x30', '58x40'].map((s) => <button key={s} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>{s} mm</button>)}</div></div>
      {items.map((p, i) => (
        <div className="row" key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}><b>{cleanName(p.name)}</b><div className="muted small">{p.barcode || p.sku}</div></div>
          <Barcode value={p.barcode || p.sku} height={30} width={1.4} displayValue={false} />
          <input className="input sm" style={{ width: 70 }} type="number" min="1" value={p.copies} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, copies: Math.max(1, +e.target.value || 1) } : x)))} aria-label="Copies" /><span className="muted small">copies</span>
        </div>))}
    </Modal>
  );
}
