// Settings → "Tags" tile: how many new tags wait for review, a line on what
// the library does, and the button that opens the Tags page. The count is a
// direct read of pb_tags (RLS: staff); a failed count still shows the button.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { countTagsToReview } from '../../data/tags';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbSection, PbSkelBar, PbTile } from '../ui';

export default function TagsTile({ onOpen, count: given }: { onOpen: () => void; count?: number | null }) {
  const [count, setCount] = useState<number | null>(given ?? null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    countTagsToReview().then(n => { if (live) setCount(n); }).catch(e => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [given]);
  return (
    <PbTile as="section" aria-labelledby="pbs-tags">
      <PbSection title="Tags" id="pbs-tags"
        hint="Every product carries its own clean tags, built from its facts, the other store's tags and the AI. Websites send them with the {tags} placeholder. Review new tags, hide junk such as _altnew_ codes, and merge two spellings of one tag."
        right={<PbButton icon="tag" onClick={onOpen}>Open Tags</PbButton>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 24 }}>
          {count === null && !err && <PbSkelBar w={160} h={14} />}
          {count !== null && (count > 0
            ? <Dot color={PB.review} label={<><span style={pbNum}>{count.toLocaleString('en-IN')}</span> new {count === 1 ? 'tag' : 'tags'} to review</>} style={{ color: PB.tx, fontSize: 13 }} />
            : <Dot color={PB.live} label="Nothing to review" style={{ color: PB.tx, fontSize: 13 }} />)}
          {err && <span style={{ ...pbMeta, color: PB.failed }}>Could not count the new tags: {err}</span>}
        </div>
      </PbSection>
    </PbTile>
  );
}
