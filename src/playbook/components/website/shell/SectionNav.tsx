// How the editor's six sections are reached. Desktop: a side list in one
// glass tile, the chosen section frosted with the amber inset bar (pbActiveSide).
// Phone: one glass row per section with a summary; each opens full screen.
// A section holding unsaved edits says so with a dot + "Unsaved".
import { PB, pbActiveSide } from '../../../pbTheme';
import { Dot } from '../../product/status';
import { PbIcon, PbRow, PbTile } from '../../ui';
import { SECTIONS, type SectionId } from './sections';

type Props = { current: SectionId; onPick: (id: SectionId) => void; edited: (id: SectionId) => boolean };

const unsaved = <Dot color={PB.review} label="Unsaved" />;

export function SectionSideList({ current, onPick, edited }: Props) {
  return (
    <PbTile flat style={{ padding: 8 }}>
      <nav aria-label="Website sections" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SECTIONS.map(s => {
          const on = s.id === current;
          return (
            <button key={s.id} type="button" onClick={() => onPick(s.id)} aria-current={on ? 'page' : undefined} className="pb-pill"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 12px', borderRadius: PB.r.input,
                border: '1px solid transparent', background: 'transparent', color: PB.tx2, fontFamily: PB.sans, fontSize: 14,
                fontWeight: 500, lineHeight: 1.35, textAlign: 'left', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                ...(on ? pbActiveSide : null),
              }}>
              <PbIcon name={s.icon} size={18} />
              <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
              {edited(s.id) && unsaved}
            </button>
          );
        })}
      </nav>
    </PbTile>
  );
}

export function SectionRows({ onPick, edited, meta }: Omit<Props, 'current'> & { meta: (id: SectionId) => string }) {
  return (
    <nav aria-label="Website sections" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {SECTIONS.map(s => (
        <PbRow key={s.id} icon={s.icon} title={s.label} meta={meta(s.id)} status={edited(s.id) ? unsaved : undefined} onClick={() => onPick(s.id)} />
      ))}
    </nav>
  );
}
