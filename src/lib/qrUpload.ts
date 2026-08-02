// Shared helper: upload a per-employee payment QR image to the public
// `employee-qr` bucket and return its public URL. Mirrors the proven upload in
// components/settings/PaymentQR.tsx. The path is time-keyed (not employee-id
// keyed) so it works in add-mode (no employee id yet) and edit-mode alike.
import { supabase } from './supabase';
import { friendlyError } from './friendlyError';

export async function uploadQrImage(file: File): Promise<{ url?: string; error?: string }> {
  if (!file.type.startsWith('image/')) return { error: 'Please select an image file' };
  if (file.size > 5 * 1024 * 1024) return { error: 'Image must be under 5MB' };
  // Unguessable path + no upsert: a time-keyed name was enumerable (harvest every
  // employee's payment QR by guessing timestamps) and upsert-on-predictable-path
  // let anyone overwrite one with their own QR — payment-redirection fraud on a
  // public bucket. A random UUID closes both; a fresh name every upload means
  // upsert never applied anyway.
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `emp-qr-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('employee-qr').upload(path, file, { contentType: file.type });
  if (upErr) return { error: friendlyError(upErr) };
  const { data } = supabase.storage.from('employee-qr').getPublicUrl(path);
  return { url: data.publicUrl };
}
