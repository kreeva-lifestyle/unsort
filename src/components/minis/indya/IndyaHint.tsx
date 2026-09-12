// The one-paragraph explanation of the Indya lookup rules, split out of
// IndyaImport.tsx to keep that file under the size limit.
import { T } from '../../../lib/theme';

export default function IndyaHint() {
  return (
    <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
      Each row is looked up as <span style={{ fontFamily: T.mono }}>code-SIZE</span>: the code exactly as Indya sent it first, then again with a size stuck on the code dropped; Unstitched uses the bare code; 2XL and XXL are the same; a dashless spelling still matches (shown as “loose match”). The SKU sheet lists that SKU for every row — give it to the vendors and add the stock files they return. Import Indya’s file exactly as downloaded (.xls or .csv) — opening it in Excel and saving destroys it. Sizes above XXL are not made: they are left out of the SKU sheet and written as 0. A LEHENGA CHOLI stock given on the bare code is applied to every size up to XXL and Unstitched. The SKU map replaces a misspelt code before the lookup (codes only — one fix covers every size). Duplicate Indya listings of one product get the same stock. Unknown codes are written as “SKU mismatch”; a known code with no stock in that size is 0.
    </div>
  );
}
