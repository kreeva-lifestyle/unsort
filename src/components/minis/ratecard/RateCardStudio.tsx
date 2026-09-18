// RateCard Studio entry: the rate card generator, Catalog downloads (vendor
// photo packs from Dropbox) and the Index maker (photo grid captioned with
// SKUs). Used by the signed-in Minis view and by the public seller link
// alike; the index maker is in-app only (it needs no server, but the seller
// link is scoped to the rate card and catalogs).
import { useState } from 'react';
import { S } from '../../../lib/theme';
import RateCardGenerator from './RateCardGenerator';
import CatalogDownloads from '../catalogdl/CatalogDownloads';
import IndexMaker from './IndexMaker';

type Feature = 'card' | 'catalogs' | 'index';

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
        {!lockedMode && pill('index', 'Index maker')}
      </div>
      {feature === 'card' && <RateCardGenerator addToast={addToast} lockedMode={lockedMode} shareToken={shareToken} />}
      {feature === 'catalogs' && <CatalogDownloads addToast={addToast} shareToken={shareToken} />}
      {feature === 'index' && !lockedMode && <IndexMaker addToast={addToast} />}
    </div>
  );
}
