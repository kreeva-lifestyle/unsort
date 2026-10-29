// Results panel for the Catalog maker: one or many generated pages. Each
// page gets the rate card's preview + WhatsApp / Share / Save panel; with
// several pages a bar on top shares or saves them all in one go.
// "Save all" is ONE zip file: browsers refuse a burst of downloads from one
// tap (Chrome blocks every file after the first until "multiple downloads"
// is allowed; iPhone Safari keeps only the first), which is how a 14-page
// catalog used to save as 3 or 4 pages.
import { zipSync } from 'fflate';
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
  const saveAll = async () => {
    try {
      const entries: Record<string, Uint8Array> = {};
      for (let i = 0; i < pages.length; i++) entries[fileOf(i).name] = new Uint8Array(await pages[i].blob.arrayBuffer());
      const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }); // JPEGs do not shrink; level 0 is instant
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a'); a.href = url; a.download = exportName(label, [name, `${pages.length}-pages`, fileDate()], 'zip'); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      addToast(`${pages.length} pages saved as one ZIP — unzip it to get every page`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
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
            <button onClick={saveAll} style={{ ...S.btnGhost, minHeight: 36 }}>Save all (ZIP)</button>
          </div>
        </div>
      )}
      {pages.map((p, i) => (
        <RateCardActions key={p.url} result={p} catalogName={pages.length > 1 ? `${name} p${i + 1}` : name} fileLabel={label} addToast={addToast} />
      ))}
    </div>
  );
}
