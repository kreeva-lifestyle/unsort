import { T } from '../../../lib/theme';

export default function SectionTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 20 }}>
      <div style={{ width: 4, height: 18, borderRadius: 2, background: color }} />
      <span className="prg-section-title" style={{ fontSize: 13, fontWeight: 700, fontFamily: T.sora, textTransform: 'uppercase', letterSpacing: 1.5, color }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.bd} 0%, transparent 100%)` }} />
    </div>
  );
}
