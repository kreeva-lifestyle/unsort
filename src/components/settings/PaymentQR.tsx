import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';

export default function PaymentQR({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingUpi, setSavingUpi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'payment_qr_url').maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', 'payment_upi_id').maybeSingle(),
    ]).then(([qr, upi]) => {
      if (qr.data?.value) setQrUrl(qr.data.value as string);
      if (upi.data?.value) setUpiId(upi.data.value as string);
    });
  }, []);

  const uploadQr = async (file: File) => {
    if (!file.type.startsWith('image/')) { addToast('Please select an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { addToast('Image must be under 5MB', 'error'); return; }
    setUploading(true);
    const path = `qr-${Date.now()}.${file.name.split('.').pop() || 'png'}`;
    const { error: upErr } = await supabase.storage.from('payment-qr').upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) { addToast(friendlyError(upErr), 'error'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('payment-qr').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    const { error: setErr } = await supabase.from('app_settings').upsert({ key: 'payment_qr_url', value: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (setErr) { addToast(friendlyError(setErr), 'error'); setUploading(false); return; }
    setQrUrl(publicUrl);
    addToast('QR code updated', 'success');
    setUploading(false);
  };

  const saveUpiId = async () => {
    setSavingUpi(true);
    const { error } = await supabase.from('app_settings').upsert({ key: 'payment_upi_id', value: upiId.trim(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) addToast(friendlyError(error), 'error');
    else addToast('UPI ID saved', 'success');
    setSavingUpi(false);
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 4 }}>Payment QR Code</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 16, lineHeight: 1.5 }}>Upload your UPI QR code image. This will be shared via WhatsApp when you click "Share QR" on a challan.</div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        {qrUrl ? (
          <img src={qrUrl} alt="Payment QR" style={{ width: '100%', maxWidth: 200, borderRadius: 8, marginBottom: 12 }} />
        ) : (
          <div style={{ padding: '30px 16px', color: T.tx3, fontSize: 11 }}>No QR code uploaded yet</div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadQr(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...S.btnPrimary, pointerEvents: uploading ? 'none' : 'auto', opacity: uploading ? 0.5 : 1 }}>
          {uploading ? 'Uploading…' : qrUrl ? 'Change QR Image' : 'Upload QR Image'}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={S.fLabel}>UPI ID</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={upiId} onChange={e => setUpiId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveUpiId(); }} placeholder="name@upi" style={{ ...S.fInput, fontFamily: T.mono, flex: 1 }} />
          <button onClick={saveUpiId} disabled={savingUpi} style={{ ...S.btnGhost, pointerEvents: savingUpi ? 'none' : 'auto', opacity: savingUpi ? 0.5 : 1 }}>{savingUpi ? 'Saving…' : 'Save'}</button>
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>This UPI ID is included in the WhatsApp message when sharing QR.</div>
      </div>
    </div>
  );
}
