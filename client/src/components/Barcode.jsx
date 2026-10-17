import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/** Real Code128 barcode (readable by any USB scanner or phone camera). */
export function barcodeSvg(value, { height = 50, width = 2, text = true, fontSize = 13, margin = 0 } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(el, String(value), { format: 'CODE128', height, width, displayValue: text, fontSize, margin, background: 'transparent', textMargin: 2 }); }
  catch { return ''; }
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return el.outerHTML;
}
export default function Barcode({ value, ...opts }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try { JsBarcode(ref.current, String(value), { format: 'CODE128', height: 50, width: 2, fontSize: 13, margin: 0, background: 'transparent', ...opts }); } catch { /* invalid value */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <svg ref={ref} className="barcode-svg" />;
}
