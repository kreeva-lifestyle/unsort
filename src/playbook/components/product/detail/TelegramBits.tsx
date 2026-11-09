// What a Telegram product carries beyond the facts: where it came from (the
// vendor's channel + a link to the post), the vendor's separate "Less"
// (cost = rate − less) and the intake notes (no description, video too big…).
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { clearIntakeNotes, type ProductDetail } from '../../../data/products';
import type { AddToast } from '../../PbToasts';
import PbButton from '../../ui/PbButton';
import { PB, pbMeta, pbNum, pbTileTitle } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';
import PbTile from '../../ui/PbTile';
import { Dot, rupees } from '../status';

/** Only real t.me links (public channels) are opened. */
const postUrl = (u: string | null) => (u && /^https:\/\/t\.me\/[A-Za-z0-9_]{4,32}\/\d+$/.test(u) ? u : null);

/** The channel's name as people know it: its title, else @username (from the vendor or the post link). */
export function channelName(p: ProductDetail) {
  const v = p.pb_vendors;
  const fromUrl = postUrl(p.source_url)?.split('/')[3];
  return v?.tg_title || (v?.tg_username ? `@${v.tg_username}` : fromUrl ? `@${fromUrl}` : null);
}

/** Imported products link to the product page on the other store (https only). */
const pageUrl = (u: string | null) => (u && /^https:\/\/[^\s/]+\/\S*$/.test(u) ? u : null);
const linkStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, color: PB.tx, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 } as const;

/** "From Telegram · KUMARI_ART · Open post", or "From a website · example.com · Open page". Nothing for manual products. */
export function SourceLine({ p }: { p: ProductDetail }) {
  if (p.source === 'import') {
    const url = pageUrl(p.source_url);
    const host = p.source_ref?.split(':')[0] || (url ? new URL(url).host : null);
    return (
      <span style={{ ...pbMeta, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span>From a website</span>
        {host && <><span aria-hidden="true">·</span><span style={{ ...pbNum, color: PB.tx, overflowWrap: 'anywhere', minWidth: 0 }}>{host}</span></>}
        {url && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}><span aria-hidden="true">·</span><a href={url} target="_blank" rel="noopener noreferrer" className="pb-pill" style={linkStyle}>Open page<PbIcon name="arrowUpRight" size={14} /><span className="pb-sr"> (opens the other store)</span></a></span>}
      </span>
    );
  }
  if (p.source !== 'telegram') return null;
  const url = postUrl(p.source_url);
  const name = channelName(p);
  return (
    <span style={{ ...pbMeta, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
      <span>From Telegram</span>
      {name && <><span aria-hidden="true">·</span><span style={{ color: PB.tx, overflowWrap: 'anywhere', minWidth: 0 }}>{name}</span></>}
      {url && (
        <>
          <span aria-hidden="true">·</span>
          {/* A plain link (no window.open): iOS opens it in Telegram or Safari and the app stays where it was. */}
          <a href={url} target="_blank" rel="noopener noreferrer" className="pb-pill" style={linkStyle}>
            Open post<PbIcon name="arrowUpRight" size={14} /><span className="pb-sr"> (opens Telegram)</span>
          </a>
        </>
      )}
    </span>
  );
}

/** Inside Facts: "Rate ₹1,600 − Less ₹200 = Cost ₹1,400". */
export function LessLine({ p }: { p: ProductDetail }) {
  const less = p.less_amount == null ? null : Number(p.less_amount);
  if (less == null || less <= 0) return null;
  const kept = p.locked.includes('cost_price');
  const box = { display: 'flex', flexDirection: 'column' as const, gap: 4, padding: '12px 16px', borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.tileBd}`, minWidth: 0 };
  if (p.cost_price == null) {
    return <div style={box}><span style={{ ...pbMeta, color: PB.tx }}>Vendor’s less: <span style={pbNum}>{rupees(less)}</span></span>
      <span style={pbMeta}>It is taken off the rate when the AI reads the post.</span></div>;
  }
  if (kept) {
    return <div style={box}><span style={{ ...pbMeta, color: PB.tx }}>Vendor’s less: <span style={pbNum}>{rupees(less)}</span></span>
      <span style={pbMeta}>The cost price was typed by hand, so the less was not taken off it.</span></div>;
  }
  return (
    <div style={box}>
      <span style={{ ...pbNum, fontSize: 13, lineHeight: 1.5, color: PB.tx2, overflowWrap: 'anywhere' }}>
        Rate {rupees(Number(p.cost_price) + less)} − Less {rupees(less)} = <span style={{ color: PB.tx, fontWeight: 600 }}>Cost {rupees(p.cost_price)}</span>
      </span>
      <span style={pbMeta}>The vendor’s “Less” came as a separate message and was taken off the rate.</span>
    </div>
  );
}

/** Review-tinted tile with what the Telegram intake could not do by itself; "Mark as checked" clears it. */
export function IntakeNotesTile({ p, span, addToast, onChanged }: { p: ProductDetail; span?: 12; addToast: AddToast; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const notes = (p.intake_notes ?? []).filter(n => n.trim());
  if (!notes.length) return null;
  const check = async () => {
    if (saving) return;
    setSaving(true);
    try { await clearIntakeNotes(p.id); addToast('Notes marked as checked', 'success'); onChanged(); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setSaving(false); }
  };
  return (
    <PbTile as="section" variant="review" span={span} aria-labelledby="pb-intake-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="pb-intake-title" style={pbTileTitle}>Notes from Telegram</h2>
        <Dot color={PB.review} label={notes.length === 1 ? '1 thing to check' : `${notes.length} things to check`} style={{ color: PB.tx }} />
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {notes.map((n, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>{n}</li>)}
      </ul>
      <div><PbButton onClick={() => void check()} busy={saving} busyLabel="Saving…">Mark as checked</PbButton></div>
    </PbTile>
  );
}
