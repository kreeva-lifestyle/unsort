// The cleaning rules (pb_settings 'tags'): hide patterns as chips (each one
// checked as it is typed, the same way the server checks it), exact hides,
// tags per product, shortest tag, Title Case and "hide codes" switches, then
// Save rules (admin / manager; the server validates again). Below: the live
// tester and Re-clean all products (TagRulesExtras.tsx).
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import { DEFAULT_TAG_SETTINGS, TAG_LIMITS, type PbTagSettings } from '../../tagTypes';
import { PB, pbErrorBox, pbMeta, pbNum } from '../../pbTheme';
import { useDirty } from '../../hooks/useDirty';
import { PbButton, PbSection, PbSwitch, PbTag, PbTile } from '../ui';
import { ChipsInput, Field, Grid2, NumInput } from '../website/ui';
import { patternProblem } from './tagCleanPreview';
import { RecleanBlock, TagTester } from './TagRulesExtras';
import { TagRowsSkeleton, TagsError } from './TagStates';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function TagRulesTile({ api, addToast, onChanged }: { api: TagsApi; addToast: AddToast; onChanged: () => void }) {
  const [saved, setSaved] = useState<PbTagSettings | null>(null);
  const [r, setR] = useState<PbTagSettings>(DEFAULT_TAG_SETTINGS);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const s = await api.settings(); setSaved(s); setR(s); setErr(''); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const put = (p: Partial<PbTagSettings>) => setR(x => ({ ...x, ...p }));
  const dirty = !!saved && !same(r, saved);
  useDirty(dirty && !saving, 'Discard changes to the tag rules?'); // Back to Settings, a nav tab or device Back ask first
  const bad = r.hide_patterns.map(p => ({ p, why: patternProblem(p) })).filter(x => x.why);
  const save = async () => {
    if (saving || !dirty) return;
    if (bad.length) { setSaveErr(bad[0].why!); return; }
    setSaving(true); setSaveErr('');
    try {
      const out = await api.saveSettings(r);
      setSaved(out); setR(out);
      addToast('Tag rules saved — new products use them from now; Re-clean applies them to existing ones', 'success');
      onChanged();
    } catch (e) { const m = friendlyError(e); setSaveErr(m); addToast(m, 'error'); } finally { setSaving(false); }
  };
  const switchRow = (label: string, hint: string, on: boolean, onToggle: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: PB.tx, lineHeight: 1.5 }}>{label}</span>
        <span style={{ ...pbMeta, display: 'block' }}>{hint}</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}><PbTag>{on ? 'On' : 'Off'}</PbTag><PbSwitch on={on} onToggle={onToggle} label={label} /></span>
    </div>
  );

  return (
    <PbTile as="section" variant={err && !saved ? 'failed' : 'default'} aria-labelledby="pbt-rules" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PbSection title="Rules" id="pbt-rules"
        hint="How a store's tags are cleaned when a product arrives. Patterns are matched ignoring case; a tag that matches any pattern is dropped before it reaches the library.">
        {!saved && !err && <TagRowsSkeleton count={2} label="Loading the tag rules" />}
        {err && !saved && <TagsError title="Could not load the rules" message={err} onRetry={() => void load()} busy={loading} />}
        {saved && (
          <>
            <Field label={`Hide patterns · ${r.hide_patterns.length}`} htmlFor="pbt-pat"
              hint={<>Patterns, one chip each — a tag matching any of them is hidden. <span style={pbNum}>^_</span> hides every tag starting with an underscore (_altnew_…), <span style={pbNum}>^label[_ ]</span> the store's label markers. At most {TAG_LIMITS.patterns}, each up to {TAG_LIMITS.patternLen} characters.</>}
              error={bad.length ? bad.map(b => b.why).join(' ') : undefined}>
              <ChipsInput id="pbt-pat" mono values={r.hide_patterns} onChange={v => put({ hide_patterns: v.slice(0, TAG_LIMITS.patterns) })} placeholder="e.g. ^_" maxLen={TAG_LIMITS.patternLen} />
            </Field>
            <Field label={`Always hide these tags · ${r.hide_exact.length}`} htmlFor="pbt-exact" hint="Exact tags, any letter case.">
              <ChipsInput id="pbt-exact" values={r.hide_exact} onChange={v => put({ hide_exact: v })} placeholder="e.g. Size Chart" maxLen={255} />
            </Field>
            <Grid2>
              <Field label="Tags per product, at most" htmlFor="pbt-max" hint={`1 to ${TAG_LIMITS.maxPerProduct}. Facts and the store's tags come first.`}>
                <NumInput id="pbt-max" value={r.max_per_product} min={1} max={TAG_LIMITS.maxPerProduct} onChange={v => put({ max_per_product: Math.round(v ?? 1) || 1 })} />
              </Field>
              <Field label="Shortest tag (characters)" htmlFor="pbt-min" hint={`1 to ${TAG_LIMITS.minLen}. Shorter tags are dropped.`}>
                <NumInput id="pbt-min" value={r.min_len} min={1} max={TAG_LIMITS.minLen} onChange={v => put({ min_len: Math.round(v ?? 1) || 1 })} />
              </Field>
            </Grid2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {switchRow('Title Case', 'ideal collection → Ideal Collection (mixed case such as iPhone is kept)', r.title_case, () => put({ title_case: !r.title_case }))}
              {switchRow('Hide tags that look like codes', 'kb261, nkb55, 2024, anything starting with _', r.auto_hide_codes, () => put({ auto_hide_codes: !r.auto_hide_codes }))}
            </div>
            {saveErr && <div role="alert" style={pbErrorBox}>{saveErr}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {dirty && <PbButton icon="refresh" onClick={() => { setR(saved); setSaveErr(''); }} dim={saving}>Discard changes</PbButton>}
              <PbButton onClick={() => void save()} disabled={!dirty || bad.length > 0} busy={saving} busyLabel="Saving…">Save rules</PbButton>
              {!dirty && <span style={pbMeta}>No changes to save</span>}
            </div>
          </>
        )}
      </PbSection>
      {saved && <TagTester rules={r} />}
      {saved && <RecleanBlock api={api} addToast={addToast} dirty={dirty} dim={saving} onDone={onChanged} />}
    </PbTile>
  );
}
