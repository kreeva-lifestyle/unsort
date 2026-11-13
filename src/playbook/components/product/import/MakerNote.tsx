// Inside "Check website": does this website name who makes its products? (owner, 2026-11-13: "Before importing can
// we check whether the website has manufacturer or vendor name mentioned. And show alert whether its there or not.")
// Counted by the server on the products the check reads (pb-products import/maker.ts). Named on most products →
// a plain note with the names (live dot); named on few or none → the review tint, saying what the products show
// instead (often the website's own name) and that the vendor below is then the owner's to fill in.
import type { CSSProperties, ReactNode } from 'react';
import type { ImportMaker } from '../../../data/imports';
import { PB, pbBody, pbNum } from '../../../pbTheme';
import { Dot } from '../status';

const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderRadius: PB.r.input, minWidth: 0 };
const n = (x: number) => <span style={pbNum}>{x.toLocaleString('en-IN')}</span>;
const products = (x: number) => <>{n(x)} {x === 1 ? 'product' : 'products'}</>;

export default function MakerNote({ m }: { m: ImportMaker | null | undefined }) {
  if (!m || !m.checked) return null;
  const list: ReactNode = m.names.map((x, i) => <span key={x.name}>{i ? ', ' : ''}<b style={{ fontWeight: 600 }}>{x.name}</b> ({n(x.products)})</span>);
  const own = m.own ? <>“<b style={{ fontWeight: 600 }}>{m.own}</b>”, the website’s own name</> : null;
  const most = m.named / m.checked >= 0.8;
  let title: string, body: ReactNode;
  if (most) {
    title = 'Manufacturer named';
    body = <>{m.named === m.checked ? <>All {products(m.checked)} checked name their manufacturer</> : <>{n(m.named)} of {products(m.checked)} checked name their manufacturer</>}: {list}.</>;
  } else if (m.named) {
    title = 'Manufacturer named on some products';
    body = <>Only {n(m.named)} of {products(m.checked)} checked {m.named === 1 ? 'names' : 'name'} a manufacturer: {list}. {own ? <>The others show only {own}.</> : 'The others name none.'} Enter the vendor below yourself if you know it.</>;
  } else if (own) {
    title = 'Manufacturer not named';
    body = <>{m.checked === 1 ? 'The product checked shows' : <>All {products(m.checked)} checked show</>} only {own}. If this website makes its own clothes, that is the maker; if it resells, enter the real vendor below.</>;
  } else {
    title = 'Manufacturer not named';
    body = <>None of the {products(m.checked)} checked names a manufacturer or vendor. Enter the vendor below yourself.</>;
  }
  return (
    <div role="status" style={{ ...box, background: most ? PB.ctl : PB.reviewBg, border: `1px solid ${most ? PB.tileBd : PB.reviewBd}` }}>
      <Dot color={most ? PB.live : PB.review} label={title} style={{ fontSize: 13, color: PB.tx, fontWeight: 600 }} />
      <span style={{ ...pbBody, color: PB.tx, overflowWrap: 'anywhere' }}>{body}</span>
    </div>
  );
}
