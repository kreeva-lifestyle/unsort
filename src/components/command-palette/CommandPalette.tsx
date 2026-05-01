import { useState, useEffect, useRef, useCallback } from 'react';
import { T, Icon } from '../../lib/theme';
import type { Command } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const grouped = {
    action: filtered.filter(c => c.category === 'action'),
    navigate: filtered.filter(c => c.category === 'navigate'),
  };

  const flatList = [...grouped.action, ...grouped.navigate];

  useEffect(() => { if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  const run = useCallback((cmd: Command) => { onClose(); setTimeout(() => cmd.action(), 50); }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatList.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && flatList[selected]) { e.preventDefault(); run(flatList[selected]); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, selected, flatList, onClose, run]);

  if (!open) return null;

  const catLabel: Record<string, string> = { action: 'Actions', navigate: 'Navigate' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', paddingTop: 'min(20vh, 140px)' }} onClick={onClose}>
      <div style={{ background: 'rgba(14,18,30,0.98)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: 520, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 24px 80px rgba(0,0,0,.65)', overflow: 'hidden', animation: 'fi .12s ease' }} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Type a command or search..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.tx, fontFamily: T.sans, fontSize: 15, fontWeight: 400 }} />
          <span style={{ fontSize: 10, color: T.tx3, padding: '2px 6px', border: `1px solid ${T.bd}`, borderRadius: 4, fontFamily: T.mono }}>esc</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {flatList.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>No matching commands</div>
          )}
          {(['action', 'navigate'] as const).map(cat => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div style={{ padding: '8px 16px 4px', fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>{catLabel[cat]}</div>
                {items.map(cmd => {
                  const idx = flatList.indexOf(cmd);
                  const isActive = idx === selected;
                  return (
                    <div key={cmd.id}
                      onClick={() => run(cmd)}
                      onMouseEnter={() => setSelected(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', background: isActive ? 'rgba(99,102,241,.10)' : 'transparent', transition: 'background .08s' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: isActive ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? T.ac2 : T.tx3, flexShrink: 0 }}>
                        {cmd.icon ? <Icon name={cmd.icon} size={14} /> : <span style={{ fontSize: 12 }}>⚡</span>}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, color: isActive ? T.tx : T.tx2, fontWeight: isActive ? 500 : 400 }}>{cmd.label}</span>
                      {cmd.shortcut && <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, padding: '2px 6px', border: `1px solid ${T.bd}`, borderRadius: 4 }}>{cmd.shortcut}</span>}
                      {isActive && <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>↵</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 12, justifyContent: 'center' }}>
          {[
            { label: 'Navigate', key: '↑↓' },
            { label: 'Select', key: '↵' },
            { label: 'Close', key: 'esc' },
          ].map(h => (
            <span key={h.label} style={{ fontSize: 9, color: T.tx3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: T.mono, padding: '1px 4px', border: `1px solid ${T.bd}`, borderRadius: 3, fontSize: 8 }}>{h.key}</span>
              {h.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
