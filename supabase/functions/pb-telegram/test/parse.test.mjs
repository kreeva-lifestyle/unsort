// node --test --experimental-strip-types supabase/functions/pb-telegram/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdate } from '../parse.ts';

const group = { id: -1009876543210, type: 'supergroup', title: 'Arya admin' };
const channel = { id: -1001234567890, type: 'channel', title: 'KUMARI ART', username: 'KUMARI_ART' };
const fwd = (extra) => ({ update_id: 77, message: { message_id: 5, chat: group, forward_origin: { type: 'channel', chat: channel, message_id: 4210, date: 1 }, ...extra } });

test('/link code in a group', () => {
  assert.equal(parseUpdate({ message: { message_id: 1, chat: group, text: '/link 123456' } }).link, '123456');
  assert.equal(parseUpdate({ message: { message_id: 1, chat: group, text: '/link@PlaybookBot 004321' } }).link, '004321');
  assert.equal(parseUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, text: '/link 123456' } }).link, undefined);
});

test('forwarded photo: largest size, origin from the channel', () => {
  const r = parseUpdate(fwd({ media_group_id: 'g1', caption: 'CODE KA-5070', photo: [
    { file_id: 'small', file_unique_id: 's', width: 90, height: 90, file_size: 1000 },
    { file_id: 'big', file_unique_id: 'b', width: 1280, height: 1280, file_size: 200000 },
  ] })).row;
  assert.equal(r.kind, 'photo'); assert.equal(r.file_id, 'big'); assert.equal(r.file_size, 200000);
  assert.equal(r.origin_chat_id, -1001234567890); assert.equal(r.origin_username, 'kumari_art');
  assert.equal(r.origin_message_id, 4210); assert.equal(r.media_group_id, 'g1'); assert.equal(r.text, 'CODE KA-5070');
  assert.equal(r.update_id, 77); assert.equal(r.chat_id, -1009876543210);
});

test('video, image document, sticker, text, legacy forward', () => {
  assert.equal(parseUpdate(fwd({ video: { file_id: 'v', file_unique_id: 'vu', file_size: 95000000, mime_type: 'video/mp4' } })).row.kind, 'video');
  assert.equal(parseUpdate(fwd({ document: { file_id: 'd', file_unique_id: 'du', mime_type: 'image/png' } })).row.kind, 'photo');
  assert.equal(parseUpdate(fwd({ document: { file_id: 'd', file_unique_id: 'du', mime_type: 'application/pdf' } })).row.kind, 'other');
  assert.equal(parseUpdate(fwd({ sticker: { file_id: 's' } })).row.kind, 'other');
  assert.equal(parseUpdate(fwd({ text: 'RATE :- 1600/-INR' })).row.kind, 'text');
  const legacy = parseUpdate({ update_id: 1, message: { message_id: 9, chat: group, text: '200 Less', forward_from_chat: channel, forward_from_message_id: 4211 } }).row;
  assert.equal(legacy.origin_message_id, 4211); assert.equal(legacy.kind, 'text');
});

test('not forwarded → no row; forwarded from a person → row with no origin yet; supergroup migration', () => {
  assert.equal(parseUpdate({ message: { message_id: 3, chat: group, text: 'hello' } }).row, undefined);
  const u = parseUpdate({ message: { message_id: 3, chat: group, forward_origin: { type: 'user', sender_user: { id: 1 } }, text: 'x' } }).row;
  assert.equal(u.origin_chat_id, null); assert.equal(u.origin_message_id, null); assert.equal(u.kind, 'text');
  assert.deepEqual(parseUpdate({ message: { message_id: 3, chat: { id: -55, type: 'group' }, migrate_to_chat_id: -100555 } }).migrate, { from: -55, to: -100555 });
  assert.deepEqual(parseUpdate({ edited_message: {} }), {});
});
