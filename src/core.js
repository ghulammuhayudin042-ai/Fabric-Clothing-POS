import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { lineTotal, toMilli, toPaisa } from './money.js';

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  return db;
}
export let depth = 0; // nested calls (e.g. exchange = return + sale) join the outer transaction
const tx = (db, fn) => { if (depth > 0) { depth++; try { return fn(); } finally { depth--; } } db.exec('BEGIN IMMEDIATE'); depth = 1; try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth = 0; } };
const setting = (db, k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
const audit = (db, user, action, type, id, detail) => db.prepare('INSERT INTO audit_logs(user_id,action,record_type,record_id,detail) VALUES(?,?,?,?,?)').run(user ?? null, action, type, id ?? null, detail ? JSON.stringify(detail) : null);
const nextInvoice = (db) => { const p = setting(db, 'invoice_prefix'); db.prepare('INSERT OR IGNORE INTO invoice_sequences(prefix) VALUES(?)').run(p); db.prepare('UPDATE invoice_sequences SET last_no=last_no+1 WHERE prefix=?').run(p); return `${p}-${String(db.prepare('SELECT last_no n FROM invoice_sequences WHERE prefix=?').get(p).n).padStart(6,'0')}`; };

const costOf = (db, p) => { if (!p.is_suit) return p.cost_price; const c = db.prepare('SELECT SUM(p.cost_price*s.qty/1000.0) v,COUNT(*) n FROM suit_components s JOIN products p ON p.id=s.component_id WHERE s.suit_id=?').get(p.id); return c.n ? Math.round(c.v) : p.cost_price; };
function move(db, { productId, rollId = null, qty, type, srcType, srcId, userId, note }) {
  db.prepare('INSERT INTO stock_movements(product_id,roll_id,qty,type,source_type,source_id,user_id,note) VALUES(?,?,?,?,?,?,?,?)').run(productId, rollId, qty, type, srcType, srcId, userId ?? null, note ?? null);
  db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(qty, productId);
  if (rollId) db.prepare('UPDATE fabric_rolls SET remaining_length=remaining_length+? WHERE id=?').run(qty, rollId);
}
/** sign -1 = deduct, +1 = restore. Suits with components expand to component stock. */
function stockOut(db, p, qty, ctx, sign = -1) {
  const comps = p.is_suit ? db.prepare('SELECT component_id,qty FROM suit_components WHERE suit_id=?').all(p.id) : [];
  const targets = comps.length ? comps.map(c => ({ id: c.component_id, q: Math.round(c.qty * qty / 1000) })) : [{ id: p.id, q: qty }];
  for (const t of targets) {
    const row = db.prepare('SELECT * FROM products WHERE id=?').get(t.id);
    const roll = ctx.rollId && t.id === p.id ? db.prepare('SELECT * FROM fabric_rolls WHERE id=?').get(ctx.rollId) : null;
    const avail = roll ? roll.remaining_length : row.stock;
    if (sign < 0 && avail < t.q) {
      const allowed = ctx.override?.userId;
      if (!allowed) throw new Error(`Insufficient stock for ${row.name}: have ${avail / 1000}, need ${t.q / 1000}`);
      audit(db, allowed, 'NEGATIVE_STOCK_OVERRIDE', 'product', row.id, { need: t.q, avail });
    }
    move(db, { productId: row.id, rollId: roll?.id, qty: sign * t.q, type: ctx.type, srcType: ctx.srcType, srcId: ctx.srcId, userId: ctx.userId });
  }
}

export function createSale(db, { cashierId, customerId = null, items, billDiscount = '0', payments = [], override = null, clientToken = null }) {
  return tx(db, () => {
    if (clientToken) { const dup = db.prepare('SELECT id FROM sales WHERE client_token=?').get(clientToken); if (dup) return { saleId: dup.id, duplicate: true }; }
    if (!items?.length) throw new Error('Cart is empty');
    const taxOn = setting(db, 'tax_enabled') === '1', rateBp = +setting(db, 'tax_rate_bp');
    const lines = items.map(it => {
      const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.productId); if (!p) throw new Error('Product unavailable');
      if (it.rollId) { const ro = db.prepare('SELECT product_id FROM fabric_rolls WHERE id=?').get(it.rollId); if (!ro || ro.product_id !== p.id) throw new Error('Selected roll does not belong to this product'); }
      const dec = db.prepare('SELECT decimals FROM units WHERE code=?').get(p.unit).decimals;
      if (dec === 0 && !/^\d+$/.test(String(it.qty))) throw new Error(`${p.name} must be sold in whole ${p.unit}`);
      const qty = toMilli(it.qty); if (qty <= 0) throw new Error('Quantity must be > 0');
      const price = it.unitPrice != null ? toPaisa(it.unitPrice) : p.sale_price, disc = toPaisa(it.discount ?? 0);
      const gross = lineTotal(qty, price); if (disc > gross) throw new Error('Discount exceeds line total');
      return { p, qty, price, disc, total: gross - disc, rollId: it.rollId ?? null };
    });
    const subtotal = lines.reduce((s, l) => s + l.total, 0), bd = toPaisa(billDiscount);
    if (bd > subtotal) throw new Error('Bill discount exceeds subtotal');
    const taxable = subtotal - bd, tax = taxOn ? Math.round(taxable * rateBp / 10000) : 0, total = taxable + tax;
    const paid = payments.reduce((s, x) => s + toPaisa(x.amount), 0);
    if (paid < total && !customerId) throw new Error('Walk-in sales must be paid in full; select a customer for credit/udhaar');
    if (customerId && paid < total) { const c = db.prepare('SELECT * FROM customers WHERE id=?').get(customerId); if (c.credit_limit && customerBalance(db, customerId) + total - paid > c.credit_limit) throw new Error('Credit limit exceeded'); }
    const invoiceNo = nextInvoice(db);
    const sid = Number(db.prepare('INSERT INTO sales(invoice_no,cashier_id,customer_id,subtotal,discount,tax,total,client_token) VALUES(?,?,?,?,?,?,?,?)').run(invoiceNo, cashierId, customerId, subtotal, bd, tax, total, clientToken).lastInsertRowid);
    for (const l of lines) {
      db.prepare('INSERT INTO sale_items(sale_id,product_id,roll_id,unit,qty,unit_price,discount,line_total,cost_snapshot) VALUES(?,?,?,?,?,?,?,?,?)').run(sid, l.p.id, l.rollId, l.p.unit, l.qty, l.price, l.disc, l.total, costOf(db, l.p));
      stockOut(db, l.p, l.qty, { rollId: l.rollId, type: 'sale', srcType: 'sale', srcId: sid, userId: cashierId, override });
    }
    let remaining = total; // recorded amounts are capped at total; excess is change
    for (const x of payments) { const a = Math.min(toPaisa(x.amount), remaining); if (a > 0) db.prepare('INSERT INTO payments(sale_id,customer_id,method,amount,reference,kind) VALUES(?,?,?,?,?,?)').run(sid, customerId, x.method, a, x.reference ?? null, x.method === 'exchange_credit' ? 'credit' : 'sale'); remaining -= a; }
    audit(db, cashierId, 'SALE_CREATED', 'sale', sid, { invoiceNo, total });
    return { saleId: sid, invoiceNo, total, paid: Math.min(paid, total), balanceDue: Math.max(total - paid, 0), change: Math.max(paid - total, 0) };
  });
}

export function returnItems(db, { saleId, userId, items, reason, restock = true, refundMode = 'cash', exchange = false }) {
  return tx(db, () => {
    const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId); if (!sale) throw new Error('Original invoice not found');
    let refund = 0; const rows = [];
    for (const it of items) {
      const si = db.prepare('SELECT * FROM sale_items WHERE id=? AND sale_id=?').get(it.saleItemId, saleId); if (!si) throw new Error('Line not on this invoice');
      const q = toMilli(it.qty); if (q <= 0 || q > si.qty - si.returned_qty) throw new Error('Return quantity exceeds remaining sold quantity');
      const amt = Math.round(si.line_total * q / si.qty); refund += amt; rows.push({ si, q, amt });
    }
    const rid = Number(db.prepare('INSERT INTO returns(sale_id,user_id,reason,refund_amount,refund_mode,restock) VALUES(?,?,?,?,?,?)').run(saleId, userId, reason ?? null, refund, refundMode, restock ? 1 : 0).lastInsertRowid);
    for (const { si, q, amt } of rows) {
      db.prepare('INSERT INTO return_items(return_id,sale_item_id,qty,amount) VALUES(?,?,?,?)').run(rid, si.id, q, amt);
      db.prepare('UPDATE sale_items SET returned_qty=returned_qty+? WHERE id=?').run(q, si.id);
      if (restock) stockOut(db, db.prepare('SELECT * FROM products WHERE id=?').get(si.product_id), q, { rollId: si.roll_id, type: 'return', srcType: 'return', srcId: rid, userId }, +1);
    }
    // Refund first offsets any unpaid balance on this invoice; the rest is paid out.
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE sale_id=?").get(saleId).s;
    const due = Math.max(sale.total - paid, 0), offset = Math.min(due, refund), cashOut = refund - offset;
    if (cashOut > 0 && !exchange) db.prepare("INSERT INTO payments(sale_id,customer_id,method,amount,kind) VALUES(?,?,?,?,'refund')").run(saleId, sale.customer_id, refundMode, -cashOut);
    audit(db, userId, 'RETURN', 'return', rid, { saleId, refund, reason });
    return { returnId: rid, refund, cashOut, offset };
  });
}

export function receivePurchase(db, { supplierId, userId, refNo, items, paid = '0' }) {
  return tx(db, () => {
    const prepared = items.map(i => ({ ...i, qty: toMilli(i.qty), cost: toPaisa(i.unitCost) }));
    const total = prepared.reduce((s, i) => s + lineTotal(i.qty, i.cost), 0);
    const pid = Number(db.prepare('INSERT INTO purchases(supplier_id,ref_no,total,paid) VALUES(?,?,?,?)').run(supplierId, refNo ?? null, total, toPaisa(paid)).lastInsertRowid);
    for (const i of prepared) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(i.productId);
      let rollId = null;
      if (i.rollCode) rollId = Number(db.prepare('INSERT INTO fabric_rolls(roll_code,product_id,initial_length,remaining_length,cost_per_unit) VALUES(?,?,?,0,?)').run(i.rollCode, p.id, i.qty, i.cost).lastInsertRowid);
      const base = Math.max(p.stock, 0), newAvg = Math.round((base * p.cost_price + i.qty * i.cost) / (base + i.qty)); // weighted average
      db.prepare('UPDATE products SET cost_price=? WHERE id=?').run(newAvg, p.id);
      db.prepare('INSERT INTO purchase_items(purchase_id,product_id,roll_id,qty,unit_cost) VALUES(?,?,?,?,?)').run(pid, p.id, rollId, i.qty, i.cost);
      move(db, { productId: p.id, rollId, qty: i.qty, type: 'purchase', srcType: 'purchase', srcId: pid, userId });
    }
    audit(db, userId, 'PURCHASE_RECEIVED', 'purchase', pid, { total });
    return { purchaseId: pid, total };
  });
}

// opening + billed - refunds on those invoices - payments received
export const customerBalance = (db, id) => {
  const ob = db.prepare('SELECT opening_balance ob FROM customers WHERE id=?').get(id).ob;
  const billed = db.prepare("SELECT COALESCE(SUM(total),0) s FROM sales WHERE customer_id=?").get(id).s;
  const ret = db.prepare("SELECT COALESCE(SUM(r.refund_amount),0) s FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=?").get(id).s;
  const pay = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE customer_id=? AND kind IN('sale','ledger')").get(id).s;
  const paidOut = db.prepare("SELECT COALESCE(SUM(-amount),0) s FROM payments WHERE customer_id=? AND kind='refund'").get(id).s;
  return ob + billed - ret - pay + paidOut; // cash refunded to customer is added back
};

// ================= security, shifts, extras =================
export const PERMS = { admin: ['*'], manager: ['sale', 'return', 'override', 'purchase', 'product', 'report', 'expense', 'adjust', 'customer', 'shift', 'audit'], cashier: ['sale', 'customer', 'shift'] };
export const can = (role, perm) => PERMS[role]?.includes('*') || PERMS[role]?.includes(perm) || false;
export const hashPw = (pw, salt = crypto.randomBytes(8).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
export function ensureAdmin(db) { // clean DB gets one admin (admin / admin123) - change the password after first login
  for (const [r, ps] of Object.entries(PERMS)) for (const x of ps) db.prepare('INSERT OR IGNORE INTO permissions VALUES(?,?)').run(r, x);
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) createUser(db, { username: 'admin', password: 'admin123', role: 'admin' });
}
export function createUser(db, { username, password, role }) {
  if (!PERMS[role]) throw new Error('Unknown role'); if (!username || String(password || '').length < 6) throw new Error('Username required and password must be 6+ characters');
  return Number(db.prepare('INSERT INTO users(username,pass_hash,role) VALUES(?,?,?)').run(username, hashPw(password), role).lastInsertRowid);
}
export function login(db, username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
  if (!u || hashPw(password, u.pass_hash.split(':')[0]) !== u.pass_hash) { audit(db, u?.id, 'LOGIN_FAILED', 'user', u?.id, { username }); throw new Error('Wrong username or password'); }
  audit(db, u.id, 'LOGIN', 'user', u.id); return { id: u.id, username: u.username, role: u.role };
}
export function verifyOverride(db, { username, password }) { const u = login(db, username, password); if (!can(u.role, 'override')) throw new Error('This user cannot authorize overrides'); return u.id; }

export function openShift(db, userId, cash) {
  if (db.prepare('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL').get(userId)) throw new Error('A shift is already open');
  const id = Number(db.prepare('INSERT INTO shifts(user_id,opening_cash) VALUES(?,?)').run(userId, toPaisa(cash)).lastInsertRowid); audit(db, userId, 'SHIFT_OPEN', 'shift', id); return { id };
}
export const currentShift = (db, userId) => db.prepare('SELECT * FROM shifts WHERE user_id=? AND closed_at IS NULL').get(userId) ?? null;
export function closeShift(db, userId, closingCash) {
  const sh = currentShift(db, userId); if (!sh) throw new Error('No open shift');
  const net = db.prepare("SELECT COALESCE(SUM(p.amount),0) v FROM payments p JOIN sales s ON s.id=p.sale_id WHERE s.cashier_id=? AND p.method='cash' AND p.kind IN('sale','refund') AND p.ts>=?").get(userId, sh.opened_at).v;
  const expected = sh.opening_cash + net, counted = toPaisa(closingCash);
  db.prepare("UPDATE shifts SET closed_at=datetime('now','localtime'),closing_cash=? WHERE id=?").run(counted, sh.id);
  audit(db, userId, 'SHIFT_CLOSE', 'shift', sh.id, { expected, counted, difference: counted - expected });
  return { expected, counted, difference: counted - expected };
}
export function addExpense(db, { title, amount, userId }) { if (!title) throw new Error('Title required'); const id = Number(db.prepare('INSERT INTO expenses(title,amount) VALUES(?,?)').run(title, toPaisa(amount)).lastInsertRowid); audit(db, userId, 'EXPENSE', 'expense', id, { title, amount }); return { id }; }

export function adjustStock(db, { productId, qty, type = 'adjustment', userId, note, rollId = null }) {
  return tx(db, () => {
    if (!['adjustment', 'damage'].includes(type)) throw new Error('Type must be adjustment or damage');
    const neg = String(qty).trim().startsWith('-'), m = toMilli(String(qty).replace('-', '')); if (!m) throw new Error('Quantity must be > 0');
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId); if (!p || p.is_suit) throw new Error('Choose a stock item (not a suit set)');
    const roll = rollId ? db.prepare('SELECT * FROM fabric_rolls WHERE id=? AND product_id=?').get(rollId, productId) : null;
    if (neg && (roll ? roll.remaining_length : p.stock) < m) throw new Error('Cannot reduce below zero');
    move(db, { productId, rollId: roll?.id, qty: neg ? -m : m, type, srcType: 'adjustment', srcId: null, userId, note });
    audit(db, userId, 'STOCK_' + type.toUpperCase(), 'product', productId, { qty, note }); return { stock: db.prepare('SELECT stock FROM products WHERE id=?').get(productId).stock };
  });
}

export function exchange(db, { saleId, userId, returned, newItems, payments = [], reason, override = null }) {
  return tx(db, () => {
    const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
    const ret = returnItems(db, { saleId, userId, items: returned, reason: reason || 'Exchange', exchange: true });
    const credit = ret.refund - ret.offset;
    const ns = createSale(db, { cashierId: userId, customerId: sale.customer_id, items: newItems, override, payments: [{ method: 'exchange_credit', amount: (credit / 100).toFixed(2) }, ...payments] });
    const leftover = credit - Math.min(credit, ns.total);
    if (leftover > 0) db.prepare("INSERT INTO payments(sale_id,customer_id,method,amount,kind) VALUES(?,?,'cash',?,'refund')").run(saleId, sale.customer_id, -leftover);
    audit(db, userId, 'EXCHANGE', 'sale', saleId, { newSale: ns.saleId, credit, leftover }); return { ...ns, returnId: ret.returnId, credit, cashBack: leftover };
  });
}

export function purchaseReturn(db, { purchaseId, userId, items }) {
  return tx(db, () => {
    const pu = db.prepare('SELECT * FROM purchases WHERE id=?').get(purchaseId); if (!pu) throw new Error('Purchase not found'); let amount = 0;
    for (const it of items) {
      const pi = db.prepare('SELECT * FROM purchase_items WHERE id=? AND purchase_id=?').get(it.purchaseItemId, purchaseId); if (!pi) throw new Error('Line not on this purchase');
      const q = toMilli(it.qty); if (q <= 0 || q > pi.qty - pi.returned_qty) throw new Error('Return quantity exceeds received quantity');
      const p = db.prepare('SELECT stock FROM products WHERE id=?').get(pi.product_id), roll = pi.roll_id ? db.prepare('SELECT remaining_length r FROM fabric_rolls WHERE id=?').get(pi.roll_id) : null;
      if (p.stock < q || (roll && roll.r < q)) throw new Error('Not enough stock left to return to supplier');
      move(db, { productId: pi.product_id, rollId: pi.roll_id, qty: -q, type: 'return', srcType: 'purchase_return', srcId: purchaseId, userId });
      db.prepare('UPDATE purchase_items SET returned_qty=returned_qty+? WHERE id=?').run(q, pi.id); amount += lineTotal(q, pi.unit_cost);
    }
    db.prepare('INSERT INTO purchase_returns(purchase_id,supplier_id,amount,user_id) VALUES(?,?,?,?)').run(purchaseId, pu.supplier_id, amount, userId);
    audit(db, userId, 'PURCHASE_RETURN', 'purchase', purchaseId, { amount }); return { amount };
  });
}
export const paySupplier = (db, { supplierId, amount, reference }) => { db.prepare('INSERT INTO supplier_payments(supplier_id,amount,reference) VALUES(?,?,?)').run(supplierId, toPaisa(amount), reference ?? null); return { balance: supplierBalance(db, supplierId) }; };
export const supplierBalance = (db, id) => { const g = (q) => db.prepare(q).get(id).v;
  return g('SELECT opening_balance v FROM suppliers WHERE id=?') + g('SELECT COALESCE(SUM(total-paid),0) v FROM purchases WHERE supplier_id=?') - g('SELECT COALESCE(SUM(amount),0) v FROM supplier_payments WHERE supplier_id=?') - g('SELECT COALESCE(SUM(amount),0) v FROM purchase_returns WHERE supplier_id=?'); };

const genBarcode = (db) => { for (;;) { const c = '2' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0'); if (!db.prepare('SELECT 1 FROM products WHERE barcode=? OR sku=?').get(c, c)) return c; } };
export function createProduct(db, b, userId) {
  return tx(db, () => {
    if (!b.sku || !b.name) throw new Error('SKU and name are required'); if (!db.prepare('SELECT 1 FROM units WHERE code=?').get(b.unit)) throw new Error('Unknown unit');
    const id = Number(db.prepare('INSERT INTO products(sku,barcode,name,category_id,parent_id,brand,fabric,color,design,size,unit,cost_price,sale_price,wholesale_price,reorder_level,supplier_id,is_suit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(b.sku, b.barcode || genBarcode(db), b.name, b.category_id || null, b.parent_id || null, b.brand || null, b.fabric || null, b.color || null, b.design || null, b.size || null, b.unit, toPaisa(b.cost_price || 0), toPaisa(b.sale_price || 0), b.wholesale_price ? toPaisa(b.wholesale_price) : null, toMilli(b.reorder_level || 0), b.supplier_id || null, b.components?.length ? 1 : (b.is_suit ? 1 : 0)).lastInsertRowid);
    for (const c of b.components || []) { const cp = db.prepare('SELECT id FROM products WHERE sku=? OR barcode=?').get(c.sku, c.sku); if (!cp) throw new Error(`Component ${c.sku} not found`); db.prepare('INSERT INTO suit_components VALUES(?,?,?)').run(id, cp.id, toMilli(c.qty)); }
    audit(db, userId, 'PRODUCT_CREATED', 'product', id, { sku: b.sku }); return { id };
  });
}
export function createVariants(db, b, userId) { // e.g. sizes "S,M,L,XL" -> one SKU, barcode and stock record per size
  return tx(db, () => (b.sizes || []).map(sz => createProduct(db, { ...b, sku: `${b.sku}-${sz}`, size: sz, barcode: null }, userId).id));
}
