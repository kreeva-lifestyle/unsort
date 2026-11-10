// One tag in the review queue or the library: a 44px checkbox for bulk
// actions, the name (struck through when hidden) with its kind, a meta line
// (uses in mono · source · first seen · example products), and the row's
// own buttons on ONE line — Keep (queue only, and only on a visible row:
// hiding already marks a tag reviewed, so a hidden row offers Unhide, not a
// "Keep" that reads as "keep this tag"), Hide / Unhide, and Edit (rename,
// kind, merge into…). On phone the three share the line: Keep and Hide drop
// their icons and Edit is icon-only, so they fit at 360 px. Hairline rows
// inside one tile; every action is a visible button, never hover-only.
import { PB, pbMeta, pbName, pbNum } from '../../pbTheme';
import { istDate } from '../../format';
import { useIsPhone } from '../../hooks/useIsPhone';
import { Dot } from '../product/status';
import { PbButton, PbTag } from '../ui';
import TagCheck from './TagCheck';
import type { PbTag as Tag, PbTagReview } from '../../tagTypes';
import { kindLabel, plural, sourceLabel } from './tagText';

export type TagRowData = Pick<Tag, 'id' | 'name' | 'kind' | 'hidden' | 'source' | 'uses' | 'first_seen_at'> & { examples?: string[]; reviewed_at?: string | null };
export const asRow = (t: Tag | PbTagReview): TagRowData => t;

export default function TagRow({ t, selected, onSelect, onKeep, onHide, onEdit, busy, queue }: {
  t: TagRowData; selected: boolean; onSelect: (on: boolean) => void;
  onKeep?: () => void; onHide: () => void; onEdit: () => void;
  /** This row's action is running ('keep' | 'hide'), or another row's ('other'). */
  busy: '' | 'keep' | 'hide' | 'other';
  /** In the review queue: show Keep, and "New" on never-reviewed rows. */
  queue?: boolean;
}) {
  const ex = (t.examples ?? []).filter(Boolean);
  const phone = useIsPhone();
  // phone: Keep and Hide share the line equally, Edit keeps its 44px square
  const fit = phone ? { flex: '1 1 0', minWidth: 0, padding: '0 12px' } : undefined;
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      <span style={{ margin: '-2px 0 0 -8px', display: 'inline-flex' }}><TagCheck checked={selected} onChange={onSelect} label={`Select ${t.name}`} /></span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ ...pbName, overflowWrap: 'anywhere', minWidth: 0, ...(t.hidden ? { textDecoration: 'line-through', color: PB.tx2 } : null) }}>{t.name}</span>
          <PbTag>{kindLabel(t.kind)}</PbTag>
          {t.hidden && <Dot color={PB.tx3} label="Hidden from websites" />}
          {queue && !t.reviewed_at && <Dot color={PB.review} label="New" />}
        </div>
        <div style={{ ...pbMeta, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap' }}><span style={{ ...pbNum, color: PB.tx }}>{t.uses.toLocaleString('en-IN')}</span> {t.uses === 1 ? 'product' : 'products'}</span>
          <span>{sourceLabel(t.source)}</span>
          <span style={{ color: PB.tx3 }}>first seen {istDate(t.first_seen_at)}</span>
        </div>
        {ex.length > 0 && (
          <div style={{ ...pbMeta, overflowWrap: 'anywhere' }}>
            e.g. {ex.map((n, i) => <span key={i}>{i > 0 && ' · '}<span style={{ color: PB.tx }}>{n}</span></span>)}
            {t.uses > ex.length && <span style={{ color: PB.tx3 }}> and {plural(t.uses - ex.length, 'more', 'more')}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 2, minWidth: 0 }}>
          {queue && onKeep && !t.hidden && <PbButton icon={phone ? undefined : 'check'} onClick={onKeep} busy={busy === 'keep'} busyLabel="Keeping…" dim={busy === 'other' || busy === 'hide'} style={fit}>Keep</PbButton>}
          <PbButton icon={phone ? undefined : t.hidden ? 'eye' : 'eyeOff'} onClick={onHide} busy={busy === 'hide'} busyLabel={t.hidden ? 'Showing…' : 'Hiding…'} dim={busy === 'other' || busy === 'keep'} style={fit}>
            {t.hidden ? 'Unhide' : 'Hide'}
          </PbButton>
          {phone
            ? <PbButton icon="edit" iconOnly aria-label={`Edit ${t.name}`} onClick={onEdit} dim={busy !== ''} />
            : <PbButton icon="edit" onClick={onEdit} dim={busy !== ''}>Edit</PbButton>}
        </div>
      </div>
    </li>
  );
}
