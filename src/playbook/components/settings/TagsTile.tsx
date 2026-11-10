// Settings → "Tags" tile: the owner's tag lists AND the category list live on
// the Tags page now (categories moved there from this page, 2026-11-10); this
// tile says how many suggestions wait and opens it. The count is a direct read
// of pb_tag_suggestions (RLS: staff); a failed count still shows the button.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { countSuggestions } from '../../data/tags';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbSection, PbSkelBar, PbTile } from '../ui';

export default function TagsTile({ onOpen, count: given }: { onOpen: () => void; count?: number | null }) {
  const [count, setCount] = useState<number | null>(given ?? null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    countSuggestions().then(n => { if (live) setCount(n); }).catch(e => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [given]);
  return (
    <PbTile as="section" aria-labelledby="pbs-tags">
      <PbSection title="Tags" id="pbs-tags"
        hint="Categories, and the attributes and values Playbook tags products with (Colour: Black, Work: Embroidery…). Every attribute of a category is a must before a product goes to websites. Websites send the values with {tags}."
        right={<PbButton icon="tag" onClick={onOpen}>Categories &amp; tags</PbButton>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 24 }}>
          {count === null && !err && <PbSkelBar w={160} h={14} />}
          {count !== null && (count > 0
            ? <Dot color={PB.review} label={<><span style={pbNum}>{count.toLocaleString('en-IN')}</span> {count === 1 ? 'suggestion' : 'suggestions'} to look at</>} style={{ color: PB.tx, fontSize: 13 }} />
            : <Dot color={PB.live} label="No suggestions waiting" style={{ color: PB.tx, fontSize: 13 }} />)}
          {err && <span style={{ ...pbMeta, color: PB.failed }}>Could not count the suggestions: {err}</span>}
        </div>
      </PbSection>
    </PbTile>
  );
}
