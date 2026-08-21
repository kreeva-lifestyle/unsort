// Catalog photo WITHOUT uploading (supplier-requested): once the rate sheet
// has SKUs, offer ~8 of their own Dropbox product photos — one per SKU when
// there are many — and let the user tap one as the hero. The tapped photo is
// fetched through the edge fn as bytes, then fed into the SAME pickHero path
// an upload uses, so the canvas export stays untainted. Works on the seller
// link too: the share token authorises the two photo actions server-side.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { call, explainGen } from '../dropboxlinks/api';

interface Candidate { sku: string; name: string; path: string; url: string }

export default function HeroFromSkus({ skus, shareToken, onPick, addToast }: {
  skus: string[];
  shareToken?: string;
  onPick: (f: File) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    if (loading) return;
    setLoading(true); setNote('');
    try {
      const { status, data } = await call({ action: 'ratecard_photos', skus, ...(shareToken ? { shareToken } : {}) });
      if (!data?.ok) { setCands([]); setNote(explainGen(data, status)); return; }
      setCands(data.candidates as Candidate[]);
      const missed = (data.misses || []) as { sku: string; reason: string }[];
      if (missed.length) setNote(`No photo for ${missed.map(m => m.sku).join(', ')}`);
    } catch {
      setCands([]); setNote('Could not load product photos — check the connection and try again');
    } finally { setLoading(false); }
  };

  const choose = async (c: Candidate) => {
    if (fetching) return;
    setFetching(c.path);
    try {
      const { status, data } = await call({ action: 'ratecard_photo_fetch', path: c.path, ...(shareToken ? { shareToken } : {}) });
      if (!data?.ok) { addToast(explainGen(data, status), 'error'); return; }
      const bin = atob(String(data.b64));
      const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
      onPick(new File([bytes], String(data.name || c.name), { type: String(data.mime || 'image/jpeg') }));
      setCands(null); setNote('');
      addToast(`Using ${c.sku}'s photo as the catalog photo`, 'success');
    } catch {
      addToast('Could not fetch that photo — try another', 'error');
    } finally { setFetching(''); }
  };

  if (skus.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={cands ? () => { setCands(null); setNote(''); } : load}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
          {loading ? 'Finding photos…' : cands ? 'Hide product photos' : 'Or pick from product photos'}
        </button>
        {cands !== null && cands.length > 0 && (
          <button onClick={load} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Show different photos</button>
        )}
      </div>
      {note && <div style={{ fontSize: 10, color: T.yl, marginTop: 6, lineHeight: 1.5 }}>{note}</div>}
      {cands !== null && cands.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, marginTop: 8 }}>
          {cands.map(c => (
            <div key={c.path} onClick={() => choose(c)}
              style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.bd}`, cursor: 'pointer', background: T.s2, opacity: fetching && fetching !== c.path ? 0.5 : 1 }}>
              <img src={c.url} alt={c.sku} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 6px 4px', fontSize: 9, fontFamily: T.mono, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.75))', textAlign: 'center' }}>
                {fetching === c.path ? 'Loading…' : c.sku}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
