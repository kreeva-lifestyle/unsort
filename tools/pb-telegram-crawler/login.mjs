#!/usr/bin/env node
// One-time sign-in for the staff Telegram account. Run on a laptop:
//   npm run login
// Asks for api_id, api_hash, phone number, the code Telegram sends and the
// two-step password (if set), then prints TG_SESSION once. Nothing is saved
// to disk.
import readline from 'node:readline';
import { Logger, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { LogLevel } from 'telegram/extensions/Logger.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = s => { if (!muted || s.includes('\n')) rl.output.write(muted ? '\n' : s); };

const ask = (q, { hidden = false } = {}) => new Promise(res => {
  rl.output.write(q);
  muted = hidden;
  rl.question('', a => { muted = false; res(a.trim()); });
});

console.log('Playbook Telegram crawler — sign in the STAFF account (not the bot).');
console.log('api_id and api_hash come from https://my.telegram.org → API development tools.\n');
const apiId = Number(process.env.TG_API_ID || await ask('api_id: '));
const apiHash = process.env.TG_API_HASH || await ask('api_hash: ', { hidden: true });
if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
  console.log('api_id must be a number and api_hash must not be empty.');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 5,
  baseLogger: new Logger(LogLevel.ERROR),
});
try {
  await client.start({
    phoneNumber: () => ask('Phone number with country code (e.g. +919876543210): '),
    phoneCode: () => ask('Code Telegram just sent you: '),
    password: hint => ask(`Two-step password${hint ? ` (hint: ${hint})` : ''}: `, { hidden: true }),
    onError: e => { console.log(`Telegram said: ${e.errorMessage || e.message}`); },
  });
  const me = await client.getMe();
  const session = client.session.save();
  console.log(`\nSigned in as ${me.firstName || ''} ${me.lastName || ''} ${me.username ? '@' + me.username : ''}`.trimEnd());
  console.log('\n================  TG_SESSION  ================');
  console.log(session);
  console.log('==============================================');
  console.log('KEEP THIS SECRET. Anyone with it can read and send messages as this account.');
  console.log('Paste it only into the server\'s TG_SESSION variable, then clear this window.');
  console.log('To cancel it later: Telegram → Settings → Devices → end this session.');
} catch (e) {
  console.log(`Sign-in failed: ${e.errorMessage || e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await client.destroy().catch(() => {});
}
