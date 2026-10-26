// Settings → Size Summariser (admins): everything the summariser treats as
// data — the model and effort, the extraction prompt (every edit bumps its
// version so old runs can be compared), the order-number pattern, the sane
// measurement range, the required measurements per garment, the sheet's
// title and footer, and the cost-cutting switch. Saved in
// app_settings.size_summariser; the edge function reads it on every run.
import { useState, useEffect } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { loadSettings, saveSettings } from '../minis/sizesummariser/api';
import type { SummariserSettings } from '../minis/sizesummariser/types';

const MODELS = [
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', desc: 'Cheapest; judge it against Sonnet with "Re-run on…" before making it the default.' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', desc: 'Default. Reads ticked circles reliably on 25 page pictures.' },
  { id: 'claude-opus-5-5', name: 'Opus 5.5', desc: 'Most careful, most expensive.' },
];
const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
const GARMENTS = ['saree_blouse', 'lehenga', 'suit', 'gown', 'other'];

export default function SizeSummariserSettings({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [s, setS] = useState<SummariserSettings | null>(null);
  const [orig, setOrig] = useState<SummariserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadSettings().then(v => { setS(v); setOrig(v); }).catch(e => addToast(friendlyError(e), 'error')); }, [addToast]);
  if (!s) return <div style={{ padding: 20, color: T.tx3, fontSize: 12 }}>Loading…</div>;
  const set = <K extends keyof SummariserSettings>(k: K, v: SummariserSettings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    if (saving) return;
    try { new RegExp(s.order_no_regex); } catch { addToast('The order-number pattern is not a valid regular expression', 'error'); return; }
    if (!s.prompt.trim()) { addToast('The prompt cannot be empty', 'error'); return; }
    setSaving(true);
    const next = { ...s, prompt_version: orig && s.prompt !== orig.prompt ? (orig.prompt_version || 1) + 1 : s.prompt_version };
    try { await saveSettings(next); setS(next); setOrig(next); addToast(`Saved${next.prompt_version !== s.prompt_version ? ` — prompt is now v${next.prompt_version}` : ''} · applies from the next run`, 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };
  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 };
  const head = (t: string) => <div style={{ fontSize: 11, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{t}</div>;
  return (
    <div>
      <div style={card}>{head('Model')}
        {MODELS.map(m => { const on = m.id === s.model; return (
          <div key={m.id} onClick={() => set('model', m.id)} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6, border: `1px solid ${on ? T.ac33 : T.bd}`, background: on ? T.ac3 : 'transparent' }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, marginTop: 2, border: `2px solid ${on ? T.ac : T.tx3}`, background: on ? T.ac : 'transparent', flexShrink: 0 }} />
            <div><div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{m.name}</div><div style={{ fontSize: 11, color: T.tx3 }}>{m.desc}</div></div>
          </div>); })}
        <label style={S.fLabel}>Effort</label>
        <select value={s.effort} onChange={e => set('effort', e.target.value)} style={{ ...S.fInput, width: 200 }}>{EFFORTS.map(e => <option key={e} value={e}>{e || 'model default'}</option>)}</select>
      </div>
      <div style={card}>{head(`Extraction prompt · v${s.prompt_version}`)}
        <textarea value={s.prompt} onChange={e => set('prompt', e.target.value)} rows={14} style={{ ...S.fInput, width: '100%', height: 'auto', fontFamily: T.mono, fontSize: 12, lineHeight: 1.5, resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Saving a changed prompt makes it v{s.prompt_version + 1}; every run records the version it used.</div>
      </div>
      <div style={card}>{head('Checks')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div><label style={S.fLabel}>Order number pattern</label><input value={s.order_no_regex} onChange={e => set('order_no_regex', e.target.value)} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} /></div>
          <div><label style={S.fLabel}>Smallest sane measurement</label><input type="number" value={s.measurement_min} onKeyDown={e => numericKeyDown(e)} onChange={e => set('measurement_min', Number(e.target.value))} style={{ ...S.fInput, width: '100%' }} /></div>
          <div><label style={S.fLabel}>Largest sane measurement</label><input type="number" value={s.measurement_max} onKeyDown={e => numericKeyDown(e)} onChange={e => set('measurement_max', Number(e.target.value))} style={{ ...S.fInput, width: '100%' }} /></div>
        </div>
        <div style={{ marginTop: 10 }}>{GARMENTS.map(g => (
          <div key={g} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ width: 110, fontSize: 11, color: T.tx2 }}>{g.replace('_', ' ')}</span>
            <input value={(s.required_fields[g] || []).join(', ')} onChange={e => set('required_fields', { ...s.required_fields, [g]: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="required measurement keys, comma separated" style={{ ...S.fInput, flex: 1, fontFamily: T.mono, fontSize: 12 }} />
          </div>))}
          <div style={{ fontSize: 11, color: T.tx3 }}>A missing required measurement is a red ⛔ warning on the sheet.</div>
        </div>
      </div>
      <div style={card}>{head('Sheet')}
        <label style={S.fLabel}>Title</label><input value={s.sheet_title} onChange={e => set('sheet_title', e.target.value)} style={{ ...S.fInput, width: '100%', marginBottom: 8 }} />
        <label style={S.fLabel}>Footer (brand, support contact — never taken from the form)</label><input value={s.footer_text} onChange={e => set('footer_text', e.target.value)} style={{ ...S.fInput, width: '100%', marginBottom: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.tx2, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.raster_only_option_pages} onChange={e => set('raster_only_option_pages', e.target.checked)} />
          Send page pictures only for pages with options (cheaper; numbers come from text alone)
        </label>
      </div>
      <button type="button" onClick={save} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}
