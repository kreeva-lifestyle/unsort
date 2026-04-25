import { T, S } from '../../lib/theme';
import MatchingCompanyRepeater from './components/MatchingCompanyRepeater';
import type { ProgramFormData, Program } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  form: ProgramFormData;
  setField: <K extends keyof ProgramFormData>(key: K, value: ProgramFormData[K]) => void;
  editing: Program | null;
  error: string;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

export default function ProgramForm({ form, setField, editing, error, saving, onSave, onClose, t }: Props) {
  const isSkuError = error === 'skuRequired';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)', padding: 16 }} onClick={onClose}>
      <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 0, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{editing ? t('editTitle') : t('addTitle')}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18 }}>&times;</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          {/* SKU fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={S.fLabel}>{t('sellingSkuLabel')}</label>
              <input value={form.selling_sku} onChange={e => setField('selling_sku', e.target.value)}
                placeholder="e.g. SKU-SELL-001"
                style={{ ...S.fInput, fontSize: 11, border: isSkuError && !form.selling_sku ? `1px solid ${T.re}` : undefined }} />
            </div>
            <div>
              <label style={S.fLabel}>{t('manufacturingSkuLabel')}</label>
              <input value={form.manufacturing_sku} onChange={e => setField('manufacturing_sku', e.target.value)}
                placeholder="e.g. SKU-MFG-001"
                style={{ ...S.fInput, fontSize: 11, border: isSkuError && !form.manufacturing_sku ? `1px solid ${T.re}` : undefined }} />
            </div>
          </div>
          {isSkuError && <div style={{ ...S.errorBox, marginBottom: 10 }}>{t('skuRequired')}</div>}

          {/* Companies repeater */}
          <MatchingCompanyRepeater rows={form.matchings} onChange={v => setField('matchings', v)} t={t} />

          {/* Link */}
          <div style={{ marginBottom: 12 }}>
            <label style={S.fLabel}>{t('linkLabel')}</label>
            <input value={form.dropbox_gdrive_link} onChange={e => setField('dropbox_gdrive_link', e.target.value)}
              placeholder={t('linkPlaceholder')} style={{ ...S.fInput, fontSize: 11 }} />
          </div>

          {/* Errors */}
          {error && !isSkuError && <div style={{ ...S.errorBox, marginBottom: 10 }}>{error === 'conflictError' ? t('conflictError') : error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${T.bd}`, paddingTop: 14 }}>
            <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', cursor: 'pointer' }}>{t('cancel')}</button>
            <button onClick={onSave} disabled={saving}
              style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
