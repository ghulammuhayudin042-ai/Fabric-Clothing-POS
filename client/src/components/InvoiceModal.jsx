import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { invoiceHtml } from '../lib/print.js';
import PrintPreview from './PrintPreview.jsx';
import { Modal } from './ui.jsx';

/** Loads an invoice and shows it with 58mm / 80mm / A4 template switch. */
export default function InvoiceModal({ saleId, onClose, defaultSize = '80', extra }) {
  const [v, setV] = useState(null), [size, setSize] = useState(defaultSize || '80'), [err, setErr] = useState('');
  useEffect(() => { api('invoice?id=' + saleId).then(setV).catch((e) => setErr(e.message)); }, [saleId]);
  if (err) return <Modal title="Invoice" onClose={onClose}><div className="alert bad">{err}</div></Modal>;
  if (!v) return <Modal title="Invoice" onClose={onClose}>Loading…</Modal>;
  return (
    <PrintPreview title={`Invoice ${v.invoice_no}`} html={invoiceHtml(v, size)} onClose={onClose}
      extra={<><div className="seg" style={{ marginRight: 'auto' }}>{['58', '80', 'A4'].map((z) => <button key={z} className={size === z ? 'on' : ''} onClick={() => setSize(z)} data-testid={`size-${z}`}>{z === 'A4' ? 'A4' : `${z}mm`}</button>)}</div>{extra}</>} />
  );
}
