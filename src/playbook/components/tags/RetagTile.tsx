// Tag all products again + "Let AI decide" progress (Tags page).
// Retag: a dry run first ("41 products change · 12 become Needs info · 5
// become Ready"), then a confirm, then the change (staff's own choices and
// locked products are never touched). Progress: while an AI run is going,
// "AI is filling 12 products · 5 done" with a bar, refreshed every 8 s; when
// it ends the page reloads its counts.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { logSwallowed } from '../../../lib/errorLogger';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbFillRun, PbRetagResult } from '../../tagTypes';
import { PB, pbBody, pbMeta, pbNum } from '../../pbTheme';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import { PbButton, PbConfirm, PbSection, PbTile } from '../ui';
import { Dot } from '../product/status';
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
  const pct = fill && fill.total ? Math.round((fill.done / fill.total) * 100) : 0;
  return (
    <PbTile as="section" aria-labelledby="pbt-retag">
      <PbSection title="Tag existing products" id="pbt-retag" hint="After adding values or “also known as” words, run the rules over every product again. The AI's choices stay unless the rules find a better match.">
        {fill && (running || fill.total > 0) && (
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Dot color={running ? PB.busy : PB.live} style={{ color: PB.tx, fontSize: 13, whiteSpace: 'normal' }}
              label={running ? <>AI is filling <span style={pbNum}>{fill.total}</span> products · <span style={pbNum}>{fill.done}</span> done</>
                : <>AI filled <span style={pbNum}>{fill.filled}</span> of <span style={pbNum}>{fill.total}</span>{fill.left_empty ? <> · <span style={pbNum}>{fill.left_empty}</span> still need you</> : null}</>} />
            <span aria-hidden="true" style={{ height: 8, borderRadius: PB.r.skel, background: PB.skelBar, overflow: 'hidden', display: 'block' }}>
              <span className={running ? 'pb-pulse' : undefined} style={{ display: 'block', height: '100%', width: `${running ? Math.max(4, pct) : 100}%`, background: running ? PB.busy : PB.live }} />
            </span>
            {running && <span style={pbMeta}>It runs in the background with the rest of the automation — you can leave this page.</span>}
          </div>
        )}
        {canEdit ? (
          <div><PbButton icon="refresh" onClick={() => void run()} busy={!!busy} busyLabel={busy}>Retag all products</PbButton></div>
        ) : <span style={{ ...pbBody, color: PB.tx2 }}>An admin or manager can retag all products.</span>}
      </PbSection>
      <PbConfirm {...modalProps} />
    </PbTile>
  );
}
