// Brand Tags scene — master list, filters, import, print queue
const {useState:btUseState,useMemo:btUseMemo} = React;

const BT_BRANDS = ['TANUKA','FUSIONIC','SVARAA'];
const BT_SIZES = ['XS','S','M','L','XL','XXL','Free'];

const BT_SAMPLE = [
  {id:'1',brand:'TANUKA',sku:'TNDRS177-S',ean:'8905738880431',product:'Co-ord Set',size:'S',color:'Maroon',mrp:6800,jio:'JIO-A41',copies:2},
  {id:'2',brand:'TANUKA',sku:'TNDRS177-M',ean:'8905738880432',product:'Co-ord Set',size:'M',color:'Maroon',mrp:6800,jio:'JIO-A42',copies:2},
  {id:'3',brand:'TANUKA',sku:'TNDRS177-L',ean:'8905738880433',product:'Co-ord Set',size:'L',color:'Maroon',mrp:6800,jio:'JIO-A43',copies:1},
  {id:'4',brand:'FUSIONIC',sku:'FNGNS210-M',ean:'8905738881042',product:'Gown',size:'M',color:'Indigo',mrp:4499,jio:'JIO-B12',copies:3},
  {id:'5',brand:'FUSIONIC',sku:'FNKRT112-L',ean:'8905738881052',product:'Kurta',size:'L',color:'White',mrp:1799,jio:'JIO-B13',copies:0},
  {id:'6',brand:'SVARAA',sku:'SWDRS901-XL',ean:'8905738882011',product:'Dress',size:'XL',color:'Black',mrp:3299,jio:'JIO-C44',copies:5},
  {id:'7',brand:'SVARAA',sku:'SWJMP340-S',ean:'8905738882022',product:'Jumpsuit',size:'S',color:'Olive',mrp:2899,jio:'JIO-C45',copies:1},
  {id:'8',brand:'TANUKA',sku:'TNGWN410-M',ean:'8905738880511',product:'Gown Set',size:'M',color:'Red',mrp:7499,jio:'JIO-A88',copies:0},
];

function LabelPreview({row,small}){
  const s = small ? 0.6 : 1;
  return (
    <div style={{width:198*s,height:298*s,background:'#fff',color:'#000',
      display:'flex',borderRadius:4,boxShadow:'0 2px 8px rgba(0,0,0,.4)',
      fontFamily:'Arial,sans-serif',overflow:'hidden',flexShrink:0}}>
      <div style={{flex:1,padding:8*s,display:'flex',flexDirection:'column',justifyContent:'space-between',fontSize:8*s,lineHeight:1.3}}>
        <div>
          <div style={{fontWeight:900,fontSize:9*s}}>BRAND: {row.brand}</div>
          <div style={{fontWeight:900,fontSize:9*s,marginTop:2}}>SKU: {row.sku}</div>
          <div style={{marginTop:3}}>PRODUCT: {row.product}</div>
          <div>SIZE: {row.size} · COLOR: {row.color}</div>
          <div style={{marginTop:3,fontSize:7*s,color:'#444',lineHeight:1.2}}>Mktd by: Arya Designs, Surat-395004</div>
        </div>
        <div>
          <div style={{fontWeight:900,fontSize:11*s}}>MRP ₹{row.mrp}</div>
          <div style={{height:30*s,background:'repeating-linear-gradient(90deg,#000 0 1.4px,#fff 1.4px 3px)',marginTop:4*s,borderRadius:1}}/>
          <div style={{fontFamily:'monospace',fontSize:7*s,textAlign:'center',marginTop:1}}>{row.jio}</div>
        </div>
      </div>
      <div style={{width:18*s,background:'#e8e8e8',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{writingMode:'vertical-rl',transform:'rotate(180deg)',fontWeight:900,
          fontSize:7*s,letterSpacing:1,color:'#000'}}>EAN: {row.ean}</span>
      </div>
    </div>
  );
}

function BrandTagsScene({onToast}){
  const [rows,setRows] = btUseState(BT_SAMPLE);
  const [search,setSearch] = btUseState('');
  const [brand,setBrand] = btUseState('');
  const [size,setSize] = btUseState('');
  const [selected,setSelected] = btUseState(new Set());
  const [printPreview,setPrintPreview] = btUseState(null);
  const [showImport,setShowImport] = btUseState(false);

  const filtered = btUseMemo(()=>rows.filter(r=>{
    if(search && !(r.sku.toLowerCase().includes(search.toLowerCase()) ||
      r.product.toLowerCase().includes(search.toLowerCase()) ||
      r.ean.includes(search))) return false;
    if(brand && r.brand!==brand) return false;
    if(size && r.size!==size) return false;
    return true;
  }),[rows,search,brand,size]);

  const totalCopies = filtered.filter(r=>selected.has(r.id)).reduce((s,r)=>s+r.copies,0);
  const allSelected = filtered.length>0 && filtered.every(r=>selected.has(r.id));

  const toggle = id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll = ()=>setSelected(s=>{
    if(allSelected) return new Set([...s].filter(id=>!filtered.find(r=>r.id===id)));
    const n = new Set(s); filtered.forEach(r=>n.add(r.id)); return n;
  });

  const printSelected = ()=>{
    const sel = filtered.filter(r=>selected.has(r.id));
    if(sel.length===0){ onToast('No tags selected'); return; }
    setPrintPreview(sel);
  };

  const setCopies = (id,n)=>setRows(rs=>rs.map(r=>r.id===id?{...r,copies:Math.max(0,n)}:r));

  return (
    <div style={{padding:'28px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
        <div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx,letterSpacing:-.5}}>Brand Tags</div>
          <div style={{fontSize:12,color:T.tx3,marginTop:3}}>{rows.length} master tags · 1.97 × 2.97 in label · CODE128 barcode</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn kind="ghost" icon="box" onClick={()=>{setShowImport(true);}}>Import order sheet</Btn>
          <Btn kind="ghost" icon="plus" onClick={()=>onToast('Add tag (mock)')}>Add tag</Btn>
          <Btn kind="primary" icon="tag" onClick={printSelected}>
            Print {selected.size>0?`(${totalCopies})`:''}
          </Btn>
        </div>
      </div>

      {/* Filter bar */}
      <Card pad={12} style={{marginBottom:12}}>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:240,position:'relative'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search SKU, product, EAN…"
              style={{width:'100%',background:T.s,border:`1px solid ${T.bd}`,borderRadius:8,
                padding:'8px 12px 8px 34px',color:T.tx,fontFamily:T.font,fontSize:13,outline:'none'}}/>
            <div style={{position:'absolute',left:11,top:9,color:T.tx3,pointerEvents:'none'}}>
              <Icon n="search" s={14}/>
            </div>
          </div>
          <div style={{display:'flex',gap:4}}>
            <button onClick={()=>setBrand('')} style={{padding:'7px 11px',borderRadius:6,fontSize:11,
              fontFamily:T.font,fontWeight:500,border:`1px solid ${!brand?T.ac:T.bd}`,
              background:!brand?T.ac3:'transparent',color:!brand?T.ac2:T.tx2,cursor:'pointer'}}>All brands</button>
            {BT_BRANDS.map(b=>(
              <button key={b} onClick={()=>setBrand(b)} style={{padding:'7px 11px',borderRadius:6,fontSize:11,
                fontFamily:T.font,fontWeight:500,border:`1px solid ${brand===b?T.ac:T.bd}`,
                background:brand===b?T.ac3:'transparent',color:brand===b?T.ac2:T.tx2,cursor:'pointer'}}>{b}</button>
            ))}
          </div>
          <div style={{width:1,height:22,background:T.bd}}/>
          <select value={size} onChange={e=>setSize(e.target.value)}
            style={{background:T.s,border:`1px solid ${T.bd}`,borderRadius:7,padding:'7px 10px',
              color:T.tx2,fontSize:12,fontFamily:T.font,outline:'none'}}>
            <option value="">All sizes</option>
            {BT_SIZES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card pad={0}>
        <div style={{display:'grid',
          gridTemplateColumns:'40px 110px 1fr 80px 80px 90px 90px 110px',gap:12,
          padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
          fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            style={{accentColor:T.ac,cursor:'pointer'}}/>
          <div>Brand</div><div>SKU · Product</div><div>Size</div><div>Color</div>
          <div style={{textAlign:'right'}}>MRP</div><div>JIO Code</div>
          <div style={{textAlign:'right'}}>Copies</div>
        </div>
        {filtered.map(r=>{
          const sel = selected.has(r.id);
          return (
            <div key={r.id} style={{display:'grid',
              gridTemplateColumns:'40px 110px 1fr 80px 80px 90px 90px 110px',gap:12,
              padding:'12px 14px',borderBottom:`1px solid ${T.bd}`,alignItems:'center',
              background:sel?'rgba(99,102,241,.04)':'transparent',cursor:'pointer'}}
              onClick={()=>toggle(r.id)}>
              <input type="checkbox" checked={sel} onChange={()=>toggle(r.id)} onClick={e=>e.stopPropagation()}
                style={{accentColor:T.ac,cursor:'pointer'}}/>
              <div><Pill tone="ac">{r.brand}</Pill></div>
              <div>
                <div style={{fontFamily:T.mono,fontSize:11,color:T.tx2}}>{r.sku}</div>
                <div style={{fontSize:13,color:T.tx,fontWeight:500,marginTop:2}}>{r.product}</div>
              </div>
              <div style={{fontSize:12,color:T.tx2}}>{r.size}</div>
              <div style={{fontSize:12,color:T.tx2}}>{r.color}</div>
              <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,textAlign:'right',fontWeight:600}}>₹{r.mrp.toLocaleString('en-IN')}</div>
              <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{r.jio}</div>
              <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:4,alignItems:'center',justifyContent:'flex-end'}}>
                <button onClick={()=>setCopies(r.id,r.copies-1)} style={{width:24,height:24,borderRadius:6,
                  border:`1px solid ${T.bd}`,background:'transparent',color:T.tx2,cursor:'pointer'}}>−</button>
                <input value={r.copies} onChange={e=>setCopies(r.id,parseInt(e.target.value)||0)}
                  style={{width:36,textAlign:'center',background:T.s,border:`1px solid ${T.bd}`,
                    borderRadius:6,padding:'4px 0',color:T.tx,fontFamily:T.mono,fontSize:12,outline:'none'}}/>
                <button onClick={()=>setCopies(r.id,r.copies+1)} style={{width:24,height:24,borderRadius:6,
                  border:`1px solid ${T.bd}`,background:'transparent',color:T.tx2,cursor:'pointer'}}>+</button>
              </div>
            </div>
          );
        })}
        {filtered.length===0 && (
          <div style={{padding:'40px 20px',textAlign:'center',color:T.tx3,fontSize:13}}>No tags match.</div>
        )}
      </Card>

      {/* Selection footer */}
      {selected.size>0 && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:600,
          background:T.s,border:`1px solid ${T.bd2}`,borderRadius:10,padding:'10px 14px',
          display:'flex',gap:14,alignItems:'center',
          boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
          <div style={{fontSize:12,color:T.tx2}}>
            <span style={{color:T.ac2,fontWeight:600}}>{selected.size}</span> SKUs · <span style={{color:T.tx,fontWeight:600}}>{totalCopies}</span> copies
          </div>
          <div style={{width:1,height:18,background:T.bd}}/>
          <button onClick={()=>setSelected(new Set())} style={{background:'transparent',border:'none',
            color:T.tx3,cursor:'pointer',fontSize:12,fontFamily:T.font}}>Clear</button>
          <Btn kind="primary" icon="tag" onClick={printSelected}>Preview & print</Btn>
        </div>
      )}

      {/* Print preview modal */}
      {printPreview && (
        <div style={{position:'fixed',inset:0,zIndex:900,background:'rgba(6,8,16,.7)',
          backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={()=>setPrintPreview(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.s,border:`1px solid ${T.bd2}`,
            borderRadius:14,padding:24,width:760,maxWidth:'100%',maxHeight:'88vh',overflow:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3}}>Print preview</div>
                <div style={{fontSize:12,color:T.tx3,marginTop:2}}>
                  {printPreview.length} SKUs · {printPreview.reduce((s,r)=>s+r.copies,0)} labels · 1.97 × 2.97 in
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <Btn kind="ghost" onClick={()=>setPrintPreview(null)}>Cancel</Btn>
                <Btn kind="primary" icon="check" onClick={()=>{setPrintPreview(null);onToast('Sent to printer',`${printPreview.reduce((s,r)=>s+r.copies,0)} labels`);}}>Send to printer</Btn>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',
              gap:12,padding:16,background:T.s2,borderRadius:10,border:`1px solid ${T.bd}`}}>
              {printPreview.flatMap(r=>Array(r.copies).fill(0).map((_,i)=>(
                <LabelPreview key={r.id+'-'+i} row={r} small/>
              )))}
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div style={{position:'fixed',inset:0,zIndex:900,background:'rgba(6,8,16,.7)',
          backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={()=>setShowImport(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.s,border:`1px solid ${T.bd2}`,
            borderRadius:14,padding:24,width:520,maxWidth:'100%'}}>
            <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3,marginBottom:6}}>Import order sheet</div>
            <div style={{fontSize:12,color:T.tx3,marginBottom:16}}>Drop a .xlsx with Marketplace + SKU columns. Quantities auto-aggregate per SKU.</div>
            <div style={{border:`2px dashed ${T.bd2}`,borderRadius:12,padding:'40px 20px',textAlign:'center',
              background:T.glass1}}>
              <div style={{margin:'0 auto 12px',width:48,height:48,borderRadius:12,
                background:T.ac3,display:'flex',alignItems:'center',justifyContent:'center',color:T.ac2}}>
                <Icon n="up" s={22}/>
              </div>
              <div style={{fontSize:13,color:T.tx,fontWeight:500}}>Drop sheet here</div>
              <div style={{fontSize:11,color:T.tx3,marginTop:4}}>or click to browse · .xlsx, .csv</div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <Btn kind="ghost" onClick={()=>setShowImport(false)}>Cancel</Btn>
              <Btn kind="primary" icon="check" onClick={()=>{setShowImport(false);onToast('Order sheet imported','24 SKUs · 67 labels queued');}}>Import sample</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile Brand Tag (compact list) ──
function BrandTagsMobile({onToast}){
  const [search,setSearch] = btUseState('');
  const [selected,setSelected] = btUseState(new Set());
  const filtered = BT_SAMPLE.filter(r=>!search ||
    r.sku.toLowerCase().includes(search.toLowerCase()) ||
    r.product.toLowerCase().includes(search.toLowerCase()));
  const total = filtered.filter(r=>selected.has(r.id)).reduce((s,r)=>s+r.copies,0);
  const toggle = id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  return (
    <div style={{padding:'4px 16px 100px'}}>
      <div style={{position:'sticky',top:0,zIndex:5,background:T.bg,paddingBottom:10}}>
        <div style={{position:'relative'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search SKU, product…"
            style={{width:'100%',background:T.s2,border:`1px solid ${T.bd}`,borderRadius:10,
              padding:'12px 14px 12px 38px',color:T.tx,fontFamily:T.font,fontSize:14,outline:'none'}}/>
          <div style={{position:'absolute',left:13,top:13,color:T.tx3,pointerEvents:'none'}}>
            <Icon n="search" s={15}/>
          </div>
        </div>
      </div>
      {filtered.map(r=>{
        const sel = selected.has(r.id);
        return (
          <div key={r.id} onClick={()=>toggle(r.id)} style={{
            background:sel?'rgba(99,102,241,.08)':T.s2,
            border:`1px solid ${sel?T.ac:T.bd}`,borderRadius:12,padding:14,marginBottom:8,
            display:'flex',gap:12,alignItems:'center'}}>
            <div style={{width:40,height:40,borderRadius:9,
              background:sel?T.ac:T.s3,display:'flex',alignItems:'center',justifyContent:'center',
              color:sel?'#fff':T.tx2,flexShrink:0}}>
              <Icon n={sel?'check':'tag'} s={16}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:T.mono,fontSize:10,color:T.tx3}}>{r.sku}</div>
              <div style={{fontSize:14,color:T.tx,fontWeight:600,marginTop:2}}>{r.product}</div>
              <div style={{display:'flex',gap:6,marginTop:5}}>
                <Pill tone="ac">{r.brand}</Pill>
                <Pill>{r.size}</Pill>
                <Pill>{r.color}</Pill>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,fontWeight:600}}>₹{r.mrp}</div>
              <div style={{fontSize:10,color:T.tx3,marginTop:3}}>{r.copies} copies</div>
            </div>
          </div>
        );
      })}
      {selected.size>0 && (
        <div style={{position:'fixed',bottom:90,left:16,right:16,zIndex:50,
          background:T.ac,borderRadius:14,padding:14,display:'flex',
          alignItems:'center',justifyContent:'space-between',
          boxShadow:'0 10px 30px rgba(99,102,241,.4)'}}>
          <div style={{color:'#fff'}}>
            <div style={{fontFamily:T.sora,fontSize:15,fontWeight:600}}>{selected.size} SKUs · {total} labels</div>
            <div style={{fontSize:11,opacity:.8}}>Tap to print queue</div>
          </div>
          <button onClick={()=>{setSelected(new Set());onToast('Sent to printer',`${total} labels`);}}
            style={{background:'rgba(255,255,255,.2)',border:'none',borderRadius:10,padding:'10px 14px',
              color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            <Icon n="tag" s={14}/>Print
          </button>
        </div>
      )}
    </div>
  );
}

window.BrandTagsScene = BrandTagsScene;
window.BrandTagsMobile = BrandTagsMobile;
