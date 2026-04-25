import { S } from '../../../lib/theme';
import type { TranslationKey } from '../i18n/en';

interface Row { company_name: string; matching_label: string }
interface Props {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  t: (key: TranslationKey) => string;
}

export default function MatchingCompanyRepeater({ rows, onChange, t }: Props) {
  const update = (i: number, field: keyof Row, value: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { company_name: '', matching_label: '' }]);

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={S.fLabel}>{t('companiesForMatching')}</label>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <input value={r.company_name} onChange={e => update(i, 'company_name', e.target.value)}
            placeholder={t('companyName')}
            style={{ ...S.fInput, fontSize: 11, padding: '6px 8px' }} />
          <input value={r.matching_label} onChange={e => update(i, 'matching_label', e.target.value)}
            placeholder={t('matchingLabelField')}
            style={{ ...S.fInput, fontSize: 11, padding: '6px 8px' }} />
          <button type="button" onClick={() => remove(i)}
            style={{ ...S.btnDanger, ...S.btnSm, fontSize: 10, padding: '4px 8px', cursor: 'pointer', alignSelf: 'center' }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px', cursor: 'pointer' }}>{t('addCompany')}</button>
    </div>
  );
}
