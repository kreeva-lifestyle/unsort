// Tag all products again + "Let AI decide" progress (Tags page).
// Retag: a dry run first ("41 products change · 12 become Needs info · 5
// become Ready"), then a confirm, then the change (staff's own choices and
// locked products are never touched). "Let AI decide" progress (FillProgress):
// every request of the newest batch together, refreshed every 8 s while it runs;
// when it ends the page reloads its counts.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { logSwallowed } from '../../../lib/errorLogger';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbFillRun, PbRetagResult } from '../../tagTypes';
import { PB, pbBody } from '../../pbTheme';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import { PbButton, PbConfirm, PbSection, PbTile } from '../ui';
import FillProgress from './FillProgress';
import { plural } from './tagText';

export default function RetagTile({ fill: given, api, addToast, onChanged, canEdit }: { fill: PbFillRun | null; api: TagsApi; addToast: AddToast; onChanged: () => void; canEdit: boolean }) {
  const [fill, setFill] = useState(given);
  const [busy, setBusy] = useState<'' | 'Checking…' | 'Retagging…'>('');
  const { ask, modalProps } = useConfirm();
  useEffect(() => { setFill(given); }, [given]);
  const running = !!fill && !fill.finished_at;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      api.fillStatus().then(f => { setFill(f); if (f?.finished_at) onChanged(); }).catch(e => logSwallowed('tags_fill_status', e));
    }, 8000);
    return () => clearInterval(t);
  }, [running, api, onChanged]);

  const run = async () => {
    setBusy('Checking…');
    try {
      const d: PbRetagResult = await api.retag(true);
      if (!d.changed) { addToast(`Nothing to change — ${plural(d.products, 'product')} already match your lists`, 'success'); return; }
      const moves = [d.to_needs_info ? `${plural(d.to_needs_info, 'product')} become Needs info` : '', d.to_ready ? `${plural(d.to_ready, 'product')} become Ready` : ''].filter(Boolean).join(' · ');
      const sample = d.sample.slice(0, 2).map(x => `${x.name}: ${[...x.added.map(a => `+${a}`), ...x.removed.map(r => `−${r}`)].join(' ')}`).join('; ');
      if (!await ask({ title: `Retag ${plural(d.changed, 'product')}?`, message: `${moves ? `${moves}.` : 'No status changes.'}${sample ? ` For example ${sample}.` : ''} Your own choices and locked products stay as they are.`, confirmLabel: 'Retag' })) return;
      setBusy('Retagging…');
      const r = await api.retag(false);
      addToast(`Retagged ${plural(r.changed, 'product')}${r.to_needs_info ? ` · ${r.to_needs_info} now need a tag` : ''}${r.to_ready ? ` · ${r.to_ready} ready` : ''}`, 'success');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <PbTile as="section" aria-labelledby="pbt-retag">
      <PbSection title="Tag existing products" id="pbt-retag" hint="After adding values or “also known as” words, run the rules over every product again. The AI's choices stay unless the rules find a better match.">
        {fill && (running || fill.total > 0) && <FillProgress fill={fill} />}
        {canEdit ? (
          <div><PbButton icon="refresh" onClick={() => void run()} busy={!!busy} busyLabel={busy}>Retag all products</PbButton></div>
        ) : <span style={{ ...pbBody, color: PB.tx2 }}>An admin or manager can retag all products.</span>}
      </PbSection>
      <PbConfirm {...modalProps} />
    </PbTile>
  );
}
