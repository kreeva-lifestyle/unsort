import { S } from '../../../lib/theme';
import SuggestInput from '../../../components/ui/SuggestInput';
import type { TranslationKey } from '../i18n/en';

interface Row { company_name: string; matching_label: string }
interface Props {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  t: (key: TranslationKey) => string;
  brandOptions?: string[];
}

export default function MatchingCompanyRepeater({ rows, onChange, t, brandOptions = [] }: Props) {
  const update = (i: number, field: keyof Row, value: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { company_name: '', matching_label: '' }]);

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={S.fLabel}>{t('brandsLabel')}</label>
      {rows.map((r, i) => (
        <div key={i} className="prg-matching-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <input value={r.company_name} onChange={e => update(i, 'company_name', e.target.value)}
            placeholder={t('brandName')}
            style={{ ...S.fInput, fontSize: 12 }} />
          <SuggestInput value={r.matching_label} onChange={v => update(i, 'matching_label', v)} options={brandOptions}
            placeholder={t('brandLabel')}
            style={{ ...S.fInput, fontSize: 12 }} />
          <button type="button" onClick={() => remove(i)}
            style={{ ...S.btnDanger, ...S.btnSm, cursor: 'pointer', alignSelf: 'center' }} aria-label="Remove">×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>{t('addCompany')}</button>
    </div>
  );
}
