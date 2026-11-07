// Step 1 — the Playbook bot. Admin / manager pastes the BotFather token
// (password field) → Save → @bot_username and whether Telegram can reach
// Playbook's webhook. Everyone else sees the status and can run "Check bot".
import { useState } from 'react';
import { PB, pbErrorBox, pbInput, pbMeta, pbNum } from '../../../pbTheme';
import type { PbTgConfig } from '../../../types';
import { NEUTRAL } from '../../product/status';
import PbButton from '../../ui/PbButton';
import { Field } from '../../website/ui';
import { TgStep, type StepState } from './TgStep';

type Props = {
  config: PbTgConfig | null; canManage: boolean; busy: string;
  onSave: (token: string) => Promise<boolean>; onTest: () => void;
};

export const botState = (c: PbTgConfig | null): StepState =>
  !c?.bot_username ? { color: NEUTRAL, label: 'Not set up' }
    : c.webhook_ok === false ? { color: PB.failed, label: 'Telegram can’t reach Playbook' }
      : c.webhook_ok ? { color: PB.live, label: 'Connected' } : { color: PB.review, label: 'Not checked yet' };

export default function TgBotStep({ config, canManage, busy, onSave, onTest }: Props) {
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false);
  const has = !!config?.bot_username;
  const showForm = canManage && (!has || editing);

  const save = async () => {
    if (!token.trim() || busy) return;
    if (await onSave(token.trim())) { setToken(''); setEditing(false); }
  };

  return (
    <TgStep n={1} id="pbs-tg-bot" title="Playbook bot" state={botState(config)}>
      {has && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ ...pbNum, fontSize: 15, color: PB.tx, overflowWrap: 'anywhere' }}>@{config!.bot_username}</span>
          {(config!.webhook_ok === false || config!.webhook_error) && (
            <div role="alert" style={{ ...pbErrorBox, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Telegram could not deliver the last messages to Playbook. Tap Check bot — it usually fixes itself within a few minutes.</span>
              {config!.webhook_error && (
                <details><summary style={{ ...pbMeta, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Technical details</summary>
                  <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{config!.webhook_error}</span></details>
              )}
            </div>
          )}
        </div>
      )}
      {!has && !canManage && <p style={{ ...pbMeta, margin: 0 }}>Not set up yet — an admin or manager pastes the bot’s token here.</p>}
      {showForm && (
        <form onSubmit={e => { e.preventDefault(); void save(); }} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Field label="Bot token" htmlFor="pbs-tg-token"
            hint="In Telegram open @BotFather, send /newbot, then copy the token it sends back (numbers, a colon, then letters).">
            <input id="pbs-tg-token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password"
              data-1p-ignore="" data-lpignore="true" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" maxLength={200} placeholder="123456789:AA…"
              aria-describedby="pbs-tg-token-hint" className="pb-input" style={{ ...pbInput, ...pbNum }} />
          </Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PbButton type="submit" busy={busy === 'token'} busyLabel="Saving…" dim={!!busy && busy !== 'token'} disabled={!token.trim()}>Save token</PbButton>
            {editing && <PbButton onClick={() => { setEditing(false); setToken(''); }} dim={!!busy}>Cancel</PbButton>}
          </div>
        </form>
      )}
      {has && !showForm && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PbButton icon="refresh" onClick={onTest} busy={busy === 'test'} busyLabel="Checking…" dim={!!busy && busy !== 'test'}>Check bot</PbButton>
          {canManage && <PbButton onClick={() => setEditing(true)} dim={!!busy}>Change token</PbButton>}
        </div>
      )}
    </TgStep>
  );
}
