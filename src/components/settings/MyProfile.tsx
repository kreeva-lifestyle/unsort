// Personal settings (Phone + Cash PIN) — accessible to every authenticated user.
// Extracted from Users.tsx so operators/viewers can set their own PIN without
// needing admin privileges, which was blocking cash-handover confirmation.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

export default function MyProfile({ addToast, profile }: { addToast: (msg: string, type?: string) => void; profile: any }) {
  const [pinExists, setPinExists] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const loadPin = useCallback(async () => {
    if (!profile?.id) return;
    const { data: pin } = await supabase.rpc('get_own_pin');
    setPinExists(!!pin);
    const { data: prof } = await supabase.from('profiles').select('phone').eq('id', profile.id).maybeSingle();
    setMyPhone(prof?.phone || '');
  }, [profile?.id]);

  useEffect(() => { loadPin(); }, [loadPin]);

  const savePhone = async () => {
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length !== 10) { addToast('Phone must be 10 digits', 'error'); return; }
    setPhoneSaving(true);
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', profile.id);
    setPhoneSaving(false);
    if (error) { addToast('Save failed — ' + friendlyError(error), 'error'); return; }
    setMyPhone(cleaned);
    setPhoneEditing(false);
    addToast('Phone saved', 'success');
  };

  const saveMyPin = async () => {
    setPinError('');
    if (newPin.length < 4 || newPin.length > 6) { setPinError('PIN must be 4-6 digits'); return; }
    if (!/^\d+$/.test(newPin)) { setPinError('PIN must be digits only'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
    setPinSaving(true);
    const { error } = await supabase.from('profiles').update({ cash_pin: newPin }).eq('id', profile.id);
    setPinSaving(false);
    if (error) { setPinError('Save failed — ' + friendlyError(error)); return; }
    setNewPin(''); setConfirmPin(''); setEditingPin(false);
    await loadPin();
    addToast('Cash PIN saved successfully', 'success');
  };

  const removePin = async () => {
    if (!confirm('Remove your Cash PIN? You will not be able to confirm cash handovers without it.')) return;
    const { error } = await supabase.from('profiles').update({ cash_pin: null }).eq('id', profile.id);
    if (error) { addToast('Remove failed — ' + friendlyError(error), 'error'); return; }
    await loadPin();
    addToast('Cash PIN removed', 'success');
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
        Signed in as <strong style={{ color: T.tx }}>{profile?.full_name || profile?.email}</strong> · <span style={{ textTransform: 'capitalize' as const, color: T.ac2 }}>{profile?.role}</span>
      </div>

      {/* My Phone — required for WhatsApp notifications */}
      <div style={{ background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.gr, fontFamily: T.sora }}>My Phone Number</div>
          {!phoneEditing && (myPhone.length === 10 ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase' as const }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' as const }}>Required</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to receive WhatsApp notifications for cash handovers and payment alerts.</div>

        {!phoneEditing ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {myPhone.length === 10 ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 1 }}>+91 {myPhone.slice(0, 5)} {myPhone.slice(5)}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' as const }}>No phone number saved</span>
            )}
            <button onClick={() => { setPhoneInput(myPhone); setPhoneEditing(true); }} style={S.btnPrimary}>{myPhone.length === 10 ? 'Edit' : 'Add Phone'}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="tel" inputMode="numeric" value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" autoFocus style={{ ...S.fInput, fontFamily: T.mono, flex: 1, maxWidth: 220, fontSize: 13 }} />
            <button onClick={savePhone} disabled={phoneSaving} style={{ ...S.btnPrimary, opacity: phoneSaving ? 0.6 : 1 }}>{phoneSaving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => { setPhoneEditing(false); setPhoneInput(''); }} style={S.btnGhost}>Cancel</button>
          </div>
        )}
      </div>

      {/* My Cash PIN — for confirming cash handovers */}
      <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.yl, fontFamily: T.sora }}>My Cash PIN</div>
          {!editingPin && (pinExists ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Not Set</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to sign cash handovers received from accountant. 4-6 digits.</div>

        {!editingPin ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {pinExists ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 6 }}>{'•••••'}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' as const }}>No PIN configured</span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setEditingPin(true); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnPrimary}>{pinExists ? 'Edit' : 'Set PIN'}</button>
              {pinExists && <button onClick={removePin} style={S.btnDanger}>Remove</button>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>{pinExists ? 'New PIN' : 'PIN'}</label>
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" autoFocus style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center' as const, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>Confirm PIN</label>
                <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center' as const, fontSize: 14 }} />
              </div>
            </div>
            {pinError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '5px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{pinError}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={saveMyPin} disabled={pinSaving} style={{ ...S.btnPrimary, opacity: pinSaving ? 0.6 : 1 }}>{pinSaving ? 'Saving...' : 'Save PIN'}</button>
              <button onClick={() => { setEditingPin(false); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
