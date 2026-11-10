// Two helpers beside the rules form: the live tester ("Would this tag be
// hidden?", answered by tagCleanPreview.ts, the server's own rules copied)
// and "Re-clean all products" (a dry run that says how many products would
// change, a confirm, then the real run — two signals on every step).
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import type { AddToast } from '../PbToasts';
import type { RecleanResult, TagsApi } from '../../data/tags';
import type { PbTagSettings } from '../../tagTypes';
import { PB, pbBody, pbInput, pbMeta, pbNum } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbConfirm, PbSection } from '../ui';
import { Field } from '../website/ui';
import { testTag } from './tagCleanPreview';
import { hiddenWhy, plural } from './tagText';

/** Type a tag, see what the rules (as edited, unsaved) would do with it. */
export function TagTester({ rules }: { rules: PbTagSettings }) {
  const [raw, setRaw] = useState('');
  const r = raw.trim() ? testTag(raw, rules) : null;
  return (
    <PbSection label="Try a tag" id="pbt-tester" divider hint="Type a tag the way a store writes it — the answer uses the rules as they are above, saved or not.">
      <Field label="Would this tag be hidden?" htmlFor="pbt-try">
        <input id="pbt-try" value={raw} onChange={e => setRaw(e.target.value)} placeholder="e.g. _altnew_KBSUIT25" className="pb-input" style={{ ...pbInput, fontFamily: PB.mono }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <div aria-live="polite" style={{ ...pbBody, minHeight: 20, marginTop: -8 }}>
        {r && (r.hidden
          ? <Dot color={PB.review} label={`Hidden — ${hiddenWhy(r.hidden)}`} style={{ color: PB.tx, fontSize: 13, whiteSpace: 'normal' }} />
          : <Dot color={PB.live} label={`Kept as “${r.tag}”`} style={{ color: PB.tx, fontSize: 13, whiteSpace: 'normal' }} />)}
      </div>
    </PbSection>
  );
}

/** Dry run → confirm → apply. `dirty` = unsaved rules on the form (the server uses the SAVED rules). */
export function RecleanBlock({ api, addToast, dirty, dim, onDone }: { api: TagsApi; addToast: AddToast; dirty: boolean; dim: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<'' | 'dry' | 'apply'>('');
  const [last, setLast] = useState<RecleanResult | null>(null);
  const { ask, modalProps } = useConfirm();
  const start = async () => {
    if (stage) return;
    setStage('dry');
    let dry: RecleanResult;
    try { dry = await api.reclean(true); setLast(dry); }
    catch (e) { addToast(friendlyError(e), 'error'); setStage(''); return; }
    setStage('');
    if (!dry.changed) { addToast(`Checked ${plural(dry.products, 'product')} — the tags are already clean`, 'success'); return; }
    const sample = dry.sample.slice(0, 3).map(s => `${s.name}: ${[...s.added.map(t => `+${t}`), ...s.removed.map(t => `−${t}`)].join(', ')}`).join(' · ');
    if (!(await ask({
      title: `Re-clean ${plural(dry.changed, 'product')}?`, confirmLabel: `Re-clean ${dry.changed.toLocaleString('en-IN')}`,
      message: `${dry.changed.toLocaleString('en-IN')} of ${plural(dry.products, 'product')} would get different tags under the saved rules. Tags typed by hand are kept. Websites pick the new tags up the next time a listing is written.${sample ? ` For example — ${sample}.` : ''}`,
    }))) return;
    setStage('apply');
    try {
      const r = await api.reclean(false);
      setLast(r);
      addToast(`Re-cleaned ${plural(r.changed, 'product')}`, 'success');
      onDone();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setStage(''); }
  };
  return (
    <PbSection label="Re-clean all products" id="pbt-reclean" divider
      hint="Runs the saved rules over every product's store tags and current tags again. Nothing is changed until you confirm the count.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <PbButton icon="refresh" onClick={() => void start()} busy={stage !== ''} busyLabel={stage === 'apply' ? 'Re-cleaning…' : 'Counting…'} dim={dim}>Re-clean all products</PbButton>
        {dirty && <span style={pbMeta}>Save the rules first — the re-clean uses the saved ones.</span>}
        {!dirty && last && !last.dry_run && <span style={pbMeta}>Last run changed <span style={pbNum}>{last.changed.toLocaleString('en-IN')}</span> of <span style={pbNum}>{last.products.toLocaleString('en-IN')}</span> products.</span>}
      </div>
      <PbConfirm {...modalProps} />
    </PbSection>
  );
}
