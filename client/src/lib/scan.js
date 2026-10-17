import { useEffect, useRef } from 'react';

let ctx;
export function beep(ok = true) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 1100 : 220; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch { /* audio not available */ }
}

/**
 * USB / Bluetooth barcode scanners behave like a keyboard: they type the code very fast and press Enter.
 * This hook catches that burst anywhere on the page (even when no input is focused) and calls onScan(code).
 * Normal typing is slower than `gap` ms between keys, so it is never mistaken for a scan.
 */
export function useWedgeScanner(onScan, { enabled = true, minLength = 4, gap = 40 } = {}) {
  const cb = useRef(onScan); cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buf = '', last = 0, fast = 0;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (e.key === 'Enter') {
        if (buf.length >= minLength && fast >= minLength - 1) {
          const el = document.activeElement;
          // a scan finished: stop the Enter from also submitting a focused form/field
          e.preventDefault(); e.stopPropagation();
          if (el && el.tagName === 'INPUT' && el.dataset.scanTarget !== 'true') { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
          const code = buf; buf = ''; fast = 0; cb.current(code);
        } else { buf = ''; fast = 0; }
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > gap) { buf = ''; fast = 0; }
      else fast++;
      buf += e.key; last = now;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, minLength, gap]);
}
