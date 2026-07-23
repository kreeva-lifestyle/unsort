// Result panel for a generated rate card: preview + WhatsApp / Share / Save.
// Extracted from RateCardGenerator for the file budget.
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';

export default function RateCardActions({ result, catalogName, addToast }: {
  result: { url: string; blob: Blob };
  catalogName: string;
  addToast: (m: string, t?: string) => void;
}) {
  const fileName = () => `RateCard-${catalogName.trim().replace(/[^\w-]+/g, '_') || 'catalog'}.jpg`;

  const download = () => {
    const a = document.createElement('a');
    a.href = result.url; a.download = fileName(); a.click();
  };

  const share = async () => {
    const file = new File([result.blob], fileName(), { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: catalogName.trim() });
      else download();
    } catch (e: any) { if (e?.name !== 'AbortError') addToast(friendlyError(e), 'error'); }
  };

  // Send to WhatsApp. There is no way to attach an image to a specific number
  // from the web, so on a phone we share the image file (WhatsApp shows up in
  // the share sheet); on desktop we save the image and open WhatsApp Web so the
  // user can drop it into a chat.
  const whatsapp = async () => {
    const file = new File([result.blob], fileName(), { type: 'image/jpeg' });
    const text = `${catalogName.trim() || 'Rate card'} — rate card`;
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: catalogName.trim(), text }); }
      catch (e: any) { if (e?.name !== 'AbortError') addToast(friendlyError(e), 'error'); }
      return;
    }
    download();
    addToast('Image saved — attach it in the WhatsApp chat', 'success');
    window.open('https://web.whatsapp.com', '_blank', 'noopener');
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12 }}>
      <img src={result.url} alt="Rate card preview" style={{ width: '100%', borderRadius: 8, display: 'block', marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={whatsapp} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center', background: T.gr, border: 'none', color: '#fff' }}>WhatsApp</button>
        <button onClick={share} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Share</button>
        <button onClick={download} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Save</button>
      </div>
    </div>
  );
}
