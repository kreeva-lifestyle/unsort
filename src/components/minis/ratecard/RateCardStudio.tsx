// RateCard Studio entry: the rate card generator, Catalog downloads (vendor
// photo packs from Dropbox), the Catalog maker (index grid / two-per-page
// sheets from photos + SKUs) and the Product detail generator (WhatsApp
// write-up from the master sheet, Dropbox photos and the AI). Used by the
// signed-in Minis view and by the public seller link alike; the maker and
// the detail generator are in-app only (the seller link is scoped to the
// rate card and catalogs, and the generator spends the AI key).
import { useState } from 'react';
import { S } from '../../../lib/theme';
import RateCardGenerator from './RateCardGenerator';
import CatalogDownloads from '../catalogdl/CatalogDownloads';
import CatalogMaker from './CatalogMaker';
import ProductDetailGenerator from './ProductDetailGenerator';

type Feature = 'card' | 'catalogs' | 'maker' | 'details';

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
        {!lockedMode && pill('details', 'Product details')}
      </div>
      {feature === 'card' && <RateCardGenerator addToast={addToast} lockedMode={lockedMode} shareToken={shareToken} />}
      {feature === 'catalogs' && <CatalogDownloads addToast={addToast} shareToken={shareToken} />}
      {feature === 'maker' && !lockedMode && <CatalogMaker addToast={addToast} />}
      {feature === 'details' && !lockedMode && <ProductDetailGenerator addToast={addToast} />}
    </div>
  );
}
