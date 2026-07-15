// One saved-template row in the manager list (kept out of TemplateManager
// for the file budget): summary line + two-tap delete.
import { T, S } from '../../lib/theme';
import type { ListingTemplate } from '../../types/database';

export default function TemplateListRow({ t, confirming, onOpen, onAskDelete, onCancelDelete, onDelete }: {
  t: ListingTemplate;
  confirming: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 6, background: 'rgba(255,255,255,0.01)' }}>
      <div onClick={onOpen} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
          {t.name}
          {t.marketplace && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: T.ac3, color: T.ac2 }}>{t.marketplace}</span>}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
          {t.fields.length} fields · {t.fields.filter(f => f.allowed?.length).length} with dropdowns · {t.fields.filter(f => f.fixed).length} fixed{t.file_name ? ` · exports into ${t.file_name}` : ''} — tap to edit
        </div>
      </div>
      {confirming ? (
        <>
          <button onClick={onDelete} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
          <button onClick={onCancelDelete} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
        </>
      ) : (
        <button onClick={onAskDelete} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
      )}
    </div>
  );
}
