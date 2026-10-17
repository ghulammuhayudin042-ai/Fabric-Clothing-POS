import { useEffect, useState } from 'react';
import { LuSave, LuDatabaseBackup, LuDownload, LuPrinter, LuImage } from 'react-icons/lu';
import { api, apiText } from '../lib/api.js';
import { downloadText, cleanName } from '../lib/fmt.js';
import { PageHead, Field, useToast, useAsync, Loading } from '../components/ui.jsx';
import PrintPreview from '../components/PrintPreview.jsx';
import { invoiceHtml } from '../lib/print.js';

const TABLES = ['sales', 'sale_items', 'products', 'customers', 'payments', 'stock_movements', 'returns', 'purchases', 'expenses', 'audit_logs'];
const SAMPLE = { invoice_no: 'INV-000123', ts: new Date().toISOString().slice(0, 19).replace('T', ' '), cashier: 'cashier', customer: 'Sample Customer', subtotal: 520000, discount: 20000, tax: 0, total: 500000,
  items: [{ name: 'Cotton Lawn - Floral', sku: '1001', unit: 'm', qty: 3500, unit_price: 85000, discount: 0, line_total: 297500 }, { name: 'Cotton Kurta M', sku: '2001-M', unit: 'pc', qty: 1000, unit_price: 180000, discount: 20000, line_total: 160000 }], payments: [{ method: 'cash', amount: 500000 }] };

export default function Settings({ settings, reloadSettings }) {
  const toast = useToast(); const [f, setF] = useState(null), [prev, setPrev] = useState(null);
  const cur = useAsync(async () => Object.fromEntries((await api('settings')).map((r) => [r.key, r.value])), []);
  useEffect(() => { if (cur.data) setF({ ...cur.data, tax_pct: String((+cur.data.tax_rate_bp || 0) / 100) }); }, [cur.data]);
  if (!f) return <Loading />;
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value });
  const save = async () => {
    try { const { tax_pct, ...rest } = f; await api('settings', { ...rest, tax_rate_bp: Math.round((parseFloat(tax_pct) || 0) * 100) }); await reloadSettings(); toast('Settings saved'); } catch (e) { toast(e.message, 'err'); }
  };
  const logo = (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 300000) return toast('Logo must be under 300 KB', 'err'); const r = new FileReader(); r.onload = () => setF({ ...f, store_logo: r.result }); r.readAsDataURL(file); };
  const exp = async (t) => { try { downloadText(`${t}.csv`, await apiText('export?table=' + t)); } catch (e) { toast(e.message, 'err'); } };
  const backup = async () => { try { const r = await api('backup', {}); toast('Backup saved: ' + r.path, 'info'); } catch (e) { toast(e.message, 'err'); } };

  return (
    <>
      <PageHead title="Settings" sub="Shop details, receipts, tax and data"><button className="btn primary" onClick={save} data-testid="save-settings"><LuSave /> Save settings</button></PageHead>
      <div className="grid g2">
        <div className="card"><h3>Shop details</h3><div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Shop name"><input className="input" value={f.store_name || ''} onChange={s('store_name')} data-testid="set-name" /></Field>
          <Field label="Phone"><input className="input" value={f.store_phone || ''} onChange={s('store_phone')} /></Field>
          <Field label="Address"><input className="input" value={f.store_address || ''} onChange={s('store_address')} /></Field>
          <Field label="Receipt footer"><input className="input" value={f.footer || ''} onChange={s('footer')} /></Field>
          <Field label="Logo (PNG/JPG, under 300 KB)"><div className="row"><input type="file" accept="image/*" onChange={logo} />{f.store_logo && <img src={f.store_logo} alt="logo" style={{ height: 36 }} />}</div></Field>
        </div></div>
        <div className="card"><h3>Billing &amp; printing</h3><div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Default receipt size"><select className="input" value={f.receipt_size || '80'} onChange={s('receipt_size')}><option value="58">58 mm thermal</option><option value="80">80 mm thermal</option><option value="A4">A4 invoice</option></select></Field>
          <Field label="Invoice prefix"><input className="input" value={f.invoice_prefix || 'INV'} onChange={s('invoice_prefix')} /></Field>
          <label className="row"><input type="checkbox" checked={f.tax_enabled === '1'} onChange={s('tax_enabled')} data-testid="set-tax" /> Charge sales tax</label>
          <Field label="Tax rate (%)"><input className="input" inputMode="decimal" value={f.tax_pct} onChange={s('tax_pct')} disabled={f.tax_enabled !== '1'} /></Field>
          <div className="row"><span className="muted small">Preview a template:</span>{['58', '80', 'A4'].map((z) => <button key={z} className="btn sm" onClick={() => setPrev({ z, html: invoiceHtml({ ...SAMPLE, store: f }, z) })}><LuPrinter /> {z === 'A4' ? 'A4' : z + 'mm'}</button>)}</div>
        </div></div>
        <div className="card"><h3><LuDatabaseBackup /> Backup</h3><p className="muted">Saves a full copy of the database next to the app (in the <span className="kbd">data</span> folder).</p><button className="btn" onClick={backup} data-testid="backup-btn"><LuDatabaseBackup /> Back up now</button></div>
        <div className="card"><h3><LuDownload /> Export data (CSV)</h3><div className="row">{TABLES.map((t) => <button key={t} className="btn sm" onClick={() => exp(t)}>{t}</button>)}</div></div>
      </div>
      {prev && <PrintPreview title={`Sample ${prev.z === 'A4' ? 'A4' : prev.z + 'mm'} invoice`} html={prev.html} onClose={() => setPrev(null)} />}
    </>
  );
}
