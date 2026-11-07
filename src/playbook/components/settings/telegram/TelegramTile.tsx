// Settings → Telegram: vendor channel posts → Products, set up in three
// numbered steps (bot, admin group, crawler + its daily checks) with live status, plus how many
// forwarded messages are waiting to become products. Owns the one busy key
// for its buttons; every action ends in a success or friendlyError toast.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { useAuth } from '../../../../hooks/useAuth';
import { useConfirm } from '../../../../components/ui/ConfirmModal';
import type { AddToast } from '../../PbToasts';
import { WINDOW_DEFAULT, createCrawlerKey, getLinkCode, respreadSlots, saveBotToken, saveCrawlWindow, testBot } from '../../../data/telegram';
import { minuteLabel } from '../../../data/tgSchedule';
import { count, istDate, istRelative } from '../../../format';
import { useTgStatus } from '../../../hooks/useTgStatus';
import { PB, pbBody, pbLabel, pbMeta, pbNum } from '../../../pbTheme';
import { Dot } from '../../product/status';
import { PbButton, PbConfirm, PbSection, PbSkelBar, PbTile } from '../../ui';
import TgBotStep from './TgBotStep';
import TgGroupStep from './TgGroupStep';
import TgCrawlerStep from './TgCrawlerStep';
import { copyText } from './TgStep';
import TgFailedPosts from './TgFailedPosts';
import TgSchedule from './TgSchedule';

type Busy = '' | 'token' | 'test' | 'code' | 'key' | 'window' | 'spread';

export default function TelegramTile({ addToast, onGuide }: { addToast: AddToast; onGuide: () => void }) {
  const { status, error, loading, reload } = useTgStatus();
  const { profile } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'manager';
  const [busy, setBusy] = useState<Busy>('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const { ask, modalProps } = useConfirm();
  const config = status?.config ?? null;

  /** One busy key; returns whether it worked. */
  const run = async (key: Busy, fn: () => Promise<string>) => {
    if (busy) return false;
    setBusy(key);
    try { addToast(await fn(), 'success'); return true; }
    catch (e) { addToast(friendlyError(e), 'error'); return false; }
    finally { setBusy(''); void reload(); }
  };

  const onSave = (token: string) => run('token', async () => {
    const r = await saveBotToken(token);
    return r.webhook_ok === false ? `Saved @${r.bot_username}, but Telegram can’t reach Playbook yet — tap Check bot` : `Bot @${r.bot_username} saved and connected`;
  });
  const onTest = () => void run('test', async () => {
    const r = await testBot();
    if (!r.url_ok) throw new Error(canManage ? 'The bot is not connected to Playbook — save the bot token again.' : 'The bot is not connected to Playbook — ask an admin or manager to save the bot token again.');
    return r.last_error_message ? 'Bot connected. Telegram had trouble delivering recently — it retries by itself' : 'Bot connected';
  });
  const onCode = () => void run('code', async () => { const r = await getLinkCode(); return `Link code ${r.code} — send /link ${r.code} in the group`; });
  const onKey = async () => {
    if (config?.crawler_seen_at && !(await ask({
      title: 'Replace the crawler key?', danger: true, confirmLabel: 'Replace key',
      message: 'The crawler stops forwarding posts until you paste the new key on the server.',
    }))) return;
    await run('key', async () => { const r = await createCrawlerKey(); setNewKey(r.key); return 'New crawler key created — copy it now, it is shown only once'; });
  };
  const winStart = config?.crawl_window_start ?? WINDOW_DEFAULT.start, winEnd = config?.crawl_window_end ?? WINDOW_DEFAULT.end;
  const onWindow = (start: number, end: number) => run('window', async () => {
    await saveCrawlWindow(start, end);
    return `Window saved — channels are checked between ${minuteLabel(start)} and ${minuteLabel(end)}, spread evenly`;
  });
  const onSpread = async () => {
    const n = status?.schedule.length ?? 0;
    if (!(await ask({
      title: `Spread all ${n} channels evenly?`, confirmLabel: 'Spread evenly',
      message: `Each channel gets a new daily time, evenly spaced between ${minuteLabel(winStart)} and ${minuteLabel(winEnd)}, in the same order as now. Nothing is copied twice. If you do this during the night, channels whose new time has already passed are checked the next night.`,
    }))) return;
    await run('spread', async () => { await respreadSlots(); return `${n} channels spread evenly`; });
  };
  const onCopy = async (text: string, what: string) => {
    if (await copyText(text)) addToast(`${what} copied`, 'success');
    else addToast('Could not copy — press and hold the text to copy it by hand', 'error');
  };

  const counts = status && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} aria-live="polite">
        <span style={pbMeta}>Messages waiting <span style={{ ...pbNum, color: PB.tx, fontWeight: 600 }}>{count(status.waiting + status.retrying)}</span></span>
        {status.retrying > 0 && <Dot color={PB.review} label={`${count(status.retrying)} being tried again`} style={{ color: PB.tx }} />}
        {status.failed > 0 && <Dot color={PB.failed} label={`${count(status.failed)} could not be used`} style={{ color: PB.tx }} />}
        <span style={pbMeta} title={config?.last_message_at ? istDate(config.last_message_at) : undefined}>
          Last message <span style={{ color: PB.tx }}>{config?.last_message_at ? istRelative(config.last_message_at) : 'none yet'}</span>
        </span>
      </span>
      {status.failed > 0 && <TgFailedPosts failed={status.failed} />}
    </div>
  );
  const head = (
    <PbSection title="Telegram" id="pbs-tg"
      hint="Products posted in the vendors’ Telegram channels come into Products by themselves, with the vendor taken from the channel." />
  );

  if (!status) {
    return (
      <PbTile as="section" variant={error ? 'failed' : 'default'} aria-labelledby="pbs-tg" aria-busy={!error || undefined} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {head}
        {error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Dot color={PB.failed} label="Could not load the Telegram status" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
              <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{error}</span>
            </span>
            <PbButton icon="refresh" onClick={() => void reload()} busy={loading} busyLabel="Trying again…">Try again</PbButton>
          </div>
        ) : (
          <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ display: 'flex', gap: 12 }}><PbSkelBar w={32} h={32} style={{ borderRadius: PB.r.pill }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="40%" h={14} /><PbSkelBar w="100%" h={40} style={{ borderRadius: PB.r.input }} /></span></div>)}
            <span className="pb-sr" role="status">Loading Telegram status</span>
          </div>
        )}
      </PbTile>
    );
  }

  return (
    <PbTile as="section" aria-labelledby="pbs-tg" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {head}
      {counts}
      {error && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not refresh: {error}</span>}
      <span style={{ ...pbLabel, marginBottom: -4 }}>Set up once, in order</span>
      <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TgBotStep config={config} canManage={canManage} busy={busy} onSave={onSave} onTest={onTest} />
        <TgGroupStep config={config} canManage={canManage} busy={busy} onCode={onCode} onCopy={(t, w) => void onCopy(t, w)} />
        <TgCrawlerStep config={config} canManage={canManage} busy={busy} newKey={newKey} onKey={() => void onKey()}
          onHideKey={() => setNewKey(null)} onCopy={(t, w) => void onCopy(t, w)} onGuide={onGuide}
          schedule={<TgSchedule rows={status.schedule} channels={config?.crawler_channels ?? []} start={winStart} end={winEnd}
            canManage={canManage} busy={busy} onSaveWindow={onWindow} onSpread={() => void onSpread()} />} />
      </ol>
      <PbConfirm {...modalProps} />
    </PbTile>
  );
}
