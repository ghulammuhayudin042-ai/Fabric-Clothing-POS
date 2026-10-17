import { M, Q, esc, cleanName } from './fmt';
import { barcodeSvg } from '../components/Barcode';

/** Builds a complete HTML document for the print preview iframe. size: '58' | '80' | 'A4' */
export function invoiceHtml(v, size = '80') {
  const s = v.store || {};
  const paid = v.payments.reduce((a, p) => a + p.amount, 0), due = v.total - paid;
  const logo = s.store_logo ? `<img src="${s.store_logo}" style="max-height:48px;max-width:100%">` : '';
  const bc = barcodeSvg(v.invoice_no, { height: size === 'A4' ? 40 : 34, width: size === '58' ? 1.4 : 1.8, fontSize: 11 });
  const methods = v.payments.map((p) => p.method).join(' + ') || '-';
  const totals = `
    <div class="t"><span>Subtotal</span><b>${M(v.subtotal)}</b></div>
    ${v.discount ? `<div class="t"><span>Discount</span><b>-${M(v.discount)}</b></div>` : ''}
    ${v.tax ? `<div class="t"><span>Tax</span><b>${M(v.tax)}</b></div>` : ''}
    <div class="t g"><span>TOTAL</span><b>${M(v.total)}</b></div>
    <div class="t"><span>Paid (${esc(methods)})</span><b>${M(paid)}</b></div>
    ${due > 0 ? `<div class="t"><span>Balance due</span><b>${M(due)}</b></div>` : ''}`;
  const foot = `<p class="ctr">${esc(s.footer || 'Thank you for shopping with us!')}</p><div class="ctr">${bc}</div>`;
  if (size === 'A4') {
    const rows = v.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(cleanName(i.name))}<div class="sku">${esc(i.sku)}</div></td><td class="r">${Q(i.qty)} ${esc(i.unit)}</td><td class="r">${M(i.unit_price)}</td><td class="r">${M(i.discount)}</td><td class="r">${M(i.line_total)}</td></tr>`).join('');
    return doc(`@page{size:A4;margin:14mm}body{font:13px/1.45 'Segoe UI',Arial,sans-serif;color:#0f1c3a}
      .h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:16px}
      .h h2{margin:6px 0 2px;font-size:22px;color:#1d4ed8}.inv{text-align:right}.inv h1{margin:0 0 4px;font-size:20px;letter-spacing:.04em}
      table{width:100%;border-collapse:collapse}th{background:#eef3ff;text-align:left;padding:8px;font-size:12px}td{padding:8px;border-bottom:1px solid #e1e8f4;vertical-align:top}
      .r{text-align:right}.sku{color:#7b8aa8;font-size:11px}.t{display:flex;justify-content:space-between;padding:4px 0}.g{font-size:17px;border-top:2px solid #0f1c3a;margin-top:4px;padding-top:6px}.ctr{text-align:center}
      .tot{width:290px;margin:16px 0 0 auto}.status{margin:14px 0;font-weight:700}.sign{margin-top:70px;display:flex;justify-content:space-between;color:#4a5a7a}`,
      `<div class="h"><div>${logo}<h2>${esc(s.store_name || 'Store')}</h2><div>${esc(s.store_address || '')}</div><div>${esc(s.store_phone || '')}</div></div>
       <div class="inv"><h1>INVOICE</h1><div><b>${esc(v.invoice_no)}</b></div><div>${esc(v.ts)}</div><div>Cashier: ${esc(v.cashier || '-')}</div>${v.customer ? `<div>Customer: <b>${esc(cleanName(v.customer))}</b></div>` : ''}</div></div>
       <table><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Discount</th><th class="r">Total</th></tr>${rows}</table>
       <div class="tot">${totals}</div><div class="status">Payment status: ${due > 0 ? 'PARTIAL / ON CREDIT' : 'PAID IN FULL'}</div>
       <div class="sign"><span>Customer signature: ________________</span><span>Authorized signature: ________________</span></div>${foot}`);
  }
  const w = size === '58' ? '58mm' : '80mm', small = size === '58';
  const rows = v.items.map((i) => `<div class="nm">${esc(cleanName(i.name))}</div><div class="t"><span>${Q(i.qty)} ${esc(i.unit)} × ${M(i.unit_price).replace('PKR ', '')}</span><b>${M(i.line_total).replace('PKR ', '')}</b></div>`).join('');
  return doc(`@page{size:${w} auto;margin:0}body{width:${w};margin:0;padding:3mm;font:${small ? '10px' : '12px'}/1.35 'Courier New',monospace;color:#000}
    h2{margin:2px 0;font-size:${small ? '13px' : '16px'}}.ctr{text-align:center}.t{display:flex;justify-content:space-between;gap:6px}.nm{font-weight:700;margin-top:4px}.g{font-size:${small ? '12px' : '15px'};font-weight:700;border-top:1px dashed #000;margin-top:3px;padding-top:3px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}svg{max-width:100%}`,
    `<div class="ctr">${logo}<h2>${esc(s.store_name || 'Store')}</h2><div>${esc(s.store_address || '')}</div><div>${esc(s.store_phone || '')}</div></div><hr>
     <div>Invoice: <b>${esc(v.invoice_no)}</b></div><div>${esc(v.ts)}</div><div>Cashier: ${esc(v.cashier || '-')}</div>${v.customer ? `<div>Customer: ${esc(cleanName(v.customer))}</div>` : ''}<hr>
     ${rows}<hr>${totals}<hr>${foot}`);
}

export function labelsHtml(items, size = '50x30') {
  const [wm, hm] = size.split('x').map(Number);
  const labels = items.flatMap((p) => Array.from({ length: p.copies || 1 }, () => `<div class="l"><b>${esc(cleanName(p.name))}</b>${barcodeSvg(p.barcode || p.sku, { height: Math.max(18, hm * 0.9), width: 1.6, fontSize: 10 })}<span>${p.sale_price ? M(p.sale_price) + ' / ' + esc(p.unit) : ''}</span></div>`)).join('');
  return doc(`@page{size:${wm}mm ${hm}mm;margin:0}body{margin:0;font-family:Arial,sans-serif}
    .l{width:${wm}mm;height:${hm}mm;padding:1.5mm;text-align:center;overflow:hidden;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
    .l b{font-size:8px;max-height:20px;overflow:hidden;line-height:1.1}.l span{font-size:9px;font-weight:700}.l svg{max-width:94%;max-height:${hm * 0.5}mm}`, labels);
}
export function reportHtml(title, subtitle, head, rows, totalRow) {
  return doc(`@page{size:A4;margin:14mm}body{font:12.5px 'Segoe UI',Arial,sans-serif;color:#0f1c3a}h1{margin:0;color:#1d4ed8;font-size:22px}p{margin:2px 0 14px;color:#4a5a7a}
    table{width:100%;border-collapse:collapse}th{background:#eef3ff;text-align:left;padding:7px;font-size:12px}td{padding:7px;border-bottom:1px solid #e1e8f4}.r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #0f1c3a}`,
    `<h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><tr>${head.map((h, i) => `<th class="${i ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr>
     ${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
     ${totalRow ? `<tfoot><tr>${totalRow.map((c, i) => `<td class="${i ? 'r' : ''}">${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`);
}
const doc = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>*{box-sizing:border-box}${css}</style></head><body>${body}</body></html>`;
