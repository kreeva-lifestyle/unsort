// Prev / "1 / N" / Next + item count (the app's standard pagination, fixed 25 per page).
import { T, S } from '../../../lib/theme';

export default function Pager({ page, pageSize, count, onPage }: { page: number; pageSize: number; count: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const btn = (disabled: boolean) => ({ ...S.btnGhost, minHeight: 44, minWidth: 64, opacity: disabled ? 0.3 : 1, pointerEvents: disabled ? 'none' as const : 'auto' as const });
  return (
    <div style={{ ...S.flexBetween, gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} style={btn(page === 0)}>Prev</button>
        <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} style={btn(page >= pages - 1)}>Next</button>
      </div>
      <span style={{ fontSize: 11, color: T.tx3 }}>{count} product{count === 1 ? '' : 's'}</span>
    </div>
  );
}
