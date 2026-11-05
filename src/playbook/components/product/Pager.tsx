// Prev / "1 / N" / Next + item count (Playbook pages, 25 per page). The noun
// defaults to "product" so existing callers read as before; Vendors passes
// noun="vendor".
import { PB, pbBtnSecondary, pbNum } from '../../pbTheme';
import PbIcon from '../ui/PbIcon';

export default function Pager({ page, pageSize, count, onPage, noun = 'product', nounPlural }: {
  page: number; pageSize: number; count: number; onPage: (p: number) => void; noun?: string; nounPlural?: string;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const btn = (disabled: boolean) => ({ ...pbBtnSecondary, minWidth: 88, padding: '0 12px', opacity: disabled ? 0.3 : 1, pointerEvents: disabled ? 'none' as const : 'auto' as const });
  const atStart = page === 0, atEnd = page >= pages - 1;
  return (
    <nav aria-label="Pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="pb-pill" onClick={() => onPage(page - 1)} disabled={atStart} style={btn(atStart)}>
          <PbIcon name="chevronLeft" size={16} />Prev
        </button>
        <span style={{ ...pbNum, fontSize: 12, color: PB.tx2, whiteSpace: 'nowrap' }} aria-live="polite">
          <span className="pb-sr">Page </span>{page + 1}<span aria-hidden="true"> / </span><span className="pb-sr"> of </span>{pages}
        </span>
        <button type="button" className="pb-pill" onClick={() => onPage(page + 1)} disabled={atEnd} style={btn(atEnd)}>
          Next<PbIcon name="chevronRight" size={16} />
        </button>
      </div>
      <span style={{ fontSize: 12, color: PB.tx2 }} aria-live="polite">
        <span style={pbNum}>{count.toLocaleString('en-IN')}</span> {count === 1 ? noun : (nounPlural ?? `${noun}s`)}
      </span>
    </nav>
  );
}
