// Results for Client Finder, grouped by website. One row per domain with the
// strongest match it produced, expandable to the individual pages — a seller
// listing the same design on 12 URLs should read as one client, not twelve.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import Empty from '../../ui/Empty';
import { kindLabel, type Hit, type MatchKind } from './api';

const kindColor: Record<MatchKind, string> = { full: T.gr, partial: T.yl, page: T.tx3, similar: T.bl };
const rank: Record<MatchKind, number> = { full: 0, partial: 1, page: 2, similar: 3 };

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
  for (const h of hits) byDomain.set(h.domain, [...(byDomain.get(h.domain) || []), h]);
  const domains = [...byDomain.entries()].sort((a, b) => {
    const best = (x: Hit[]) => Math.min(...x.map(h => rank[h.match_kind]));
    return best(a[1]) - best(b[1]) || b[1].length - a[1].length;
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
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
                  {kindLabel[strongest.match_kind]}{list.length > 1 ? ` · ${list.length} pages` : ''}
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
                <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {kindLabel[h.match_kind]} · {h.url}
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
