// What "Check website" found, inside the import sheet: the platform in plain
// words (dot + label), the estimate, 3 sample products and any warnings in
// the review tint. Boxes use the control fill (a sheet is not a tile, so
// nothing here is a tile on a tile).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ImportCheck } from '../../../data/imports';
import type { PbImportSample } from '../../../types';
import { PB, pbBody, pbMeta, pbName, pbNum } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';
import PbTag from '../../ui/PbTag';
import { Dot, rupees } from '../status';
import { PLATFORM, estimateLine, nothingFound } from './importText';

const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.tileBd}`, minWidth: 0 };

/** 48×60 photo from the other store (their CDN; a broken one shows the placeholder). */
function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  const frame: CSSProperties = { width: 48, height: 60, borderRadius: PB.r.skel, overflow: 'hidden', background: PB.tile, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PB.tx3 };
  if (!src || broken) return <span style={frame}><PbIcon name="photo" size={18} /><span className="pb-sr">No photo</span></span>;
  return <span style={frame}><img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={48} height={60} onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></span>;
}

function SampleRow({ s }: { s: PbImportSample }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, padding: '8px 0', borderTop: `1px solid ${PB.tileBd}` }}>
      <Thumb src={s.image} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="pb-clamp2" style={{ ...pbName, fontSize: 13 }}>{s.name || 'Untitled product'}</span>
        {s.in_stock === false && <span style={{ alignSelf: 'flex-start' }}><PbTag>Out of stock</PbTag></span>}
      </span>
      <span style={{ ...pbNum, fontSize: 15, fontWeight: 500, color: PB.tx, flexShrink: 0 }}>{s.price == null ? <span style={pbMeta}>No price</span> : s.currency && s.currency !== 'INR' ? `${s.currency} ${s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : rupees(s.price)}</span>
    </li>
  );
}

export default function ImportPreview({ check }: { check: ImportCheck }) {
  const plat = PLATFORM[check.platform] ?? PLATFORM.unknown;
  const empty = nothingFound(check);
  // After a check, focus moves here (the address box was busy), so a screen reader reads the result next.
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => { first.current?.focus(); }, [check]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
      <div ref={first} tabIndex={-1} id="pb-imp-result" style={{ ...box, outline: 'none', ...(empty ? { background: PB.failedBg, borderColor: PB.failedBd } : null) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Dot color={plat.color} label={plat.label} style={{ fontSize: 13, color: PB.tx, fontWeight: 600 }} />
          <span style={{ ...pbNum, ...pbMeta, overflowWrap: 'anywhere' }}>{check.host}</span>
        </div>
        {empty ? (
          <span style={{ ...pbBody, color: PB.tx }}>No products were found on this website. Playbook reads Shopify and WooCommerce stores fully, and other stores only when their pages carry product data. Check the address, or try the store’s home page.</span>
        ) : (
          <>
            <span style={{ ...pbBody, color: PB.tx }}>{estimateLine(check).split(/(\d[\d,+]*)/).map((part, i) => (i % 2 ? <span key={i} style={pbNum}>{part}</span> : part))}</span>
            <span style={{ ...pbMeta }}>{plat.hint}</span>
          </>
        )}
        {check.sample.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Sample products">
            {check.sample.slice(0, 3).map((s, i) => <SampleRow key={i} s={s} />)}
          </ul>
        )}
      </div>
      {check.warnings.length > 0 && (
        <div role="status" style={{ ...box, background: PB.reviewBg, borderColor: PB.reviewBd, gap: 8 }}>
          <Dot color={PB.review} label={check.warnings.length === 1 ? 'One thing to know' : `${check.warnings.length} things to know`} style={{ fontSize: 13, color: PB.tx, fontWeight: 600 }} />
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {check.warnings.map((w, i) => <li key={i} style={{ ...pbBody, color: PB.tx, overflowWrap: 'anywhere' }}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
