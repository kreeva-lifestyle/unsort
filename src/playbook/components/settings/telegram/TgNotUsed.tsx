// Settings → Telegram, under the counts (pre-launch fixes D14 and D20):
//   TgSkipped  "See which messages were not used": what Playbook set aside in
//              the last 7 days and why — a text with no photos and no price, a
//              greeting, a forward from a person… — so a lost caption or a
//              "back in stock" note can be seen and acted on by hand.
//              Stickers, arrows and repeated posts are left out: they hide
//              nothing. Loads when opened.
//   TgLost     forwards the crawler made that never reached Playbook, per
//              channel, and what happens next.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { listSkipped, type TgLost as Lost, type TgSkipped as Row } from '../../../data/telegram';
import { count, istRelative } from '../../../format';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import { Dot } from '../../product/status';
import { PbSkelBar } from '../../ui';

const linkStyle = { color: PB.tx, fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center' } as const;
const KIND: Record<string, string> = { photo: 'A photo', video: 'A video', text: '', other: 'A sticker or file' };

export function TgSkipped({ skipped }: { skipped: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try { setRows(await listSkipped()); } catch (e) { setError(friendlyError(e)); }
  };
  return (
    <details onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && !rows) void load(); }} style={{ minWidth: 0 }}>
      <summary style={{ ...pbMeta, color: PB.tx, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        See which messages were not used ({count(skipped)} in the last 7 days)
      </summary>
      {error && <p role="alert" style={{ ...pbMeta, color: PB.failed, margin: 0 }}>{error}</p>}
      {!rows && !error && <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="70%" h={14} /><PbSkelBar w="50%" h={14} /></div>}
      {rows && rows.length === 0 && <p style={{ ...pbMeta, margin: 0 }}>Nothing left to check.</p>}
      {rows && rows.length > 0 && (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {rows.map(r => (
            <li key={r.id} style={{ listStyle: 'none', borderTop: `1px solid ${PB.tileBd}`, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                <span style={{ fontSize: 13, color: PB.tx, overflowWrap: 'anywhere' }}>{r.title} · <span style={{ color: PB.tx2 }}>{istRelative(r.at)}</span></span>
                {r.username && r.postId !== null && (
                  <a href={`https://t.me/${encodeURIComponent(r.username)}/${r.postId}`} target="_blank" rel="noopener noreferrer" style={linkStyle}>Open post</a>
                )}
              </span>
              {(r.text || KIND[r.kind]) && (
                <span style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {r.text ? `“${r.text}${r.text.length >= 200 ? '…' : ''}”` : KIND[r.kind]}
                </span>
              )}
              <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{r.why}</span>
            </li>
          ))}
          {skipped > rows.length && <li style={{ ...pbMeta, listStyle: 'none', borderTop: `1px solid ${PB.tileBd}`, paddingTop: 8 }}>The newest {count(rows.length)} are shown.</li>}
        </ul>
      )}
    </details>
  );
}

/** `held`: the bot is not reading the group, so nothing is sent again until that is fixed. */
export function TgLost({ lost, held }: { lost: Lost[]; held: boolean }) {
  const n = lost.reduce((a, l) => a + l.lost, 0);
  if (!n) return null;
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <Dot color={PB.failed} label={`${count(n)} forwarded ${n === 1 ? 'post' : 'posts'} never reached Playbook`} style={{ color: PB.tx, fontWeight: 600, whiteSpace: 'normal' }} />
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lost.map(l => (
          <li key={l.origin_chat_id} style={{ ...pbMeta, listStyle: 'none', overflowWrap: 'anywhere' }}>
            <span style={{ color: PB.tx }}>{l.origin_title || (l.origin_username ? `@${l.origin_username}` : 'A channel')}</span>
            {' '}· {l.lost === 1 ? <>post <span style={pbNum}>#{l.first_id}</span></> : <>{count(l.lost)} between posts <span style={pbNum}>#{l.first_id}</span> and <span style={pbNum}>#{l.last_id}</span></>}
          </li>
        ))}
      </ul>
      <span style={pbMeta}>
        {held ? 'They are sent again once the bot is back in the group and that channel has its next daily check.'
          : 'They are sent again at that channel’s next daily check. If this keeps happening, tap Check bot in step 1.'}
      </span>
    </div>
  );
}
