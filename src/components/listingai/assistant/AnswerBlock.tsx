// One assistant answer: the narration, the caveats that change how to read it,
// the two export/handoff actions, and the complete result tables. Split out of
// MasterAssistant.tsx to keep that file inside the 200-line budget.
import { T, S } from '../../../lib/theme';
import AssistantTables, { AssistantTable } from './AssistantTables';
import type { ComparisonReport } from './buildReport';
import { downloadComparisonWorkbook } from './reportWorkbook';
import { activeNotUploadedSkus, writeListingHandoff } from '../listingHandoff';

export interface Msg {
  role: 'user' | 'assistant';
  text: string;
  tables?: AssistantTable[];
  report?: ComparisonReport | null;
  warnings?: string[];
  estUsd?: number;
}

export default function AnswerBlock({ msg, addToast, openListingAI }: {
  msg: Msg;
  addToast: (m: string, t?: string) => void;
  openListingAI?: () => void;
}) {
  const rep = msg.report;
  const genSkus = rep && openListingAI ? activeNotUploadedSkus(rep) : [];

  return (
    <div style={{ maxWidth: '95%' }}>
      <div style={{ padding: '10px 12px', borderRadius: 10, background: T.s2, border: `1px solid ${T.bd}`, fontSize: 12, color: T.tx2, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.text}</div>

      {/* Caveats stay on screen. As toasts they vanished in seconds — but a
          truncated sheet or an exhausted match budget changes what every
          number above actually means. Same set the workbook Summary carries. */}
      {!!msg.warnings?.length && (
        <div style={{ marginTop: 8, background: 'oklch(0.78 0.18 75 / .1)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '9px 11px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.yl, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Read these before acting on the numbers</div>
          {msg.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: T.tx2, lineHeight: 1.55, marginTop: i ? 4 : 0 }}>· {w}</div>
          ))}
        </div>
      )}

      {rep && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { downloadComparisonWorkbook(rep); addToast('Excel report downloaded', 'success'); }}
              style={{ ...S.btnPrimary, minHeight: 40, fontSize: 12 }}>
              ⬇ Download Excel report
            </button>
            {genSkus.length > 0 && (
              <button onClick={() => { writeListingHandoff({ skus: genSkus, seller: rep.seller }); openListingAI!(); }}
                style={{ ...S.btnGhost, minHeight: 40, fontSize: 12 }}>
                ✦ Generate listings for not-uploaded ({genSkus.length})
              </button>
            )}
          </div>
          {/* Say what is in the file before it gets mailed to a seller. */}
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.6 }}>
            4 sheets — Summary · Mark Out of Stock ({rep.stockOut.length}) · Mark In Stock ({rep.inStock.length}) · Not Uploaded ({rep.notUploaded.length})
          </div>
          {genSkus.length > 0 && (
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.5 }}>
              Opens Listing AI with these SKUs pre-filled. Pick this seller&rsquo;s own Listing Template there — if it isn&rsquo;t saved yet, upload the seller&rsquo;s blank sheet once via Manage Templates; the filled file downloads in that exact column format. Price columns are never AI-filled.
            </div>
          )}
        </div>
      )}

      {msg.tables && <AssistantTables tables={msg.tables} />}
      {!!msg.estUsd && <div style={{ fontSize: 9, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>~${msg.estUsd.toFixed(4)}</div>}
    </div>
  );
}
