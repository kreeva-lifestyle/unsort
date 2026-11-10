// Settings → Tags: the review queue of new tags, the whole library, and the
// cleaning rules. Opened from the Tags tile on Settings (desktop and phone;
// on phone it is full screen with Back to Settings, and device Back returns
// there). V2 bento: review 12 / library 8 + rules 4 (6 + 6 at ≤1099px);
// phone stacks in that order. An action in one tile reloads the others
// through `version`. `api` is swapped for fakes by the screenshot harness.
import { useEffect, useState } from 'react';
import type { AddToast } from '../components/PbToasts';
import { TAGS_API, type TagsApi } from '../data/tags';
import TagLibraryTile from '../components/tags/TagLibraryTile';
import TagReviewTile from '../components/tags/TagReviewTile';
import TagRulesTile from '../components/tags/TagRulesTile';
import { PbPageHeader, bentoClass, focusPageTitle } from '../components/ui';

export default function Tags({ addToast, onBack, api = TAGS_API }: { addToast: AddToast; onBack: () => void; api?: TagsApi }) {
  const [version, setVersion] = useState(0);
  const changed = () => setVersion(v => v + 1);
  // Opened from Settings: focus moves to the title (not <body>), and the page starts at the top.
  useEffect(() => { focusPageTitle(); document.querySelector('.pb-scroll')?.scrollTo({ top: 0 }); }, []);
  return (
    <>
      <PbPageHeader title="Tags" back={{ label: 'Settings', onBack }} phoneSub
        sub="Every product carries its own clean tags; websites send them with {tags}. Review new ones, hide junk, merge spellings." />
      <div className="pb-bento pb-bento--auto">
        <div className={bentoClass(12)} style={{ display: 'grid', minWidth: 0 }}>
          <TagReviewTile api={api} addToast={addToast} version={version} onChanged={changed} />
        </div>
        <div className={bentoClass(8)} style={{ display: 'grid', minWidth: 0 }}>
          <TagLibraryTile api={api} addToast={addToast} version={version} onChanged={changed} />
        </div>
        <div className={bentoClass(4)} style={{ display: 'grid', minWidth: 0, alignSelf: 'start' }}>
          <TagRulesTile api={api} addToast={addToast} onChanged={changed} />
        </div>
      </div>
    </>
  );
}
