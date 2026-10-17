// Money is integer paisa, quantities are integer milli-units (same as the server).
export const M = (p = 0) => 'PKR ' + (p / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const Mshort = (p = 0) => { const v = p / 100, a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? (a / 1e5).toFixed(2) + ' Lac' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a.toFixed(0)); };
export const Q = (m = 0) => String(+(m / 1000).toFixed(3));
export const today = () => new Date().toLocaleDateString('en-CA');
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
export const shortDate = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
export const dt = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cleanName = (n) => String(n ?? '').replace(/^\[DEMO\]\s*/, '');
export const UNITS = ['m', 'yd', 'pc', 'suit', 'roll', 'kg'];
export const cashStr = (p) => (p / 100).toFixed(2);
// qty input rules mirror server: whole numbers for pc/suit/roll, up to 3 decimals otherwise
export const wholeUnit = (u) => ['pc', 'suit', 'roll'].includes(u);
export function downloadText(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
