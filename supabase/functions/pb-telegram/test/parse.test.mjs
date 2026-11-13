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

test('D13: when the channel posted it is kept (forward header), a junk date is not', () => {
  const at = 1794304800; // 2026-11-10 10:00 UTC
  const r = parseUpdate({ update_id: 1, message: { message_id: 6, chat: group, forward_origin: { type: 'channel', chat: channel, message_id: 4212, date: at }, text: 'CODE KA-5070 rate 1600' } }).row;
  assert.equal(r.origin_date, '2026-11-10T10:00:00.000Z');
  assert.equal(parseUpdate(fwd({ text: 'x' })).row.origin_date, null, 'date: 1 is not a date');
  const legacy = parseUpdate({ message: { message_id: 7, chat: group, forward_from_chat: channel, forward_from_message_id: 4213, forward_date: at, text: 'y' } }).row;
  assert.equal(legacy.origin_date, '2026-11-10T10:00:00.000Z');
  // From a person: no channel, so no channel date either (the crawler's mapping supplies both).
  const person = parseUpdate({ message: { message_id: 8, chat: group, forward_origin: { type: 'user', sender_user: { id: 1 }, date: at }, text: 'z' } }).row;
  assert.equal(person.origin_date, null);
});

test('D20: the bot removed from a chat, or added to it', () => {
  const mine = (status) => parseUpdate({ update_id: 5, my_chat_member: { chat: group, from: { id: 9 }, new_chat_member: { user: { id: 123456, is_bot: true }, status } } });
  assert.deepEqual(mine('kicked').member, { change: 'left', bot: true, users: [] }); assert.equal(mine('kicked').chat_id, group.id);
  assert.deepEqual(mine('left').member, { change: 'left', bot: true, users: [] });
  assert.deepEqual(mine('administrator').member, { change: 'joined', bot: true, users: [] });
  assert.equal(mine('creator').member, undefined);
  // The service message everyone in the group sees: the webhook compares the ids with the bot's own.
  assert.deepEqual(parseUpdate({ message: { message_id: 9, chat: group, left_chat_member: { id: 123456, is_bot: true } } }).member, { change: 'left', bot: false, users: [123456] });
  assert.deepEqual(parseUpdate({ message: { message_id: 10, chat: group, new_chat_members: [{ id: 7 }, { id: 123456 }] } }).member, { change: 'joined', bot: false, users: [7, 123456] });
  assert.equal(parseUpdate({ message: { message_id: 11, chat: group, text: 'hello' } }).member, undefined);
});
