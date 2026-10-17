import test from 'node:test'; import assert from 'node:assert/strict';
import { openDb, ensureAdmin } from '../src/core.js'; import { makeServer } from '../src/server.js';
test('API: sale -> invoice -> dashboard -> return', async () => {
  const db = openDb(); ensureAdmin(db);
  db.prepare("INSERT INTO products(sku,barcode,name,unit,sale_price,cost_price,stock) VALUES('1','1','Cotton','m',85000,50000,10000)").run();
  const srv = makeServer(db); await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}/api/`;
  let tok = ''; const H = () => ({ 'x-token': tok }); const post = (u, b) => fetch(base + u, { method: 'POST', headers: H(), body: JSON.stringify(b) }).then(r => r.json());
  tok = (await post('login', { username: 'admin', password: 'admin123' })).token;
  const s = await post('sales', { cashierId: 1, items: [{ productId: 1, qty: '2.35' }], payments: [{ method: 'cash', amount: '2000' }] });
  assert.equal(s.total, 199750);
  const inv = await fetch(base + 'invoice?id=' + s.saleId, { headers: H() }).then(r => r.json()); assert.equal(inv.items.length, 1);
  await post('returns', { saleId: s.saleId, userId: 1, items: [{ saleItemId: 1, qty: '1' }] });
  const d = await fetch(base + 'dashboard', { headers: H() }).then(r => r.json()); assert.equal(d.netSales, 199750 - 85000); assert.equal(d.grossProfit, Math.round((199750 - 117500) * 1350 / 2350));
  srv.close(); });
