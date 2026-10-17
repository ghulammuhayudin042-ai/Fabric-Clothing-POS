import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LuX, LuCircleCheck, LuCircleAlert, LuInfo, LuInbox, LuSearch, LuLoader } from 'react-icons/lu';

/* ---------- toasts: toast('text') = success, toast('text','err') = error, toast('text','info') ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setList((l) => [...l, { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 5500 : 3400);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} data-testid="toast">
            {t.kind === 'err' ? <LuCircleAlert size={18} /> : t.kind === 'info' ? <LuInfo size={18} /> : <LuCircleCheck size={18} />}<span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal ' + size} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><button className="btn icon ghost" onClick={onClose} aria-label="Close"><LuX size={18} /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- building blocks ---------- */
export const PageHead = ({ title, sub, children }) => (
  <div className="pagehead"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><span className="sp" /><div className="row">{children}</div></div>
);
export const Field = ({ label, help, children, className = '', style }) => (
  <div className={'field ' + className} style={style}>{label && <label>{label}</label>}{children}{help && <span className="help">{help}</span>}</div>
);
export const Stat = ({ icon, label, value, sub, tone = 'blue' }) => (
  <div className="card stat"><div className={'ic tone-' + tone}>{icon}</div><div><div className="lbl">{label}</div><div className="val">{value}</div>{sub && <div className="hint">{sub}</div>}</div></div>
);
export const Badge = ({ tone = 'blue', icon, children }) => <span className={'badge ' + tone}>{icon}{children}</span>;
export const Loading = () => <div className="loading"><LuLoader className="spin" /> Loading…</div>;
export const ErrorBox = ({ error }) => <div className="alert bad" role="alert"><LuCircleAlert /><span>{error}</span></div>;
export const Empty = ({ icon, title = 'Nothing here yet', children }) => (
  <div className="empty">{icon || <LuInbox />}<b>{title}</b>{children && <span>{children}</span>}</div>
);
export const SearchBox = ({ value, onChange, placeholder = 'Search…', ...rest }) => (
  <div className="search"><LuSearch /><input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} /></div>
);
/** cols: [{h, f(row,i), num?}] · empty: {title,text} */
export function Table({ cols, rows, empty, onRow }) {
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{cols.map((c, i) => <th key={i} className={c.num ? 'num' : ''} style={c.w ? { width: c.w } : null}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? 'click' : ''}>
            {cols.map((c, j) => <td key={j} className={c.num ? 'num' : ''}>{c.f(r, i)}</td>)}</tr>)}
          {!rows.length && <tr className="none"><td colSpan={cols.length}><Empty title={empty?.title} >{empty?.text}</Empty></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
export function useAsync(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true }));
    try { const data = await fn(); if (alive.current) set({ data, error: null, loading: false }); }
    catch (e) { if (alive.current) set({ data: null, error: e.message, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false; }; }, [run]);
  return { ...state, reload: run };
}
