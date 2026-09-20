// Picker for the dashboard quick-access chips: modules and Minis tools the
// user is allowed to open, grouped, searchable, toggled on/off, capped at
// MAX_QUICK_CHIPS. Save writes the whole list back through QuickChips.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { SHORTCUTS, canUseShortcut, MAX_QUICK_CHIPS } from '../../lib/shortcuts';
import type { Shortcut } from '../../lib/shortcuts';

export default function QuickChipsPicker({ current, onClose, onSave }: {
  current: Shortcut[];
  onClose: () => void;
  onSave: (next: Shortcut[]) => void;
}) {
  const { profile } = useAuth();
  const [picked, setPicked] = useState<string[]>(current.map(s => s.id));
  const [q, setQ] = useState('');
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { document.body.classList.add('modal-open'); return () => document.body.classList.remove('modal-open'); }, []);

  const allowed = SHORTCUTS.filter(s => canUseShortcut(s, profile) && (!q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase())));
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_QUICK_CHIPS ? p : [...p, id]));
  const full = picked.length >= MAX_QUICK_CHIPS;
  const group = (kind: Shortcut['kind'], title: string) => {
    const items = allowed.filter(s => s.kind === kind);
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.fLabel, marginBottom: 6 }}>{title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {items.map(s => {
            const on = picked.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on} disabled={!on && full}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, padding: '6px 12px', fontSize: 11, borderRadius: 999, background: on ? T.ac3 : undefined, color: on ? T.ac2 : T.tx2, borderColor: on ? T.ac3 : undefined, opacity: !on && full ? 0.4 : 1 }}>
                {on ? '✓ ' : ''}{s.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  // Keep the user's existing order; append new picks in the order they were tapped.
  const next = () => picked.map(id => SHORTCUTS.find(s => s.id === id)).filter((s): s is Shortcut => !!s);

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Quick access</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search modules and tools…" style={{ ...S.fSearch, width: '100%' }} autoFocus />
          </div>
          <div style={{ fontSize: 10, color: full ? T.yl : T.tx3, marginBottom: 10 }}>{picked.length} of {MAX_QUICK_CHIPS} picked{full ? ' — remove one to add another' : ''}. Only what you can open is listed.</div>
          {group('module', 'Modules')}
          {group('mini', 'Minis tools')}
          {allowed.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Nothing matches.</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          <button type="button" onClick={() => onSave(next())} style={{ ...S.btnPrimary, minHeight: 44 }}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
