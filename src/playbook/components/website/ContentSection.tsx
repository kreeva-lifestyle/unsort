// Content & AI: which Claude model and effort write this store's listings,
// in which language and voice, the title pattern, length limits, extra
// instructions and image alt text.
// Layout: one column of 12-wide tiles — AI model / Voice / Title / Length
// limits (four fields in a row when wide) / Extra instructions.
import type { CSSProperties } from 'react';
import PbSwitch from '../ui/PbSwitch';
import { PB_EFFORTS, PB_MODELS, type PbContent } from '../../types';
import { PB, pbTextarea } from '../../pbTheme';
import { PbTag } from '../ui';
import { Field, Grid2, NumInput, Section, Seg, input44 } from './ui';
import { Cell, Quad, SectionGrid } from './sections/SectionGrid';
import type { Draft, SetDraft } from './WebsiteEditor';

const textarea: CSSProperties = { ...pbTextarea, minHeight: 96, maxHeight: 200, lineHeight: 1.5 };
const TITLE_PH = '{ai_title} {category} {fabric} {color} {vendor} {sku} {name}';
const mono = (t: string) => <span style={{ fontFamily: PB.mono, color: PB.tx }}>{t}</span>;

export default function ContentSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const c = draft.content;
  const put = (x: Partial<PbContent>) => set({ content: { ...c, ...x } });
  const lim = (k: 'title_max' | 'description_words' | 'meta_title_max' | 'meta_desc_max', max: number) =>
    (v: number | null) => { if (v != null) put({ [k]: Math.min(max, Math.max(1, Math.round(v))) } as Partial<PbContent>); };

  return (
    <SectionGrid>
      <Cell>
        <Section title="AI model" hint="The AI writes each listing for this store alone (title, description, SEO, FAQ, tags, alt text), checks it, and rewrites it once if a check fails. Pick per store: a premium store may deserve a better writer.">
          <Field label="Model">
            <Seg label="AI model" value={c.model} onChange={v => put({ model: v })} options={PB_MODELS.map(m => ({ id: m.id, label: m.label, hint: m.note }))} />
          </Field>
          <Field label="Effort" htmlFor="pbx-effort" hint="How hard the model thinks before writing. Higher = slower and costs more; 'Model default' suits most listings. Ignored by models that do not support it.">
            <select id="pbx-effort" value={c.effort} onChange={e => put({ effort: e.target.value as PbContent['effort'] })} aria-describedby="pbx-effort-hint"
              className="pb-input" style={{ ...input44, maxWidth: 320, cursor: 'pointer' }}>
              {PB_EFFORTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Field>
        </Section>
      </Cell>

      <Cell>
        <Section title="Voice">
          <Grid2>
            <Field label="Language" htmlFor="pbx-lang" hint="e.g. English, Hinglish, Hindi">
              <input id="pbx-lang" value={c.language} onChange={e => put({ language: e.target.value })} maxLength={40} aria-describedby="pbx-lang-hint" className="pb-input" style={input44} />
            </Field>
            <Field label="Image alt text" hint="Describe each photo for Google and screen readers.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--pb-ctl-h)' }}>
                <PbSwitch on={c.alt_text} onToggle={() => put({ alt_text: !c.alt_text })} label="Write image alt text" />
                <PbTag>{c.alt_text ? 'On' : 'Off'}</PbTag>
              </div>
            </Field>
          </Grid2>
          <Field label="Brand voice" htmlFor="pbx-voice" hint='How this store talks, e.g. "premium, elegant, festive — for brides and wedding guests".'>
            <textarea id="pbx-voice" value={c.brand_voice} onChange={e => put({ brand_voice: e.target.value })} maxLength={600} rows={3}
              aria-describedby="pbx-voice-hint" className="pb-input" style={textarea} />
          </Field>
        </Section>
      </Cell>

      <Cell>
        <Section title="Title">
          <Field label="Title pattern" htmlFor="pbx-title"
            hint={<>Use {mono('{ai_title}')} to let the AI write it, or build one from: {mono(TITLE_PH)} — e.g. {mono('{color} {fabric} {category}')}. Cut to the title limit.</>}>
            <input id="pbx-title" value={c.title_template} onChange={e => put({ title_template: e.target.value })} maxLength={200}
              spellCheck={false} aria-describedby="pbx-title-hint" className="pb-input" style={{ ...input44, fontFamily: PB.mono }} />
          </Field>
          <Field label="Title style for the AI" htmlFor="pbx-formula" hint={<>How the AI should build its part of the title ({mono('{ai_title}')}), in your words. The search phrase from the store profile is always in it.</>}>
            <input id="pbx-formula" value={c.title_formula} onChange={e => put({ title_formula: e.target.value })} maxLength={300}
              placeholder="e.g. Colour, fabric, type, then the work" aria-describedby="pbx-formula-hint" className="pb-input" style={input44} />
          </Field>
        </Section>
      </Cell>
      <Cell>
        <Section title="Length limits">
          <Quad>
            <Field label="Title (characters)" htmlFor="pbx-tmax"><NumInput id="pbx-tmax" value={c.title_max} max={255} onChange={lim('title_max', 255)} /></Field>
            <Field label="Description (words)" htmlFor="pbx-dw"><NumInput id="pbx-dw" value={c.description_words} max={1000} onChange={lim('description_words', 1000)} /></Field>
            <Field label="SEO title (characters)" htmlFor="pbx-mt" hint="Google shows about 60"><NumInput id="pbx-mt" value={c.meta_title_max} max={120} onChange={lim('meta_title_max', 120)} /></Field>
            <Field label="SEO description (characters)" htmlFor="pbx-md" hint="Google shows about 155"><NumInput id="pbx-md" value={c.meta_desc_max} max={320} onChange={lim('meta_desc_max', 320)} /></Field>
          </Quad>
        </Section>
      </Cell>

      <Cell>
        <Section title="Extra instructions" hint="Anything else the writer should always do or avoid on this store. The AI never invents a fabric or size that is not given.">
          <textarea value={c.extra_instructions} onChange={e => put({ extra_instructions: e.target.value })} maxLength={2000} rows={4}
            aria-label="Extra instructions" placeholder='e.g. "Mention free shipping above ₹1,999. Never use the word cheap."' className="pb-input" style={textarea} />
        </Section>
      </Cell>
    </SectionGrid>
  );
}
