// Playbook's home. A placeholder until the owner says what goes here.
import { T } from '../lib/theme';
import { PlaybookMark } from '../components/brand/DivisionLogos';

export default function PlaybookDashboard({ name }: { name: string }) {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{name ? `Hello, ${name}` : 'Dashboard'}</div>
        <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Playbook dashboard</div>
      </div>
      <div style={{ background: T.glass1, border: `1px dashed ${T.bd2}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', marginBottom: 14, opacity: 0.9 }}><PlaybookMark size={56} decorative /></div>
        <div style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.tx }}>Playbook is being set up</div>
        <div style={{ fontSize: 12, color: T.tx3, marginTop: 6, maxWidth: 360, marginInline: 'auto', lineHeight: 1.6 }}>
          The dashboard and tools for this division are coming soon. Everything you use every day is in DailyWork — switch with the button at the top.
        </div>
      </div>
    </>
  );
}
