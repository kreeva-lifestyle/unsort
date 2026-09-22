// Indya Import's toolbar: the file pickers (each a real button over a hidden
// input, touch44) and the actions. Split out of IndyaImport.tsx to keep
// that file under the size limit.
import { useRef } from 'react';
import { T, S } from '../../../lib/theme';
import IndyaBarcodes from './IndyaBarcodes';

const ACCEPT = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const hidden = { position: 'absolute' as const, width: 0, height: 0, overflow: 'hidden' as const, opacity: 0 };
const BLUE = { color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' };
const AMBER = { color: T.yl, border: '1px solid oklch(0.78 0.18 75 / .2)', background: 'oklch(0.78 0.18 75 / .06)' };

export default function IndyaToolbar({ busy, hasMaster, hasVendors, hasBlocked, hasResult, anything, addToast, onMaster, onVendors, onBlocked, onSkuSheet, onCompute, onDownload, onReset }: {
  busy: string; hasMaster: boolean; hasVendors: boolean; hasBlocked: boolean; hasResult: boolean; anything: boolean; addToast: (msg: string, type?: string) => void;
  onMaster: (f: File) => void; onVendors: (f: File[]) => void; onBlocked: (f: File) => void;
  onSkuSheet: () => void; onCompute: () => void; onDownload: () => void; onReset: () => void;
}) {
  const masterRef = useRef<HTMLInputElement>(null), vendorRef = useRef<HTMLInputElement>(null), blockedRef = useRef<HTMLInputElement>(null);
  const bt = (style: React.CSSProperties, disabled = !!busy): React.CSSProperties => ({ ...style, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' });
  // The input is cleared BEFORE the picker opens (so the same file can be
  // picked twice), never inside onChange: on iOS the picked File is a
  // temporary copy tied to the input's file list, and clearing the input
  // before the read finishes makes that read fail.
  const pick = (ref: React.RefObject<HTMLInputElement | null>) => () => { if (ref.current) { ref.current.value = ''; ref.current.click(); } };
  const one = (fn: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) fn(f); };
  const many = (e: React.ChangeEvent<HTMLInputElement>) => { const fs = Array.from(e.target.files || []); if (fs.length) onVendors(fs); };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="touch44" onClick={pick(masterRef)} style={bt(S.btnPrimary)}>{busy === 'master' ? 'Reading…' : hasMaster ? 'Replace Indya master' : '1 · Import Indya master'}</button>
        {hasMaster && <button type="button" className="touch44" onClick={onSkuSheet} style={bt({ ...S.btnGhost, ...BLUE })}>{busy === 'skus' ? 'Preparing…' : '2 · Download SKU sheet'}</button>}
        <button type="button" className="touch44" onClick={pick(vendorRef)} style={bt(S.btnGhost)}>{busy === 'vendor' ? 'Reading…' : `${hasMaster ? '3 · ' : ''}+ Add vendor files`}</button>
        <button type="button" className="touch44" onClick={pick(blockedRef)} style={bt({ ...S.btnGhost, ...AMBER })}>{busy === 'blocked' ? 'Reading…' : hasBlocked ? 'Replace blocked' : 'Blocked inventory'}</button>
        {hasMaster && hasVendors && <button type="button" className="touch44" onClick={onCompute} style={bt(S.btnSuccess)}>{busy === 'compute' ? 'Computing…' : '4 · Compute'}</button>}
        {hasResult && <button type="button" className="touch44" onClick={onDownload} style={bt({ ...S.btnPrimary, background: T.gr, color: T.tx, fontWeight: 700 })}>{busy === 'download' ? 'Preparing…' : '5 · Download updated file'}</button>}
        <IndyaBarcodes addToast={addToast} busy={!!busy} />
        {anything && <button type="button" className="touch44" onClick={onReset} style={bt(S.btnDanger)}>Reset</button>}
      </div>
      <input ref={masterRef} type="file" accept={ACCEPT} onChange={one(onMaster)} style={hidden} aria-label="Indya master file" />
      <input ref={vendorRef} type="file" accept={ACCEPT} multiple onChange={many} style={hidden} aria-label="Vendor stock files" />
      <input ref={blockedRef} type="file" accept={ACCEPT} onChange={one(onBlocked)} style={hidden} aria-label="Blocked inventory file" />
    </>
  );
}
