// The one-line legal reminder above the import button: photos and text on
// another store belong to that store. "Read the note" closes the sheet and
// opens the Guide at "Import products from a website" (its copyright note).
import { PB, pbMeta } from '../../../pbTheme';

export default function LegalLine({ onGuide }: { onGuide?: () => void }) {
  return (
    <p style={{ ...pbMeta, margin: 0, color: PB.tx2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
      <span>Their photos and text are their copyright: import only stores whose content you may reuse.</span>
      {onGuide && (
        <button type="button" onClick={onGuide} className="pb-pill"
          style={{ minHeight: 44, padding: 0, background: 'none', border: 0, color: PB.tx, font: 'inherit', fontSize: 12, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
          Read the note in the Guide
        </button>
      )}
    </p>
  );
}
