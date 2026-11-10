// Tags (owner, 2026-11-10): the owner's controlled taxonomy — Category →
// Attributes → Attribute values — that Playbook chooses from automatically
// (rules first, then the AI). Opened from the Settings tile (phone: More →
// Settings → Tags; Back returns to Settings). V2 bento: Suggestions 12, then
// Attributes 8 + a 4-wide column with Categories and "Tag existing products"
// (stacked on phone in that order). The one gradient is "New attribute" in
// the header. Structure edits are for admins / managers (`canEdit`); others
// can look. `api` is swapped for fakes by the screenshot harness.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import type { AddToast } from '../components/PbToasts';
import { TAGS_API, type TagsApi } from '../data/tags';
import type { PbAttribute, PbTaxonomy } from '../tagTypes';
import AttributeSheet from '../components/tags/AttributeSheet';
import AttributesTile from '../components/tags/AttributesTile';
import CategoriesTile from '../components/tags/CategoriesTile';
import RetagTile from '../components/tags/RetagTile';
import SuggestionsTile from '../components/tags/SuggestionsTile';
import { TagRowsSkeleton, TagsError } from '../components/tags/TagStates';
import { PbButton, PbPageHeader, PbTile, bentoClass, focusPageTitle } from '../components/ui';

export default function Tags({ addToast, onBack, api = TAGS_API, canEdit = false }: { addToast: AddToast; onBack: () => void; api?: TagsApi; canEdit?: boolean }) {
  const [tax, setTax] = useState<PbTaxonomy | null>(null);
  const [err, setErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<{ attr: PbAttribute | null } | null>(null);
  const load = useCallback(() => api.taxonomy().then(t => { setTax(t); setErr(''); }).catch(e => setErr(friendlyError(e))), [api]);
  useEffect(() => { void load(); }, [load, version]);
  const changed = useCallback(() => setVersion(v => v + 1), []);
  // Opened from Settings: focus moves to the title (not <body>), and the page starts at the top.
  useEffect(() => { focusPageTitle(); document.querySelector('.pb-scroll')?.scrollTo({ top: 0 }); }, []);

  const add = canEdit ? <PbButton kind="primary" icon="plus" onClick={() => setSheet({ attr: null })}>New attribute</PbButton> : null;
  const header = (
    <PbPageHeader title="Tags" back={{ label: 'Settings', onBack }} phoneSub actions={add}
      phoneAction={canEdit ? <PbButton kind="primary" iconOnly icon="plus" aria-label="New attribute" onClick={() => setSheet({ attr: null })} /> : null}
      sub="Your own lists of tags: categories use attributes (Colour, Work…), attributes hold values (Black, Embroidery…). Playbook picks from them — first from the product's text, then with the AI." />
  );
  if (!tax) {
    return (
      <>
        {header}
        <PbTile variant={err ? 'failed' : 'default'}>
          {err ? <TagsError title="Could not load your tags" message={err} busy={retrying} onRetry={() => { setRetrying(true); void load().finally(() => setRetrying(false)); }} />
            : <TagRowsSkeleton label="Loading your tags" />}
        </PbTile>
      </>
    );
  }
  const sug = (
    <div className={bentoClass(12)} style={{ display: 'grid', minWidth: 0 }}>
      <SuggestionsTile attrs={tax.attributes} api={api} addToast={addToast} version={version} onChanged={changed} canEdit={canEdit} />
    </div>
  );
  return (
    <>
      {header}
      <div className="pb-bento pb-bento--auto">
        {/* First run (no attributes yet): building the lists comes first, the (empty) suggestions last. */}
        {tax.attributes.length > 0 && sug}
        <div className={bentoClass(8)} style={{ display: 'grid', minWidth: 0, alignSelf: 'start' }}>
          <AttributesTile attrs={tax.attributes} api={api} addToast={addToast} onChanged={changed} canEdit={canEdit}
            onNew={() => setSheet({ attr: null })} onEdit={a => setSheet({ attr: a })} />
        </div>
        <div className={bentoClass(4)} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, alignSelf: 'start' }}>
          <CategoriesTile tax={tax} api={api} addToast={addToast} onChanged={changed} canEdit={canEdit} />
          <RetagTile fill={tax.fill} api={api} addToast={addToast} onChanged={changed} canEdit={canEdit} />
        </div>
        {!tax.attributes.length && sug}
      </div>
      <AttributeSheet open={!!sheet} attr={sheet?.attr ?? null} api={api} addToast={addToast} onClose={() => setSheet(null)} onSaved={changed} />
    </>
  );
}
