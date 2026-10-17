import { useState } from 'react';
import { LuUserPlus, LuUserCheck, LuUserX } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { useAsync, PageHead, Table, Badge, Modal, Field, useToast, Loading } from '../components/ui.jsx';

const ROLES = { admin: 'Full access, settings and users', manager: 'Sales, stock, reports, returns and approvals', cashier: 'Sales and customers only' };

export default function Users({ user }) {
  const toast = useToast(); const { data, loading, reload } = useAsync(() => api('users'), []); const [open, setOpen] = useState(false), [f, setF] = useState({ username: '', password: '', role: 'cashier' });
  const save = async () => { try { await api('users', f); toast('User created'); setOpen(false); setF({ username: '', password: '', role: 'cashier' }); reload(); } catch (e) { toast(e.message, 'err'); } };
  const toggle = async (u) => { try { await api('users', { toggle: u.id }); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <PageHead title="Users & roles" sub="Who can log in and what they are allowed to do"><button className="btn primary" onClick={() => setOpen(true)} data-testid="new-user"><LuUserPlus /> Add user</button></PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}>{Object.entries(ROLES).map(([r, d]) => <div className="card" key={r}><Badge tone={r === 'admin' ? 'red' : r === 'manager' ? 'blue' : 'gray'}>{r}</Badge><p className="muted" style={{ marginBottom: 0 }}>{d}</p></div>)}</div>
      <div className="card flush">{loading ? <Loading /> : <Table rows={data || []} cols={[{ h: 'Username', f: (u) => <b>{u.username}{u.id === user.id ? ' (you)' : ''}</b> }, { h: 'Role', f: (u) => <Badge tone={u.role === 'admin' ? 'red' : u.role === 'manager' ? 'blue' : 'gray'}>{u.role}</Badge> }, { h: 'Status', f: (u) => (u.active ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>) },
        { h: '', f: (u) => u.id !== user.id && <button className="btn sm" onClick={() => toggle(u)}>{u.active ? <><LuUserX /> Disable</> : <><LuUserCheck /> Enable</>}</button> }]} />}</div>
      {open && <Modal title="Add user" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!f.username || f.password.length < 6} onClick={save}>Create user</button></>}>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}><Field label="Username"><input className="input" autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field><Field label="Password (6+ characters)"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field><Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.keys(ROLES).map((r) => <option key={r}>{r}</option>)}</select></Field></div></Modal>}
    </>
  );
}
