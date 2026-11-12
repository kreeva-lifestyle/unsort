// Listing editor parts for "one store, one voice" (owner, 2026-11-12):
//   ListingChecks     what the program checks found and the facts the writer
//                     missed, as a review-tinted note (nothing shown when clean)
//   ListingKeyword    the search phrase this listing is written for
//   ListingQuestions  the two questions and answers (FAQ)
// While the extras load: bars shaped like the fields; if they cannot be read:
// the reason with Retry (the rest of the editor still works).
import { PB, pbBody, pbErrorBox, pbLabel, pbMeta, pbTileReview } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import { PbSkelBar } from '../../ui/PbSkeleton';
import { Dot } from '../status';
import ListingField from './ListingField';
import type { ListingSeoState } from './useListingSeo';

const note = { ...pbTileReview, backdropFilter: undefined, WebkitBackdropFilter: undefined, borderRadius: PB.r.input, padding: '12px 14px', marginBottom: 16 } as const;

/** `said`: the listing's own note ("Check before it goes out: …"); what it already says is not repeated here. */
export function ListingChecks({ s, said }: { s: ListingSeoState; said?: string | null }) {
  const notes = (s.seo?.notes ?? []).filter(n => !(said || '').includes(n)), missing = s.seo?.missing ?? [];
  if (!notes.length && !missing.length) return null;
  return (
    <section aria-label="What the checks found" style={{ ...note, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notes.length > 0 && (
        <>
          <Dot color={PB.review} label={`${said ? 'Also worth a look' : 'Worth a look'} (${notes.length === 1 ? 'one note' : `${notes.length} notes`} from the checks)`} style={{ fontWeight: 600, color: PB.tx, fontSize: 13, whiteSpace: 'normal' }} />
          <ul style={{ ...pbBody, margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, overflowWrap: 'anywhere' }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </>
      )}
      {missing.length > 0 && (
        <div style={{ ...pbBody, color: PB.tx2, overflowWrap: 'anywhere' }}>
          The writer was not given: <span style={{ color: PB.tx }}>{missing.join(', ')}</span>. Add them to the product's facts and regenerate to have them written in.
        </div>
      )}
    </section>
  );
}

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
      hint="The phrase shoppers search for. The AI puts it once in the title, near the top of the description and in the SEO title. Change it, save, then regenerate. Empty uses the website's pattern." />
  );
}

export function ListingQuestions({ s, disabled }: { s: ListingSeoState; disabled: boolean }) {
  if (!s.seo) return <Waiting s={s} what="questions" />;
  // Growing boxes, not one-line inputs: a question is often longer than a phone is wide.
  const field = (k: 'q1' | 'a1' | 'q2' | 'a2', label: string, area: number, max: number) => (
    <ListingField id={`pb-l-${k}`} label={label} value={s.f[k]} onChange={s.set(k)} disabled={disabled} kept={s.seo!.faq_locked && k === 'q1'} area={area} max={max} />
  );
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...pbLabel, padding: 0, marginBottom: 4 }}>Questions shoppers ask (FAQ)</legend>
      <div style={{ ...pbMeta, marginBottom: 12 }}>Sent to Shopify with the listing. Empty a question and its answer to drop it.</div>
      {field('q1', 'Question 1', 2, 200)}{field('a1', 'Answer 1', 3, 500)}{field('q2', 'Question 2', 2, 200)}{field('a2', 'Answer 2', 3, 500)}
    </fieldset>
  );
}
