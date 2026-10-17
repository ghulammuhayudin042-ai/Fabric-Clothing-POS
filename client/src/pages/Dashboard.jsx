import { useMemo, useState } from 'react';
import { LuBanknote, LuTrendingUp, LuReceipt, LuWallet, LuTruck, LuPackageSearch, LuHandCoins, LuWarehouse, LuTriangleAlert, LuScale } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { M, Q, today, daysAgo, shortDate, cleanName } from '../lib/fmt.js';
import { useAsync, Stat, PageHead, Loading, ErrorBox, Empty, Table, Badge } from '../components/ui.jsx';
import { TrendChart, HBars, VBars, Donut } from '../components/charts.jsx';

const RANGES = [['Today', 0], ['7 days', 6], ['30 days', 29], ['Custom', -1]];

export default function Dashboard({ go }) {
  const [r, setR] = useState(29);
  const [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today());
  const f = r >= 0 ? daysAgo(r) : from, t = r >= 0 ? today() : to;
  const { loading, data, error } = useAsync(async () => {
    const [d, trend, sum, cat] = await Promise.all([api('dashboard?' + qs({ from: f, to: t })), api('trend?' + qs({ from: f, to: t })), api('summary'), api('report?' + qs({ type: 'category', from: f, to: t }))]);
    return { d, trend, sum, cat };
  }, [f, t]);

  const series = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.trend.map((x) => [x.d, x])), out = [];
    const a = new Date(f + 'T00:00:00'), b = new Date(t + 'T00:00:00');
    for (let d = new Date(a); d <= b && out.length < 400; d.setDate(d.getDate() + 1)) {
      const k = d.toLocaleDateString('en-CA'), x = map.get(k);
      out.push({ label: shortDate(k), sales: x?.sales ?? 0, profit: x?.profit ?? 0, invoices: x?.invoices ?? 0 });
    }
    return out;
  }, [data, f, t]);

  return (
    <>
      <PageHead title="Business overview" sub={`${f === t ? f : `${f} to ${t}`} · sales, profit and stock at a glance`}>
        <div className="seg" role="tablist">{RANGES.map(([l, n]) => <button key={l} className={r === n ? 'on' : ''} onClick={() => setR(n)}>{l}</button>)}</div>
        {r === -1 && <div className="row"><input type="date" className="input sm" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="muted">to</span><input type="date" className="input sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>}
      </PageHead>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : <Body {...data} series={series} go={go} />}
    </>
  );
}

function Body({ d, sum, cat, series, go }) {
  const netProfit = d.grossProfit - d.expenses;
  const topItems = d.topItems.map((x) => ({ label: cleanName(x.name), value: x.amount }));
  const catData = cat.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).map((x) => ({ label: x.label, value: x.amount }));
  const pay = d.paymentSplit.filter((x) => x.amount > 0).map((x) => ({ label: x.method, value: x.amount }));
  const hours = Array.from({ length: 12 }, (_, i) => i + 9).map((h) => ({ label: `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`, value: sum.hourly.find((x) => x.h === h)?.amount ?? 0 }));
  return (
    <>
      {d.lowStock.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 16 }}><LuTriangleAlert /><span><b>{d.lowStock.length} item{d.lowStock.length > 1 ? 's are' : ' is'} running low:</b> {d.lowStock.slice(0, 3).map((x) => cleanName(x.name)).join(', ')}{d.lowStock.length > 3 ? '…' : ''}</span><span className="sp" /><button className="btn sm" onClick={() => go('purchases')}>Restock</button></div>
      )}
      <div className="grid g4">
        <Stat icon={<LuBanknote />} label="Net sales" value={M(d.netSales)} sub={`${d.invoices} invoices · returns ${M(d.returns)}`} />
        <Stat icon={<LuTrendingUp />} label="Gross profit" value={M(d.grossProfit)} tone="green" sub={d.netSales ? `${((d.grossProfit / d.netSales) * 100).toFixed(1)}% margin` : '—'} />
        <Stat icon={<LuScale />} label="Net profit after expenses" value={M(netProfit)} tone={netProfit >= 0 ? 'green' : 'red'} sub={`Expenses ${M(d.expenses)}`} />
        <Stat icon={<LuTruck />} label="Purchases received" value={M(d.purchases)} tone="violet" sub="Stock bought in this period" />
      </div>
      <div className="grid g4 mt">
        <Stat icon={<LuReceipt />} label="Average bill" value={M(d.invoices ? Math.round(d.sales / d.invoices) : 0)} tone="amber" />
        <Stat icon={<LuWarehouse />} label="Stock value (cost)" value={M(sum.inventoryCost)} sub={`Retail ${M(sum.inventoryRetail)}`} tone="violet" />
        <Stat icon={<LuHandCoins />} label="Customers owe you" value={M(sum.receivable)} tone="amber" sub="Udhaar to collect" />
        <Stat icon={<LuWallet />} label="You owe suppliers" value={M(sum.payable)} tone="red" sub="Payables" />
      </div>

      <div className="grid g21 mt">
        <div className="card"><h3>Sales &amp; profit trend</h3>{series.some((x) => x.sales) ? <TrendChart data={series} series={[{ key: 'sales', name: 'Sales' }, { key: 'profit', name: 'Gross profit' }]} /> : <Empty title="No sales in this period">Pick a longer range or make a sale.</Empty>}</div>
        <div className="card"><h3>Payment methods</h3>{pay.length ? <Donut data={pay} /> : <Empty title="No payments yet" />}</div>
      </div>
      <div className="grid g3 mt">
        <div className="card"><h3>Top selling items</h3>{topItems.length ? <HBars data={topItems} height={230} /> : <Empty title="No items sold" />}</div>
        <div className="card"><h3>Sales by category</h3>{catData.length ? <HBars data={catData} height={230} color="#1baf7a" /> : <Empty title="No data" />}</div>
        <div className="card"><h3>Busy hours <span className="muted small" style={{ fontWeight: 400 }}>(all time)</span></h3><VBars data={hours} height={230} color="#6250d6" /></div>
      </div>
      <div className="card flush mt">
        <div className="card-h"><LuPackageSearch style={{ color: 'var(--warn)', fontSize: 18 }} /><h3>Low stock</h3><span className="sp" /><button className="btn sm" onClick={() => go('purchases')}>Receive stock</button></div>
        <Table cols={[{ h: 'Item', f: (x) => <b>{cleanName(x.name)}</b> }, { h: 'In stock', num: true, f: (x) => `${Q(x.stock)} ${x.unit}` }, { h: 'Reorder at', num: true, f: (x) => `${Q(x.reorder_level)} ${x.unit}` }, { h: 'Status', f: (x) => <Badge tone={x.stock <= 0 ? 'red' : 'amber'}>{x.stock <= 0 ? 'Out of stock' : 'Low'}</Badge> }]}
          rows={d.lowStock} empty={{ title: 'Stock levels look healthy', text: 'Nothing is below its reorder level.' }} />
      </div>
    </>
  );
}
