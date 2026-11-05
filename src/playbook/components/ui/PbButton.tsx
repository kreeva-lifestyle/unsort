// Playbook button: primary (the one gradient per view) | secondary | danger,
// optionally icon-only (pass aria-label). Two-signal rule (root CLAUDE.md):
// `busy` swaps the label for `busyLabel` ("Saving…"), sets aria-busy and greys
// it out without the width jumping; `dim` greys out the screen's other
// buttons while one action runs. The success / friendlyError toast is the caller's.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { pbBtnDanger, pbBtnPrimary, pbBtnSecondary, pbIconBtn, PB } from '../../pbTheme';
import PbIcon from './PbIcon';

export type PbButtonKind = 'primary' | 'secondary' | 'danger';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  kind?: PbButtonKind;
  icon?: string;
  /** Square icon-only button; needs aria-label. */
  iconOnly?: boolean;
  busy?: boolean;
  busyLabel?: ReactNode;
  /** Another action on this screen is running. */
  dim?: boolean;
  /** Full width (sheet footers, More page). */
  block?: boolean;
  style?: CSSProperties;
};

export default function PbButton({ kind = 'secondary', icon, iconOnly, busy, busyLabel, dim, block, style, children, className, type, onClick, ...rest }: Props) {
  // pointer-events: none stops taps only; Enter / Space on a focused button (or
  // Enter in a form, for a submit) must not run the action twice either.
  const blocked = busy || dim;
  const base = iconOnly ? pbIconBtn : kind === 'primary' ? pbBtnPrimary : kind === 'danger' ? pbBtnDanger : pbBtnSecondary;
  const look: CSSProperties = {
    ...base,
    ...(iconOnly && kind === 'primary' ? { background: PB.brand, color: PB.onBrand, border: 'none' } : null),
    ...(iconOnly && kind === 'danger' ? { background: 'transparent', color: PB.dangerTx, borderColor: PB.dangerBd } : null),
    ...(block ? { width: '100%', borderRadius: PB.r.btn } : null),
    ...(busy || dim ? { pointerEvents: 'none', opacity: 0.5 } : null),
    ...(rest.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
    ...style,
  };
  const ico = icon ? <span className={busy && iconOnly ? 'pb-pulse' : undefined} style={{ display: 'inline-flex' }}><PbIcon name={icon} size={18} /></span> : null;
  return (
    <button type={type ?? 'button'} className={['pb-pill', className].filter(Boolean).join(' ')} aria-busy={busy || undefined}
      aria-disabled={blocked || undefined} style={look} {...rest}
      onClick={e => { if (blocked) { e.preventDefault(); return; } onClick?.(e); }}>
      {ico}
      {!iconOnly && children != null && (busyLabel == null ? children : (
        // Both labels share one grid cell, so the button keeps the wider width.
        <span style={{ display: 'inline-grid', minWidth: 0 }}>
          <span style={{ gridArea: '1 / 1', visibility: busy ? 'hidden' : 'visible', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
          <span style={{ gridArea: '1 / 1', visibility: busy ? 'visible' : 'hidden' }}>{busyLabel}</span>
        </span>
      ))}
    </button>
  );
}
