// Settings → Telegram: "See which posts" under the header when Playbook gave up
// on some forwarded messages — which channel post, why, and a link to open it
// in Telegram, so staff can add that product by hand. Loads when opened.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { listFailedPosts, type TgFailedPost } from '../../../data/telegram';
import { count } from '../../../format';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import { PbSkelBar } from '../../ui';

const linkStyle = { color: PB.tx, fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center' } as const;

export default function TgFailedPosts({ failed }: { failed: number }) {
  const [rows, setRows] = useState<TgFailedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try { setRows(await listFailedPosts()); } catch (e) { setError(friendlyError(e)); }
  };
  return (
    <details onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && !rows) void load(); }} style={{ minWidth: 0 }}>
      <summary style={{ ...pbMeta, color: PB.tx, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        See which posts could not be used ({count(failed)} {failed === 1 ? 'message' : 'messages'})
      </summary>
      {error && <p role="alert" style={{ ...pbMeta, color: PB.failed, margin: 0 }}>{error}</p>}
      {!rows && !error && <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="70%" h={14} /><PbSkelBar w="50%" h={14} /></div>}
      {rows && rows.length === 0 && <p style={{ ...pbMeta, margin: 0 }}>Nothing left to check.</p>}
      {rows && rows.length > 0 && (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {rows.map(r => (
            <li key={r.key} style={{ listStyle: 'none', borderTop: `1px solid ${PB.tileBd}`, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                <span style={{ fontSize: 13, color: PB.tx, overflowWrap: 'anywhere' }}>
                  {r.title}{r.firstId !== null && <> · post <span style={pbNum}>#{r.firstId}</span></>}
                </span>
                {r.username && r.firstId !== null && (
                  <a href={`https://t.me/${encodeURIComponent(r.username)}/${r.firstId}`} target="_blank" rel="noopener noreferrer" style={linkStyle}>Open post</a>
                )}
              </span>
              <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{r.note}{r.messages > 1 ? ` · ${r.messages} messages` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
