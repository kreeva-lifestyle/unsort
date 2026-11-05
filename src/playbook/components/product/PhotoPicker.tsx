// Pick several photos (JPG / PNG / WebP, ≤ 15 MB each) with previews and remove buttons.
// V2 (mobile.md §10): a grid of 4:5 cells (3 across on a phone), radius 16,
// the first photo marked as the cover, 44px remove buttons, and a dashed
// "add" cell.
import { useEffect, useRef, useState } from 'react';
import { checkPhoto } from '../../data/products';
import { PB } from '../../pbTheme';
import PbIcon from '../ui/PbIcon';

const MAX = 20;

export default function PhotoPicker({ files, onChange, onError, label = 'Add photos' }: {
  files: File[]; onChange: (f: File[]) => void; onError: (msg: string) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Made and revoked in the same effect, so StrictMode's re-run never leaves revoked URLs on screen.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map(f => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(x => URL.revokeObjectURL(x));
  }, [files]);

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const bad = picked.map(checkPhoto).filter(Boolean) as string[];
    const ok = picked.filter(f => !checkPhoto(f));
    const all = [...files, ...ok];
    if (all.length > MAX) bad.push(`At most ${MAX} photos — ${all.length - MAX} not added`);
    if (bad.length) onError(bad.join(' · '));
    if (ok.length) onChange(all.slice(0, MAX));
    if (input.current) input.current.value = '';
  };

  const cell = { position: 'relative' as const, aspectRatio: '4 / 5', borderRadius: PB.r.photo, overflow: 'hidden', background: PB.tile, minWidth: 0 };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {urls.map((u, i) => (
          <div key={u} style={{ ...cell, border: `1px solid ${PB.tileBd}` }}>
            <img src={u} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {i === 0 && (
              <span style={{ position: 'absolute', left: 6, bottom: 6, padding: '2px 8px', borderRadius: PB.r.pill, background: PB.sheetSolid, color: PB.tx, fontSize: 11, fontWeight: 600, lineHeight: 1.5 }}>Cover</span>
            )}
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="pb-focus"
              style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 6 }}>
              <span style={{ width: 28, height: 28, borderRadius: PB.r.pill, background: PB.sheetSolid, border: `1px solid ${PB.ctlBd}`, color: PB.tx, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <PbIcon name="x" size={14} />
              </span>
            </button>
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()} className="pb-pill"
          style={{ ...cell, border: `1px dashed ${PB.ctlBd}`, color: PB.tx, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: PB.sans, fontSize: 13, fontWeight: 600, padding: 8, textAlign: 'center' }}>
          <PbIcon name="plus" size={20} />{label}
        </button>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pick(e.target.files)} />
    </div>
  );
}
