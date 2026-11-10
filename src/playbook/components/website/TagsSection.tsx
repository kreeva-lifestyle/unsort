// Tags: this store's tag structure — templates with placeholders ({tags} =
// the product's own cleaned tags, Settings → Tags), fixed tags, letter case,
// AI extras and the per-product cap — with an example built from a sample
// product. Layout: (Templates 12) / (Fixed tags 6)(Letter case 6) /
// (AI extra 6)(Example 6) / (Cap 12); the pairs stack at 6 columns and on phone.
import PbSwitch from '../ui/PbSwitch';
import type { PbTagRules } from '../../types';
import { DEFAULT_MAX_TAGS, buildTags, type TagFacts } from './tagPreview';
import { PB, pbMeta } from '../../pbTheme';
import { PbTag } from '../ui';
import { ChipsInput, Field, NumInput, Section, Seg } from './ui';
import { Cell, SectionGrid } from './sections/SectionGrid';
import type { Draft, SetDraft } from './WebsiteEditor';

const PLACEHOLDERS: [string, string][] = [
  ['{tags}', 'the product’s cleaned tags (Settings → Tags), one tag each'], ['{category}', 'Saree, Kurta Set…'], ['{fabric}', 'Silk, Cotton…'], ['{color}', 'Red, Navy…'], ['{vendor}', 'vendor name'],
  ['{vendor_code}', 'vendor short code'], ['{size}', 'one tag per size'], ['{sku}', 'product code'], ['{attr:occasion}', 'any AI-read detail: work, occasion, pattern…'],
  ['{attr:brand}', 'brand, product type… copied by Import from website'], ['{attr:store_tags}', 'one tag per tag on the other store'],
];
const SAMPLE: TagFacts = {
  category: 'Saree', fabric: 'Banarasi Silk', color: 'Maroon', vendor: 'Rangoli', vendor_code: 'RG', sku: 'RG-101',
  sizes: ['Free Size'], attributes: { occasion: 'Festive', work: 'Zari', wash_care: 'Dry clean only' },
  tags: ['Saree', 'Banarasi Silk', 'Maroon', 'Festive', 'Zari', 'Wedding Guest'],
};
const AI_MARK = '+ AI tags';

/** Example tags for the sample product — built by the server's own rules (tagPreview.ts). */
function example(r: PbTagRules): string[] {
  const tags = buildTags({ ...r, ai_extra: false }, SAMPLE, []);
  return r.ai_extra && r.ai_extra_max > 0 ? [...tags, AI_MARK] : tags;
}

export default function TagsSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const r = draft.tag_rules;
  const put = (x: Partial<PbTagRules>) => set({ tag_rules: { ...r, ...x } });
  const tags = example(r);
  return (
    <SectionGrid>
      <Cell>
        <Section title="Tag templates" hint="Each line becomes one tag. A template whose placeholder is empty for a product is skipped. {tags} sends the product’s own cleaned tags — the usual choice; {attr:store_tags} sends the other store’s tags raw.">
          <Field label="Templates" htmlFor="pbt-tpl">
            <ChipsInput id="pbt-tpl" mono values={r.templates} onChange={v => put({ templates: v })} placeholder="e.g. Fabric_{fabric}" maxLen={255} />
          </Field>
          <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16 }}>
            <div style={{ ...pbMeta, fontWeight: 600, color: PB.tx, marginBottom: 8 }}>Placeholders you can use</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))', gap: '8px 16px', margin: 0 }}>
              {PLACEHOLDERS.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <dt style={{ fontFamily: PB.mono, fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>{k}</dt>
                  <dd style={{ ...pbMeta, margin: 0 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </Cell>

      <Cell span={6}>
        <Section title="Fixed tags" hint="Added to every product sent to this store.">
          <ChipsInput label="Fixed tags" values={r.static} onChange={v => put({ static: v })} placeholder="e.g. New Arrival" maxLen={255} />
        </Section>
      </Cell>
      <Cell span={6}>
        <Section title="Letter case">
          <Seg label="Tag letter case" value={r.case} onChange={v => put({ case: v })} options={[
            { id: 'as_is', label: 'As written', hint: 'Banarasi Silk' }, { id: 'lower', label: 'lowercase', hint: 'banarasi silk' }, { id: 'title', label: 'Title Case', hint: 'Banarasi Silk' },
          ]} />
        </Section>
      </Cell>

      <Cell span={6}>
        <Section title="AI extra tags" hint="Let the AI add style / occasion tags it sees in the photos and details."
          right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <PbTag>{r.ai_extra ? 'On' : 'Off'}</PbTag>
            <PbSwitch on={r.ai_extra} onToggle={() => put({ ai_extra: !r.ai_extra })} label="AI extra tags" />
          </span>}>
          {r.ai_extra && (
            <div style={{ maxWidth: 200 }}>
              <Field label="At most" htmlFor="pbt-max">
                <NumInput id="pbt-max" value={r.ai_extra_max} max={20} onChange={v => put({ ai_extra_max: Math.round(v ?? 0) })} />
              </Field>
            </div>
          )}
        </Section>
      </Cell>
      <Cell span={6}>
        <Section title="Example" hint="A maroon Banarasi silk saree from vendor Rangoli (RG), free size, with the product tags Festive, Zari and Wedding Guest, would get:">
          {tags.length ? (
            <ul aria-label="Example tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
              {tags.map(t => (
                <li key={t} style={{ minWidth: 0, maxWidth: '100%', display: 'flex' }}>
                  <PbTag style={t === AI_MARK ? { borderStyle: 'dashed', color: PB.tx } : { color: PB.tx }}>{t}</PbTag>
                </li>
              ))}
            </ul>
          ) : <div style={pbMeta}>No tags yet — add a template or a fixed tag.</div>}
        </Section>
      </Cell>
      <Cell>
        <Section title="How many tags" hint="Applied last, after the templates, fixed tags and AI extras. Shopify allows 250; a long list is harder to browse.">
          <div style={{ maxWidth: 200 }}>
            <Field label="At most, per product" htmlFor="pbt-cap" hint={`Default ${DEFAULT_MAX_TAGS}.`}>
              <NumInput id="pbt-cap" value={r.max_tags ?? DEFAULT_MAX_TAGS} min={1} max={250} onChange={v => put({ max_tags: Math.max(1, Math.round(v ?? DEFAULT_MAX_TAGS)) })} />
            </Field>
          </div>
        </Section>
      </Cell>
    </SectionGrid>
  );
}
