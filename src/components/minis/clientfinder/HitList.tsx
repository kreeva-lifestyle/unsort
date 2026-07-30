// Results for Client Finder, grouped by website. One row per domain with the
// strongest match it produced, expandable to the individual pages — a seller
// listing the same design on 12 URLs should read as one client, not twelve.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import Empty from '../../ui/Empty';
import { kindLabel, pixels, sizeLabel, type Hit, type MatchKind } from './api';

const kindColor: Record<MatchKind, string> = { full: T.gr, partial: T.yl, page: T.tx3, similar: T.bl };
const rank: Record<MatchKind, number> = { full: 0, partial: 1, page: 2, similar: 3 };

// Biggest copy first — a site hosting a 3000px original is a different lead
// from one showing a thumbnail. Anything unmeasured sorts last: the host
// refused to say, which is not the same as the image being small.
const biggestFirst = (a: Hit, b: Hit) =>
  (pixels(b) - pixels(a)) || ((b.bytes ?? 0) - (a.bytes ?? 0)) || rank[a.match_kind] - rank[b.match_kind];

/** The largest image any one website hosts — what that website is ranked on. */
const bestOf = (list: Hit[]) => list.reduce((m, h) => (pixels(h) > pixels(m) ? h : m), list[0]);

function SizeText({ hit, dim }: { hit: Hit; dim?: boolean }) {
  const label = sizeLabel(hit);
  return (
    <span style={{ fontSize: 10, color: label ? (dim ? T.tx3 : T.tx2) : T.tx3, fontFamily: T.mono, opacity: label ? 1 : 0.55 }}>
      {label || 'size unknown'}
    </span>
  );
}

export default function HitList({ hits: allHits }: { hits: Hit[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Kept strictly apart. A similar-looking design is a competitor working in
  // the same style — it is NOT evidence anyone used your photo, and mixing the
  // two would turn a lead into a false accusation.
  const hits = allHits.filter(h => h.match_kind !== 'similar');
  const similar = allHits.filter(h => h.match_kind === 'similar');

  if (hits.length === 0 && similar.length === 0) {
    return (
      <Empty
        icon="search"
        title="No websites found"
        message="Google has not indexed this image anywhere it can see. That does not prove nobody is using it — private catalogues, wholesale portals and WhatsApp are invisible to this search."
      />
    );
  }

  const byDomain = new Map<string, Hit[]>();
  for (const h of hits) byDomain.set(h.domain, [...(byDomain.get(h.domain) || []), h].sort(biggestFirst));
  // Websites ranked by the largest image each one hosts, not by match strength.
  // Exact and cropped are deliberately mixed here: a 4000px cropped copy is a
  // better lead than a 200px exact one. The one line never crossed is
  // "similar", which is filtered out above and rendered separately.
  const domains = [...byDomain.entries()].sort((a, b) => {
    const A = bestOf(a[1]), B = bestOf(b[1]);
    return biggestFirst(A, B) || b[1].length - a[1].length;
  });

  return (
    <>
    {hits.length === 0 ? (
      <Empty
        icon="search"
        title="No exact matches"
        message="Nobody appears to be using this photo on a page Google has indexed. Similar-looking designs are listed below, but those are a different thing."
      />
    ) : (
    <div style={{ borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
      {domains.map(([domain, list]) => {
        const strongest = list.reduce((a, b) => (rank[a.match_kind] <= rank[b.match_kind] ? a : b));
        const largest = bestOf(list);
        const isOpen = !!open[domain];
        return (
          <div key={domain} style={{ borderBottom: `1px solid ${T.bd}` }}>
            <div
              onClick={() => setOpen(o => ({ ...o, [domain]: !o[domain] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', minHeight: 44 }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: kindColor[strongest.match_kind], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</div>
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <SizeText hit={largest} />
                  <span>{kindLabel[strongest.match_kind]}{list.length > 1 ? ` · ${list.length} pages` : ''}</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: T.tx3, flexShrink: 0 }}>{isOpen ? '−' : '+'}</span>
            </div>
            {isOpen && list.map(h => (
              <a
                key={h.url}
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', padding: '8px 14px 8px 32px', borderTop: `1px solid ${T.bd}`, textDecoration: 'none' }}
              >
                <div style={{ fontSize: 11, color: T.ac2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.page_title || h.url}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 2 }}>
                  <SizeText hit={h} dim />
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kindLabel[h.match_kind]} · {h.url}
                  </span>
                </div>
              </a>
            ))}
          </div>
        );
      })}
      <div style={{ ...S.fLabel, padding: '8px 14px', color: T.tx3, textTransform: 'none', letterSpacing: 0 }}>
        {domains.length} website{domains.length === 1 ? '' : 's'} · {hits.length} page{hits.length === 1 ? '' : 's'}
      </div>
    </div>
    )}
    {similar.length > 0 && <SimilarSection hits={similar} />}
    </>
  );
}

/** Similar-looking designs, kept apart and labelled without euphemism. */
function SimilarSection({ hits }: { hits: Hit[] }) {
  const domains = [...new Set(hits.map(h => h.domain))];
  return (
    <div style={{ marginTop: 14, borderRadius: 10, border: `1px dashed ${T.bd2}`, background: 'rgba(56,189,248,.03)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.bl }}>Similar designs &mdash; not your photo</div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, lineHeight: 1.5 }}>
          These merely look alike. They show someone working in the same style; they are
          <strong> not</strong> evidence that anyone used your image.
        </div>
      </div>
      {hits.map(h => (
        <a key={h.url} href={h.url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', padding: '9px 14px', borderTop: `1px solid ${T.bd}`, textDecoration: 'none', minHeight: 44 }}>
          <div style={{ fontSize: 12, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.domain}</div>
          <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</div>
        </a>
      ))}
      <div style={{ ...S.fLabel, padding: '8px 14px', color: T.tx3, textTransform: 'none', letterSpacing: 0 }}>
        {domains.length} site{domains.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
