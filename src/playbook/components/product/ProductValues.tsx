// The product's tags, inside the Facts tile, grouped by the attributes of
// its category: "Colour: Black · Work: Embroidery, Sequins". Each attribute
// is one row button that opens its sheet (ValuesSheet: chips of the allowed
// values; one or several). A hint says who chose them (Auto = found in the
// text, AI, You). Every attribute is required: missing ones show a
// review-tinted line "Choose Colour and Work to finish this product" with
// "Let AI decide" (two signals: "AI is choosing…", then what it chose or
// "AI couldn't tell — please choose"). Not a <form>: it sits inside the
// Facts form. `load` / `save` / `fill` are swapped for fakes by the harness.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbProduct } from '../../types';
import { aiFillNow, productTaxonomy, setProductValues } from '../../data/tags';
import { SOURCE_LABEL, type PbAttribute, type PbProductValue } from '../../tagTypes';
import { PB, pbBody, pbBtnSecondary, pbLabel, pbMeta, pbTileReview } from '../../pbTheme';
import PbButton from '../ui/PbButton';
import PbIcon from '../ui/PbIcon';
import { PbSkelBar, PbTag } from '../ui';
import { KeptTag } from './detail/ListingField';
import { Dot } from './status';
import ValuesSheet from './ValuesSheet';
import { andList } from '../tags/tagText';

type Data = { attributes: PbAttribute[]; values: PbProductValue[] };

export default function ProductValues({ product, addToast, onSaved, load = productTaxonomy, save = setProductValues, fill = aiFillNow }: {
  product: Pick<PbProduct, 'id' | 'category' | 'locked' | 'status' | 'missing_attrs' | 'updated_at'>; addToast: AddToast; onSaved: () => void;
  load?: typeof productTaxonomy; save?: typeof setProductValues; fill?: typeof aiFillNow;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<PbAttribute | null>(null);
  const [busy, setBusy] = useState(false);
  const get = useCallback(() => load(product.id, product.category).then(d => { setData(d); setErr(''); }).catch(e => setErr(friendlyError(e))), [load, product.id, product.category]);
  useEffect(() => { void get(); }, [get, product.updated_at]);
  const reading = product.status === 'reading';

  const chosen = (a: PbAttribute) => a.values.filter(v => data?.values.some(x => x.value_id === v.id));
  const sourceOf = (a: PbAttribute) => [...new Set(chosen(a).map(v => data?.values.find(x => x.value_id === v.id)?.source).filter(Boolean))] as PbProductValue['source'][];
  const missing = data ? data.attributes.filter(a => !chosen(a).length).map(a => a.name) : product.missing_attrs;
  const letAi = async () => {
    setBusy(true);
    try {
      const r = await fill(product.id);
      if (r.filled.length) addToast(`AI chose ${andList(r.filled)}${r.left.length ? ` — it couldn't tell ${andList(r.left)}, please choose` : ''}${r.routed ? ` · sent to ${r.routed} website${r.routed === 1 ? '' : 's'}` : ''}`, r.left.length ? 'info' : 'success');
      else addToast(`AI couldn't tell ${andList(r.left.length ? r.left : missing)} — please choose`, 'info');
      onSaved(); void get();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  const row = { ...pbBtnSecondary, width: '100%', justifyContent: 'space-between', borderRadius: PB.r.input, fontWeight: 500, whiteSpace: 'normal', textAlign: 'left', gap: 12, padding: '8px 14px' } as const;

  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginTop: 8 }}>
      <span style={{ ...pbLabel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 0 }}>
        Tags{product.locked.includes('tags') && <KeptTag hint="You chose these. The text rules and the AI no longer change them; Let AI decide still fills empty ones." />}
      </span>
      {!product.category && <span style={{ ...pbBody, color: PB.tx2 }}>Pick a category first — the attributes it needs (Colour, Work…) appear here.</span>}
      {product.category && !data && !err && <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="60%" h={14} /><PbSkelBar w="40%" h={14} /></div>}
      {err && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not load the tags: {err} <button type="button" onClick={() => void get()} className="pb-pill" style={{ ...pbBtnSecondary, marginLeft: 8 }}>Try again</button></span>}
      {data && product.category && !data.attributes.length && <span style={{ ...pbBody, color: PB.tx2 }}>{product.category} needs no tags yet — choose its attributes on Settings → Tags.</span>}
      {data && data.attributes.length > 0 && missing.length > 0 && (
        <div style={{ ...pbTileReview, backdropFilter: 'none', WebkitBackdropFilter: 'none', borderRadius: PB.r.input, padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Dot color={PB.review} label={`Choose ${andList(missing)} to finish this product`} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 200px' }} />
          <PbButton icon="sparkles" onClick={() => void letAi()} busy={busy} busyLabel="AI is choosing…" disabled={reading}>Let AI decide</PbButton>
        </div>
      )}
      {data && data.attributes.length > 0 && (
        <ul aria-label="Tags by attribute" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.attributes.map(a => {
            const vs = chosen(a), src = sourceOf(a);
            return (
              <li key={a.id}>
                <button type="button" className="pb-pill" style={{ ...row, ...(vs.length ? null : { borderColor: PB.reviewBd }) }} onClick={() => setOpen(a)} disabled={reading}
                  aria-label={`${a.name}: ${vs.length ? vs.map(v => v.name).join(', ') : 'not chosen'}. Change`}>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...pbMeta, fontWeight: 600, color: PB.tx2 }}>{a.name}</span>
                    <span style={{ color: vs.length ? PB.tx : PB.review, overflowWrap: 'anywhere' }}>{vs.length ? vs.map(v => v.name).join(', ') : 'Choose…'}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {src.map(s => <PbTag key={s}>{SOURCE_LABEL[s]}</PbTag>)}
                    <span style={{ color: PB.tx3, display: 'inline-flex' }}><PbIcon name="chevronRight" size={16} /></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.attributes.length > 0 && <span style={pbMeta}>Auto = found in the product's text · AI = chosen by the AI · You = chosen here. Websites send them with <span style={{ fontFamily: PB.mono }}>{'{tags}'}</span>.</span>}
      <ValuesSheet attr={open} chosen={open && data ? chosen(open).map(v => v.id) : []} productId={product.id} save={save} addToast={addToast}
        onClose={() => setOpen(null)} onSaved={() => { onSaved(); void get(); }} />
    </div>
  );
}
