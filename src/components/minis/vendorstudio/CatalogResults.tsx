// Results panel for the Catalog maker: one or many generated pages. Each
// page gets the rate card's preview + WhatsApp / Share / Save panel; with
// several pages a bar on top shares or saves them all in one go.
import { S, T } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { exportName, fileDate } from '../../../lib/exportName';
import RateCardActions from './RateCardActions';

export interface PageResult { url: string; blob: Blob }

export default function CatalogResults({ pages, label, title, addToast }: {
  pages: PageResult[];
  /** File-name prefix: 'Index' or 'Catalog'. */
  label: string;
  title: string;
  addToast: (m: string, t?: string) => void;
}) {
  const name = title.trim() || label;
  const fileOf = (i: number) => new File([pages[i].blob], exportName(label, [name, pages.length > 1 ? `p${i + 1}` : '', fileDate()].filter(Boolean), 'jpg'), { type: 'image/jpeg' });
  const saveAll = () => {
    pages.forEach((p, i) => { const a = document.createElement('a'); a.href = p.url; a.download = fileOf(i).name; a.click(); });
    addToast(`${pages.length} pages saved`, 'success');
  };
  const shareAll = async () => {
    const files = pages.map((_, i) => fileOf(i));
    try {
      if (navigator.canShare?.({ files }) && navigator.share) await navigator.share({ files, title: name });
      else saveAll();
    } catch (e: any) { if (e?.name !== 'AbortError') addToast(friendlyError(e), 'error'); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pages.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10 }}>
          <span style={{ fontSize: 11, color: T.tx2 }}>{pages.length} pages</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={shareAll} style={{ ...S.btnPrimary, minHeight: 36 }}>Share all</button>
            <button onClick={saveAll} style={{ ...S.btnGhost, minHeight: 36 }}>Save all</button>
          </div>
        </div>
      )}
      {pages.map((p, i) => (
        <RateCardActions key={p.url} result={p} catalogName={pages.length > 1 ? `${name} p${i + 1}` : name} fileLabel={label} addToast={addToast} />
      ))}
    </div>
  );
}
