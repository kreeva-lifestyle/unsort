// Command palette — ⌘K, fuzzy search, actions + navigation + recent, with grouping tweak
function CommandPalette({open,onClose,onAction,grouping='category'}){
  const [q,setQ] = React.useState('');
  const [sel,setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(()=>{ if(open){ setQ(''); setSel(0); setTimeout(()=>inputRef.current?.focus(),60); }},[open]);

  const all = React.useMemo(()=>[
    // Actions
    {id:'a1',kind:'action',cat:'Create',label:'Create new challan',icon:'plus',shortcut:'C',hint:'Invoice a customer'},
    {id:'a2',kind:'action',cat:'Create',label:'Add expense',icon:'cash',shortcut:'E',hint:'Log petty cash'},
    {id:'a3',kind:'action',cat:'Create',label:'Add new SKU',icon:'tag',shortcut:'S',hint:'Brand Tags'},
    {id:'a4',kind:'action',cat:'Create',label:'Start pack session',icon:'box',hint:'PackStation'},
    {id:'a5',kind:'action',cat:'Scan',label:'Scan AWB barcode',icon:'scan',shortcut:'B',hint:'Camera scanner'},
    {id:'a6',kind:'action',cat:'Scan',label:'Scan SKU barcode',icon:'scan',hint:'Inventory lookup'},
    {id:'a7',kind:'action',cat:'Cash',label:'Start shift handover',icon:'cash',hint:'CashBook · PIN required'},
    {id:'a8',kind:'action',cat:'Cash',label:'Reconcile today',icon:'check',hint:'Match scans to sales'},
    // Navigation
    {id:'n1',kind:'nav',cat:'Go to',label:'Dashboard',icon:'grid'},
    {id:'n2',kind:'nav',cat:'Go to',label:'Inventory',icon:'box'},
    {id:'n3',kind:'nav',cat:'Go to',label:'Brand Tags',icon:'tag'},
    {id:'n4',kind:'nav',cat:'Go to',label:'PackStation',icon:'truck'},
    {id:'n5',kind:'nav',cat:'Go to',label:'Cash Challan',icon:'book'},
    {id:'n6',kind:'nav',cat:'Go to',label:'CashBook',icon:'cash'},
    {id:'n7',kind:'nav',cat:'Go to',label:'Settings',icon:'settings'},
    // Recent
    {id:'r1',kind:'recent',cat:'Recent',label:'CH-2024-0847 · Rao Textiles',icon:'clock',hint:'₹12,400 · overdue 4d'},
    {id:'r2',kind:'recent',cat:'Recent',label:'MYN-FLEX-42-BLK · Flex Pro Sneaker',icon:'clock',hint:'Edited 20m ago'},
    {id:'r3',kind:'recent',cat:'Recent',label:'Pack session · Myntra · DTDC',icon:'clock',hint:'127 scans · live'},
  ],[]);

  const results = React.useMemo(()=>{
    if(!q) return all;
    const s = q.toLowerCase();
    return all.filter(r => r.label.toLowerCase().includes(s) || r.cat.toLowerCase().includes(s) || (r.hint||'').toLowerCase().includes(s));
  },[q,all]);

  // Group/order
  const grouped = React.useMemo(()=>{
    if(grouping==='flat') return [{key:'All',items:results}];
    if(grouping==='kind'){
      const order = ['action','nav','recent'];
      const names = {action:'Actions',nav:'Navigate',recent:'Recent'};
      return order.map(k=>({key:names[k],items:results.filter(r=>r.kind===k)})).filter(g=>g.items.length);
    }
    // category
    const keys = [...new Set(results.map(r=>r.cat))];
    return keys.map(k=>({key:k,items:results.filter(r=>r.cat===k)}));
  },[results,grouping]);

  // Flat list for keyboard nav
  const flat = grouped.flatMap(g=>g.items);

  React.useEffect(()=>{ setSel(0); },[q,grouping]);
  React.useEffect(()=>{
    if(!open) return;
    const h = e => {
      if(e.key==='Escape') onClose();
      else if(e.key==='ArrowDown'){ e.preventDefault(); setSel(s=>Math.min(s+1,flat.length-1)); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); setSel(s=>Math.max(s-1,0)); }
      else if(e.key==='Enter'){ e.preventDefault(); flat[sel] && onAction(flat[sel]); }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[open,flat,sel,onAction,onClose]);

  if(!open) return null;

  let flatIdx = -1;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,
      background:'rgba(3,5,10,.72)',backdropFilter:'blur(8px)',
      display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'12vh',
      animation:'pfade .15s ease-out'}}>
      <style>{`@keyframes pfade{from{opacity:0}to{opacity:1}}
        @keyframes pslide{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
      <div onClick={e=>e.stopPropagation()} style={{width:620,maxWidth:'92vw',maxHeight:'70vh',
        background:T.s,border:`1px solid ${T.bd2}`,borderRadius:14,overflow:'hidden',
        display:'flex',flexDirection:'column',
        boxShadow:'0 40px 100px rgba(0,0,0,.6), 0 0 0 1px rgba(99,102,241,.15)',
        animation:'pslide .18s ease-out'}}>
        {/* Input */}
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 20px',borderBottom:`1px solid ${T.bd}`}}>
          <div style={{color:T.tx3}}><Icon n="search" s={18}/></div>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search actions, pages, recent items…"
            style={{flex:1,background:'transparent',border:'none',color:T.tx,fontSize:15,
              fontFamily:T.font,outline:'none',fontWeight:400}}/>
          <span style={{fontFamily:T.mono,fontSize:10,color:T.tx3,
            padding:'3px 7px',border:`1px solid ${T.bd2}`,borderRadius:4}}>esc</span>
        </div>

        {/* Results */}
        <div style={{overflowY:'auto',flex:1,padding:'8px 0'}}>
          {grouped.length === 0 && (
            <div style={{padding:'40px 20px',textAlign:'center',color:T.tx3,fontSize:13}}>
              No results for <span style={{color:T.tx2}}>"{q}"</span>
            </div>
          )}
          {grouped.map(g=>(
            <div key={g.key} style={{marginBottom:4}}>
              {grouping!=='flat' && <div style={{fontSize:10,fontWeight:600,color:T.tx3,
                textTransform:'uppercase',letterSpacing:2,padding:'8px 20px 6px'}}>{g.key}</div>}
              {g.items.map(it=>{
                flatIdx++;
                const isSel = flatIdx === sel;
                return (
                  <div key={it.id} onMouseEnter={(idx=>()=>setSel(idx))(flatIdx)}
                    onClick={()=>onAction(it)}
                    style={{padding:'10px 20px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',
                      background:isSel?'rgba(99,102,241,.1)':'transparent',
                      borderLeft:`2px solid ${isSel?T.ac:'transparent'}`,
                      transition:'background .1s'}}>
                    <div style={{width:28,height:28,borderRadius:6,background:T.s2,
                      border:`1px solid ${T.bd}`,display:'flex',alignItems:'center',justifyContent:'center',
                      color:isSel?T.ac2:T.tx2}}>
                      <Icon n={it.icon} s={15}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{it.label}</div>
                      {it.hint && <div style={{fontSize:11,color:T.tx3,marginTop:1}}>{it.hint}</div>}
                    </div>
                    {it.shortcut && <span style={{fontFamily:T.mono,fontSize:10,color:T.tx3,
                      padding:'2px 6px',border:`1px solid ${T.bd2}`,borderRadius:4}}>⌘{it.shortcut}</span>}
                    {isSel && <Icon n="arrow" s={14} c={T.ac2}/>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{padding:'10px 20px',borderTop:`1px solid ${T.bd}`,
          display:'flex',justifyContent:'space-between',alignItems:'center',
          background:T.glass1,fontSize:11,color:T.tx3,fontFamily:T.font}}>
          <div style={{display:'flex',gap:14}}>
            <span><kbd style={{fontFamily:T.mono,color:T.tx2}}>↑↓</kbd> navigate</span>
            <span><kbd style={{fontFamily:T.mono,color:T.tx2}}>↵</kbd> select</span>
            <span><kbd style={{fontFamily:T.mono,color:T.tx2}}>esc</kbd> close</span>
          </div>
          <span>{flat.length} result{flat.length!==1?'s':''}</span>
        </div>
      </div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
