// Settings → Pricing: the app-wide inputs behind the Price Projector mini —
// stitching cost heads, per-category thresholds and profit defaults. Each
// card saves its own app_settings key.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { SkeletonRows } from '../ui/Skeleton';
import { loadPricingConfig, PricingConfig } from '../minis/pricing/pricingConfig';
import StitchingHeads from './pricing/StitchingHeads';
import PricingThresholds from './pricing/PricingThresholds';
import PricingDefaults from './pricing/PricingDefaults';

export default function PricingSettings({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [config, setConfig] = useState<PricingConfig | null>(null);

  useEffect(() => {
    loadPricingConfig().then(({ config: c, error }) => {
      if (error) addToast('Could not load pricing settings — ' + friendlyError(error), 'error');
      setConfig(c);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) return <SkeletonRows rows={4} />;
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 4 }}>Pricing</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 16, lineHeight: 1.5 }}>
        Used by the Price Projector (Minis). Stitching heads are added to every product's material cost; thresholds flag products that earn too little or cost too much.
      </div>
      <StitchingHeads heads={config.stitching} addToast={addToast} onSaved={h => setConfig({ ...config, stitching: h })} />
      <PricingThresholds thresholds={config.thresholds} addToast={addToast} onSaved={t => setConfig({ ...config, thresholds: t })} />
      <PricingDefaults defaults={config.defaults} addToast={addToast} onSaved={d => setConfig({ ...config, defaults: d })} />
    </div>
  );
}
