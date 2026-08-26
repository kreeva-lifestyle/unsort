// The save-time error list — every line is TAPPABLE and scrolls to the field
// it is about (owner's ask: no hunting). Targets are data-fx markers set on
// both the desktop table row and the mobile card for the same sub; the jump
// picks whichever is actually visible in the current layout.
import { T } from '../../../lib/theme';
import { SheetProblem } from './costingModel';

const jump = (target: string) => {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-fx="${target}"], #${CSS.escape(target)}`)]
    .find(e => e.offsetParent !== null);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el instanceof HTMLInputElement) el.focus();
};

export default function SheetProblems({ problems }: { problems: SheetProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 12, lineHeight: 1.5 }}>
      {problems.slice(0, 8).map((e, i) => (
        <div key={i} onClick={() => jump(e.target)} role="button"
          style={{ cursor: 'pointer', minHeight: 28, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>• {e.msg}</span>
          <span style={{ fontSize: 9, opacity: 0.7, textDecoration: 'underline', whiteSpace: 'nowrap' }}>tap to fix</span>
        </div>
      ))}
      {problems.length > 8 && <div style={{ paddingTop: 4 }}>…and {problems.length - 8} more</div>}
    </div>
  );
}
