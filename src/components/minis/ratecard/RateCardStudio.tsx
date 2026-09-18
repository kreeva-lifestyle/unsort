// RateCard Studio entry: the rate card generator, Catalog downloads (vendor
// photo packs from Dropbox) and the Catalog maker (index grid / two-per-page
// sheets from photos + SKUs). Used by the signed-in Minis view and by the
// public seller link alike; the catalog maker is in-app only (it needs no
// server, but the seller link is scoped to the rate card and catalogs).
import { useState } from 'react';
import { S } from '../../../lib/theme';
import RateCardGenerator from './RateCardGenerator';
import CatalogDownloads from '../catalogdl/CatalogDownloads';
import CatalogMaker from './CatalogMaker';

type Feature = 'card' | 'catalogs' | 'maker';

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
        {!lockedMode && pill('maker', 'Catalog maker')}
      </div>
      {feature === 'card' && <RateCardGenerator addToast={addToast} lockedMode={lockedMode} shareToken={shareToken} />}
      {feature === 'catalogs' && <CatalogDownloads addToast={addToast} shareToken={shareToken} />}
      {feature === 'maker' && !lockedMode && <CatalogMaker addToast={addToast} />}
    </div>
  );
}
