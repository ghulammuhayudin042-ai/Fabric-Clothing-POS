import { useCallback, useEffect, useState } from 'react';
import { LuLayoutDashboard, LuShoppingCart, LuPackage, LuScroll, LuTruck, LuUsers, LuUndo2, LuChartColumn, LuArrowLeftRight, LuClock3, LuWallet, LuUserCog, LuHistory, LuSettings, LuLogOut, LuMenu, LuScissors } from 'react-icons/lu';
import { api, setToken, hasToken, setAuthLostHandler } from './lib/api';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Rolls from './pages/Rolls';
import Purchases from './pages/Purchases';
import Customers from './pages/Customers';
import Returns from './pages/Returns';
import Reports from './pages/Reports';
import Stock from './pages/Stock';
import Shift from './pages/Shift';
import Expenses from './pages/Expenses';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Settings from './pages/Settings';

const PERMS = { admin: ['*'], manager: ['sale', 'return', 'override', 'purchase', 'product', 'report', 'expense', 'adjust', 'customer', 'shift', 'audit'], cashier: ['sale', 'customer', 'shift'] };
export const can = (u, p) => !p || PERMS[u?.role]?.includes('*') || PERMS[u?.role]?.includes(p);

const PAGES = [
  ['Sell', [['pos', 'New Sale', LuShoppingCart, POS, 'sale'], ['returns', 'Returns & Exchange', LuUndo2, Returns, 'return'], ['shift', 'Cash Shift', LuClock3, Shift, 'shift']]],
  ['Insights', [['dashboard', 'Dashboard', LuLayoutDashboard, Dashboard, 'report'], ['reports', 'Reports', LuChartColumn, Reports, 'report']]],
  ['Inventory', [['products', 'Products', LuPackage, Products], ['rolls', 'Fabric Rolls', LuScroll, Rolls], ['stock', 'Stock Movements', LuArrowLeftRight, Stock], ['purchases', 'Purchases & Suppliers', LuTruck, Purchases, 'purchase']]],
  ['People & money', [['customers', 'Customers & Udhaar', LuUsers, Customers, 'customer'], ['expenses', 'Expenses', LuWallet, Expenses, 'expense']]],
  ['Admin', [['users', 'Users', LuUserCog, Users, 'admin'], ['audit', 'Audit Log', LuHistory, Audit, 'audit'], ['settings', 'Settings', LuSettings, Settings]]],
];
const flat = PAGES.flatMap(([, l]) => l);
const fromHash = () => { const h = window.location.hash.replace('#/', '').split('?')[0]; return flat.find((p) => p[0] === h)?.[0]; };

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState(fromHash() || 'pos');
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState({});
  
  

  const logout = useCallback(async (silent) => { if (!silent) { try { await api('logout', {}); } catch { /* already gone */ } } setToken(''); setUser(null); }, []);
  useEffect(() => { setAuthLostHandler(() => logout(true)); }, [logout]);
  useEffect(() => { // resume session after refresh
    (async () => { if (hasToken()) { try { setUser(await api('me')); } catch { setToken(''); } } setBooting(false); })();
  }, []);
  const loadSettings = useCallback(async () => { try { setSettings(Object.fromEntries((await api('settings')).map((r) => [r.key, r.value]))); } catch { /* ignore */ } }, []);
  useEffect(() => { if (user) loadSettings(); }, [user, loadSettings]);
  useEffect(() => { const f = () => { const p = fromHash(); if (p) setPage(p); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  const go = (p) => { window.location.hash = '#/' + p; setPage(p); setOpen(false); };
  const onLogin = (u) => { setUser(u); const h = fromHash(); const first = flat.find((p) => can(u, p[4])); go(h && can(u, flat.find((p) => p[0] === h)?.[4]) ? h : (can(u, 'sale') ? 'pos' : first[0])); };

  if (booting) return null;
  if (!user) return <Login onLogin={onLogin} />;
  const cur = flat.find((p) => p[0] === page && can(user, p[4])) || flat.find((p) => can(user, p[4]));
  const Page = cur[3];
  return (
    <div className="app">
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="brand"><div className="logo"><LuScissors /></div><div><b>{(settings.store_name || 'Fabric POS').replace(/^\[DEMO\]\s*/, '')}</b><small>Fabric &amp; Clothing POS</small></div></div>
        <nav className="nav" aria-label="Main">
          {PAGES.map(([g, list]) => {
            const vis = list.filter((p) => can(user, p[4])); if (!vis.length) return null;
            return <div key={g} style={{ display: 'contents' }}><div className="grp">{g}</div>
              {vis.map(([k, label, Icon]) => <a key={k} role="link" tabIndex={0} className={cur[0] === k ? 'on' : ''} onClick={() => go(k)} onKeyDown={(e) => e.key === 'Enter' && go(k)} data-nav={k}><Icon />{label}</a>)}</div>;
          })}
        </nav>
        <div className="userbox"><div className="avatar">{user.username[0]}</div><div><b>{user.username}</b><small>{user.role}</small></div>
          <button onClick={() => logout()} title="Log out" aria-label="Log out"><LuLogOut /></button></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn icon ghost menu-btn" onClick={() => setOpen(!open)} aria-label="Menu"><LuMenu size={20} /></button>
          <h1>{cur[1]}</h1><div className="grow" />
          <span className="clock">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </header>
        <main className="content" key={cur[0]}><Page user={user} settings={settings} reloadSettings={loadSettings} go={go} can={(p) => can(user, p)} /></main>
      </div>
      
    </div>
  );
}
