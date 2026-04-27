import { T } from '../../lib/theme';

interface Props { label: string; id: string; onUndo: () => void; onDismiss: () => void }

export default function UndoBar({ label, id, onUndo, onDismiss }: Props) {
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 260 }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{label}</span>
        <span onClick={onUndo} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: T.yl, color: '#000' }}>Undo</span>
        <span onClick={onDismiss} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span>
      </div>
      <div className="undo-bar" key={id} />
    </div>
  );
}
