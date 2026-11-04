// Pick several photos (JPG / PNG / WebP, ≤ 15 MB each) with previews and remove buttons.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { checkPhoto } from '../../data/products';

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

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {urls.map((u, i) => (
          <div key={u} style={{ position: 'relative', width: 76, height: 76, borderRadius: T.r, overflow: 'hidden', border: `1px solid ${T.bd2}` }}>
            <img src={u} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(files.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 4 }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: T.bg, color: T.tx, fontSize: 14, lineHeight: '20px', textAlign: 'center' }}>&#215;</span>
            </button>
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()}
          style={{ ...S.btnGhost, width: 76, height: 76, flexDirection: 'column', whiteSpace: 'normal', fontSize: 11, padding: 6 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>{label}
        </button>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pick(e.target.files)} />
    </div>
  );
}
