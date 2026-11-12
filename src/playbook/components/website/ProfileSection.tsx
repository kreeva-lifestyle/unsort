// Store profile: what makes this store's listings its own (owner, 2026-11-12:
// "different content … for each store"). The writer reads it before every
// listing: brand, market, spelling and units, who the store is for and what it
// leads with, the search phrase each listing is written for, the ordering
// details, and where the FAQ and the product details go on Shopify.
// Layout: (Brand and market 12) / (Who it is for 12) / (Search phrase 6)
// (On Shopify 6) / (Ordering details 12); pairs stack on phone.
import type { CSSProperties } from 'react';
import PbSwitch from '../ui/PbSwitch';
import { fillKeyword, type PbProfile } from '../../seoTypes';
import { PB, pbBody, pbTextarea } from '../../pbTheme';
import { PbTag } from '../ui';
import { Field, Grid2, Section, Seg, input44 } from './ui';
import { Cell, SectionGrid } from './sections/SectionGrid';
import type { Draft, SetDraft } from './WebsiteEditor';

const textarea: CSSProperties = { ...pbTextarea, minHeight: 72, maxHeight: 160, lineHeight: 1.5 };
const SAMPLE = { name: 'Zari Kurta Set', category: 'Kurta Set', fabric: 'Georgette', color: 'Maroon', attributes: { work: 'Zari', occasion: 'Festive' } };
const KEYWORD_PH = '{color} {fabric} {category} {work} {occasion} {name}';
const mono = (t: string) => <span style={{ fontFamily: PB.mono, color: PB.tx, overflowWrap: 'anywhere' }}>{t}</span>;

export default function ProfileSection({ draft, set, siteName }: { draft: Draft; set: SetDraft; siteName: string }) {
  const p = draft.content.profile;
  const put = (x: Partial<PbProfile>) => set({ content: { ...draft.content, profile: { ...p, ...x } } });
  const text = (k: 'brand_name' | 'market' | 'delivery' | 'stitching' | 'returns', id: string, max: number, placeholder: string) => (
    <input id={id} value={p[k]} onChange={e => put({ [k]: e.target.value } as Partial<PbProfile>)} maxLength={max} placeholder={placeholder}
      aria-describedby={`${id}-hint`} className="pb-input" style={input44} />
  );
  const onOff = (on: boolean, toggle: () => void, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--pb-ctl-h)' }}>
      <PbSwitch on={on} onToggle={toggle} label={label} />
      <PbTag>{on ? 'On' : 'Off'}</PbTag>
    </div>
  );
  const example = fillKeyword(p.keyword_pattern, SAMPLE);
  const brand = p.brand_name.trim() || siteName;

  return (
    <SectionGrid>
      <Cell>
        <Section title="Brand and market" hint="The writer is told which store it is writing for. Two stores with different profiles get different titles, descriptions and SEO text for the same product.">
          <Grid2>
            <Field label="Brand name" htmlFor="pbp-brand" hint={<>Every SEO title ends with it: {mono(`… | ${brand}`)}. Empty uses the website's name.</>}>
              {text('brand_name', 'pbp-brand', 80, siteName)}
            </Field>
            <Field label="Market" htmlFor="pbp-market" hint="Where the shoppers are. The writer uses the words they search with.">
              {text('market', 'pbp-market', 80, 'e.g. India, USA, UK')}
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Spelling">
              <Seg label="Spelling" value={p.spelling} onChange={v => put({ spelling: v })} options={[
                { id: 'british', label: 'British / Indian', hint: 'colour, jewellery' }, { id: 'american', label: 'American', hint: 'color, jewelry' },
              ]} />
            </Field>
            <Field label="Measurements">
              <Seg label="Measurements" value={p.units} onChange={v => put({ units: v })} options={[
                { id: 'inches', label: 'Inches' }, { id: 'cm', label: 'Centimetres' },
              ]} />
            </Field>
          </Grid2>
        </Section>
      </Cell>

      <Cell>
        <Section title="Who it is for" hint="Give each store a different angle, so the same product opens differently on each one.">
          <Field label="Audience" htmlFor="pbp-aud" hint="Who shops here, in a line.">
            <textarea id="pbp-aud" value={p.audience} onChange={e => put({ audience: e.target.value })} maxLength={400} rows={2}
              placeholder="e.g. Women 25 to 40 buying for weddings and festivals" aria-describedby="pbp-aud-hint" className="pb-input" style={textarea} />
          </Field>
          <Field label="Angle" htmlFor="pbp-angle" hint="What this store leads with. The description opens with it.">
            <textarea id="pbp-angle" value={p.angle} onChange={e => put({ angle: e.target.value })} maxLength={400} rows={2}
              placeholder="e.g. Heavy wedding work at a fair price" aria-describedby="pbp-angle-hint" className="pb-input" style={textarea} />
          </Field>
        </Section>
      </Cell>

      <Cell span={6}>
        <Section title="Search phrase" hint="The phrase each listing is written for. It goes once in the title, once near the top of the description and once in the SEO title.">
          <Field label="Pattern" htmlFor="pbp-kw" hint={<>Build it from: {mono(KEYWORD_PH)}. You can change the phrase for one listing in its editor.</>}>
            <input id="pbp-kw" value={p.keyword_pattern} onChange={e => put({ keyword_pattern: e.target.value })} maxLength={120} spellCheck={false}
              aria-describedby="pbp-kw-hint" className="pb-input" style={{ ...input44, fontFamily: PB.mono }} />
          </Field>
          <div style={{ ...pbBody, color: PB.tx2 }}>
            For a maroon georgette kurta set with zari work: {example ? mono(example) : 'nothing yet, add a placeholder such as {category}'}
          </div>
        </Section>
      </Cell>
      <Cell span={6}>
        <Section title="On Shopify" hint="Each listing comes with two questions and answers (FAQ) and five details: fabric, work, colour, occasion and what is in the set.">
          <Field label="Questions in the description" hint="Adds the two questions at the end of the description, so every theme shows them.">
            {onOff(p.faq_in_description, () => put({ faq_in_description: !p.faq_in_description }), 'Show the questions at the end of the description')}
          </Field>
          <Field label="Custom fields" hint="Sends the five details and the questions to Shopify as custom fields, for themes and filters that read them. Other apps' fields are never touched.">
            {onOff(p.custom_fields, () => put({ custom_fields: !p.custom_fields }), 'Send details and questions as custom fields')}
          </Field>
        </Section>
      </Cell>

      <Cell>
        <Section title="Ordering details" hint="The writer may use one of these as the store benefit in the SEO description, and never adds a number you did not type. They are not written into descriptions or questions, which are about the product only.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', columnGap: 16 }}>
            <Field label="Delivery time" htmlFor="pbp-del" hint="How long an order takes.">{text('delivery', 'pbp-del', 300, 'e.g. Ships in 5 to 7 days')}</Field>
            <Field label="Stitching" htmlFor="pbp-st" hint="What you offer, if anything.">{text('stitching', 'pbp-st', 300, 'e.g. Stitched to measure')}</Field>
            <Field label="Returns" htmlFor="pbp-ret" hint="Your return rule.">{text('returns', 'pbp-ret', 300, 'e.g. Returns within 7 days')}</Field>
          </div>
        </Section>
      </Cell>
    </SectionGrid>
  );
}
