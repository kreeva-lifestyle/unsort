import { S } from '../../../lib/theme';
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
      <label style={S.fLabel}>Brands</label>
      {rows.map((r, i) => (
        <div key={i} className="prg-matching-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <input value={r.company_name} onChange={e => update(i, 'company_name', e.target.value)}
            placeholder="Brand Name"
            style={{ ...S.fInput, fontSize: 11 }} />
          <input list="dl-brand" value={r.matching_label} onChange={e => update(i, 'matching_label', e.target.value)}
            placeholder="Brand"
            style={{ ...S.fInput, fontSize: 11 }} />
          <button type="button" onClick={() => remove(i)}
            style={{ ...S.btnDanger, ...S.btnSm, fontSize: 10, padding: '4px 8px', cursor: 'pointer', alignSelf: 'center' }}>×</button>
        </div>
      ))}
      <datalist id="dl-brand">{brandOptions.map(n => <option key={n} value={n} />)}</datalist>
      <button type="button" onClick={add}
        style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px', cursor: 'pointer' }}>{t('addCompany')}</button>
    </div>
  );
}
