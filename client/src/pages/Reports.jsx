import { useMemo, useState } from 'react';
import { LuChartLine, LuPackage, LuLayers, LuUserRound, LuCreditCard, LuUndo2, LuWallet, LuTruck, LuRuler, LuHandCoins, LuBuilding2, LuFileText, LuDownload, LuPrinter } from 'react-icons/lu';
import { api, qs } from '../lib/api.js';
import { M, Q, today, daysAgo, shortDate, cleanName, dt, downloadText } from '../lib/fmt.js';
import { useAsync, PageHead, Table, Loading, ErrorBox, Empty, Badge } from '../components/ui.jsx';
import { TrendChart, HBars, Donut } from '../components/charts.jsx';
import PrintPreview from '../components/PrintPreview.jsx';
import InvoiceModal from '../components/InvoiceModal.jsx';
import { reportHtml } from '../lib/print.js';

const money = (v) => M(v);
const REPORTS = [
  { id: 'daily', label: 'Daily summary', icon: LuChartLine, desc: 'Sales, profit and expenses per day' },
  { id: 'register', label: 'Sales register', icon: LuFileText, desc: 'Every invoice in the period' },
  { id: 'products', label: 'Item-wise sales', icon: LuPackage, desc: 'What sold, how much and for how much' },
  { id: 'category', label: 'Category-wise', icon: LuLayers, desc: 'Sales split by category' },
  { id: 'employee', label: 'Cashier-wise', icon: LuUserRound, desc: 'Sales by user' },
  { id: 'payment', label: 'Payment methods', icon: LuCreditCard, desc: 'Cash, card, bank and wallets' },
  { id: 'returns', label: 'Returns', icon: LuUndo2, desc: 'Refunds and reasons' },
  { id: 'expenses', label: 'Expenses', icon: LuWallet, desc: 'Shop spending' },
  { id: 'purchases', label: 'Purchases', icon: LuTruck, desc: 'Supplier bills received' },
  { id: 'rolls', label: 'Roll stock', icon: LuRuler, desc: 'Length left on each roll', range: false },
  { id: 'balances', label: 'Customer balances', icon: LuHandCoins, desc: 'Who owes you', range: false },
  { id: 'suppliers', label: 'Supplier balances', icon: LuBuilding2, desc: 'Who you owe', range: false },
];

export default function Reports({ settings }) {
  const [id, setId] = useState('daily'), [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today());
  const [preview, setPreview] = useState(null), [inv, setInv] = useState(null);
  const rep = REPORTS.find((r) => r.id === id);
  const { data, loading, error } = useAsync(async () => {
    const p = { from, to };
    if (id === 'daily') return (await api('trend?' + qs(p)));
    if (id === 'register') return api('sales?' + qs(p));
    return api('report?' + qs({ type: id, ...p }));
  }, [id, from, to]);

  // normalise every report to { head, rows(array of cell arrays), totals, chart }
  const view = useMemo(() => {
    if (!data) return null;
    const d = data;
    if (id === 'daily') { const rows = d.map((x) => [x.d, x.invoices, x.sales, x.profit, x.expenses]);
      return { head: ['Date', 'Invoices', 'Sales', 'Gross profit', 'Expenses'], rows, fmt: [null, null, money, money, money], totals: ['Total', d.reduce((s, x) => s + x.invoices, 0), d.reduce((s, x) => s + x.sales, 0), d.reduce((s, x) => s + x.profit, 0), d.reduce((s, x) => s + x.expenses, 0)], trend: d.map((x) => ({ label: shortDate(x.d), sales: x.sales, profit: x.profit, expenses: x.expenses })) }; }
    if (id === 'register') { return { head: ['Invoice', 'Date', 'Customer', 'Total', 'Status'], rows: d.map((s) => [s.invoice_no, dt(s.ts), cleanName(s.customer) || 'Walk-in', s.total, s.status]), fmt: [null, null, null, money, null], totals: ['Total', '', '', d.reduce((s, x) => s + x.total, 0), ''], ids: d.map((s) => s.id) }; }
    if (id === 'products') { const s = [...d].sort((a, b) => b.amount - a.amount); return { head: ['Item', 'Qty sold', 'Amount'], rows: s.map((x) => [cleanName(x.label), x.qty, x.amount]), fmt: [null, Q, money], totals: ['Total', '', s.reduce((t, x) => t + x.amount, 0)], bars: s.slice(0, 10).map((x) => ({ label: cleanName(x.label), value: x.amount })) }; }
    if (id === 'rolls') { const s = [...d].sort((a, b) => b.amount - a.amount); return { head: ['Roll', 'Fabric', 'Remaining (m)'], rows: s.map((x) => [x.label, cleanName(x.name), x.amount]), fmt: [null, null, Q], totals: ['Total length', '', s.reduce((t, x) => t + x.amount, 0)], totalFmt: [null, null, Q], bars: s.filter((x) => x.amount > 0).slice(0, 10).map((x) => ({ label: x.label, value: x.amount })), barMoney: false }; }
    if (['returns', 'purchases'].includes(id)) return { head: [id === 'returns' ? 'Invoice' : 'Supplier', id === 'returns' ? 'Reason' : 'Reference', 'Amount'], rows: d.map((x) => [cleanName(x.label), x.name || '—', x.amount]), fmt: [null, null, money], totals: ['Total', '', d.reduce((s, x) => s + x.amount, 0)] };
    const s = [...d].filter((x) => x.amount !== 0).sort((a, b) => b.amount - a.amount);
    const label = { category: 'Category', employee: 'Cashier', payment: 'Method', expenses: 'Expense', balances: 'Customer', suppliers: 'Supplier' }[id];
    return { head: [label, 'Amount'], rows: s.map((x) => [cleanName(x.label), x.amount]), fmt: [null, money], totals: ['Total', s.reduce((t, x) => t + x.amount, 0)], bars: s.slice(0, 10).map((x) => ({ label: cleanName(x.label), value: x.amount })), donut: id === 'payment' };
  }, [data, id]);

  const text = (v, i, set) => { const f = (set || view.fmt)[i]; return f ? f(v) : String(v ?? ''); };
  const asRows = () => view.rows.map((r) => r.map((c, i) => text(c, i)));
  const exportCsv = () => downloadText(`${id}-${from}-to-${to}.csv`, [view.head, ...asRows()].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  const printIt = () => setPreview(reportHtml(rep.label, rep.range === false ? `As of ${today()}` : `${from} to ${to}`, view.head, asRows(), view.totals.map((c, i) => (c === '' ? '' : text(c, i, view.totalFmt)))));

  return (
    <>
      <PageHead title="Reports" sub={rep.desc}>
        {rep.range !== false && <div className="row"><input type="date" className="input sm" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="rep-from" /><span className="muted">to</span><input type="date" className="input sm" value={to} onChange={(e) => setTo(e.target.value)} data-testid="rep-to" /></div>}
        <button className="btn" onClick={exportCsv} disabled={!view?.rows.length} data-testid="export-csv"><LuDownload /> CSV</button>
        <button className="btn primary" onClick={printIt} disabled={!view?.rows.length} data-testid="print-report"><LuPrinter /> Print / PDF</button>
      </PageHead>
      <div className="chips" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {REPORTS.map((r) => { const I = r.icon; return <button key={r.id} className={`chip ${id === r.id ? 'on' : ''}`} onClick={() => setId(r.id)} data-testid={`rep-${r.id}`}><I style={{ verticalAlign: -3, marginRight: 5 }} />{r.label}</button>; })}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : view && (
        <>
          {view.trend && view.trend.some((x) => x.sales) && <div className="card" style={{ marginBottom: 16 }}><h3>Sales, profit and expenses by day</h3><TrendChart data={view.trend} series={[{ key: 'sales', name: 'Sales' }, { key: 'profit', name: 'Gross profit' }, { key: 'expenses', name: 'Expenses' }]} /></div>}
          {view.bars?.length > 0 && <div className="grid g2" style={{ marginBottom: 16 }}>
            <div className="card"><h3>Top {view.bars.length}</h3><HBars data={view.bars} height={Math.max(180, view.bars.length * 30)} money={view.barMoney !== false} /></div>
            {view.donut && <div className="card"><h3>Share of payments</h3><Donut data={view.bars} /></div>}
          </div>}
          <div className="card flush">
            <div className="card-h"><h3>{rep.label}</h3><Badge tone="blue">{view.rows.length} rows</Badge></div>
            <Table rows={view.rows.map((r, i) => ({ r, i }))} onRow={view.ids ? (x) => setInv(view.ids[x.i]) : undefined} empty={{ title: 'No data for this period', text: 'Try a wider date range.' }}
              cols={view.head.map((h, ci) => ({ h, num: !!view.fmt[ci] && view.fmt[ci] !== undefined && ci > 0 || (id === 'daily' && ci === 1), f: (x) => text(x.r[ci], ci) }))}
              foot={<tfoot><tr>{view.totals.map((c, i) => <td key={i} className={i && view.fmt[i] ? 'num' : ''} style={{ fontWeight: 700, background: '#f8faff' }}>{c === '' ? '' : text(c, i, view.totalFmt)}</td>)}</tr></tfoot>} />
          </div>
        </>
      )}
      {preview && <PrintPreview title={`${rep.label} — print`} html={preview} onClose={() => setPreview(null)} />}
      {inv && <InvoiceModal saleId={inv} defaultSize={settings.receipt_size} onClose={() => setInv(null)} />}
    </>
  );
}
