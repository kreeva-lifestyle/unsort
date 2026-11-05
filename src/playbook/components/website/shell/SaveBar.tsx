// Sticky save bar for the website editor (mobile.md §5): a glass bar that
// rides above the tab bar on phone (and the keyboard, via --pb-kb) and at the
// bottom of the body column on desktop. Shown only while there is something
// to say: unsaved changes or a save error. One primary; Discard beside it.
import { PB, pbErrorBox, pbMeta, pbSheet } from '../../../pbTheme';
import { Dot } from '../../product/status';
import { PbButton } from '../../ui';

export default function SaveBar({ dirty, err, saving, onDiscard, onSave }: {
  dirty: boolean; err: string; saving: boolean; onDiscard: () => void; onSave: () => void;
}) {
  return (
    <div role="region" aria-label="Save changes"
      style={{
        ...pbSheet, position: 'sticky', zIndex: 5, marginTop: 16, padding: 8, borderRadius: PB.r.tilePhone,
        bottom: 'calc(var(--pb-bar) + env(safe-area-inset-bottom) + 8px + var(--pb-kb, 0px))',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span aria-live="polite" style={{ flex: '1 0 auto', padding: '0 8px', display: 'inline-flex' }}>
          {dirty ? <Dot color={PB.review} label="Unsaved changes" style={{ fontSize: 13, color: PB.tx }} /> : <span style={pbMeta}>Nothing to save</span>}
        </span>
        <span style={{ display: 'flex', gap: 16, flex: '1 1 260px', justifyContent: 'flex-end' }}>
          <PbButton onClick={onDiscard} disabled={!dirty} dim={saving}>Discard</PbButton>
          <PbButton kind="primary" onClick={onSave} disabled={!dirty} busy={saving} busyLabel="Saving…" style={{ flex: '1 1 auto', maxWidth: 260 }}>
            Save changes
          </PbButton>
        </span>
      </div>
    </div>
  );
}
