// The look-alike guard (owner: "we don't want look-alike tags"): shown when a
// new value or a suggestion is close to a value that already exists.
// "'Embroided' looks like 'Embroidery' (Work)". The one gradient is "Same
// thing — add as also known as" for the closest match; other matches are
// secondary; "It's different — add as new" adds it anyway (force). A match in
// ANOTHER attribute leads with "This looks like a Fabric value" and its
// primary files the word under that value instead. Its own sheet / modal, so
// its gradient never competes with the page's.
import type { PbLookAlike } from '../../tagTypes';
import { PB, pbBody, pbMeta, pbTileReview } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbModal from '../product/PbModal';
import { PbButton } from '../ui';
import { Dot } from '../product/status';
import { WRAP, lookSentence } from './tagText';

export default function LookAlikeModal({ open, phrase, target, matches, busy, onSame, onNew, onClose }: {
  open: boolean; phrase: string;
  /** The attribute it is being added to ("Work"). */
  target: string;
  matches: PbLookAlike[]; busy: '' | 'same' | 'new';
  onSame: (m: PbLookAlike) => void; onNew: () => void; onClose: () => void;
}) {
  const phone = useIsPhone();
  const top = matches[0];
  if (!top) return null;
  const cross = top.other_attribute;
  const footer = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PbButton kind="primary" block style={WRAP} onClick={() => onSame(top)} busy={busy === 'same'} busyLabel="Saving…" dim={!!busy && busy !== 'same'}>
        {cross ? `Same thing — file it under ${top.attribute}: ${top.value}` : `Same thing — add as also known as “${top.value}”`}
      </PbButton>
      <PbButton block={phone} style={WRAP} onClick={onNew} busy={busy === 'new'} busyLabel="Adding…" dim={!!busy && busy !== 'new'}>
        {`It's different — add “${phrase}” to ${target} as new`}
      </PbButton>
    </div>
  );
  return (
    <PbModal open={open} title={cross ? `This looks like a ${top.attribute} value` : 'Is this the same thing?'} onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        <div style={{ ...pbTileReview, backdropFilter: 'none', WebkitBackdropFilter: 'none', borderRadius: PB.r.input, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Dot color={PB.review} label={lookSentence(phrase, top)} style={{ whiteSpace: 'normal', color: PB.tx, fontSize: 13, fontWeight: 600 }} />
          <span style={pbBody}>
            {cross && top.reason === 'same'
              ? `It is already ${top.attribute}: ${top.value} — products that say “${phrase}” get that. “Same thing” files this one there; “it's different” adds a second “${phrase}” under ${target}.`
              : cross
              ? `It is already a ${top.attribute} value — move it there? Saying “same thing” files “${phrase}” as another name for ${top.value}, so products that say “${phrase}” get ${top.attribute}: ${top.value}.`
              : `Saying “same thing” keeps one value, ${top.value}, and teaches Playbook that “${phrase}” means it too.`}
          </span>
        </div>
        {matches.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={pbMeta}>Or the same thing as:</span>
            {matches.slice(1, 4).map(m => (
              <PbButton key={m.value_id} onClick={() => onSame(m)} dim={!!busy} style={{ ...WRAP, justifyContent: 'flex-start', textAlign: 'left' }}>
                {m.value} <span style={{ ...pbMeta, marginLeft: 4 }}>({m.attribute})</span>
              </PbButton>
            ))}
          </div>
        )}
      </div>
    </PbModal>
  );
}
