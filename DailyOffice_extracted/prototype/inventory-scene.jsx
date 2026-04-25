// Inventory scene v2 — proper filter UX
function InventoryScene({onDelete,onStatusChange,onOpenHistory,items}){
  const [filters,setFilters] = React.useState({
    status:[], marketplace:[], category:[], brand:[], tag:[],
  });
  const [filterOpen,setFilterOpen] = React.useState(false);
  const [preset,setPreset] = React.useState('all');
  const [openMenu,setOpenMenu] = React.useState(null);
  const filterBtnRef = React.useRef(null);

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

  React.useEffect(()=>{
    const h = e=>{ if(!e.target.closest('[data-menu]')) setOpenMenu(null); };
    document.addEventListener('click',h);
    return ()=>document.removeEventListener('click',h);
  },[]);

  const STATUS_TONE = {sorted:'gr',dry_clean:'yl',damaged:'re',packed:'bl',shipped:'ac'};

  return (
    <div style={{padding:'28px 32px',maxWidth:1240,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:18,gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:6}}>Inventory</div>
          <div style={{fontFamily:T.sora,fontSize:28,fontWeight:700,letterSpacing:-.5,color:T.tx}}>All items</div>
          <div style={{color:T.tx2,fontSize:13,marginTop:4}}>
            {visible.length} of {items.filter(i=>!i.deleted).length} items
            {activeCount>0 && <span style={{color:T.ac2}}> · {activeCount} filter{activeCount>1?'s':''} active</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <Btn icon="up">Export</Btn>
          <Btn icon="chart">Smart Intel</Btn>
          <Btn icon="plus" kind="primary">Add item</Btn>
        </div>
      </div>

      {/* Preset strip + filter button row */}
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
            background:'transparent',color:T.tx3,fontSize:12,display:'flex',alignItems:'center',gap:4}}>
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

        {/* Filters button with popover */}
        <div style={{position:'relative'}} data-menu>
          <button ref={filterBtnRef} onClick={()=>setFilterOpen(o=>!o)} style={{
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
                <style>{`@keyframes fdrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>

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
                              transition:'background .08s'}}
                              onMouseEnter={e=>{ if(!on) e.currentTarget.style.background='rgba(255,255,255,.02)'; }}
                              onMouseLeave={e=>{ if(!on) e.currentTarget.style.background='transparent'; }}>
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
                                background:{gr:T.gr,yl:T.yl,re:T.re,bl:T.bl,ac:T.ac2}[tone],marginLeft:'auto'}}/>}
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
                    {activeCount>0 ? `Showing ${visible.length} of ${items.filter(i=>!i.deleted).length}` : 'No filters applied'}
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
                <span style={{width:7,height:7,borderRadius:4,background:{gr:T.gr,yl:T.yl,re:T.re,bl:T.bl,ac:T.ac2}[tone],
                  boxShadow:`0 0 6px ${{gr:T.gr,yl:T.yl,re:T.re,bl:T.bl,ac:T.ac2}[tone]}80`}}/>
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
                    display:'flex',alignItems:'center',justifyContent:'center',transition:'all .1s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.color=T.tx}}
                  onMouseLeave={e=>{if(openMenu!==it.sku){e.currentTarget.style.background='transparent';e.currentTarget.style.color=T.tx2}}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
                {openMenu===it.sku && (
                  <div style={{position:'absolute',right:0,top:36,width:180,zIndex:50,
                    background:T.s,border:`1px solid ${T.bd2}`,borderRadius:9,overflow:'hidden',
                    boxShadow:'0 12px 30px rgba(0,0,0,.5)',animation:'fdrop .12s ease-out'}}>
                    {[
                      {icon:'search',label:'View details',action:()=>{setOpenMenu(null);}},
                      {icon:'edit',label:'Edit item',action:()=>{setOpenMenu(null);}},
                      {icon:'clock',label:'Change history',action:()=>{setOpenMenu(null);onOpenHistory(it);}},
                    ].map(m=>(
                      <button key={m.label} onClick={m.action} style={{width:'100%',padding:'9px 12px',
                        background:'transparent',border:'none',display:'flex',alignItems:'center',gap:10,
                        color:T.tx,fontSize:12.5,cursor:'pointer',fontFamily:T.font,textAlign:'left'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Icon n={m.icon} s={13} c={T.tx2}/> {m.label}
                      </button>
                    ))}
                    <div style={{height:1,background:T.bd}}/>
                    <button onClick={()=>{setOpenMenu(null);onDelete(it);}} style={{width:'100%',padding:'9px 12px',
                      background:'transparent',border:'none',display:'flex',alignItems:'center',gap:10,
                      color:T.re,fontSize:12.5,cursor:'pointer',fontFamily:T.font,textAlign:'left'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(248,113,113,.06)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
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
window.InventoryScene = InventoryScene;
