// The OTP Inbox settings panel: which Dropbox folder courier delivery-sheet
// PDFs get filed into (app_settings.otp_delivery_sheet_folder — one global
// value, used server-side by the otp-inbox edge function).
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

export default function OtpFolderSetting({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [folder, setFolder] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'otp_delivery_sheet_folder').maybeSingle()
      .then(({ data }) => { if (typeof data?.value === 'string') setFolder(data.value); });
  }, []);

  const save = async () => {
    if (saving) return;
    const v = folder.trim().replace(/\/+$/, '');
    const path = v ? (v.startsWith('/') ? v : `/${v}`) : '';
    if (!path) { addToast('Type the Dropbox folder first — e.g. /Delivery Sheets', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'otp_delivery_sheet_folder', value: path, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setFolder(path);
    addToast(`Delivery sheets will save to ${path}`, 'success');
  };

  return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <label style={S.fLabel}>Dropbox folder for courier delivery sheets</label>
      <div style={{ fontSize: 10.5, color: T.tx3, lineHeight: 1.6, margin: '2px 0 8px' }}>
        When a courier SMS (Shadowfax, Delhivery etc.) carries a delivery-sheet link, the sheet is saved here automatically as a PDF named by date and courier — e.g. 26-08-2026 - Delhivery.pdf. Couriers are recognised from the names saved in PackStation settings.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="/Delivery Sheets"
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          style={{ ...S.fInput, flex: 1, minWidth: 180, fontFamily: T.mono }} />
        <button onClick={save} disabled={saving}
          style={{ ...S.btnPrimary, minHeight: 36, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
