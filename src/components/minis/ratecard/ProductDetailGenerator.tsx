// Rate Card Studio → Product details: type a design code, get the WhatsApp
// write-up — facts from the master sheet copy, photos and a view-only HD
// link from Dropbox, words from the AI on the Settings model. In-app only
// (it spends the AI key). The price and link boxes re-compose the text, so
// a missing price or link is a 10-second fix, not a regenerate.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import SkuInput from '../../ui/SkuInput';
import { composeDetail, inr, type DetailResult } from './productDetailText';
import { generateDetail } from './productDetailApi';

export default function ProductDetailGenerator({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DetailResult | null>(null);
  const [price, setPrice] = useState('');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');

  const recompose = (r: DetailResult, p: string, l: string) => setText(composeDetail(r.detail, r.code, p.trim() ? Number(p.replace(/[^0-9.]/g, '')) || null : null, l.trim()));

  const run = async () => {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true);
    try {
      const r = await generateDetail(c);
      const p = r.price != null ? String(r.price) : '';
      setRes(r); setPrice(p); setLink(r.hdLink); recompose(r, p, r.hdLink);
      addToast(`Details ready for ${r.code}${r.estUsd ? ` · cost $${r.estUsd.toFixed(4)}` : ''}`, 'success');
      if (r.price == null) addToast('No price in the master sheet — type it in the Price box', 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); addToast('Copied — paste it into WhatsApp', 'success'); }
    catch { addToast('Could not copy — select the text and copy it by hand', 'error'); }
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
        Type a design code. The details come from the master sheet, the photos and a view-only HD link from its Dropbox folder, and the write-up from the AI model picked in Settings → Listing AI.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <SkuInput value={code} onChange={setCode} sizes={false} placeholder="Design code, e.g. DRS243"
          style={{ ...S.fInput, flex: 1, minWidth: 180, fontFamily: T.mono, textTransform: 'uppercase' }} />
        <button type="button" onClick={run} disabled={busy || !code.trim()}
          style={{ ...S.btnPrimary, minHeight: 36, minWidth: 120, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !code.trim() ? 0.5 : 1 }}>
          {busy ? 'Generating…' : res ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {busy && <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>Reading the master sheet, fetching the photos and writing the details — about 10–20 seconds.</div>}

      {res && (
        <div style={{ display: 'grid', gap: 12 }}>
          {res.warnings.length > 0 && (
            <div style={{ background: 'oklch(0.78 0.18 75 / .08)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: T.yl, lineHeight: 1.5 }}>
              {res.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {res.images.map(im => <img key={im.name} src={`data:image/jpeg;base64,${im.b64}`} alt={im.name} title={im.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.bd2}` }} />)}
            <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5, minWidth: 0 }}>
              {res.sheet ? <><b style={{ color: T.tx2 }}>{res.sheet.tab}</b> · {res.sheet.title || res.sheet.category}{res.sheet.color ? ` · ${res.sheet.color}` : ''}</> : 'Not in the master sheet'}
              {res.folder && <div style={{ fontFamily: T.mono, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.folder}</div>}
              <div>{res.images.length} photo{res.images.length === 1 ? '' : 's'} read · {res.model}</div>
            </div>
          </div>
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 8 }}>
            <div>
              <label style={S.fLabel}>Price exc GST</label>
              <input value={price} onChange={e => { setPrice(e.target.value); recompose(res, e.target.value, link); }} inputMode="decimal" placeholder="₹"
                style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
            </div>
            <div>
              <label style={S.fLabel}>HD images link (view only)</label>
              <input value={link} onChange={e => { setLink(e.target.value); recompose(res, price, e.target.value); }} placeholder="https://www.dropbox.com/…"
                style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
            </div>
          </div>
          <div>
            <label style={S.fLabel}>WhatsApp text{price.trim() ? ` · ₹${inr(Number(price.replace(/[^0-9.]/g, '')) || 0)} + GST + Shipping` : ''}</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={18} spellCheck={false}
              style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 320, resize: 'vertical', lineHeight: 1.5, fontSize: 13, whiteSpace: 'pre-wrap' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copy} style={{ ...S.btnPrimary, minHeight: 44, flex: 1, minWidth: 140 }}>Copy text</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btnGhost, minHeight: 44, flex: 1, minWidth: 140, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: T.gr, borderColor: 'oklch(0.72 0.19 145 / .3)', background: 'oklch(0.72 0.19 145 / .06)' }}>
              Open in WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
