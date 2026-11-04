// Content & AI: which Claude model and effort write this store's listings,
// in which language and voice, the title pattern, length limits, extra
// instructions and image alt text.
import { T, S } from '../../../lib/theme';
import Toggle from '../../../components/ui/Toggle';
import { PB_EFFORTS, PB_MODELS, type PbContent } from '../../types';
import { Field, Grid2, NumInput, Section, Seg, input44 } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

const textarea = { ...S.fInput, height: 'auto', minHeight: 88, resize: 'vertical' as const, lineHeight: 1.5, fontFamily: T.sans };
const TITLE_PH = '{ai_title} {category} {fabric} {color} {vendor} {sku} {name}';

export default function ContentSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const c = draft.content;
  const put = (x: Partial<PbContent>) => set({ content: { ...c, ...x } });
  const lim = (k: 'title_max' | 'description_words' | 'meta_title_max' | 'meta_desc_max', max: number) =>
    (v: number | null) => { if (v != null) put({ [k]: Math.min(max, Math.max(1, Math.round(v))) } as Partial<PbContent>); };

  return (
    <>
      <Section title="AI model" hint="One AI call writes each listing (title, description, SEO, tags, alt text). Pick per store — a premium store may deserve a better writer.">
        <Field label="Model">
          <Seg label="AI model" value={c.model} onChange={v => put({ model: v })} options={PB_MODELS.map(m => ({ id: m.id, label: m.label, hint: m.note }))} />
        </Field>
        <Field label="Effort" hint="How hard the model thinks before writing. Higher = slower and costs more; 'Model default' suits most listings. Ignored by models that do not support it.">
          <Seg label="AI effort" value={c.effort} onChange={v => put({ effort: v })} options={PB_EFFORTS.map(e => ({ id: e.id, label: e.label }))} />
        </Field>
      </Section>

      <Section title="Voice">
        <Grid2>
          <Field label="Language" htmlFor="pbx-lang" hint="e.g. English, Hinglish, Hindi">
            <input id="pbx-lang" value={c.language} onChange={e => put({ language: e.target.value })} maxLength={40} style={input44} />
          </Field>
          <Field label="Image alt text" hint="Describe each photo for Google and screen readers.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <Toggle on={c.alt_text} onToggle={() => put({ alt_text: !c.alt_text })} label="Write image alt text" />
              <span style={{ fontSize: 12, color: T.tx2 }}>{c.alt_text ? 'On' : 'Off'}</span>
            </div>
          </Field>
        </Grid2>
        <Field label="Brand voice" htmlFor="pbx-voice" hint='How this store talks, e.g. "premium, elegant, festive — for brides and wedding guests".'>
          <textarea id="pbx-voice" value={c.brand_voice} onChange={e => put({ brand_voice: e.target.value })} maxLength={600} rows={3} style={textarea} />
        </Field>
      </Section>

      <Section title="Title">
        <Field label="Title pattern" htmlFor="pbx-title"
          hint={<>Use <span style={{ fontFamily: T.mono }}>{'{ai_title}'}</span> to let the AI write it, or build one from: <span style={{ fontFamily: T.mono }}>{TITLE_PH}</span> — e.g. <span style={{ fontFamily: T.mono }}>{'{color} {fabric} {category}'}</span>. Cut to the title limit.</>}>
          <input id="pbx-title" value={c.title_template} onChange={e => put({ title_template: e.target.value })} maxLength={200}
            spellCheck={false} style={{ ...input44, fontFamily: T.mono }} />
        </Field>
      </Section>

      <Section title="Length limits">
        <Grid2>
          <Field label="Title (characters)" htmlFor="pbx-tmax"><NumInput id="pbx-tmax" value={c.title_max} max={255} onChange={lim('title_max', 255)} /></Field>
          <Field label="Description (words)" htmlFor="pbx-dw"><NumInput id="pbx-dw" value={c.description_words} max={1000} onChange={lim('description_words', 1000)} /></Field>
          <Field label="SEO title (characters)" htmlFor="pbx-mt" hint="Google shows about 60"><NumInput id="pbx-mt" value={c.meta_title_max} max={120} onChange={lim('meta_title_max', 120)} /></Field>
          <Field label="SEO description (characters)" htmlFor="pbx-md" hint="Google shows about 155"><NumInput id="pbx-md" value={c.meta_desc_max} max={320} onChange={lim('meta_desc_max', 320)} /></Field>
        </Grid2>
      </Section>

      <Section title="Extra instructions" hint="Anything else the writer should always do or avoid on this store. The AI never invents a fabric or size that is not given.">
        <textarea value={c.extra_instructions} onChange={e => put({ extra_instructions: e.target.value })} maxLength={2000} rows={4}
          aria-label="Extra instructions" placeholder='e.g. "Mention free shipping above ₹1,999. Never use the word cheap."' style={textarea} />
      </Section>
    </>
  );
}
