import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';
import { LuCamera, LuCameraOff } from 'react-icons/lu';
import { Modal } from './ui.jsx';
import { beep } from '../lib/scan';

/** Phone / webcam barcode scanner. `onScan(code)` is called for every distinct read; keep=true leaves the camera open for continuous scanning. */
export default function CameraScanner({ onScan, onClose, continuous = false, title = 'Scan with camera' }) {
  const [err, setErr] = useState('');
  const [last, setLast] = useState('');
  const cb = useRef(onScan); cb.current = onScan;
  useEffect(() => {
    let scanner, stopped = false, lastCode = '', lastAt = 0;
    const id = 'cam-' + Math.random().toString(36).slice(2);
    const host = document.getElementById('cam-host'); if (host) host.id = id;
    (async () => {
      try {
        scanner = new Html5Qrcode(id, { formatsToSupport: [F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.QR_CODE, F.ITF], verbose: false });
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 280, height: 140 } }, (text) => {
          const now = Date.now();
          if (text === lastCode && now - lastAt < 1800) return;
          lastCode = text; lastAt = now; setLast(text); beep(true); cb.current(text);
          if (!continuous) onClose?.();
        }, () => {});
      } catch (e) { if (!stopped) setErr(String(e?.message || e).includes('Permission') ? 'Camera permission was blocked. Allow camera access in the browser address bar and try again.' : 'No camera could be started on this device. You can still use a USB scanner or type the code.'); }
    })();
    return () => { stopped = true; scanner?.isScanning ? scanner.stop().then(() => scanner.clear()).catch(() => {}) : scanner?.clear?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title={title} onClose={onClose} size="narrow" footer={<button className="btn" onClick={onClose}>Done</button>}>
      {err ? <div className="empty"><LuCameraOff /><b>Camera unavailable</b><span>{err}</span></div> : (
        <>
          <div id="cam-host" className="scanner-view" data-testid="camera-view" />
          <p className="muted" style={{ margin: '10px 0 0', display: 'flex', gap: 8, alignItems: 'center' }}><LuCamera /> Hold the barcode inside the box. {continuous ? 'Scanning stays on until you press Done.' : ''}</p>
          {last && <p style={{ margin: '6px 0 0' }}>Last scan: <b>{last}</b></p>}
        </>
      )}
    </Modal>
  );
}
