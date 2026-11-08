import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errors } from 'telegram';
import { classify } from '../lib/errors.mjs';
import { readEnv } from '../lib/util.mjs';
import { rpcError } from './fake.mjs';

test('real GramJS FloodWaitError is read as a flood with its seconds', () => {
  const e = new errors.FloodWaitError({ capture: 77, request: undefined });
  assert.deepEqual(classify(e), { kind: 'flood', seconds: 77, code: 'FLOOD' });
});

test('error kinds', () => {
  const k = e => classify(e).kind;
  assert.equal(k(rpcError('CHAT_FORWARDS_RESTRICTED')), 'forwards_restricted');
  assert.equal(k(rpcError('CHANNEL_PRIVATE')), 'not_joined');
  assert.equal(k(new Error('Could not find the input entity for {"channelId":"5"}')), 'not_joined');
  assert.equal(k(rpcError('USERNAME_NOT_OCCUPIED')), 'no_channel');
  assert.equal(k(new Error('No user has "abc" as username')), 'no_channel');
  assert.equal(k(rpcError('AUTH_KEY_UNREGISTERED')), 'auth');
  assert.equal(k(rpcError('CHAT_WRITE_FORBIDDEN')), 'group');
  assert.equal(k(rpcError('CHAT_SEND_MEDIA_FORBIDDEN')), 'group');
  assert.equal(k(new Error('Not connected')), 'network');
  assert.equal(k(new Error('connect ECONNREFUSED 1.2.3.4:443')), 'network');
  assert.equal(k(rpcError('MESSAGE_ID_INVALID')), 'gone');
  assert.equal(k(rpcError('MEDIA_INVALID')), 'other');
});

test('environment: every missing variable named at once, numbers checked', () => {
  assert.throws(() => readEnv({}), /TG_API_ID is not set; TG_API_HASH is not set; TG_SESSION is not set; PB_URL is not set; PB_CRAWLER_KEY is not set/);
  const base = { TG_API_ID: '123', TG_API_HASH: 'h', TG_SESSION: 's', PB_URL: 'https://x.test/f', PB_CRAWLER_KEY: 'k' };
  assert.deepEqual(readEnv(base), { apiId: 123, apiHash: 'h', session: 's', pbUrl: 'https://x.test/f', crawlerKey: 'k', pollSeconds: 60, backfill: 0, startDelay: 20, forwardGap: 1.5 });
  assert.throws(() => readEnv({ ...base, PB_URL: 'http://x.test/f' }), /PB_URL must start with https/);
  assert.equal(readEnv({ ...base, POLL_SECONDS: '30', BACKFILL_POSTS: '20' }).backfill, 20);
  assert.throws(() => readEnv({ ...base, POLL_SECONDS: 'x' }), /POLL_SECONDS must be a whole number/);
  assert.equal(readEnv({ ...base, FORWARD_GAP_SECONDS: '2.5' }).forwardGap, 2.5);
  assert.throws(() => readEnv({ ...base, FORWARD_GAP_SECONDS: '0.5' }), /FORWARD_GAP_SECONDS must be a number from 1 to 60/);
});
