// Listing editor parts for "one store, one voice" (owner, 2026-11-12):
//   ListingKeyword    the search phrase this listing is written for
//   ListingQuestions  the questions and answers (FAQ): two shown, up to five
// The checks' notes and the facts the writer missed are no longer shown (owner, 18 Nov 2026: "donot provide
// suggestions rather fix it directly using AI"): the writer fixes what it can itself (genWrite.ts), and only what could
// harm the store holds a listing, with its reason in the editor (ListingEditor.tsx).
// While the extras load: bars shaped like the fields; if they cannot be read: the reason with Retry (the rest of the
// editor still works).
import { pbErrorBox, pbLabel, pbMeta } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import { PbSkelBar } from '../../ui/PbSkeleton';
import ListingField from './ListingField';
import { useState } from 'react';
import { FAQ_SLOTS, type FaqKey, type ListingSeoState } from './useListingSeo';

function Waiting({ s, what }: { s: ListingSeoState; what: string }) {
  if (s.loadErr) return (
    <div role="alert" style={{ ...pbErrorBox, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ minWidth: 0 }}>Could not load the {what}. {s.loadErr}</span>
      <PbButton icon="refresh" onClick={s.reload}>Try again</PbButton>
    </div>
  );
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <span className="pb-sr" role="status">Loading the {what}</span>
      <PbSkelBar w="30%" h={10} /><PbSkelBar w="100%" h={44} />
    </div>
  );
}

export function ListingKeyword({ s, disabled }: { s: ListingSeoState; disabled: boolean }) {
  if (!s.seo) return <Waiting s={s} what="search phrase" />;
  return (
    <ListingField id="pb-l-keyword" label="Search phrase" value={s.f.keyword} onChange={s.set('keyword')} disabled={disabled} kept={s.seo.keyword_locked} max={80}
      hint="The phrase shoppers search for, made from the product's tags and short enough for the SEO title. The AI puts it in the title, near the top of the description and in the SEO title. Change it, save, then regenerate. Empty uses the website's pattern." />
  );
}

export function ListingQuestions({ s, disabled }: { s: ListingSeoState; disabled: boolean }) {
  const [asked, setAsked] = useState(2);
  if (!s.seo) return <Waiting s={s} what="questions" />;
  // Growing boxes, not one-line inputs: a question is often longer than a phone is wide.
  const field = (k: FaqKey, label: string, area: number, max: number) => (
    <ListingField key={k} id={`pb-l-${k}`} label={label} value={s.f[k]} onChange={s.set(k)} disabled={disabled} kept={s.seo!.faq_locked && k === 'q1'} area={area} max={max} />
  );
  // Two are always shown; a third to fifth appear when they hold something, or when asked for.
  const filled = FAQ_SLOTS.reduce((last: number, n) => (s.f[`q${n}`].trim() || s.f[`a${n}`].trim() ? n : last), 0);
  const shown = Math.max(2, filled, asked);
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...pbLabel, padding: 0, marginBottom: 4 }}>Questions shoppers ask (FAQ)</legend>
      <div style={{ ...pbMeta, marginBottom: 12 }}>Up to five. Sent to Shopify with the listing. Empty a question and its answer to drop it.</div>
      {FAQ_SLOTS.slice(0, shown).flatMap(n => [field(`q${n}`, `Question ${n}`, 2, 200), field(`a${n}`, `Answer ${n}`, 3, 500)])}
      {shown < FAQ_SLOTS.length && <PbButton icon="plus" onClick={() => setAsked(shown + 1)} disabled={disabled} style={{ marginBottom: 16 }}>Add a question</PbButton>}
    </fieldset>
  );
}
