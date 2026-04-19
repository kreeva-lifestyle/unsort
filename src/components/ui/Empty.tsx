// Shared empty-state card — replaces scattered "No rows" grey-text stubs.
// Audit P2: give a fresh page an icon, an instruction, and a CTA.
import { T } from '../../lib/theme';

export default function Empty({
  icon = '📋',
  title,
  message,
  cta,
  onCta,
}: {
  icon?: string;
  title: string;
  message?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.bd2}`, borderRadius: 10, padding: '36px 24px', textAlign: 'center' as const, animation: 'fi .15s ease' }}>
      <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: 13, color: T.tx, fontWeight: 600, fontFamily: T.sora, marginBottom: 4 }}>{title}</div>
      {message && <div style={{ fontSize: 12, color: T.tx3, marginBottom: cta ? 14 : 0, maxWidth: 320, margin: '0 auto', lineHeight: 1.5 }}>{message}</div>}
      {cta && onCta && (
        <button onClick={onCta} style={{ marginTop: 14, padding: '7px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', cursor: 'pointer', boxShadow: '0 2px 10px rgba(99,102,241,.25)' }}>{cta}</button>
      )}
    </div>
  );
}
