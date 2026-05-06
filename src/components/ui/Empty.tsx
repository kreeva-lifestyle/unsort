import { T, S } from '../../lib/theme';

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
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.bd2}`, borderRadius: 12, padding: '40px 24px', textAlign: 'center' as const, animation: 'fi .2s ease' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(99,102,241,.06)', border: `1px solid rgba(99,102,241,.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 14, color: T.tx, fontWeight: 700, fontFamily: T.sora, marginBottom: 6 }}>{title}</div>
      {message && <div style={{ fontSize: 12, color: T.tx3, marginBottom: cta ? 16 : 0, maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>{message}</div>}
      {cta && onCta && (
        <button onClick={onCta} style={{ ...S.btnPrimary, marginTop: 16 }}>{cta}</button>
      )}
    </div>
  );
}
