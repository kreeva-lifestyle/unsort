// Product Directory settings: the AI that reads incoming products, Telegram intake (bot, admin group, crawler), the history of
// imports from websites, the Tags tile (opens the Tags page in place: full
// screen on phone with Back to Settings; device Back returns here), the
// automation pause switch and "Run now".
// V2 layout (layout-and-components.md §4): form tiles 8 wide + the
// automation status tile 4 wide on desktop; on phone the status tile follows
// the form. "Run now" is the page's one gradient; the saves are secondary.
import { useCallback, useEffect, useState } from 'react';
import { useBackClose } from '../../hooks/useBackClose';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../components/ui/ConfirmModal';
import { friendlyError } from '../../lib/friendlyError';
import { dirtyTitle } from '../hooks/useDirty';
import { discardAsk } from '../components/ui/discard';
import type { AddToast } from '../components/PbToasts';
import { PB_EFFORTS, PB_MODELS, type PbSettings as Settings } from '../types';
import { DEFAULT_SETTINGS, getSettings, runWorker, saveSetting, type WorkResult } from '../data/settings';
import { Field, Grid2 } from '../components/website/ui';
import { pbInput, pbMeta } from '../pbTheme';
import { PbButton, PbConfirm, PbPageHeader, PbSection, PbTile } from '../components/ui';
import AutomationTile from '../components/settings/AutomationTile';
import TelegramTile from '../components/settings/telegram/TelegramTile';
import ImportHistoryTile from '../components/settings/ImportHistoryTile';
import TagsTile from '../components/settings/TagsTile';
import Tags from './Tags';
import { SettingsColumns, SettingsError, SettingsSkeleton } from '../components/settings/SettingsStates';

type Busy = '' | keyof Settings | 'run';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function PbSettings({ addToast, onBack, onGuide }: { addToast: AddToast; onBack?: () => void; onGuide?: (section: string) => void }) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [reader, setReader] = useState<Settings['reader']>(DEFAULT_SETTINGS.reader);
  const [busy, setBusy] = useState<Busy>('');
  const [pausing, setPausing] = useState(false);
  const [run, setRun] = useState<WorkResult | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const { ask, modalProps } = useConfirm();
  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  // Back to Settings (the button or device Back) asks "Discard changes?" while a Tags sheet has typing.
  const closeTags = () => {
    const what = dirtyTitle();
    if (what) { void ask(discardAsk(what)).then(ok => { if (ok) setTagsOpen(false); }); return false; }
    setTagsOpen(false);
  };
  useBackClose(tagsOpen, closeTags);

  const load = useCallback(() => getSettings()
    .then(s => { setSaved(s); setReader(s.reader); setLoadErr(''); })
    .catch(e => setLoadErr(friendlyError(e))), []); // the error tile (with Try again) is the one signal
  useEffect(() => { void load(); }, [load]);
  const retry = () => { setRetrying(true); void load().finally(() => setRetrying(false)); };

  const save = async <K extends keyof Settings>(key: K, value: Settings[K], ok: string) => {
    // The pause switch has its own lock: it must still work while "Run now" (up to 2 min) or a save is busy.
    const own = key === 'automation';
    if (own ? pausing : busy) return; // Enter in a field must not run a save twice
    if (own) setPausing(true); else setBusy(key);
    try {
      await saveSetting(key, value);
      setSaved(s => (s ? { ...s, [key]: value } : s));
      addToast(ok, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { if (own) setPausing(false); else setBusy(''); }
  };

  const runNow = async () => {
    if (busy) return;
    setBusy('run'); setRun(null);
    try {
      const r = await runWorker();
      setRun(r);
      addToast(`Done — read ${r.read}, routed ${r.routed}, written ${r.generated}, published ${r.published}${r.failed ? `, failed ${r.failed}` : ''}`, r.failed ? 'info' : 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const header = <PbPageHeader title="Settings" sub="How the Product Directory reads products, how Telegram posts come in, and when the automation runs"
    back={onBack ? { label: 'More', onBack } : undefined} />;
  if (tagsOpen) return <><Tags addToast={addToast} onBack={closeTags} canEdit={canEdit} /><PbConfirm {...modalProps} /></>;
  if (!saved) return <>{header}{loadErr ? <SettingsError message={loadErr} onRetry={retry} busy={retrying} /> : <SettingsSkeleton />}</>;
  const paused = saved.automation.paused;
  const readerDirty = !same(reader, saved.reader);
  const note = PB_MODELS.find(m => m.id === reader.model)?.note;
  const unchanged = <span style={{ ...pbMeta, alignSelf: 'center' }}>No changes to save</span>;

  const form = (
    <>
      <PbTile as="section">
        <PbSection title="AI that reads products" id="pbs-reader"
          hint="Reads each vendor post + photos to fill in name, category, fabric, colour, sizes, cost and details. Each website picks its own writer under Websites, then Content & AI.">
          <Grid2>
            <Field label="Model" htmlFor="pbs-model" hint={note}>
              <select id="pbs-model" value={reader.model} onChange={e => setReader(r => ({ ...r, model: e.target.value as Settings['reader']['model'] }))}
                aria-describedby={note ? 'pbs-model-hint' : undefined} className="pb-input" style={pbInput}>
                {PB_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Effort" htmlFor="pbs-effort" hint="Higher = slower and costs more. 'Model default' is enough for reading.">
              <select id="pbs-effort" value={reader.effort} onChange={e => setReader(r => ({ ...r, effort: e.target.value as Settings['reader']['effort'] }))}
                aria-describedby="pbs-effort-hint" className="pb-input" style={pbInput}>
                {PB_EFFORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          </Grid2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PbButton onClick={() => void save('reader', reader, 'Reader settings saved')} disabled={!readerDirty}
              busy={busy === 'reader'} busyLabel="Saving…" dim={!!busy && busy !== 'reader'}>Save reader</PbButton>
            {!readerDirty && unchanged}
          </div>
        </PbSection>
      </PbTile>
      <TagsTile onOpen={() => setTagsOpen(true)} />
      <TelegramTile addToast={addToast} onGuide={() => onGuide?.('telegram')} />
      <ImportHistoryTile />
    </>
  );

  return (
    <>
      {header}
      <SettingsColumns form={form} side={
        <AutomationTile paused={paused} saving={pausing} running={busy === 'run'} dim={!!busy && busy !== 'run'} run={run}
          onRun={() => void runNow()}
          onToggle={() => void save('automation', { paused: !paused }, paused ? 'Automation running again' : 'Automation paused — nothing runs on its own')} />
      } />
    </>
  );
}
