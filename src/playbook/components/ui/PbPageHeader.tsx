// Page header row (layout-and-components.md §3, DESIGN.md §7). Pages own it.
// Desktop: [‹ Back label] Sora 32 title … actions (primary last).
// Phone:   [logo | 44px glass back] Sora 20 title … ONE action (phoneAction,
//          else `actions`). It scrolls away with the content; no blur.
import type { ReactNode } from 'react';
import { PlaybookMark } from '../../../components/brand/DivisionLogos';
import { PB, pbIconBtn, pbMeta, pbPageTitle } from '../../pbTheme';
import PbIcon from './PbIcon';

type Props = {
  title: ReactNode;
  /** Back to a parent page: "Products". aria-label becomes "Back to Products". */
  back?: { label: string; onBack: () => void };
  /** Desktop actions (and phone, unless phoneAction is given). Primary last. */
  actions?: ReactNode;
  /** Phone: at most one action (a 44px gradient + or "Save"). Pass null for none. */
  phoneAction?: ReactNode;
  /** One meta line under the title. Desktop only, unless phoneSub is set. */
  sub?: ReactNode;
  /** Also show `sub` on phone (e.g. the website name over a section). */
  phoneSub?: boolean;
  /** Phone shows the logo when there is no back button (default true). */
  logo?: boolean;
  /** id for the <h1>, e.g. for aria-labelledby. */
  id?: string;
};

/** Move focus to the visible page title (a detail view opening), so it never drops to <body>. */
export function focusPageTitle() {
  [...document.querySelectorAll<HTMLElement>('main h1')].find(h => h.offsetParent)?.focus({ preventScroll: true });
}

export function PbBackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} aria-label={`Back to ${label}`} className="pb-pill"
      style={{ ...pbIconBtn, width: 'auto', minWidth: 'var(--pb-icon-btn)', padding: 0, gap: 4, flexShrink: 0 }}>
      <span style={{ width: 'var(--pb-icon-btn)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><PbIcon name="chevronLeft" size={18} /></span>
      <span className="pb-desk-only" style={{ paddingRight: 14, color: PB.tx2, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

export default function PbPageHeader({ title, back, actions, phoneAction, sub, phoneSub, logo = true, id }: Props) {
  const phone = phoneAction === undefined ? actions : phoneAction;
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--pb-pad-tile)', minWidth: 0, flexWrap: 'wrap' }}>
      {back ? <PbBackButton label={back.label} onBack={back.onBack} />
        : logo && <span className="pb-phone-only" style={{ display: 'inline-flex' }}><PlaybookMark size={32} decorative /></span>}
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        {/* tabIndex -1: a detail view moves focus here when it opens (copy-and-a11y §B). */}
        {/* A long website / product name clamps to 2 lines (the full name stays in title=); the body shows it in full. */}
        <h1 id={id} tabIndex={-1} className="pb-clamp2" title={typeof title === 'string' ? title : undefined} style={{ ...pbPageTitle, outline: 'none' }}>{title}</h1>
        {sub != null && <div className={phoneSub ? undefined : 'pb-desk-only'} style={{ ...pbMeta, marginTop: 4, display: 'block' }}>{sub}</div>}
      </div>
      {actions != null && <div className="pb-desk-only" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>{actions}</div>}
      {phone != null && <div className="pb-phone-only" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>{phone}</div>}
    </header>
  );
}
