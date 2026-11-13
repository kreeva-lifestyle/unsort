// "Already added?" on the product page (owner, 2026-11-12). What the database
// judged for this product (data/duplicates.ts), in up to four parts:
//   held      it looks like a copy of a product added earlier: it waits in
//             Needs info until a person answers (review-tinted)
//   maybe     nearest matches to answer (same code at another supplier, the
//             same number with other letters): suggestions, nothing is held
//   colour    the other colours of this design (just links)
//   original  a later product is waiting as a copy of this one (a link)
// One answer covers every product listed in its part: "It is a copy" archives
// THIS product (Restore brings it back), "Another colour" and "Different
// product" keep both and are remembered, so the pair is never asked again.
// Nothing is rendered when there is nothing to say.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import { DUP_WHY as WHY, answerDup, dupName, sourceText, type DupMatch, type DupVerdict } from '../../../data/duplicates';
import { PB, pbBody, pbBtnSecondary, pbMeta, pbName, pbNum, pbTileTitle } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbTile, { type PbSpan } from '../../ui/PbTile';
import { Dot, PRODUCT_STATUS } from '../status';
import ProductPhoto from '../list/ProductPhoto';
import type { PbProductStatus } from '../../../types';

function Other({ m, onOpen }: { m: DupMatch; onOpen: (id: string) => void }) {
  const st = PRODUCT_STATUS[m.other_status as PbProductStatus] ?? PRODUCT_STATUS.ready;
  const from = sourceText(m.other_source, m.other_ref);
  return (
    <button type="button" className="pb-pill" onClick={() => onOpen(m.other_id)} aria-label={`Open ${dupName(m)}`}
      style={{ ...pbBtnSecondary, justifyContent: 'flex-start', gap: 12, padding: 8, minHeight: 76, width: '100%', whiteSpace: 'normal', textAlign: 'left', fontWeight: 400 }}>
      <ProductPhoto path={m.other_photo ?? undefined} width={48} height={60} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span className="pb-clamp2" style={{ ...pbName, fontSize: 14 }}>{m.other_name || m.other_sku || 'Untitled product'}</span>
        <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>
          {m.other_sku && <span style={pbNum}>{m.other_sku}</span>}{m.other_sku && m.other_color ? ' · ' : ''}{m.other_color}{from && ` · from ${from}`}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12 }}><Dot color={st.color} label={st.label} /><span style={pbMeta}>{WHY[m.how]}</span></span>
      </span>
    </button>
  );
}

export default function DupTile({ productId, matches, span, onChanged, onOpen, addToast }: {
  productId: string; matches: DupMatch[]; span?: PbSpan;
  onChanged: () => void; onOpen: (id: string) => void; addToast: AddToast;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const held = matches.filter(m => m.kind === 'held'), maybe = matches.filter(m => m.kind === 'maybe');
  const colours = matches.filter(m => m.kind === 'colour'), later = matches.filter(m => m.kind === 'original');
  if (!held.length && !maybe.length && !colours.length && !later.length) return null;

  const answer = async (part: 'held' | 'maybe', list: DupMatch[], verdict: DupVerdict) => {
    if (busy) return;
    setBusy(`${part}:${verdict}`);
    try {
      const g = await answerDup(productId, list.map(m => m.other_id), verdict); // the answer and what follows, in one step
      if (verdict === 'same') addToast(`Archived as a copy of ${dupName(list[0])}. Restore brings it back`, 'success');
      else { // a held product is let go; the automation then sends it to the websites
        addToast(g?.was === 'needs_info' && g.status === 'ready' ? 'Kept as its own product. It now goes to the matching websites' : 'Kept as its own product', 'success');
      }
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(null); }
  };
  const answers = (part: 'held' | 'maybe', list: DupMatch[]) => {
    const b = (verdict: DupVerdict, label: string, busyLabel: string) => (
      <PbButton busy={busy === `${part}:${verdict}`} dim={!!busy && busy !== `${part}:${verdict}`} busyLabel={busyLabel}
        onClick={() => void answer(part, list, verdict)} style={{ flex: '1 1 150px' }}>{label}</PbButton>
    );
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {b('same', 'It is a copy', 'Archiving…')}{b('colour', 'Another colour', 'Saving…')}{b('different', 'Different product', 'Saving…')}
      </div>
    );
  };
  const part = (title: string, hint: string, list: DupMatch[], kind?: 'held' | 'maybe') => list.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div>
        <div style={{ ...pbBody, fontWeight: 600 }}>{title}</div>
        <div style={{ ...pbBody, color: PB.tx2 }}>{hint}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 8 }}>
        {list.map(m => <Other key={m.other_id} m={m} onOpen={onOpen} />)}
      </div>
      {kind && answers(kind, list)}
    </div>
  );

  return (
    <PbTile as="section" flat span={span} variant={held.length || maybe.length ? 'review' : 'default'} aria-labelledby="pb-dup-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="pb-dup-title" style={pbTileTitle}>{held.length ? 'This looks already added' : maybe.length ? 'Could this be already added?' : 'Same design'}</h2>
      {part(held.length === 1 ? 'It matches a product added earlier' : `It matches ${held.length} products added earlier`,
        'It waits here and nothing is written for the websites until you answer. One answer covers every product listed.', held, 'held')}
      {part('Nearest matches', 'Suggestions only: nothing is held. Answer once and it is not asked again.', maybe, 'maybe')}
      {part(colours.length === 1 ? 'Another colour of this design' : `${colours.length} other colours of this design`, 'Each colour is its own product.', colours)}
      {part('A later product is waiting as a copy of this one', 'Open it to answer.', later)}
    </PbTile>
  );
}
