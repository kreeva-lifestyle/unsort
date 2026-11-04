// Product Directory settings: the AI that reads incoming products, the
// category list, the automation pause switch and "Run now".
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Toggle from '../../components/ui/Toggle';
import type { AddToast } from '../components/PbToasts';
import { PB_EFFORTS, PB_MODELS, type PbSettings as Settings } from '../types';
import { getSettings, runWorker, saveSetting, type WorkResult } from '../data/settings';
import { ChipsInput, Field, Section, Seg } from '../components/website/ui';

type Busy = '' | 'reader' | 'categories' | 'automation' | 'run';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function PbSettings({ addToast }: { addToast: AddToast }) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [reader, setReader] = useState<Settings['reader']>({ model: 'claude-haiku-5-5', effort: '' });
  const [cats, setCats] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>('');
  const [run, setRun] = useState<WorkResult | null>(null);

  useEffect(() => {
    getSettings().then(s => { setSaved(s); setReader(s.reader); setCats(s.categories); })
      .catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  const save = async <K extends keyof Settings>(key: K, value: Settings[K], ok: string) => {
    setBusy(key);
    try {
      await saveSetting(key, value);
      setSaved(s => (s ? { ...s, [key]: value } : s));
      addToast(ok, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const runNow = async () => {
    setBusy('run'); setRun(null);
    try {
      const r = await runWorker();
      setRun(r);
      addToast(`Done — read ${r.read}, routed ${r.routed}, written ${r.generated}, published ${r.published}${r.failed ? `, failed ${r.failed}` : ''}`, r.failed ? 'info' : 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const btn = (k: Busy, dirty = true) => ({ ...S.btnPrimary, minHeight: 44, pointerEvents: busy || !dirty ? 'none' as const : 'auto' as const, opacity: busy === k || !dirty ? 0.5 : 1 });
  if (!saved) return <div style={S.emptyState}>Loading settings…</div>;
  const paused = saved.automation.paused;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>Settings</div>
        <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>How the Product Directory reads products and when the automation runs</div>
      </div>

      <Section title="Automation" hint="The worker checks every minute: reads new products, sends them to matching websites, writes listings and publishes them."
        right={<Toggle on={!paused} label="Automation running" onToggle={() => void save('automation', { paused: !paused }, paused ? 'Automation running again' : 'Automation paused — nothing runs on its own')} />}>
        <div style={{ fontSize: 12, color: paused ? T.yl : T.gr, marginBottom: 12 }}>
          {busy === 'automation' ? 'Saving…' : paused ? 'Paused — buttons like “Publish now” still work.' : 'Running every minute when there is work.'}
        </div>
        <button type="button" onClick={() => void runNow()} style={{ ...S.btnGhost, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy === 'run' ? 0.5 : 1 }}>
          {busy === 'run' ? 'Running… (up to 2 min)' : 'Run now'}
        </button>
        {run && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginTop: 12 }}>
            {([['Read', run.read, T.bl], ['Routed', run.routed, T.ac2], ['Written', run.generated, T.ac2], ['Published', run.published, T.gr], ['Failed', run.failed, T.re]] as const).map(([l, n, c]) => (
              <div key={l} style={{ background: T.glass2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: n ? c : T.tx3 }}>{n}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="AI that reads products" hint="Reads each vendor post + photos to fill in name, category, fabric, colour, sizes, cost and details. Each website picks its own writer under Websites → Content & AI.">
        <Field label="Model">
          <Seg label="Reader model" value={reader.model} onChange={v => setReader(r => ({ ...r, model: v }))} options={PB_MODELS.map(m => ({ id: m.id, label: m.label, hint: m.note }))} />
        </Field>
        <Field label="Effort" hint="Higher = slower and costs more. 'Model default' is enough for reading.">
          <Seg label="Reader effort" value={reader.effort} onChange={v => setReader(r => ({ ...r, effort: v }))} options={PB_EFFORTS.map(e => ({ id: e.id, label: e.label }))} />
        </Field>
        <button type="button" onClick={() => void save('reader', reader, 'Reader settings saved')} style={btn('reader', !same(reader, saved.reader))}>
          {busy === 'reader' ? 'Saving…' : 'Save reader'}
        </button>
      </Section>

      <Section title="Categories" hint="The AI picks one of these for every product (no category = Needs info). Routing rules and tags use them; removing one does not change products already read.">
        <Field label="Category list" htmlFor="pbs-cats">
          <ChipsInput id="pbs-cats" values={cats} onChange={setCats} placeholder="e.g. Saree — or paste several, comma separated" maxLen={60} />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setCats(saved.categories)} disabled={same(cats, saved.categories)}
            style={{ ...S.btnGhost, minHeight: 44, opacity: same(cats, saved.categories) ? 0.4 : 1 }}>Undo changes</button>
          <button type="button" onClick={() => void save('categories', cats, 'Categories saved')} style={btn('categories', !same(cats, saved.categories))}>
            {busy === 'categories' ? 'Saving…' : 'Save categories'}
          </button>
        </div>
      </Section>
    </>
  );
}
