import { T } from '../../../lib/theme';
import type { TranslationKey } from '../i18n/en';

interface Props {
  items: [string, number][];
  t: (key: TranslationKey) => string;
}

export default function FabricBreakdown({ items, t }: Props) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 6, padding: '8px 14px', background: 'rgba(56,189,248,.04)', border: `1px solid rgba(56,189,248,.10)`, borderRadius: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{t('fabricBreakdown')}</div>
      {items.map(([name, total]) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
          <span style={{ color: T.tx2 }}>{name}</span>
          <span style={{ fontFamily: T.mono, color: T.bl, fontWeight: 600 }}>{total.toFixed(2)} m</span>
        </div>
      ))}
    </div>
  );
}
