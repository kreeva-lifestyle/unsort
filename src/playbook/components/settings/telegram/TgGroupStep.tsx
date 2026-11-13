// Step 2 — the owner's private admin group. "Get link code" → a 6-digit code
// (30 min) and the exact instruction; the group's title appears by itself
// once someone sends /link <code> there (the page polls while a code waits).
// Only an admin / manager gets a code: it decides where all vendor posts go.
// A linked group the bot is no longer in, or cannot read (pre-launch fix D20),
// shows "Not receiving" with what to do and a button that asks Telegram again.
import { activeCode } from '../../../data/telegram';
import { istTime } from '../../../format';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import type { PbTgConfig } from '../../../types';
import { NEUTRAL } from '../../product/status';
import PbButton from '../../ui/PbButton';
import { TgStep, TgValueBox, type StepState } from './TgStep';

type Props = { config: PbTgConfig | null; canManage: boolean; busy: string; onCode: () => void; onTest: () => void; onCopy: (text: string, what: string) => void };

export const groupState = (c: PbTgConfig | null): StepState =>
  c?.group_chat_id ? (c.group_ok === false ? { color: PB.failed, label: 'Not receiving' } : { color: PB.live, label: 'Linked' })
    : activeCode(c) ? { color: PB.busy, label: 'Waiting for /link' } : { color: NEUTRAL, label: 'Not linked' };

export default function TgGroupStep({ config, canManage, busy, onCode, onTest, onCopy }: Props) {
  const code = activeCode(config);
  const linked = !!config?.group_chat_id;
  const bot = config?.bot_username ? `@${config.bot_username}` : 'the bot';
  const cmd = code ? `/link ${code.code}` : '';

  return (
    <TgStep n={2} id="pbs-tg-group" title="Admin group" state={groupState(config)}>
      {!config?.bot_username ? <p style={{ ...pbMeta, margin: 0 }}>Do step 1 first — the group is linked through the bot.</p> : (
        <>
          {linked && (
            <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>
              Group: <span style={{ color: PB.tx, fontWeight: 600 }}>{config.group_title || 'Untitled group'}</span>
              {' '}— vendor posts are forwarded here and turned into products.
            </span>
          )}
          {linked && config.group_ok === false && (
            <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>
                {config.group_error || 'The bot is not reading this group, so no vendor post is copied.'} The crawler waits meanwhile, so nothing is skipped.
              </span>
              <PbButton icon="refresh" onClick={onTest} busy={busy === 'test'} busyLabel="Checking…" dim={!!busy && busy !== 'test'}>Check again</PbButton>
            </div>
          )}
          {!canManage ? (!linked && <p style={{ ...pbMeta, margin: 0 }}>An admin or manager links the group.</p>) : code ? (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <TgValueBox big label="Link code">{code.code}</TgValueBox>
                <span style={pbMeta}>Valid until {istTime(code.expires_at)}</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.5, color: PB.tx }}>
                <li>Add <span style={pbNum}>{bot}</span> to your group as an admin.</li>
                <li>Send <span style={{ ...pbNum, fontWeight: 600 }}>{cmd}</span> in the group.</li>
                <li>Wait here — the group’s name shows up within a few seconds.</li>
              </ol>
              {config.link_attempts > 0 && <span style={pbMeta}>{config.link_attempts} wrong {config.link_attempts === 1 ? 'try' : 'tries'} — after 5 the code stops working.</span>}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <PbButton icon="copy" onClick={() => onCopy(cmd, 'Command')} dim={!!busy}>Copy {cmd}</PbButton>
                <PbButton icon="refresh" onClick={onCode} busy={busy === 'code'} busyLabel="Getting code…" dim={!!busy && busy !== 'code'}>New code</PbButton>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <PbButton onClick={onCode} busy={busy === 'code'} busyLabel="Getting code…" dim={!!busy && busy !== 'code'}>
                {linked ? 'Link a different group' : 'Get link code'}
              </PbButton>
              {!linked && <span style={pbMeta}>Make a private group for this first (only you and the staff account).</span>}
            </div>
          )}
        </>
      )}
    </TgStep>
  );
}
