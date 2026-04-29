// InventoryFilter.jsx — standalone, self-contained inventory table with filter popover.
// Drop into any React 18 project. No external dependencies beyond React.
// Usage:
//   <InventoryFilter items={items} onDelete={fn} onStatusChange={fn} onOpenHistory={fn} />
//
// `items` shape: { sku, product, brand, size, color, status, updated, deleted? }

import React, { useState, useRef, useEffect } from 'react';

// ── Design tokens (dark theme, matches DailyOffice) ────────
const T = {
  bg:'#060810', s:'#0B0F19', s2:'#0F1420', s3:'#141B2B',
  glass1:'rgba(255,255,255,0.02)', glass2:'rgba(255,255,255,0.04)',
  bd:'rgba(255,255,255,0.06)', bd2:'rgba(255,255,255,0.10)',
  tx:'#E8EEF7', tx2:'#9AA8C2', tx3:'#6B7890',
  ac:'#6366F1', ac2:'#818CF8', ac3:'rgba(99,102,241,.12)',
  gr:'#34D399', yl:'#FBBF24', re:'#F87171', bl:'#38BDF8',
  font:"'Inter',system-ui,-apple-system,sans-serif",
  sora:"'Sora',system-ui,sans-serif",
  mono:"'JetBrains Mono',ui-monospace,monospace",
};

// ── Minimal icon set ──────────────────────────────────────
const Icon = ({n,s=16,c='currentColor'})=>{
  const p={width:s,height:s,viewBox:'0 0 24 24',fill:'none',stroke:c,strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round'};
  const I={
    search:<svg {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>,
    plus:<svg {...p}><path d="M12 5v14M5 12h14"/></svg>,
    check:<svg {...p}><path d="M20 6L9 17l-5-5"/></svg>,
    x:<svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>,
    clock:<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
    trash:<svg {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"/></svg>,
    chev:<svg {...p}><path d="M9 18l6-6-6-6"/></svg>,
    edit:<svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2 2 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    settings:<svg {...p}><path d="M4 6h12M4 12h16M4 18h10"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/></svg>,
    up:<svg {...p}><path d="M7 17L17 7M8 7h9v9"/></svg>,
    chart:<svg {...p}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>,
  };
  return I[n]||null;
};

// ── Button primitive ──────────────────────────────────────
const Btn = ({kind='ghost',icon,children,onClick,style={}})=>{
  const base={display:'inline-flex',alignItems:'center',gap:8,height:34,padding:'0 14px',
    borderRadius:8,fontFamily:T.font,fontSize:13,fontWeight:500,cursor:'pointer',
    border:'1px solid transparent',transition:'all .15s',letterSpacing:-.1,whiteSpace:'nowrap'};
  const kinds={
    primary:{background:T.ac,color:'#fff',boxShadow:'0 1px 0 rgba(255,255,255,.1) inset, 0 4px 12px rgba(99,102,241,.25)'},
    ghost:{background:T.glass1,color:T.tx,border:`1px solid ${T.bd}`},
  };
  return (
    <button onClick={onClick} style={{...base,...kinds[kind],...style}}>
      {icon && <Icon n={icon} s={14}/>}
      {children}
    </button>
  );
};

const Card = ({children,style={},pad=20})=>(
  <div style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:12,padding:pad,
    boxShadow:'0 1px 0 rgba(255,255,255,.02) inset',...style}}>{children}</div>
);

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function InventoryFilter({
  items = [],
  onDelete = ()=>{},
  onStatusChange = ()=>{},
  onOpenHistory = ()=>{},
}){
  const [filters,setFilters] = useState({
    status:[], marketplace:[], category:[], brand:[], tag:[],
  });
  const [filterOpen,setFilterOpen] = useState(false);
  const [preset,setPreset] = useState('all');
  const [openMenu,setOpenMenu] = useState(null);

  const FIELDS = {
    status:{label:'Status',options:['sorted','dry_clean','damaged','packed','shipped']},
    marketplace:{label:'Marketplace',options:['Myntra','Flipkart','Ajio']},
    category:{label:'Category',options:['Footwear','Apparel','Saree','Denim','Kurta']},
    brand:{label:'Brand',options:['Myntra','Flipkart','Ajio']},
    tag:{label:'Tag',options:['Missing Tag','Return','New Arrival','Priority']},
  };
  const PRESETS = [
    {id:'all',label:'All items'},
    {id:'open',label:'My open',filter:{status:['sorted','dry_clean']}},
    {id:'damaged',label:'Damaged this week',filter:{status:['damaged']}},
    {id:'missing',label:'Missing tags',filter:{tag:['Missing Tag']}},
  ];
  const STATUS_TONE = {sorted:'gr',dry_clean:'yl',damaged:'re',packed:'bl',shipped:'ac'};
  const TONE_COLOR = {gr:T.gr,yl:T.yl,re:T.re,bl:T.bl,ac:T.ac2};

  const toggleVal = (field,v)=>setFilters(f=>({
    ...f,[field]:f[field].includes(v)?f[field].filter(x=>x!==v):[...f[field],v]
  }));
  const removeChip = (field,v)=>setFilters(f=>({...f,[field]:f[field].filter(x=>x!==v)}));
  const clearAll = ()=>{ setFilters({status:[],marketplace:[],category:[],brand:[],tag:[]}); setPreset('all'); };
  const applyPreset = (p)=>{
    setPreset(p.id);
    if(p.id==='all'){ setFilters({status:[],marketplace:[],category:[],brand:[],tag:[]}); return; }
    setFilters({status:[],marketplace:[],category:[],brand:[],tag:[],...p.filter});
  };

  const activeCount = Object.values(filters).reduce((a,b)=>a+b.length,0);
  const activeChips = Object.entries(filters).flatMap(([field,vals])=>
    vals.map(v=>({field,value:v,label:FIELDS[field].label})));

  const visible = items.filter(i=>!i.deleted).filter(i=>{
    if(filters.status.length && !filters.status.includes(i.status)) return false;
    if(filters.marketplace.length && !filters.marketplace.includes(i.brand)) return false;
    if(filters.brand.length && !filters.brand.includes(i.brand)) return false;
    return true;
  });
  const totalActive = items.filter(i=>!i.deleted).length;

  useEffect(()=>{
    const h = e=>{ if(!e.target.closest('[data-menu]')) setOpenMenu(null); };
    document.addEventListener('click',h);
    return ()=>document.removeEventListener('click',h);
  },[]);

  return (
    <div style={{padding:'28px 32px',maxWidth:1240,margin:'0 auto',fontFamily:T.font,color:T.tx,background:T.bg,minHeight:'100vh'}}>
      <style>{`
        @keyframes fdrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
        *::-webkit-scrollbar{width:8px;height:8px}
        *::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:4px}
        *::-webkit-scrollbar-track{background:transparent}
        select option{background:${T.s2};color:${T.tx}}
      `}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:18,gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:6}}>Inventory</div>
          <div style={{fontFamily:T.sora,fontSize:28,fontWeight:700,letterSpacing:-.5,color:T.tx}}>All items</div>
          <div style={{color:T.tx2,fontSize:13,marginTop:4}}>
            {visible.length} of {totalActive} items
            {activeCount>0 && <span style={{color:T.ac2}}> · {activeCount} filter{activeCount>1?'s':''} active</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <Btn icon="up">Export</Btn>
          <Btn icon="chart">Smart Intel</Btn>
          <Btn icon="plus" kind="primary">Add item</Btn>
        </div>
      </div>

      {/* Presets + search + filter button */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:activeCount?12:18,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,padding:4,background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:10}}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>applyPreset(p)} style={{
              padding:'6px 12px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:T.font,
              fontSize:12,fontWeight:500,letterSpacing:-.05,
              background:preset===p.id?T.ac3:'transparent',
              color:preset===p.id?T.ac2:T.tx2,transition:'all .1s'}}>{p.label}</button>
          ))}
          <div style={{width:1,background:T.bd,margin:'4px 2px'}}/>
          <button style={{padding:'6px 10px',borderRadius:7,border:'none',cursor:'pointer',
            background:'transparent',color:T.tx3,fontSize:12,display:'flex',alignItems:'center',gap:4,fontFamily:T.font}}>
            <Icon n="plus" s={12}/> Save current
          </button>
        </div>

        <div style={{flex:1,minWidth:200,maxWidth:360,position:'relative'}}>
          <div style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:T.tx3}}>
            <Icon n="search" s={14}/>
          </div>
          <input placeholder="Search SKU, product, EAN…" style={{
            width:'100%',height:34,paddingLeft:34,paddingRight:12,
            background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
            color:T.tx,fontSize:12.5,fontFamily:T.font,outline:'none'}}/>
        </div>

        {/* Filters button with right-anchored popover */}
        <div style={{position:'relative'}} data-menu>
          <button onClick={()=>setFilterOpen(o=>!o)} style={{
            display:'inline-flex',alignItems:'center',gap:8,height:34,padding:'0 12px 0 14px',
            background:filterOpen||activeCount?T.ac3:T.glass1,
            border:`1px solid ${filterOpen||activeCount?'rgba(99,102,241,.35)':T.bd}`,
            borderRadius:8,color:activeCount?T.ac2:T.tx,fontSize:13,fontWeight:500,cursor:'pointer',
            fontFamily:T.font}}>
            <Icon n="settings" s={13}/>
            Filters
            {activeCount>0 && <span style={{
              background:T.ac,color:'#fff',borderRadius:10,padding:'1px 7px',
              fontSize:10,fontFamily:T.mono,fontWeight:600,minWidth:18,textAlign:'center'}}>{activeCount}</span>}
            <Icon n="chev" s={11} c={T.tx3}/>
          </button>

          {filterOpen && (
            <>
              <div onClick={()=>setFilterOpen(false)} style={{position:'fixed',inset:0,zIndex:100}}/>
              <div style={{position:'absolute',top:42,right:0,width:480,zIndex:101,
                background:T.s,border:`1px solid ${T.bd2}`,borderRadius:12,
                boxShadow:'0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(99,102,241,.08)',
                animation:'fdrop .14s ease-out',overflow:'hidden'}}>

                <div style={{padding:'14px 18px',borderBottom:`1px solid ${T.bd}`,
                  display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx}}>Filter items</div>
                  {activeCount>0 && <button onClick={clearAll} style={{background:'transparent',border:'none',
                    color:T.tx3,fontSize:11,cursor:'pointer',fontFamily:T.font}}>Clear all</button>}
                </div>

                <div style={{padding:'8px 0',maxHeight:440,overflowY:'auto',display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                  {Object.entries(FIELDS).map(([key,f])=>(
                    <div key={key} style={{padding:'10px 18px'}}>
                      <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,
                        fontWeight:600,marginBottom:8,display:'flex',justifyContent:'space-between'}}>
                        <span>{f.label}</span>
                        {filters[key].length>0 && <span style={{color:T.ac2,letterSpacing:0}}>{filters[key].length} selected</span>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {f.options.map(o=>{
                          const on = filters[key].includes(o);
                          const tone = key==='status' ? STATUS_TONE[o] : 'ac';
                          return (
                            <label key={o} style={{display:'flex',alignItems:'center',gap:8,
                              padding:'6px 8px',borderRadius:6,cursor:'pointer',
                              background:on?'rgba(99,102,241,.08)':'transparent',
                              transition:'background .08s'}}>
                              <div style={{width:14,height:14,borderRadius:4,
                                border:`1.5px solid ${on?T.ac:T.bd2}`,
                                background:on?T.ac:'transparent',
                                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {on && <Icon n="check" s={10} c="#fff"/>}
                              </div>
                              <input type="checkbox" checked={on} onChange={()=>toggleVal(key,o)}
                                style={{display:'none'}}/>
                              <span style={{fontSize:12.5,color:T.tx,textTransform:key==='status'?'capitalize':'none'}}>
                                {o.replace('_',' ')}
                              </span>
                              {key==='status' && <span style={{width:6,height:6,borderRadius:3,
                                background:TONE_COLOR[tone],marginLeft:'auto'}}/>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{padding:'12px 18px',borderTop:`1px solid ${T.bd}`,
                  display:'flex',justifyContent:'space-between',alignItems:'center',background:T.glass1}}>
                  <span style={{fontSize:11,color:T.tx3}}>
                    {activeCount>0 ? `Showing ${visible.length} of ${totalActive}` : 'No filters applied'}
                  </span>
                  <Btn kind="primary" onClick={()=>setFilterOpen(false)} style={{height:30}}>Done</Btn>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length>0 && (
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginRight:4}}>Active:</span>
          {activeChips.map(c=>(
            <button key={c.field+c.value} onClick={()=>removeChip(c.field,c.value)}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 6px 4px 10px',
                background:T.ac3,border:'1px solid rgba(99,102,241,.25)',borderRadius:6,
                color:T.ac2,fontSize:11.5,fontFamily:T.font,cursor:'pointer'}}>
              <span style={{color:T.tx3,fontSize:10}}>{c.label}:</span>
              <span style={{textTransform:c.field==='status'?'capitalize':'none'}}>{c.value.replace('_',' ')}</span>
              <span style={{width:16,height:16,borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',
                background:'rgba(255,255,255,.06)'}}><Icon n="x" s={10}/></span>
            </button>
          ))}
          <button onClick={clearAll} style={{background:'transparent',border:'none',
            color:T.tx3,fontSize:11,cursor:'pointer',textDecoration:'underline',fontFamily:T.font,marginLeft:4}}>
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <Card pad={0}>
        <div style={{display:'grid',gridTemplateColumns:'1.8fr .8fr .7fr 130px 110px 52px',
          padding:'12px 20px',borderBottom:`1px solid ${T.bd}`,
          fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,gap:16,alignItems:'center'}}>
          <div>SKU · Product</div><div>Brand</div><div>Size · Color</div><div>Status</div><div>Updated</div><div></div>
        </div>
        {visible.length===0 && (
          <div style={{padding:'60px 20px',textAlign:'center',color:T.tx3}}>
            <div style={{fontSize:13,color:T.tx2,marginBottom:8}}>No items match these filters</div>
            <button onClick={clearAll} style={{background:'transparent',border:`1px solid ${T.bd2}`,
              borderRadius:7,padding:'7px 14px',color:T.ac2,cursor:'pointer',fontSize:12,fontFamily:T.font}}>
              Clear filters
            </button>
          </div>
        )}
        {visible.map(it=>{
          const tone = STATUS_TONE[it.status] || 'ac';
          return (
            <div key={it.sku} style={{display:'grid',gridTemplateColumns:'1.8fr .8fr .7fr 130px 110px 52px',
              padding:'12px 20px',borderBottom:`1px solid ${T.bd}`,alignItems:'center',gap:16,
              transition:'background .1s',position:'relative'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.03)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3,marginBottom:2}}>{it.sku}</div>
                <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{it.product}</div>
              </div>
              <div style={{fontSize:12,color:T.tx2}}>{it.brand}</div>
              <div style={{fontSize:12,color:T.tx2}}>{it.size} · {it.color}</div>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <span style={{width:7,height:7,borderRadius:4,background:TONE_COLOR[tone],
                  boxShadow:`0 0 6px ${TONE_COLOR[tone]}80`}}/>
                <select value={it.status} onChange={e=>onStatusChange(it.sku,e.target.value)}
                  style={{background:'transparent',color:T.tx,border:`1px solid ${T.bd}`,borderRadius:6,
                    padding:'4px 8px',fontSize:11.5,fontFamily:T.font,cursor:'pointer',outline:'none',textTransform:'capitalize'}}>
                  {['sorted','dry_clean','damaged','packed','shipped'].map(s=>
                    <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>
              </div>
              <div style={{fontSize:11,color:T.tx3}}>{it.updated}</div>
              <div style={{position:'relative',display:'flex',justifyContent:'flex-end'}} data-menu>
                <button onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===it.sku?null:it.sku);}}
                  style={{background:'transparent',border:`1px solid ${openMenu===it.sku?T.bd2:'transparent'}`,
                    borderRadius:6,width:32,height:30,cursor:'pointer',color:T.tx2,
                    display:'flex',alignItems:'center',justifyContent:'center',transition:'all .1s'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
                {openMenu===it.sku && (
                  <div style={{position:'absolute',right:0,top:36,width:180,zIndex:50,
                    background:T.s,border:`1px solid ${T.bd2}`,borderRadius:9,overflow:'hidden',
                    boxShadow:'0 12px 30px rgba(0,0,0,.5)',animation:'fdrop .12s ease-out'}}>
                    {[
                      {icon:'search',label:'View details',action:()=>setOpenMenu(null)},
                      {icon:'edit',label:'Edit item',action:()=>setOpenMenu(null)},
                      {icon:'clock',label:'Change history',action:()=>{setOpenMenu(null);onOpenHistory(it);}},
                    ].map(m=>(
                      <button key={m.label} onClick={m.action} style={{width:'100%',padding:'9px 12px',
                        background:'transparent',border:'none',display:'flex',alignItems:'center',gap:10,
                        color:T.tx,fontSize:12.5,cursor:'pointer',fontFamily:T.font,textAlign:'left'}}>
                        <Icon n={m.icon} s={13} c={T.tx2}/> {m.label}
                      </button>
                    ))}
                    <div style={{height:1,background:T.bd}}/>
                    <button onClick={()=>{setOpenMenu(null);onDelete(it);}} style={{width:'100%',padding:'9px 12px',
                      background:'transparent',border:'none',display:'flex',alignItems:'center',gap:10,
                      color:T.re,fontSize:12.5,cursor:'pointer',fontFamily:T.font,textAlign:'left'}}>
                      <Icon n="trash" s={13}/> Delete item
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
