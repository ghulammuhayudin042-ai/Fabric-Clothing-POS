import { useRef } from 'react';
import { LuPrinter } from 'react-icons/lu';
import { Modal } from './ui.jsx';

/** Shows a printable document in an iframe; the Print button opens the system print dialog (58mm / 80mm / A4 printers). */
export default function PrintPreview({ title = 'Print preview', html, onClose, extra }) {
  const ref = useRef();
  const doPrint = () => { const w = ref.current?.contentWindow; if (w) { w.focus(); w.print(); } };
  return (
    <Modal title={title} size="wide" onClose={onClose} footer={<>{extra}<button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={doPrint}><LuPrinter /> Print</button></>}>
      <iframe ref={ref} className="printframe" title="Print preview" srcDoc={html} data-testid="print-frame" />
    </Modal>
  );
}
