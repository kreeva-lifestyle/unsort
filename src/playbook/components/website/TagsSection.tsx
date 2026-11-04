// Tags: this store's tag structure — templates with placeholders, fixed tags,
// letter case and AI extras — with an example built from a sample product.
import { T } from '../../../lib/theme';
import Toggle from '../../../components/ui/Toggle';
import type { PbTagRules } from '../../types';
import { buildTags, type TagFacts } from './tagPreview';
import { ChipsInput, Field, NumInput, Section, Seg } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

const PLACEHOLDERS: [string, string][] = [
  ['{category}', 'Saree, Kurta Set…'], ['{fabric}', 'Silk, Cotton…'], ['{color}', 'Red, Navy…'], ['{vendor}', 'vendor name'],
  ['{vendor_code}', 'vendor short code'], ['{size}', 'one tag per size'], ['{sku}', 'product code'], ['{attr:occasion}', 'any AI-read detail: work, occasion, pattern…'],
];
const SAMPLE: TagFacts = {
  category: 'Saree', fabric: 'Banarasi Silk', color: 'Maroon', vendor: 'Rangoli', vendor_code: 'RG', sku: 'RG-101',
  sizes: ['Free Size'], attributes: { occasion: 'Festive', work: 'Zari', wash_care: 'Dry clean only' },
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
  return (
    <>
      <Section title="Tag templates" hint="Each line becomes one tag. A template whose placeholder is empty for a product is skipped.">
        <Field label="Templates" htmlFor="pbt-tpl">
          <ChipsInput id="pbt-tpl" mono values={r.templates} onChange={v => put({ templates: v })} placeholder="e.g. Fabric_{fabric}" maxLen={255} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: '4px 14px', fontSize: 11, color: T.tx3 }}>
          {PLACEHOLDERS.map(([k, v]) => (
            <div key={k}><span style={{ fontFamily: T.mono, color: T.tx2 }}>{k}</span> — {v}</div>
          ))}
        </div>
      </Section>

      <Section title="Fixed tags" hint="Added to every product sent to this store.">
        <ChipsInput values={r.static} onChange={v => put({ static: v })} placeholder="e.g. New Arrival" maxLen={255} />
      </Section>

      <Section title="Letter case">
        <Seg label="Tag letter case" value={r.case} onChange={v => put({ case: v })} options={[
          { id: 'as_is', label: 'As written', hint: 'Banarasi Silk' }, { id: 'lower', label: 'lowercase', hint: 'banarasi silk' }, { id: 'title', label: 'Title Case', hint: 'Banarasi Silk' },
        ]} />
      </Section>

      <Section title="AI extra tags" hint="Let the AI add style / occasion tags it sees in the photos and details."
        right={<Toggle on={r.ai_extra} onToggle={() => put({ ai_extra: !r.ai_extra })} label="AI extra tags" />}>
        {r.ai_extra && (
          <div style={{ maxWidth: 200 }}>
            <Field label="At most" htmlFor="pbt-max">
              <NumInput id="pbt-max" value={r.ai_extra_max} max={20} onChange={v => put({ ai_extra_max: Math.round(v ?? 0) })} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Example" hint="A maroon Banarasi silk saree from vendor Rangoli (RG), free size, would get:">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {example(r).map(t => (
            <span key={t} style={{ fontSize: 12, padding: '4px 10px', borderRadius: T.rSm, background: t === AI_MARK ? T.ac3 : T.glass2, border: `1px solid ${T.bd2}`, color: t === AI_MARK ? T.ac2 : T.tx2 }}>{t}</span>
          ))}
        </div>
      </Section>
    </>
  );
}
