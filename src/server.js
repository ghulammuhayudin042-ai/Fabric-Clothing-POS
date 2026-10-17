import { fileURLToPath } from 'node:url'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import crypto from 'node:crypto';
import * as C from './core.js';
import { openDb, createSale, returnItems, receivePurchase, customerBalance, ensureAdmin } from './core.js';
import { toMilli, toPaisa } from './money.js';
const pub = fileURLToPath(new URL('../public/', import.meta.url));
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json' };
export function makeServer(db) {
  const all = (s, ...p) => db.prepare(s).all(...p), one = (s, ...p) => db.prepare(s).get(...p);
  // A suit "set" has no stock of its own: how many complete sets the component stock can make (milli-units), plus its component list.
  const withSuitStock = (rows) => rows.map((p) => { if (!p.is_suit) return p;
    const comps = all('SELECT s.qty,c.id,c.name,c.stock FROM suit_components s JOIN products c ON c.id=s.component_id WHERE s.suit_id=?', p.id);
    return { ...p, components: comps.map((c) => ({ id: c.id, name: c.name, qty: c.qty })), avail: comps.length ? Math.max(0, Math.min(...comps.map((c) => Math.floor(c.stock / c.qty)))) * 1000 : null }; });
  const rng = (u) => [u.searchParams.get('from') || '0000-01-01', (u.searchParams.get('to') || '9999-12-31') + ' 23:59:59'];
  const routes = {
    'GET /api/products': (u) => { const q = u.searchParams.get('q') || '', b = u.searchParams.get('barcode');
      if (b) return all('SELECT * FROM products WHERE active=1 AND (barcode=? OR sku=?)', b, b);
      return all("SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?) ORDER BY p.name LIMIT 200", `%${q}%`, `%${q}%`, `%${q}%`); },
    'POST /api/products': (u, b) => { const id = db.prepare('INSERT INTO products(sku,barcode,name,category_id,brand,fabric,color,design,size,unit,cost_price,sale_price,wholesale_price,reorder_level,is_suit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(b.sku, b.barcode || b.sku, b.name, b.category_id || null, b.brand || null, b.fabric || null, b.color || null, b.design || null, b.size || null, b.unit, toPaisa(b.cost_price || 0), toPaisa(b.sale_price), b.wholesale_price ? toPaisa(b.wholesale_price) : null, toMilli(b.reorder_level || 0), b.is_suit ? 1 : 0).lastInsertRowid; return { id: Number(id) }; },
    'GET /api/categories': () => all('SELECT * FROM categories'),
    'GET /api/customers': () => all('SELECT * FROM customers ORDER BY name').map(c => ({ ...c, balance: customerBalance(db, c.id) })),
    'POST /api/customers': (u, b) => ({ id: Number(db.prepare('INSERT INTO customers(name,phone,address,opening_balance,credit_limit) VALUES(?,?,?,?,?)').run(b.name, b.phone || null, b.address || null, toPaisa(b.opening_balance || 0), toPaisa(b.credit_limit || 0)).lastInsertRowid) }),
    'GET /api/ledger': (u) => { const id = +u.searchParams.get('id'); return { sales: all('SELECT id,invoice_no,ts,total FROM sales WHERE customer_id=? ORDER BY id', id), payments: all('SELECT * FROM payments WHERE customer_id=? ORDER BY id', id), balance: customerBalance(db, id) }; },
    'POST /api/ledger-payment': (u, b) => { db.prepare("INSERT INTO payments(customer_id,method,amount,reference,kind) VALUES(?,?,?,?,'ledger')").run(b.customerId, b.method || 'cash', toPaisa(b.amount), b.reference || null); return { balance: customerBalance(db, b.customerId) }; },
    'POST /api/sales': (u, b) => createSale(db, b),
    'GET /api/sales': (u) => { const [f, t] = rng(u); return all('SELECT s.*,c.name customer FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.ts BETWEEN ? AND ? ORDER BY s.id DESC LIMIT 500', f, t); },
    'GET /api/invoice': (u) => { const id = +u.searchParams.get('id'); const s = one('SELECT s.*,c.name customer,c.phone cphone,u.username cashier FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.cashier_id WHERE s.id=?', id);
      return { ...s, items: all('SELECT i.*,p.name,p.sku FROM sale_items i JOIN products p ON p.id=i.product_id WHERE sale_id=?', id), payments: all("SELECT * FROM payments WHERE sale_id=? AND kind IN('sale','credit')", id), store: Object.fromEntries(all('SELECT * FROM settings').map(r => [r.key, r.value])) }; },
    'POST /api/returns': (u, b) => returnItems(db, b),
    'GET /api/rolls': () => all('SELECT r.*,p.name FROM fabric_rolls r JOIN products p ON p.id=r.product_id ORDER BY r.id DESC'),
    'POST /api/purchases': (u, b) => receivePurchase(db, b),
    'GET /api/suppliers': () => all('SELECT * FROM suppliers'),
    'POST /api/suppliers': (u, b) => ({ id: Number(db.prepare('INSERT INTO suppliers(name,phone,address) VALUES(?,?,?)').run(b.name, b.phone || null, b.address || null).lastInsertRowid) }),
    'GET /api/movements': (u) => all('SELECT m.*,p.name FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE (?=0 OR m.product_id=?) ORDER BY m.id DESC LIMIT 300', +u.searchParams.get('productId') || 0, +u.searchParams.get('productId') || 0),
    'GET /api/dashboard': (u) => { const [f, t] = rng(u);
      const gross = one('SELECT COALESCE(SUM(total),0) v FROM sales WHERE ts BETWEEN ? AND ?', f, t).v, ret = one('SELECT COALESCE(SUM(refund_amount),0) v FROM returns WHERE ts BETWEEN ? AND ?', f, t).v;
      const profit = one('SELECT COALESCE(SUM((i.line_total-i.cost_snapshot*i.qty/1000.0)*(i.qty-i.returned_qty)/i.qty),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.ts BETWEEN ? AND ?', f, t).v;
      return { sales: gross, returns: ret, netSales: gross - ret, grossProfit: Math.round(profit), expenses: one('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE ts BETWEEN ? AND ?', f, t).v,
        purchases: one('SELECT COALESCE(SUM(total),0) v FROM purchases WHERE ts BETWEEN ? AND ?', f, t).v, invoices: one('SELECT COUNT(*) v FROM sales WHERE ts BETWEEN ? AND ?', f, t).v,
        lowStock: all('SELECT name,stock,unit,reorder_level FROM products WHERE active=1 AND is_suit=0 AND stock<=reorder_level'),
        topItems: all('SELECT p.name,p.unit,SUM(i.qty-i.returned_qty) qty,SUM(i.line_total) amount FROM sale_items i JOIN products p ON p.id=i.product_id JOIN sales s ON s.id=i.sale_id WHERE s.ts BETWEEN ? AND ? GROUP BY p.id ORDER BY amount DESC LIMIT 5', f, t),
        paymentSplit: all("SELECT method,SUM(amount) amount FROM payments WHERE kind IN('sale','refund') AND ts BETWEEN ? AND ? GROUP BY method", f, t) }; },
    'GET /api/report': (u) => { const [f, t] = rng(u), k = u.searchParams.get('type');
      if (k === 'category') return all('SELECT COALESCE(c.name,\'-\') label,SUM(i.line_total) amount FROM sale_items i JOIN products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id JOIN sales s ON s.id=i.sale_id WHERE s.ts BETWEEN ? AND ? GROUP BY 1', f, t);
      if (k === 'employee') return all('SELECT COALESCE(u.username,\'-\') label,SUM(s.total) amount FROM sales s LEFT JOIN users u ON u.id=s.cashier_id WHERE s.ts BETWEEN ? AND ? GROUP BY 1', f, t);
      if (k === 'payment') return all("SELECT method label,SUM(amount) amount FROM payments WHERE kind='sale' AND ts BETWEEN ? AND ? GROUP BY 1", f, t);
      if (k === 'rolls') return all('SELECT r.roll_code label,p.name,r.remaining_length amount FROM fabric_rolls r JOIN products p ON p.id=r.product_id');
      if (k === 'balances') return all('SELECT id,name FROM customers').map(c => ({ label: c.name, amount: customerBalance(db, c.id) }));
      return all('SELECT p.name label,SUM(i.qty) qty,SUM(i.line_total) amount FROM sale_items i JOIN products p ON p.id=i.product_id JOIN sales s ON s.id=i.sale_id WHERE s.ts BETWEEN ? AND ? GROUP BY p.id', f, t); },
    'GET /api/settings': () => all('SELECT * FROM settings'),
    'POST /api/settings': (u, b) => { for (const [k, v] of Object.entries(b)) db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v)); return { ok: true }; },
    'POST /api/backup': () => { const p = path.resolve(`data/backup-${Date.now()}.db`); db.exec(`VACUUM INTO '${p.replace(/'/g, "''")}'`); db.prepare('INSERT INTO backups(path) VALUES(?)').run(p); return { path: p }; },
  };

  const sessions = new Map(), me = (u, b, user) => user, ovr = (b) => (b.override ? { userId: C.verifyOverride(db, b.override) } : null);
  const need = { 'POST /api/products': 'product', 'POST /api/variants': 'product', 'POST /api/products/update': 'product', 'POST /api/categories': 'product', 'POST /api/purchases': 'purchase', 'POST /api/purchase-return': 'purchase', 'POST /api/suppliers': 'purchase', 'POST /api/supplier-payment': 'purchase', 'POST /api/returns': 'return', 'POST /api/exchange': 'return', 'POST /api/adjust': 'adjust', 'POST /api/expenses': 'expense', 'GET /api/dashboard': 'report', 'GET /api/trend': 'report', 'GET /api/summary': 'report', 'GET /api/report': 'report', 'GET /api/export': 'report', 'GET /api/audit': 'audit', 'POST /api/settings': 'admin', 'POST /api/backup': 'admin', 'GET /api/users': 'admin', 'POST /api/users': 'admin' };
  const oldRep = routes['GET /api/report'];
  Object.assign(routes, {
    'GET /api/me': me, 'POST /api/login': () => null, 'POST /api/logout': () => null,
    'POST /api/sales': (u, b, user) => createSale(db, { ...b, cashierId: user.id, override: ovr(b) }),
    'POST /api/returns': (u, b, user) => returnItems(db, { ...b, userId: user.id }),
    'POST /api/purchases': (u, b, user) => receivePurchase(db, { ...b, userId: user.id }),
    'POST /api/exchange': (u, b, user) => C.exchange(db, { ...b, userId: user.id, override: ovr(b) }),
    'POST /api/products': (u, b, user) => C.createProduct(db, b, user.id),
    'POST /api/variants': (u, b, user) => ({ ids: C.createVariants(db, b, user.id) }),
    'GET /api/products': (u) => { const q = `%${u.searchParams.get('q') || ''}%`, b = u.searchParams.get('barcode'), cat = u.searchParams.get('cat') || '';
      if (b) return withSuitStock(all('SELECT * FROM products WHERE active=1 AND (barcode=? OR sku=?)', b, b));
      return withSuitStock(all("SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE (?='all' OR p.active=1) AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?) AND (?='' OR p.category_id=?) ORDER BY p.name LIMIT 500", u.searchParams.get('all') ? 'all' : '', q, q, q, cat, cat)); },
    'POST /api/products/update': (u, b, user) => { const f = []; const v = [];
      for (const [k, fn] of [['sale_price', toPaisa], ['wholesale_price', toPaisa], ['reorder_level', toMilli], ['active', x => (x ? 1 : 0)], ['supplier_id', x => x || null]]) if (b[k] !== undefined && b[k] !== '') { f.push(k + '=?'); v.push(fn(b[k])); }
      if (!f.length) throw new Error('Nothing to update'); db.prepare(`UPDATE products SET ${f.join(',')} WHERE id=?`).run(...v, b.id); db.prepare('INSERT INTO audit_logs(user_id,action,record_type,record_id,detail) VALUES(?,?,?,?,?)').run(user.id, 'PRODUCT_UPDATED', 'product', b.id, JSON.stringify(b)); return { ok: true }; },
    'POST /api/categories': (u, b) => ({ id: Number(db.prepare('INSERT INTO categories(name) VALUES(?)').run(b.name).lastInsertRowid) }),
    'GET /api/suppliers': () => all('SELECT * FROM suppliers').map(x => ({ ...x, balance: C.supplierBalance(db, x.id) })),
    'GET /api/purchases': () => all('SELECT p.*,s.name supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC LIMIT 100'),
    'GET /api/purchase-items': (u) => all('SELECT i.*,p.name FROM purchase_items i JOIN products p ON p.id=i.product_id WHERE purchase_id=?', +u.searchParams.get('id')),
    'POST /api/purchase-return': (u, b, user) => C.purchaseReturn(db, { ...b, userId: user.id }),
    'POST /api/supplier-payment': (u, b) => C.paySupplier(db, b),
    'POST /api/adjust': (u, b, user) => C.adjustStock(db, { ...b, userId: user.id }),
    'GET /api/expenses': () => all('SELECT * FROM expenses ORDER BY id DESC LIMIT 200'),
    'POST /api/expenses': (u, b, user) => C.addExpense(db, { ...b, userId: user.id }),
    'GET /api/shift': (u, b, user) => C.currentShift(db, user.id),
    'POST /api/shift-open': (u, b, user) => C.openShift(db, user.id, b.cash || '0'),
    'POST /api/shift-close': (u, b, user) => C.closeShift(db, user.id, b.cash || '0'),
    'POST /api/hold': (u, b, user) => ({ id: Number(db.prepare('INSERT INTO held_sales(user_id,label,payload) VALUES(?,?,?)').run(user.id, b.label || 'Held', JSON.stringify(b.payload)).lastInsertRowid) }),
    'GET /api/held': () => all('SELECT * FROM held_sales ORDER BY id DESC'),
    'POST /api/held-delete': (u, b) => { db.prepare('DELETE FROM held_sales WHERE id=?').run(b.id); return { ok: true }; },
    'GET /api/users': () => all('SELECT id,username,role,active FROM users'),
    'POST /api/users': (u, b, user) => { if (b.toggle) { db.prepare('UPDATE users SET active=1-active WHERE id=? AND id<>?').run(b.toggle, user.id); return { ok: true }; } return { id: C.createUser(db, b) }; },
    'GET /api/audit': () => all('SELECT a.*,u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300'),
    'GET /api/report': (u) => { const [f, t] = rng(u), k = u.searchParams.get('type');
      if (k === 'returns') return all('SELECT s.invoice_no label,r.reason name,r.refund_amount amount FROM returns r JOIN sales s ON s.id=r.sale_id WHERE r.ts BETWEEN ? AND ?', f, t);
      if (k === 'expenses') return all('SELECT title label,amount FROM expenses WHERE ts BETWEEN ? AND ?', f, t);
      if (k === 'purchases') return all("SELECT COALESCE(s.name,'-') label,p.ref_no name,p.total amount FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.ts BETWEEN ? AND ?", f, t);
      if (k === 'suppliers') return all('SELECT id,name FROM suppliers').map(x => ({ label: x.name, amount: C.supplierBalance(db, x.id) }));
      return oldRep(u); },
    'GET /api/trend': (u) => { const [f, t] = rng(u);
      const sales = all('SELECT date(ts) d,SUM(total) sales,COUNT(*) invoices FROM sales WHERE ts BETWEEN ? AND ? GROUP BY 1', f, t);
      const profit = new Map(all('SELECT date(s.ts) d,SUM((i.line_total-i.cost_snapshot*i.qty/1000.0)*(i.qty-i.returned_qty)/i.qty) v FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.ts BETWEEN ? AND ? GROUP BY 1', f, t).map((r) => [r.d, Math.round(r.v)]));
      const exp = new Map(all('SELECT date(ts) d,SUM(amount) v FROM expenses WHERE ts BETWEEN ? AND ? GROUP BY 1', f, t).map((r) => [r.d, r.v]));
      return sales.map((r) => ({ ...r, profit: profit.get(r.d) ?? 0, expenses: exp.get(r.d) ?? 0 })); },
    'GET /api/summary': () => ({
      inventoryCost: Math.round(one('SELECT COALESCE(SUM(MAX(stock,0)*cost_price/1000.0),0) v FROM products WHERE active=1 AND is_suit=0').v),
      inventoryRetail: Math.round(one('SELECT COALESCE(SUM(MAX(stock,0)*sale_price/1000.0),0) v FROM products WHERE active=1 AND is_suit=0').v),
      receivable: all('SELECT id FROM customers').reduce((s, c) => s + Math.max(customerBalance(db, c.id), 0), 0),
      payable: all('SELECT id FROM suppliers').reduce((s, x) => s + Math.max(C.supplierBalance(db, x.id), 0), 0),
      products: one('SELECT COUNT(*) v FROM products WHERE active=1').v, customers: one('SELECT COUNT(*) v FROM customers').v,
      hourly: all("SELECT CAST(strftime('%H',ts) AS INT) h,COUNT(*) n,SUM(total) amount FROM sales GROUP BY 1 ORDER BY 1") }),
    'GET /api/export': (u) => { const t = u.searchParams.get('table'); if (!['sales', 'sale_items', 'products', 'customers', 'payments', 'stock_movements', 'returns', 'purchases', 'expenses', 'audit_logs'].includes(t)) throw new Error('Table not exportable');
      const rows = all(`SELECT * FROM ${t}`); const h = rows[0] ? Object.keys(rows[0]) : []; return { __csv: [h.join(','), ...rows.map(r => h.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') }; },
  });
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const send = (c, o, t = 'application/json') => { if (o?.__csv !== undefined) { t = 'text/csv'; o = o.__csv; } res.writeHead(c, { 'Content-Type': t }); res.end(t === 'application/json' ? JSON.stringify(o) : o); };
    const h = routes[`${req.method} ${u.pathname}`];
    if (!h) { // static files: the built React app (client/dist) if present, else the legacy public/ page
      if (u.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
      const root = fs.existsSync(path.join(dist, 'index.html')) ? dist : pub;
      let f = path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      if (!f.startsWith(root)) return send(404, { error: 'Not found' });
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html'); // single-page app fallback
      if (!fs.existsSync(f)) return send(404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': f.includes('assets') ? 'public,max-age=31536000,immutable' : 'no-cache' }); return res.end(fs.readFileSync(f)); }
    let body = ''; req.on('data', d => body += d); req.on('end', () => { try {
      const key = `${req.method} ${u.pathname}`, b = body ? JSON.parse(body) : {};
      if (key === 'POST /api/login') { const user = C.login(db, b.username, b.password), tok = crypto.randomUUID(); sessions.set(tok, user); return send(200, { token: tok, user }); }
      if (key === 'POST /api/logout') { sessions.delete(req.headers['x-token']); return send(200, { ok: true }); }
      const user = sessions.get(req.headers['x-token']); if (!user) return send(401, { error: 'Please log in' });
      if (need[key] && !C.can(user.role, need[key])) return send(403, { error: `Your role (${user.role}) is not allowed to do this` });
      send(200, h(u, b, user)); } catch (e) { send(e.message === 'Please log in' ? 401 : 400, { error: /UNIQUE/.test(e.message) ? 'Duplicate SKU / barcode / name' : e.message }); } });
  });
}
if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { fs.mkdirSync('data', { recursive: true }); const db = openDb('data/pos.db'); ensureAdmin(db); const port = +process.env.PORT || 3000; makeServer(db).listen(port, '0.0.0.0', () => console.log(`POS running at http://localhost:${port} - open this address in your browser (keep this window open)`)); }
