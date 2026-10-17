// Integer-only math. qty in milli-units, money in paisa.
export const toMilli = (v) => { const s = String(v).trim(); if (!/^\d+(\.\d{1,3})?$/.test(s)) throw new Error(`Invalid quantity: ${v}`); const [a,b=''] = s.split('.'); return +a*1000 + +(b+'000').slice(0,3); };
export const toPaisa = (v) => { const s = String(v).trim(); if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid amount: ${v}`); const [a,b=''] = s.split('.'); return +a*100 + +(b+'00').slice(0,2); };
export const lineTotal = (qtyMilli, pricePaisa) => Math.round(qtyMilli * pricePaisa / 1000);
export const fmtQty = (m, d=3) => (m/1000).toFixed(d).replace(/\.?0+$/,'') || '0';
export const fmtMoney = (p) => `PKR ${(p/100).toLocaleString('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
