// Demo data for Fabric POS. Everything is created through the same core functions the app uses,
// so stock, rolls, ledgers and reports stay consistent. Every demo record is marked [DEMO] / is_demo=1.
// Re-run safe: does nothing if products already exist. For a clean DB just delete data/pos.db.
import { openDb, ensureAdmin, createUser, createProduct, createVariants, receivePurchase, createSale, returnItems, paySupplier, addExpense } from './core.js';
import { toPaisa } from './money.js';
import fs from 'node:fs';

fs.mkdirSync('data', { recursive: true });
const db = openDb('data/pos.db');
const run = (s, ...p) => db.prepare(s).run(...p);
const all = (s, ...p) => db.prepare(s).all(...p);
const get = (s, ...p) => db.prepare(s).get(...p);

ensureAdmin(db);
if (get('SELECT COUNT(*) c FROM products').c) { console.log('Already seeded (delete data/pos.db for a fresh start)'); process.exit(); }

// deterministic pseudo-random so every install gets the same demo history
let seed = 20261017; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');
const stamp = (daysAgo, hour, min) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hour)}:${pad(min)}:${pad(int(0, 59))}`; };

// ---- users ----
const ADMIN = get("SELECT id FROM users WHERE username='admin'").id;
const MANAGER = createUser(db, { username: 'manager', password: 'manager123', role: 'manager' }).id ?? get("SELECT id FROM users WHERE username='manager'").id;
const CASHIER = get("SELECT id FROM users WHERE username='cashier'")?.id ?? createUser(db, { username: 'cashier', password: 'cashier123', role: 'cashier' }).id ?? get("SELECT id FROM users WHERE username='cashier'").id;
const cashiers = [CASHIER, CASHIER, MANAGER];

// ---- categories & suppliers ----
for (const c of ['Unstitched Fabric', 'Ready-made', 'Suits', 'Dupatta & Shawl', 'Accessories']) run('INSERT OR IGNORE INTO categories(name) VALUES(?)', c);
const cat = (n) => get('SELECT id FROM categories WHERE name=?', n).id;
const SUP = {};
for (const [k, name, phone, addr] of [
  ['mills', '[DEMO] Sahiwal Textile Mills', '0300-1000001', 'Sahiwal Industrial Estate'],
  ['faisal', '[DEMO] Faisalabad Cloth House', '0301-1000002', 'Kotwali Bazaar, Faisalabad'],
  ['lahore', '[DEMO] Lahore Fine Fabrics', '0302-1000003', 'Azam Cloth Market, Lahore']]) {
  SUP[k] = Number(run('INSERT INTO suppliers(name,phone,address) VALUES(?,?,?)', name, phone, addr).lastInsertRowid);
}

// ---- products (prices in PKR; qty in whole units) ----
const F = (sku, name, fabric, color, cost, price, supplier, reorder = 20) => createProduct(db, { sku, name: `[DEMO] ${name}`, category_id: cat('Unstitched Fabric'), fabric, color, unit: 'm', cost_price: 0, sale_price: price, wholesale_price: Math.round(price * 0.92), reorder_level: reorder, supplier_id: SUP[supplier], brand: 'DEMO' }, ADMIN).id;
const fabrics = {
  lawn: F('1001', 'Cotton Lawn - Floral', 'Cotton', 'Multi', 520, 850, 'mills'),
  wnw: F('1002', 'Wash & Wear', 'Polyester Blend', 'Charcoal', 600, 950, 'mills'),
  khaddar: F('1003', 'Khaddar - Winter', 'Khaddar', 'Maroon', 650, 1050, 'faisal', 30),
  linen: F('1004', 'Pure Linen', 'Linen', 'Beige', 900, 1450, 'lahore'),
  cambric: F('1005', 'Cambric Plain', 'Cambric', 'White', 380, 620, 'faisal'),
  boski: F('1006', 'Boski Premium', 'Boski', 'Cream', 1300, 2100, 'lahore'),
  velvet: F('1007', 'Velvet', 'Velvet', 'Bottle Green', 1100, 1800, 'lahore', 15),
  shirt: F('1101', 'Suit Shirt Fabric (internal)', 'Cotton', 'Sky Blue', 480, 0, 'mills', 0),
  trouser: F('1102', 'Suit Trouser Fabric (internal)', 'Cotton', 'Navy', 420, 0, 'mills', 0),
};
const dupatta = createProduct(db, { sku: '4001', name: '[DEMO] Chiffon Dupatta', category_id: cat('Dupatta & Shawl'), unit: 'pc', cost_price: 0, sale_price: 1400, reorder_level: 10, supplier_id: SUP.faisal, color: 'Pink' }, ADMIN).id;
const shawl = createProduct(db, { sku: '4002', name: '[DEMO] Wool Shawl', category_id: cat('Dupatta & Shawl'), unit: 'pc', cost_price: 0, sale_price: 3200, reorder_level: 5, supplier_id: SUP.lahore, color: 'Grey' }, ADMIN).id;
const kurta = createVariants(db, { sku: '2001', name: '[DEMO] Cotton Kurta', category_id: cat('Ready-made'), unit: 'pc', cost_price: 0, sale_price: 1800, reorder_level: 5, supplier_id: SUP.faisal, brand: 'DEMO', color: 'White', sizes: ['S', 'M', 'L', 'XL'] }, ADMIN);
const shalwar = createVariants(db, { sku: '2101', name: '[DEMO] Shalwar Kameez', category_id: cat('Ready-made'), unit: 'pc', cost_price: 0, sale_price: 3200, reorder_level: 5, supplier_id: SUP.faisal, brand: 'DEMO', color: 'Grey', sizes: ['M', 'L', 'XL'] }, ADMIN);
const waistcoat = createVariants(db, { sku: '2201', name: '[DEMO] Waistcoat', category_id: cat('Ready-made'), unit: 'pc', cost_price: 0, sale_price: 4500, reorder_level: 3, supplier_id: SUP.lahore, brand: 'DEMO', color: 'Black', sizes: ['M', 'L'] }, ADMIN);
const cap = createProduct(db, { sku: '5001', name: '[DEMO] Prayer Cap', category_id: cat('Accessories'), unit: 'pc', cost_price: 0, sale_price: 350, reorder_level: 10, supplier_id: SUP.faisal }, ADMIN).id;
const suit3 = createProduct(db, { sku: '3001', name: '[DEMO] 3-Piece Suit (Shirt + Trouser)', category_id: cat('Suits'), unit: 'suit', cost_price: 0, sale_price: 4500, components: [{ sku: '1101', qty: '2.5' }, { sku: '1102', qty: '2' }] }, ADMIN).id;
const suitWnw = createProduct(db, { sku: '3002', name: '[DEMO] Wash & Wear Suit Length', category_id: cat('Suits'), unit: 'suit', cost_price: 0, sale_price: 3300, components: [{ sku: '1002', qty: '3.5' }] }, ADMIN).id;

// ---- opening purchases (35-45 days ago). Fabric arrives as rolls; some items are deliberately low. ----
const roll = (n) => `R-DEMO-${String(n).padStart(3, '0')}`; let rn = 0;
const fabricRolls = (productId, lengths, cost) => lengths.map(l => ({ productId, qty: String(l), unitCost: String(cost), rollCode: roll(++rn) }));
const purchases = [
  ['mills', 'DEMO-PO-001', [...fabricRolls(fabrics.lawn, [90, 80, 70], 520), ...fabricRolls(fabrics.wnw, [80, 80, 70], 600), ...fabricRolls(fabrics.shirt, [150, 120], 480), ...fabricRolls(fabrics.trouser, [150, 120], 420)], 0.6],
  ['faisal', 'DEMO-PO-002', [...fabricRolls(fabrics.khaddar, [90, 80], 650), ...fabricRolls(fabrics.cambric, [100, 90], 380),
    { productId: dupatta, qty: '60', unitCost: '900' }, { productId: cap, qty: '60', unitCost: '180' },
    ...kurta.map(id => ({ productId: id, qty: '30', unitCost: '1100' })), ...shalwar.map(id => ({ productId: id, qty: '25', unitCost: '2100' }))], 1],
  ['lahore', 'DEMO-PO-003', [...fabricRolls(fabrics.linen, [50, 45], 900), ...fabricRolls(fabrics.boski, [40, 35], 1300), ...fabricRolls(fabrics.velvet, [30], 1100),
    { productId: shawl, qty: '12', unitCost: '2000' }, ...waistcoat.map(id => ({ productId: id, qty: '10', unitCost: '2800' }))], 0.5],
];
const backdate = (table, id, ts) => run(`UPDATE ${table} SET ts=? WHERE id=?`, ts, id);
purchases.forEach(([sup, ref, items, paidShare], i) => {
  const r = receivePurchase(db, { supplierId: SUP[sup], userId: ADMIN, refNo: ref, items, paid: '0' });
  const ts = stamp(44 - i * 3, 11, 20);
  backdate('purchases', r.purchaseId, ts); run("UPDATE stock_movements SET ts=? WHERE source_type='purchase' AND source_id=?", ts, r.purchaseId);
  run('UPDATE purchases SET paid=? WHERE id=?', Math.round(r.total * paidShare), r.purchaseId);
  if (paidShare > 0 && paidShare < 1) { /* remainder stays as supplier payable */ }
});
// purchases record `paid` on the invoice; also record a later supplier payment on the Lahore balance
paySupplier(db, { supplierId: SUP.lahore, amount: '150000', reference: 'DEMO bank transfer' });
run("UPDATE supplier_payments SET ts=? WHERE supplier_id=?", stamp(20, 15, 5), SUP.lahore);

// A later restock of cambric with a fresh roll, and a damaged-stock adjustment
const r4 = receivePurchase(db, { supplierId: SUP.faisal, userId: MANAGER, refNo: 'DEMO-PO-004', items: fabricRolls(fabrics.cambric, [50], 400), paid: '20000' });
run('UPDATE purchases SET ts=? WHERE id=?', stamp(12, 10, 40), r4.purchaseId); run("UPDATE stock_movements SET ts=? WHERE source_type='purchase' AND source_id=?", stamp(12, 10, 40), r4.purchaseId);

// ---- customers ----
const customers = [
  ['Ali Khan', '0301-1111111', 'Model Town, Sahiwal', 5000000, 0], ['Sana Fatima', '0302-2222222', 'Farid Town, Sahiwal', 3000000, 0],
  ['Bilal Ahmed', '0303-3333333', 'Satellite Town, Sahiwal', 2000000, 150000], ['Hina Tariq', '0304-4444444', 'High Street, Sahiwal', 1500000, 0],
  ['Usman Traders (wholesale)', '0305-5555555', 'Cloth Market, Sahiwal', 20000000, 500000], ['Ayesha Noor', '0306-6666666', 'Jinnah Colony, Sahiwal', 1000000, 0],
  ['Tariq Mehmood', '0307-7777777', 'Chak 12/11-L', 1000000, 0], ['Zainab Bibi', '0308-8888888', 'Okara Road, Sahiwal', 800000, 0],
].map(([n, ph, ad, lim, ob]) => Number(run('INSERT INTO customers(name,phone,address,credit_limit,opening_balance) VALUES(?,?,?,?,?)', `[DEMO] ${n}`, ph, ad, lim, ob).lastInsertRowid));

// ---- 30 days of sales ----
const catalog = {
  meter: [[fabrics.lawn, 3], [fabrics.wnw, 3], [fabrics.khaddar, 3], [fabrics.linen, 3], [fabrics.cambric, 4], [fabrics.boski, 3], [fabrics.velvet, 3]],
  piece: [[dupatta, 1], [shawl, 1], [cap, 3], ...kurta.map(k => [k, 1]), ...shalwar.map(k => [k, 1]), ...waistcoat.map(k => [k, 1])],
  suit: [[suit3, 1], [suitWnw, 1]],
};
const stockOf = (id) => get('SELECT stock FROM products WHERE id=?', id).stock;
const rollFor = (pid, qtyMilli) => get("SELECT id FROM fabric_rolls WHERE product_id=? AND remaining_length>=? ORDER BY remaining_length LIMIT 1", pid, qtyMilli)?.id ?? null;
const compStockOk = (pid, qty) => { const c = all('SELECT component_id,qty FROM suit_components WHERE suit_id=?', pid); return c.every(x => stockOf(x.component_id) >= x.qty * qty + 3000); };
const method = () => pick(['cash', 'cash', 'cash', 'cash', 'card', 'bank', 'bank']);

const madeSales = [];
for (let day = 29; day >= 0; day--) {
  const n = int(3, 7) + (day % 7 === 5 ? 3 : 0); // busier on one weekday
  for (let s = 0; s < n; s++) {
    const items = [], lineCount = int(1, 3);
    for (let k = 0; k < lineCount; k++) {
      const kind = pick(['meter', 'meter', 'meter', 'piece', 'piece', 'suit']);
      const [pid, maxQ] = pick(catalog[kind]);
      if (items.some(i => i.productId === pid)) continue;
      if (kind === 'meter') {
        const qty = (int(2, 12) * 0.5 + (rnd() < 0.4 ? 0.25 : 0)); const milli = Math.round(qty * 1000);
        const rid = rollFor(pid, milli); if (!rid || stockOf(pid) < milli + 5000) continue;
        items.push({ productId: pid, qty: qty.toString(), rollId: rid });
      } else if (kind === 'piece') {
        const q = int(1, maxQ); if (stockOf(pid) < (q + 2) * 1000) continue; items.push({ productId: pid, qty: String(q) });
      } else { const q = 1; if (!compStockOk(pid, q)) continue; items.push({ productId: pid, qty: String(q) }); }
    }
    if (!items.length) continue;
    if (rnd() < 0.15) items[0].discount = String(int(1, 5) * 50);
    const total = items.reduce((t, i) => { const p = get('SELECT sale_price,unit FROM products WHERE id=?', i.productId); return t + Math.round(+i.qty * p.sale_price / 100) - toPaisa(i.discount ?? 0) / 100; }, 0);
    const credit = rnd() < 0.28, customerId = credit || rnd() < 0.35 ? pick(customers) : null;
    let payments;
    if (customerId && credit) { const share = pick([0, 0.3, 0.5, 0.7]); payments = share ? [{ method: method(), amount: String(Math.floor(total * share)) }] : []; }
    else payments = [{ method: method(), amount: String(Math.ceil(total / 50) * 50 > total && rnd() < 0.3 ? Math.ceil(total / 50) * 50 : total) }];
    try {
      const r = createSale(db, { cashierId: pick(cashiers), customerId, items, payments, clientToken: `demo-${day}-${s}` });
      const ts = stamp(day, int(10, 20), int(0, 59));
      run('UPDATE sales SET ts=? WHERE id=?', ts, r.saleId); run('UPDATE payments SET ts=? WHERE sale_id=?', ts, r.saleId);
      run("UPDATE stock_movements SET ts=? WHERE source_type='sale' AND source_id=?", ts, r.saleId);
      madeSales.push({ ...r, day, ts, customerId });
    } catch (e) { /* e.g. credit limit hit — skip, history stays valid */ }
  }
}

// ---- returns (a handful of paid sales) ----
let returns = 0;
for (const s of madeSales.filter(x => x.balanceDue === 0).filter((_, i) => i % 17 === 5).slice(0, 5)) {
  const line = get('SELECT id,qty,unit FROM sale_items WHERE sale_id=? ORDER BY id LIMIT 1', s.saleId);
  const q = line.unit === 'm' ? '0.5' : '1';
  try {
    const r = returnItems(db, { saleId: s.saleId, userId: MANAGER, items: [{ saleItemId: line.id, qty: q }], reason: pick(['Wrong colour', 'Size too small', 'Customer changed mind', 'Fabric defect']), refundMode: 'cash' });
    const ts = s.ts.slice(0, 11) + '21:' + pad(int(0, 30)) + ':00';
    run('UPDATE returns SET ts=? WHERE id=?', ts, r.returnId); run("UPDATE payments SET ts=? WHERE sale_id=? AND kind='refund'", ts, s.saleId);
    run("UPDATE stock_movements SET ts=? WHERE source_type='return' AND source_id=?", ts, r.returnId); returns++;
  } catch (e) { /* skip */ }
}

// ---- customer ledger payments (udhaar recoveries) ----
for (const [cid, day, amt, m] of [[customers[2], 14, 20000, 'cash'], [customers[4], 9, 60000, 'bank'], [customers[0], 6, 10000, 'cash'], [customers[6], 3, 5000, 'cash']]) {
  run("INSERT INTO payments(customer_id,method,amount,reference,kind,ts) VALUES(?,?,?,?,'ledger',?)", cid, m, toPaisa(amt), 'DEMO ledger payment', stamp(day, 17, 15));
}

// ---- expenses (monthly rent, utilities, daily small items) ----
for (const [title, amt, day] of [['Shop rent', 85000, 27], ['Electricity bill', 22400, 18], ['Staff salaries', 120000, 25], ['Internet & phone', 3500, 16],
  ['Packing bags & tags', 4200, 21], ['Tea & refreshments', 1800, 11], ['Cleaning', 2500, 8], ['Transport / loading', 6000, 5], ['Shop signboard repair', 7500, 2]]) {
  const r = addExpense(db, { title: `[DEMO] ${title}`, amount: String(amt), userId: MANAGER }); run('UPDATE expenses SET ts=? WHERE id=?', stamp(day, 18, 30), r.id);
}

// ---- settings: sensible shop defaults ----
run("INSERT OR REPLACE INTO settings VALUES('store_name','[DEMO] Riwaayat Fabrics & Garments'),('store_phone','0300-0000000'),('store_address','Cloth Market, Sahiwal'),('footer','Thank you! Exchange within 7 days with receipt.'),('receipt_size','80')");

run('UPDATE products SET is_demo=1');
const n = (t) => get(`SELECT COUNT(*) c FROM ${t}`).c;
console.log(`Demo data loaded (all marked [DEMO]): ${n('products')} products, ${n('fabric_rolls')} rolls, ${n('suppliers')} suppliers, ${n('customers')} customers, ${n('sales')} sales, ${returns} returns, ${n('expenses')} expenses.`);
console.log('Logins: admin/admin123, manager/manager123, cashier/cashier123');
console.log('Delete data/pos.db for a clean database.');
