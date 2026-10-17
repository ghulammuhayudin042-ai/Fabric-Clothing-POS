import { useState } from 'react';
import { LuScissors, LuScanBarcode, LuRuler, LuChartColumn, LuPrinter, LuLogIn } from 'react-icons/lu';
import { api, setToken } from '../lib/api';

export default function Login({ onLogin }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('login', { username: u, password: p }); setToken(r.token); onLogin(r.user); }
    catch (x) { setErr(x.message); } setBusy(false);
  };
  return (
    <div className="login">
      <section className="login-art">
        <div className="brand" style={{ padding: 0 }}><div className="logo"><LuScissors /></div><div><b>Fabric POS</b><small style={{ color: '#c3d0f5' }}>Cloth &amp; garment store software</small></div></div>
        <div>
          <h2>Sell by the meter. Track every roll.</h2>
          <p>Billing, roll-wise stock, suits, customer udhaar and reports in one fast screen built for the shop counter.</p>
          <ul>
            <li><LuScanBarcode /> USB and camera barcode scanning</li>
            <li><LuRuler /> Meter, yard, piece and suit-set selling</li>
            <li><LuPrinter /> 58mm, 80mm and A4 invoices</li>
            <li><LuChartColumn /> Live sales, profit and stock reports</li>
          </ul>
        </div>
        <small style={{ color: '#9fb3e8' }}>Works offline on your own computer. Your data stays with you.</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <div><h1>Welcome back</h1><p className="sub" style={{ margin: '4px 0 0' }}>Log in to start selling.</p></div>
          {err && <div className="err" role="alert">{err}</div>}
          <div className="field"><label htmlFor="lu">Username</label><input id="lu" className="input" autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></div>
          <div className="field"><label htmlFor="lp">Password</label><input id="lp" className="input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
          <button className="btn primary lg" disabled={busy || !u || !p}><LuLogIn /> {busy ? 'Logging in…' : 'Log in'}</button>
          <div className="demo-hint">Demo logins: <button type="button" onClick={() => { setU('admin'); setP('admin123'); }}>admin</button><button type="button" onClick={() => { setU('manager'); setP('manager123'); }}>manager</button><button type="button" onClick={() => { setU('cashier'); setP('cashier123'); }}>cashier</button></div>
        </form>
      </section>
    </div>
  );
}
