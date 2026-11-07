// Settings → Telegram: one numbered step (number, name, status dot + label,
// body), and the small shared bits the three steps use (code box, copy).
import type { ReactNode } from 'react';
import { PB, pbName, pbNum } from '../../../pbTheme';
import { Dot } from '../../product/status';

export type StepState = { color: string; label: string };

export function TgStep({ n, title, state, children, id }: { n: number; title: string; state: StepState; children: ReactNode; id: string }) {
  return (
    <li aria-labelledby={id} style={{ listStyle: 'none', display: 'flex', gap: 12, minWidth: 0, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16 }}>
      <span aria-hidden="true" style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: PB.r.pill, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: PB.ctl, border: `1px solid ${PB.ctlBd}`, color: PB.tx, ...pbNum, fontSize: 14, fontWeight: 600,
      }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 32, minWidth: 0 }}>
          <h3 id={id} style={{ ...pbName, margin: 0 }}><span className="pb-sr">Step {n}: </span>{title}</h3>
          <Dot color={state.color} label={state.label} style={{ color: PB.tx }} />
        </div>
        {children}
      </div>
    </li>
  );
}

/** A value shown big in mono inside a framed box (link code, crawler key). */
export function TgValueBox({ children, big, label }: { children: ReactNode; big?: boolean; label: string }) {
  return (
    <div role="group" aria-label={label} style={{
      ...pbNum, fontSize: big ? 28 : 13, fontWeight: big ? 600 : 500, letterSpacing: big ? '0.12em' : 0, lineHeight: 1.4,
      color: PB.tx, background: PB.ctl, border: `1px solid ${PB.inputBd}`, borderRadius: PB.r.input,
      padding: big ? '8px 16px' : '12px 16px', overflowWrap: 'anywhere', wordBreak: 'break-all', minWidth: 0, userSelect: 'all',
    }}>{children}</div>
  );
}

/** Copy to the clipboard; false when the browser refused (the caller says "copy it by hand"). */
export async function copyText(s: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(s); return true; } catch { return false; }
}
