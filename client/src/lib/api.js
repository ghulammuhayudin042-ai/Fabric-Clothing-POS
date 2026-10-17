let token = '';
try { token = sessionStorage.getItem('pos_token') || ''; } catch { /* storage blocked */ }
export const setToken = (t) => { token = t || ''; try { t ? sessionStorage.setItem('pos_token', t) : sessionStorage.removeItem('pos_token'); } catch { /* ignore */ } };
export const hasToken = () => !!token;
let onAuthLost = () => {};
export const setAuthLostHandler = (f) => { onAuthLost = f; };

async function req(path, body, raw) {
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-token': token }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return r.text();
  let j = {}; try { j = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && path !== 'login') { onAuthLost(); throw new Error('Please log in again'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
export const api = (p, b) => req(p, b);
export const apiText = (p) => req(p, undefined, true);
export const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
