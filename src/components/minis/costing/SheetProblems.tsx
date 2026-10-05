// The save-time problem list — every line is TAPPABLE and scrolls to the
// field it is about (owner's ask: no hunting). Targets are data-fx markers
// (component cards, sub rows) or element ids (SKU, category); the first
// VISIBLE match wins. The phone bar's "to fix" sheet reuses jumpTo.
import { T, S } from '../../../lib/theme';
import { SheetProblem } from './costingModel';

const find = (target: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-fx="${target}"], #${CSS.escape(target)}`)].find(e => e.offsetParent !== null);

export const jumpTo = (target: string) => {
  // A line inside a folded card has no row on screen: land on the card.
  const el = find(target) ?? find(target.replace(/^(cost-f-\d+)-\d+$/, '$1'));
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
};

export default function SheetProblems({ problems, onJump = jumpTo }: { problems: SheetProblem[]; onJump?: (target: string) => void }) {
  if (problems.length === 0) return null;
  return (
    <div data-fx="cost-problems" style={{ ...S.errorBox, marginTop: 12, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{problems.length} thing{problems.length === 1 ? '' : 's'} to fix — tap one</div>
      {problems.slice(0, 8).map((e, i) => (
        <div key={i} className="cost-problem" onClick={() => onJump(e.target)} role="button"
          style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>• {e.msg}</span>
          <span style={{ fontSize: 9, opacity: 0.7, textDecoration: 'underline', whiteSpace: 'nowrap', color: T.re }}>fix</span>
        </div>
      ))}
      {problems.length > 8 && <div style={{ paddingTop: 4 }}>…and {problems.length - 8} more</div>}
    </div>
  );
}
