// Indya Import's toolbar: the file pickers (each a real button over a hidden
// input, touch44) and the actions. Split out of IndyaImport.tsx to keep
// that file under the size limit.
import { useRef } from 'react';
import { T, S } from '../../../lib/theme';

const ACCEPT = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const hidden = { position: 'absolute' as const, width: 0, height: 0, overflow: 'hidden' as const, opacity: 0 };
const BLUE = { color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' };
const AMBER = { color: T.yl, border: '1px solid oklch(0.78 0.18 75 / .2)', background: 'oklch(0.78 0.18 75 / .06)' };

export default function IndyaToolbar({ busy, hasMaster, hasVendors, hasCorr, hasBlocked, hasResult, anything, onMaster, onVendors, onCorr, onBlocked, onSkuSheet, onCompute, onDownload, onReset }: {
  busy: string; hasMaster: boolean; hasVendors: boolean; hasCorr: boolean; hasBlocked: boolean; hasResult: boolean; anything: boolean;
  onMaster: (f: File) => void; onVendors: (f: File[]) => void; onCorr: (f: File) => void; onBlocked: (f: File) => void;
  onSkuSheet: () => void; onCompute: () => void; onDownload: () => void; onReset: () => void;
}) {
  const masterRef = useRef<HTMLInputElement>(null), vendorRef = useRef<HTMLInputElement>(null), corrRef = useRef<HTMLInputElement>(null), blockedRef = useRef<HTMLInputElement>(null);
  const bt = (style: React.CSSProperties, disabled = !!busy): React.CSSProperties => ({ ...style, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' });
  const one = (fn: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fn(f); };
  const many = (e: React.ChangeEvent<HTMLInputElement>) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) onVendors(fs); };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="touch44" onClick={() => masterRef.current?.click()} style={bt(S.btnPrimary)}>{busy === 'master' ? 'Reading…' : hasMaster ? 'Replace Indya master' : '1 · Import Indya master'}</button>
        {hasMaster && <button type="button" className="touch44" onClick={onSkuSheet} style={bt({ ...S.btnGhost, ...BLUE })}>{busy === 'skus' ? 'Preparing…' : '2 · Download SKU sheet'}</button>}
        <button type="button" className="touch44" onClick={() => corrRef.current?.click()} style={bt({ ...S.btnGhost, ...BLUE })}>{busy === 'corr' ? 'Reading…' : hasCorr ? 'Replace correct-SKU sheet' : 'Correct-SKU sheet'}</button>
        <button type="button" className="touch44" onClick={() => vendorRef.current?.click()} style={bt(S.btnGhost)}>{busy === 'vendor' ? 'Reading…' : `${hasMaster ? '3 · ' : ''}+ Add vendor files`}</button>
        <button type="button" className="touch44" onClick={() => blockedRef.current?.click()} style={bt({ ...S.btnGhost, ...AMBER })}>{busy === 'blocked' ? 'Reading…' : hasBlocked ? 'Replace blocked' : 'Blocked inventory'}</button>
        {hasMaster && hasVendors && <button type="button" className="touch44" onClick={onCompute} style={bt(S.btnSuccess)}>{busy === 'compute' ? 'Computing…' : '4 · Compute'}</button>}
        {hasResult && <button type="button" className="touch44" onClick={onDownload} style={bt({ ...S.btnPrimary, background: T.gr, color: '#fff', fontWeight: 700 })}>{busy === 'download' ? 'Preparing…' : '5 · Download updated file'}</button>}
        {anything && <button type="button" className="touch44" onClick={onReset} style={bt(S.btnDanger)}>Reset</button>}
      </div>
      <input ref={masterRef} type="file" accept={ACCEPT} onChange={one(onMaster)} style={hidden} aria-label="Indya master file" />
      <input ref={vendorRef} type="file" accept={ACCEPT} multiple onChange={many} style={hidden} aria-label="Vendor stock files" />
      <input ref={corrRef} type="file" accept={ACCEPT} onChange={one(onCorr)} style={hidden} aria-label="Correct SKU sheet" />
      <input ref={blockedRef} type="file" accept={ACCEPT} onChange={one(onBlocked)} style={hidden} aria-label="Blocked inventory file" />
    </>
  );
}
