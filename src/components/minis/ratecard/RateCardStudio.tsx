// RateCard Studio entry: two features side by side on open — the rate card
// generator and Catalog downloads (vendor photo packs from Dropbox). Used by
// the signed-in Minis view and by the public seller link alike.
import { useState } from 'react';
import { S } from '../../../lib/theme';
import RateCardGenerator from './RateCardGenerator';
import CatalogDownloads from '../catalogdl/CatalogDownloads';

type Feature = 'card' | 'catalogs';

export default function RateCardStudio({ addToast, lockedMode, shareToken }: { addToast: (m: string, t?: string) => void; lockedMode?: 'master'; shareToken?: string }) {
  const [feature, setFeature] = useState<Feature>('card');
  const pill = (f: Feature, label: string) => (
    <button type="button" className="touch44" onClick={() => setFeature(f)} aria-pressed={feature === f}
      style={feature === f ? { ...S.btnPrimary, minHeight: 36 } : { ...S.btnGhost, minHeight: 36 }}>{label}</button>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {pill('card', 'Rate card')}
        {pill('catalogs', 'Catalog downloads')}
      </div>
      {feature === 'card' ? <RateCardGenerator addToast={addToast} lockedMode={lockedMode} shareToken={shareToken} /> : <CatalogDownloads addToast={addToast} shareToken={shareToken} />}
    </div>
  );
}
