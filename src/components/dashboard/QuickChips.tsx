// Dashboard "Quick access" strip: the user's own pinned shortcuts to modules
// and Minis tools, saved on their profile (profiles.quick_chips) so they
// follow across devices. Only targets the user can open are offered or
// shown. "+" opens the picker; Edit turns on remove / reorder.
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { resolveChips, defaultChips, openShortcut, MAX_QUICK_CHIPS } from '../../lib/shortcuts';
import type { Shortcut } from '../../lib/shortcuts';
import QuickChipsPicker from './QuickChipsPicker';

export default function QuickChips({ navigateTo }: { navigateTo?: (tab: string) => void }) {
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [ids, setIds] = useState<string[] | null>(null); // null = not loaded yet
  const [custom, setCustom] = useState(false);            // false = showing the role defaults
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    supabase.from('profiles').select('quick_chips').eq('id', profile.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) { addToast(friendlyError(error), 'error'); setIds([]); return; }
      const saved = Array.isArray(data?.quick_chips) ? (data!.quick_chips as string[]) : [];
      setCustom(saved.length > 0);
      setIds(saved);
    });
    return () => { alive = false; };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = useMemo<Shortcut[]>(() => (ids && custom ? resolveChips(ids, profile) : defaultChips(profile)), [ids, custom, profile]);

  const save = async (next: Shortcut[]) => {
    if (!profile?.id || saving) return;
    const nextIds = next.map(s => s.id).slice(0, MAX_QUICK_CHIPS);
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ quick_chips: nextIds }).eq('id', profile.id);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setIds(nextIds); setCustom(nextIds.length > 0);
    if (nextIds.length === 0) setEditing(false);
    addToast(nextIds.length === 0 ? 'Shortcuts reset to the suggestions' : 'Shortcuts saved', 'success');
  };
  // One save at a time: while it is in flight the strip is dimmed and its
  // buttons are disabled, so a second tap is refused visibly, not dropped.
  const busy: React.CSSProperties = saving ? { pointerEvents: 'none', opacity: 0.5 } : {};
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= chips.length) return; const n = chips.slice(); [n[i], n[j]] = [n[j], n[i]]; save(n); };

  if (!navigateTo || ids === null) return null;
  const chip = (s: Shortcut, i: number) => (
    <div key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {editing && <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || saving} aria-label={`Move ${s.label} earlier`} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 6px', opacity: i === 0 ? 0.3 : 1 }}>‹</button>}
      <button type="button" disabled={saving} onClick={() => (editing ? save(chips.filter(c => c.id !== s.id)) : openShortcut(s, navigateTo))} aria-label={editing ? `Remove ${s.label}` : `Open ${s.label}`}
        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 34, padding: '5px 12px', fontSize: 11, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: editing ? 'oklch(0.63 0.22 25 / .4)' : undefined }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.kind === 'mini' ? '#D9BC7E' : T.ac2, flexShrink: 0 }} />
        {s.label}{editing && <span style={{ color: T.re, marginLeft: 2 }}>×</span>}
      </button>
      {editing && <button type="button" onClick={() => move(i, 1)} disabled={i === chips.length - 1 || saving} aria-label={`Move ${s.label} later`} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 6px', opacity: i === chips.length - 1 ? 0.3 : 1 }}>›</button>}
    </div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>Quick access{!custom && chips.length > 0 ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · suggested — tap + to make it yours</span> : null}</span>
        {custom && <button type="button" onClick={() => setEditing(e => !e)} style={{ border: 'none', background: 'none', color: editing ? T.ac2 : T.tx3, fontSize: 11, cursor: 'pointer', padding: '4px 6px', minHeight: 30 }}>{saving ? 'Saving…' : editing ? 'Done' : 'Edit'}</button>}
      </div>
      <div aria-busy={saving} style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2, flexWrap: 'wrap', ...busy }}>
        {chips.map(chip)}
        {!editing && chips.length < MAX_QUICK_CHIPS && (
          <button type="button" disabled={saving} onClick={() => setPicking(true)} aria-label="Add a shortcut" style={{ ...S.btnGhost, ...S.btnSm, minHeight: 34, padding: '5px 12px', fontSize: 11, borderRadius: 999, borderStyle: 'dashed', flexShrink: 0 }}>+ Add</button>
        )}
      </div>
      {picking && <QuickChipsPicker current={chips} onClose={() => setPicking(false)} onSave={next => { setPicking(false); save(next); }} />}
    </div>
  );
}
