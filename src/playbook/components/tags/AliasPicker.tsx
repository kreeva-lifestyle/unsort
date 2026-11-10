// "Also known as…": pick the existing value a phrase means. The closest
// look-alikes come first; a search box filters every value of every
// attribute. Picking one saves at once (the phrase becomes another name for
// that value, so products saying it get the value).
import { useEffect, useMemo, useState } from 'react';
import type { PbAttribute, PbLookAlike } from '../../tagTypes';
import { PB, pbBtnSecondary, pbInput, pbMeta } from '../../pbTheme';
import PbModal from '../product/PbModal';
import { Field } from '../website/ui';

export type AliasTarget = { value_id: string; value: string; attribute_id: string; attribute: string };

export default function AliasPicker({ phrase, attrs, matches, busy, onPick, onClose }: {
  phrase: string | null; attrs: PbAttribute[]; matches: PbLookAlike[]; busy: boolean; onPick: (t: AliasTarget) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { setQ(''); }, [phrase]);
  const all = useMemo(() => attrs.flatMap(a => a.values.map(v => ({ value_id: v.id, value: v.name, attribute_id: a.id, attribute: a.name }))), [attrs]);
  if (phrase === null) return null;
  const k = q.trim().toLowerCase();
  const list: AliasTarget[] = k ? all.filter(t => t.value.toLowerCase().includes(k) || t.attribute.toLowerCase().includes(k)).slice(0, 40)
    : [...matches.map(m => ({ value_id: m.value_id, value: m.value, attribute_id: m.attribute_id, attribute: m.attribute })), ...all.filter(t => !matches.some(m => m.value_id === t.value_id))].slice(0, 40);
  const row = { ...pbBtnSecondary, width: '100%', justifyContent: 'space-between', borderRadius: PB.r.input, fontWeight: 500, whiteSpace: 'normal', textAlign: 'left', padding: '8px 14px' } as const;
  return (
    <PbModal open title={`“${phrase}” is also known as…`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
        <Field label="Find a value" htmlFor="pbal-q" hint={`Pick the value “${phrase}” means. Products that say “${phrase}” then get it.`}>
          <input id="pbal-q" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Black" className="pb-input" style={pbInput} />
        </Field>
        {!k && matches.length > 0 && <span style={pbMeta}>Closest first</span>}
        <ul aria-label="Values" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(t => (
            <li key={t.value_id}>
              <button type="button" className="pb-pill" style={{ ...row, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={() => onPick(t)} aria-busy={busy}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.value}</span>
                <span style={{ ...pbMeta, flexShrink: 0 }}>{t.attribute}</span>
              </button>
            </li>
          ))}
          {!list.length && <li style={pbMeta}>{k ? `No value matches “${q.trim()}”.` : 'No values yet — add some under Attributes first.'}</li>}
        </ul>
      </div>
    </PbModal>
  );
}
