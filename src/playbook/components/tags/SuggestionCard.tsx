// One suggestion (a phrase Playbook saw that is not a value yet): the phrase,
// where it came from, on how many products, three example products, the
// attribute it probably belongs to (changeable), its closest look-alike, and
// the three answers: "+ Add to <Attribute>", "Also known as…", Ignore (an
// ignored phrase is never suggested again). Selectable for bulk actions.
import type { PbAttribute, PbSuggestion } from '../../tagTypes';
import { PB, pbInput, pbMeta, pbName, pbNum, pbRow } from '../../pbTheme';
import { PbButton, PbTag } from '../ui';
import { Dot } from '../product/status';
import TagCheck from './TagCheck';
import { WRAP, lookSentence, plural } from './tagText';

const FROM: Record<PbSuggestion['source'], string> = { store: 'Store tag', ai: 'Seen by the AI', text: 'In a post' };

export default function SuggestionCard({ s, attrs, selected, onSelect, busy, onAdd, onAlias, onIgnore, onMove, canEdit }: {
  s: PbSuggestion; attrs: PbAttribute[]; selected: boolean; onSelect: (on: boolean) => void; busy: string;
  onAdd: () => void; onAlias: () => void; onIgnore: () => void; onMove: (attributeId: string | null) => void; canEdit: boolean;
}) {
  const attr = attrs.find(a => a.id === s.attribute_id);
  const top = s.matches[0];
  const mine = (k: string) => busy === `${k}:${s.id}`;
  const any = !!busy;
  return (
    <li style={{ ...pbRow, alignItems: 'flex-start', flexDirection: 'column', gap: 12, padding: 16, ...(selected ? { borderColor: PB.activeBd } : null) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', minWidth: 0 }}>
        {canEdit && <span style={{ marginLeft: -8, marginTop: -8 }}><TagCheck checked={selected} onChange={onSelect} label={`Select ${s.phrase}`} /></span>}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...pbName, overflowWrap: 'anywhere' }}>{s.phrase}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <PbTag>{FROM[s.source]}</PbTag>
            <span style={pbMeta}>Seen on <span style={pbNum}>{s.uses.toLocaleString('en-IN')}</span> {s.uses === 1 ? 'product' : 'products'}</span>
          </span>
        </div>
      </div>
      {s.example_names.length > 0 && <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>e.g. {s.example_names.join(' · ')}</span>}
      {top && <Dot color={PB.review} label={lookSentence(s.phrase, top)} style={{ whiteSpace: 'normal', color: PB.tx, fontSize: 13 }} />}
      {canEdit && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, flexWrap: 'wrap' }}>
            <label htmlFor={`pbs-attr-${s.id}`} style={{ ...pbMeta, flexShrink: 0 }}>Belongs to</label>
            <select id={`pbs-attr-${s.id}`} value={s.attribute_id ?? ''} onChange={e => onMove(e.target.value || null)} disabled={any}
              className="pb-input" style={{ ...pbInput, flex: 1, minWidth: 140, maxWidth: 260 }}>
              <option value="">— Pick an attribute —</option>
              {attrs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <PbButton icon="plus" style={{ ...WRAP, flex: '1 1 100%' }} onClick={onAdd} disabled={!attr} busy={mine('add')} busyLabel="Adding…" dim={any && !mine('add')}>
              {attr ? `Add to ${attr.name}` : 'Pick an attribute to add'}
            </PbButton>
            <PbButton icon="merge" style={{ flex: '1 1 auto' }} onClick={onAlias} dim={any}>Also known as…</PbButton>
            <PbButton icon="eyeOff" style={{ flex: '1 1 auto' }} onClick={onIgnore} busy={mine('ignore')} busyLabel="Ignoring…" dim={any && !mine('ignore')}>Ignore</PbButton>
          </div>
        </>
      )}
      {!canEdit && <span style={pbMeta}>An admin or manager decides on suggestions · {plural(s.uses, 'product')}</span>}
    </li>
  );
}
