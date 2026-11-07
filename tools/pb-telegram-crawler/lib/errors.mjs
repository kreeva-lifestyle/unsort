// Sorts Telegram (GramJS) errors into the few cases the crawler acts on,
// and gives the plain words shown in Playbook Settings.
const NOT_JOINED = /^(CHANNEL_PRIVATE|CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID|USER_BANNED_IN_CHANNEL|CHANNEL_PUBLIC_GROUP_NA)$/;
const NO_NAME = /^(USERNAME_NOT_OCCUPIED|USERNAME_INVALID|NOT_A_CHANNEL)$/;
const AUTH = /^(AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|USER_DEACTIVATED_BAN)$/;
const GROUP = /^(CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|CHAT_RESTRICTED|CHAT_SEND_\w*FORBIDDEN|CHAT_GUEST_SEND_FORBIDDEN)$/;
const GONE = /^(MESSAGE_ID_INVALID|MESSAGE_IDS_EMPTY|MESSAGE_EMPTY)$/;
const NETWORK = /not connected|disconnect|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH|socket|network|connection|Request was unsuccessful/i;

export function classify(err) {
  const code = String(err?.errorMessage || '');
  const text = String(err?.message || err || '');
  if (typeof err?.seconds === 'number' && (code === 'FLOOD' || /FLOOD|SLOWMODE/.test(code))) {
    return { kind: 'flood', seconds: err.seconds, code };
  }
  if (code === 'CHAT_FORWARDS_RESTRICTED') return { kind: 'forwards_restricted', code };
  if (AUTH.test(code)) return { kind: 'auth', code };
  if (GROUP.test(code)) return { kind: 'group', code };
  if (GONE.test(code)) return { kind: 'gone', code };
  if (NO_NAME.test(code) || /^No user has ".*" as username/.test(text) || /^Cannot find any entity corresponding/.test(text)) {
    return { kind: 'no_channel', code: code || 'NOT_FOUND' };
  }
  if (code === 'NOT_BROADCAST') return { kind: 'not_broadcast', code };
  if (NOT_JOINED.test(code) || /^Could not find the input entity/.test(text)) return { kind: 'not_joined', code: code || 'NOT_IN_DIALOGS' };
  if (code === 'RPC_CALL_FAIL' || code === 'TIMEOUT' || err?.code === -503 || err?.pbNetwork || (!code && NETWORK.test(text))) {
    return { kind: 'network', code: code || 'NETWORK' };
  }
  return { kind: 'other', code: code || 'ERROR', text: text.slice(0, 160) };
}

// Errors that stop the whole cycle instead of one channel.
export const isFatal = c => c.kind === 'network' || c.kind === 'auth';

export function channelErrorText(c, ch) {
  const name = ch.username ? `@${ch.username}` : 'this channel';
  switch (c.kind) {
    case 'forwards_restricted': return 'This channel blocks forwarding';
    case 'not_joined': return 'Join this channel from the staff account';
    case 'no_channel': return `No Telegram channel called ${name} — check the name in Playbook`;
    case 'not_broadcast': return `${name} is a group, not a channel — only channels can be read`;
    case 'flood': return c.seconds >= 120
      ? `Telegram asked us to slow down for ${Math.ceil(c.seconds / 60)} min — it carries on by itself`
      : `Telegram asked us to slow down for ${c.seconds} s — it carries on by itself`;
    default: return `Telegram error: ${c.code}${c.text && c.text !== c.code ? ` (${c.text})` : ''}`;
  }
}

export const MSG = {
  waitingGroup: 'Waiting for the admin group — link it in Playbook Settings → Telegram, step 2',
  groupMissing: 'The staff account is not in the admin group — add it to the group',
  groupCantPost: "The staff account can't post in the admin group — let members send messages and media",
  groupOrChannel: 'Could not forward — check the staff account is still in the admin group',
  auth: 'Telegram signed the staff account out — run "npm run login" again and update TG_SESSION',
  network: 'Lost the connection to Telegram — reconnecting',
};
