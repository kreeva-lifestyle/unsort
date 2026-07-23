import React from 'react';
import { T, S } from '../../lib/theme';

const ILLUSTRATIONS: Record<string, React.ReactNode> = {
  'box': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><rect x="8" y="24" width="48" height="32" rx="4" stroke="#6366F1" strokeWidth="2" opacity=".5" /><path d="M8 32h48" stroke="#6366F1" strokeWidth="1.5" opacity=".3" /><path d="M4 24l12-12h32l12 12" stroke="#818CF8" strokeWidth="2" /><path d="M32 12v20" stroke="#6366F1" strokeWidth="1.5" opacity=".4" /><circle cx="32" cy="40" r="6" stroke="#818CF8" strokeWidth="1.5" /><path d="M29 40l2 2 4-4" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  'receipt': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><rect x="12" y="6" width="40" height="52" rx="4" stroke="#6366F1" strokeWidth="2" opacity=".5" /><path d="M20 18h24M20 26h18M20 34h22M20 42h12" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" opacity=".4" /><circle cx="46" cy="48" r="10" fill="#060810" stroke="#22C55E" strokeWidth="2" /><path d="M42 48h8M46 44v8" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  'clipboard': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><rect x="14" y="10" width="36" height="46" rx="4" stroke="#6366F1" strokeWidth="2" opacity=".5" /><rect x="22" y="4" width="20" height="12" rx="3" stroke="#818CF8" strokeWidth="1.5" /><path d="M22 26h20M22 34h16M22 42h12" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" opacity=".4" /></svg>,
  'tag': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><path d="M8 12l24-4 24 24-20 20-24-24z" stroke="#6366F1" strokeWidth="2" opacity=".5" /><circle cx="22" cy="22" r="4" stroke="#818CF8" strokeWidth="1.5" /><path d="M36 28l8 8M40 28l4 4" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" opacity=".6" /></svg>,
  'search': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><circle cx="28" cy="28" r="14" stroke="#6366F1" strokeWidth="2" opacity=".5" /><path d="M38 38l14 14" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" /><path d="M22 28h12M28 22v12" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" opacity=".3" /></svg>,
  'handshake': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><path d="M6 30h10l8-6 8 6h4l8-6 8 6h6" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" opacity=".5" /><path d="M20 30v16l12 6 12-6V30" stroke="#818CF8" strokeWidth="2" strokeLinejoin="round" opacity=".4" /><path d="M26 38l6 4 6-4" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  'warning': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><path d="M32 8L4 56h56L32 8z" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" opacity=".5" /><path d="M32 26v14" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" /><circle cx="32" cy="46" r="2" fill="#F59E0B" /></svg>,
  'phone': <svg viewBox="0 0 64 64" fill="none" style={{ width: 40, height: 40 }}><rect x="16" y="4" width="32" height="56" rx="6" stroke="#6366F1" strokeWidth="2" opacity=".5" /><path d="M16 14h32M16 48h32" stroke="#818CF8" strokeWidth="1.5" opacity=".3" /><circle cx="32" cy="52" r="2" stroke="#818CF8" strokeWidth="1.5" opacity=".4" /><path d="M26 26h12M24 32h16M26 38h12" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" opacity=".3" /></svg>,
};

export default function Empty({
  icon = 'clipboard',
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
  const illustration = ILLUSTRATIONS[icon];
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.bd2}`, borderRadius: 12, padding: '40px 24px', textAlign: 'center' as const, animation: 'fi .2s ease' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'oklch(0.55 0.22 265 / .06)', border: `1px solid oklch(0.55 0.22 265 / .12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: illustration ? 0 : 28 }}>
        {illustration || icon}
      </div>
      <div style={{ fontSize: 14, color: T.tx, fontWeight: 700, fontFamily: T.sora, marginBottom: 6 }}>{title}</div>
      {message && <div style={{ fontSize: 12, color: T.tx3, marginBottom: cta ? 16 : 0, maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>{message}</div>}
      {cta && onCta && (
        <button onClick={onCta} style={{ ...S.btnPrimary, marginTop: 16 }}>{cta}</button>
      )}
    </div>
  );
}
