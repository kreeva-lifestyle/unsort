// Root app — scene switcher, shared state, shell chrome, tweaks
const {useState,useEffect,useRef,useMemo} = React;

function Shell({children,active,onNav,onOpenPalette,onToggleDevice,device}){
  const nav = [
    {id:'dashboard',label:'Dashboard',icon:'grid'},
    {id:'inventory',label:'Inventory',icon:'box'},
    {id:'programs',label:'Programs',icon:'file'},
    {id:'brandtags',label:'Brand Tags',icon:'tag'},
    {id:'packstation',label:'PackStation',icon:'truck'},
    {id:'challan',label:'Challan',icon:'book'},
    {id:'cashbook',label:'CashBook',icon:'cash'},
    {id:'settings',label:'Settings',icon:'settings'},
    {id:'login',label:'Login screen',icon:'user'},
  ];
  return (
    <div style={{display:'flex',minHeight:'100%',background:T.bg,color:T.tx,fontFamily:T.font}}>
      {/* Ambient glow */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,overflow:'hidden'}}>
        <div style={{position:'absolute',top:-200,right:-100,width:500,height:500,
          background:`radial-gradient(circle,${T.ac}40 0%,transparent 60%)`,filter:'blur(60px)'}}/>
        <div style={{position:'absolute',bottom:-200,left:100,width:400,height:400,
          background:`radial-gradient(circle,${T.bl}30 0%,transparent 60%)`,filter:'blur(80px)'}}/>
      </div>

      {/* Sidebar (desktop only) */}
      <aside style={{width:220,background:T.glass1,backdropFilter:'blur(20px)',
        borderRight:`1px solid ${T.bd}`,padding:'20px 12px',
        display:'flex',flexDirection:'column',gap:4,zIndex:2,position:'relative'}}>
        <div style={{padding:'4px 10px 16px',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:28,height:28,borderRadius:7,
            background:`linear-gradient(135deg,${T.ac},${T.bl})`,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontFamily:T.sora,fontWeight:800,fontSize:14,color:'#fff'}}>D</div>
          <div>
            <div style={{fontFamily:T.sora,fontSize:14,fontWeight:700,color:T.tx,letterSpacing:-.3}}>DailyOffice</div>
            <div style={{fontSize:10,color:T.tx3,fontFamily:T.mono}}>v2.4 · prototype</div>
          </div>
        </div>
        <div style={{fontSize:9,color:T.tx3,textTransform:'uppercase',letterSpacing:2.5,
          fontWeight:600,padding:'8px 12px 4px'}}>Workspace</div>
        {nav.map(n=>(
          <button key={n.id} onClick={()=>onNav(n.id)}
            style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',
              background:active===n.id?T.ac3:'transparent',
              color:active===n.id?T.ac2:T.tx2,
              border:'none',borderRadius:7,cursor:'pointer',
              fontSize:12.5,fontWeight:active===n.id?500:400,
              fontFamily:T.font,textAlign:'left',width:'100%',transition:'all .1s'}}
            onMouseEnter={e=>{ if(active!==n.id){e.currentTarget.style.background='rgba(255,255,255,.02)';e.currentTarget.style.color=T.tx}}}
            onMouseLeave={e=>{ if(active!==n.id){e.currentTarget.style.background='transparent';e.currentTarget.style.color=T.tx2}}}>
            <Icon n={n.icon} s={15}/>{n.label}
          </button>
        ))}
        <div style={{marginTop:'auto'}}>
          <button onClick={onOpenPalette} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',
            background:T.glass2,border:`1px solid ${T.bd}`,borderRadius:7,color:T.tx2,
            width:'100%',fontSize:11,cursor:'pointer',fontFamily:T.font}}>
            <Icon n="search" s={13}/>
            <span style={{flex:1,textAlign:'left'}}>Search…</span>
            <span style={{fontFamily:T.mono,fontSize:10,padding:'2px 5px',
              border:`1px solid ${T.bd2}`,borderRadius:3}}>⌘K</span>
          </button>
        </div>
      </aside>

      <main style={{flex:1,position:'relative',zIndex:1,overflow:'auto'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 32px',borderBottom:`1px solid ${T.bd}`,
          background:T.glass1,backdropFilter:'blur(20px)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:4,height:4,borderRadius:2,background:T.ac,boxShadow:`0 0 8px ${T.ac}`}}/>
            <span style={{fontFamily:T.sora,fontSize:12,fontWeight:600,color:T.tx2,letterSpacing:.3}}>
              {nav.find(n=>n.id===active)?.label || 'Dashboard'}
            </span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button style={{background:'transparent',border:`1px solid ${T.bd}`,borderRadius:7,
              width:32,height:32,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon n="bell" s={14}/>
            </button>
            <div style={{width:32,height:32,borderRadius:7,background:T.s3,border:`1px solid ${T.bd}`,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:T.ac2}}>AR</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function MobileShell({children,active,onNav,onOpenPalette}){
  const nav = [
    {id:'dashboard',icon:'grid',label:'Home'},
    {id:'inventory',icon:'box',label:'Items'},
    {id:'packstation',icon:'scan',label:'Scan'},
    {id:'challan',icon:'book',label:'Bills'},
    {id:'more',icon:'menu',label:'More'},
  ];
  return (
    <IOSDevice dark width={390} height={844}>
      <div style={{background:T.bg,color:T.tx,fontFamily:T.font,height:'100%',
        display:'flex',flexDirection:'column',position:'relative'}}>
        {/* Ambient */}
        <div style={{position:'absolute',top:-80,right:-80,width:280,height:280,
          background:`radial-gradient(circle,${T.ac}40 0%,transparent 60%)`,filter:'blur(40px)',pointerEvents:'none'}}/>
        {/* Header */}
        <div style={{padding:'50px 20px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',zIndex:2}}>
          <div>
            <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600}}>Wed · 4 Dec</div>
            <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:T.tx,letterSpacing:-.4,marginTop:2}}>
              {nav.find(n=>n.id===active)?.label==='Home'?'Good morning':nav.find(n=>n.id===active)?.label}
            </div>
          </div>
          <button onClick={onOpenPalette} style={{width:36,height:36,borderRadius:10,
            background:T.glass2,border:`1px solid ${T.bd}`,color:T.tx2,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="search" s={16}/>
          </button>
        </div>
        <div style={{flex:1,overflow:'auto',zIndex:1,position:'relative'}}>{children}</div>
        {/* Bottom nav */}
        <div style={{display:'flex',justifyContent:'space-around',padding:'8px 8px 28px',
          borderTop:`1px solid ${T.bd}`,background:T.glass1,backdropFilter:'blur(20px)',zIndex:3}}>
          {nav.map(n=>(
            <button key={n.id} onClick={()=>onNav(n.id==='more'?'dashboard':n.id)}
              style={{background:'transparent',border:'none',display:'flex',flexDirection:'column',
                alignItems:'center',gap:3,padding:'6px 10px',
                color:active===n.id?T.ac2:T.tx3,cursor:'pointer'}}>
              <Icon n={n.icon} s={20}/>
              <span style={{fontSize:10,fontWeight:500}}>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
    </IOSDevice>
  );
}

function MobileHome({things,onThing}){
  return (
    <div style={{padding:'0 16px 16px'}}>
      <div style={{color:T.tx2,fontSize:13,marginBottom:16}}>3 things need attention</div>
      {things.map(t=>(
        <div key={t.id} onClick={t.action} style={{
          background:T.s2,border:`1px solid ${T.bd}`,borderRadius:14,
          padding:16,marginBottom:10,display:'flex',gap:12,
          borderLeft:`3px solid ${t.tone==='re'?T.re:t.tone==='yl'?T.yl:T.bl}`}}>
          <div style={{width:36,height:36,borderRadius:9,
            background:t.tone==='re'?'rgba(248,113,113,.08)':t.tone==='yl'?'rgba(251,191,36,.08)':'rgba(56,189,248,.08)',
            color:t.tone==='re'?T.re:t.tone==='yl'?T.yl:T.bl,
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon n={t.icon} s={18}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,color:T.tx,fontWeight:600,marginBottom:3,lineHeight:1.3}}>{t.title}</div>
            <div style={{fontSize:11,color:T.tx3}}>{t.sub}</div>
          </div>
        </div>
      ))}
      <div style={{marginTop:20,background:T.s2,border:`1px solid ${T.bd}`,borderRadius:14,padding:16}}>
        <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.8,fontWeight:600,marginBottom:8}}>Revenue today</div>
        <div style={{fontFamily:T.sora,fontSize:32,fontWeight:700,color:T.tx,letterSpacing:-1}}>₹42,180</div>
        <div style={{color:T.gr,fontSize:11,marginTop:4,fontWeight:500}}>▲ 18% vs last Wed</div>
      </div>
    </div>
  );
}

// ─── Root App ────────────────────────────────────────
function App(){
  const [device,setDevice] = useState('desktop');
  const [scene,setScene] = useState('dashboard');
  const [paletteOpen,setPaletteOpen] = useState(false);
  const [grouping,setGrouping] = useState('category');
  const [toasts,setToasts] = useState([]);
  const [historyRow,setHistoryRow] = useState(null);
  const [items,setItems] = useState(()=>SAMPLE.skus.map((s,i)=>({
    ...s,
    status:['sorted','sorted','dry_clean','damaged','sorted','packed'][i],
    updated:['2m ago','18m ago','1h ago','3h ago','yest','yest'][i],
    deleted:false,
    history:[
      {action:'Status changed',from:'unsorted',to:['sorted','sorted','dry_clean','damaged','sorted','packed'][i],by:'Arya',when:'18 min ago'},
      {action:'Edited location',from:'Rack 2',to:'Rack 4',by:'Anand',when:'3 hours ago'},
      {action:'SKU created',by:'Arya',when:'Yesterday'},
    ],
  })));
  const [tweaksOpen,setTweaksOpen] = useState(false);
  const timersRef = useRef({});

  // ⌘K / ⌘/ keybinding
  useEffect(()=>{
    const h = e=>{
      if((e.metaKey||e.ctrlKey) && e.key==='k'){ e.preventDefault(); setPaletteOpen(o=>!o); }
      if(e.key==='z' && (e.metaKey||e.ctrlKey)){
        const undoable = toasts.find(t=>t.undoable);
        if(undoable){ e.preventDefault(); handleUndo(undoable.id); }
      }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[toasts]);

  // Tweaks bridge
  useEffect(()=>{
    const onMsg = e=>{
      if(e.data?.type==='__activate_edit_mode') setTweaksOpen(true);
      if(e.data?.type==='__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message',onMsg);
    window.parent.postMessage({type:'__edit_mode_available'},'*');
    return ()=>window.removeEventListener('message',onMsg);
  },[]);

  // Progress countdown for toasts
  useEffect(()=>{
    const int = setInterval(()=>{
      setToasts(ts=>ts.map(t=>t.progress<=0?t:{...t,progress:t.progress-(100/50)}).filter(t=>t.progress>0));
    },100);
    return ()=>clearInterval(int);
  },[]);

  const pushToast = (t)=>{
    const id = Math.random().toString(36).slice(2);
    setToasts(ts=>[...ts,{id,progress:100,...t}]);
    return id;
  };
  const onToast = (title,sub)=>pushToast({title,sub,undoable:false});

  const handleDelete = (row)=>{
    setItems(its=>its.map(i=>i.sku===row.sku?{...i,deleted:true}:i));
    pushToast({
      title:`Deleted "${row.product}"`,
      sub:'Undo within 5 seconds',
      undoable:true,
      undoData:row.sku,
    });
  };
  const handleUndo = (toastId)=>{
    const t = toasts.find(x=>x.id===toastId);
    if(!t) return;
    if(t.undoData){
      setItems(its=>its.map(i=>i.sku===t.undoData?{...i,deleted:false}:i));
      setToasts(ts=>ts.filter(x=>x.id!==toastId));
      pushToast({title:`Restored "${items.find(i=>i.sku===t.undoData)?.product}"`,undoable:false});
    } else if(t.statusUndo){
      setItems(its=>its.map(i=>i.sku===t.statusUndo.sku?{...i,status:t.statusUndo.from}:i));
      setToasts(ts=>ts.filter(x=>x.id!==toastId));
      pushToast({title:'Status reverted',undoable:false});
    }
  };
  const handleStatus = (sku,newStatus)=>{
    let prev='';
    setItems(its=>its.map(i=>{
      if(i.sku===sku){ prev=i.status; return {...i,status:newStatus,updated:'just now',
        history:[{action:'Status changed',from:prev||i.status,to:newStatus,by:'Arya',when:'just now'},...i.history]}; }
      return i;
    }));
    pushToast({
      title:`Status → ${newStatus.replace('_',' ')}`,
      sub:`Was "${prev.replace('_',' ')}"`,
      undoable:true,
      statusUndo:{sku,from:prev},
    });
  };

  const handlePaletteAction = (item)=>{
    setPaletteOpen(false);
    if(item.kind==='nav'){
      const map = {Dashboard:'dashboard',Inventory:'inventory','Brand Tags':'brandtags',
        PackStation:'packstation','Cash Challan':'challan',CashBook:'cashbook',Programs:'programs',Settings:'dashboard'};
      setScene(map[item.label] || 'dashboard');
      onToast(`Opened ${item.label}`);
    } else {
      onToast(item.label);
    }
  };

  const things = [
    {id:'overdue',tone:'re',icon:'alert',title:'4 challans overdue · ₹12,400',sub:'Rao Textiles + 3 more',
      action:()=>{ setScene('challan'); onToast('Opening overdue list…'); }},
    {id:'drycl',tone:'yl',icon:'clock',title:'11 items in dry-clean > 7d',sub:'Review vendor status',
      action:()=>{ setScene('inventory'); onToast('Filtering inventory…'); }},
    {id:'cash',tone:'bl',icon:'cash',title:'₹8,400 cash pending handover',sub:'Yesterday · Anand',
      action:()=>{ setScene('cashbook'); onToast('Starting handover…'); }},
  ];

  // Scene renderer
  const renderScene = ()=>{
    if(scene==='inventory') return <InventoryScene items={items} onDelete={handleDelete}
      onStatusChange={handleStatus} onOpenHistory={setHistoryRow}/>;
    if(scene==='dashboard') return <Cockpit onOpenPalette={()=>setPaletteOpen(true)}
      onDeepLink={(k)=>{ if(k.startsWith('inventory'))setScene('inventory');
        else if(k.startsWith('challan'))setScene('challan');
        else if(k.startsWith('cashbook'))setScene('cashbook'); }} onToast={onToast}/>;
    if(scene==='challan') return <CashChallanScene onToast={onToast}/>;
    if(scene==='cashbook') return <CashBookScene onToast={onToast}/>;
    if(scene==='brandtags') return <BrandTagsScene onToast={onToast}/>;
    if(scene==='packstation') return <PackStationScene onToast={onToast}/>;
    if(scene==='programs') return <ProgramsScene onToast={onToast}/>;
    if(scene==='settings') return <SettingsScene onToast={onToast}/>;
    return null;
  };

  return (
    <div style={{minHeight:'100vh',background:T.bg,position:'relative'}}>
      {/* Device toggle */}
      <div style={{position:'fixed',top:16,right:16,zIndex:500,display:'flex',gap:6,
        background:T.s,border:`1px solid ${T.bd2}`,borderRadius:9,padding:4,boxShadow:'0 10px 30px rgba(0,0,0,.4)'}}>
        {['desktop','mobile','both'].map(d=>(
          <button key={d} onClick={()=>setDevice(d)} style={{
            padding:'6px 12px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:T.font,
            fontSize:11,fontWeight:500,textTransform:'capitalize',letterSpacing:.3,
            background:device===d?T.ac:'transparent',color:device===d?'#fff':T.tx2}}>{d}</button>
        ))}
      </div>

      {device==='desktop' && scene==='login' && <LoginScene onLogin={()=>{setScene('dashboard');onToast('Welcome back, Arya');}}/>}
      {device==='desktop' && scene!=='login' && (
        <div style={{minHeight:'100vh'}}>
          <Shell active={scene} onNav={setScene} onOpenPalette={()=>setPaletteOpen(true)}>
            {renderScene()}
          </Shell>
        </div>
      )}
      {device==='mobile' && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:40}}>
          <MobileShell active={scene} onNav={setScene} onOpenPalette={()=>setPaletteOpen(true)}>
            {scene==='brandtags' ? <BrandTagsMobile onToast={onToast}/> :
              scene==='packstation' ? <PackStationMobile onToast={onToast}/> :
              scene==='dashboard' ? <MobileHome things={things}/> :
              scene==='inventory' ? (
                <div style={{padding:16}}>
                  {items.filter(i=>!i.deleted).slice(0,5).map(it=>(
                    <div key={it.sku} style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:12,
                      padding:14,marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:T.mono,fontSize:10,color:T.tx3}}>{it.sku}</div>
                        <div style={{fontSize:13,color:T.tx,fontWeight:500,marginTop:2}}>{it.product}</div>
                        <div style={{marginTop:6}}><Pill tone="ac">{it.status.replace('_',' ')}</Pill></div>
                      </div>
                      <button onClick={()=>handleDelete(it)} style={{background:'transparent',
                        border:`1px solid ${T.bd}`,borderRadius:8,width:32,height:32,color:T.re,
                        display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <Icon n="trash" s={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              ) : <div style={{padding:'20px 16px',color:T.tx2,fontSize:13}}>Tap ⌘K equivalent (top right) to try the palette.</div>}
          </MobileShell>
        </div>
      )}
      {device==='both' && (
        <div style={{display:'flex',gap:24,minHeight:'100vh',padding:'24px',alignItems:'flex-start'}}>
          <div style={{flex:1,minWidth:0,border:`1px solid ${T.bd}`,borderRadius:16,overflow:'hidden',
            height:'calc(100vh - 48px)',background:T.bg}}>
            <Shell active={scene} onNav={setScene} onOpenPalette={()=>setPaletteOpen(true)}>
              {renderScene()}
            </Shell>
          </div>
          <div style={{position:'sticky',top:24}}>
            <MobileShell active={scene} onNav={setScene} onOpenPalette={()=>setPaletteOpen(true)}>
              {scene==='dashboard' ? <MobileHome things={things}/> :
                <div style={{padding:'20px 16px',color:T.tx2,fontSize:13,textAlign:'center'}}>
                  <div style={{fontFamily:T.sora,fontSize:16,color:T.tx,marginBottom:8}}>
                    {({inventory:'Items',brandtags:'Brand Tags',packstation:'Scan',challan:'Bills',cashbook:'Cash'})[scene]}
                  </div>
                  Switch to Dashboard above to see mobile cockpit.
                </div>}
            </MobileShell>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)}
        onAction={handlePaletteAction} grouping={grouping}/>
      <UndoToasts toasts={toasts} onUndo={handleUndo}
        onDismiss={id=>setToasts(ts=>ts.filter(t=>t.id!==id))}/>
      <ChangeHistory open={!!historyRow} row={historyRow} onClose={()=>setHistoryRow(null)}/>

      {/* Tweaks panel */}
      {tweaksOpen && (
        <div style={{position:'fixed',bottom:20,right:20,zIndex:950,
          background:T.s,border:`1px solid ${T.bd2}`,borderRadius:12,padding:16,width:260,
          boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
          <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx,marginBottom:12}}>Tweaks</div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>⌘K grouping</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {[['category','By category (default)'],['kind','By kind'],['flat','Flat list']].map(([v,l])=>(
              <button key={v} onClick={()=>setGrouping(v)} style={{
                padding:'8px 10px',borderRadius:6,border:`1px solid ${grouping===v?T.ac:T.bd}`,
                background:grouping===v?T.ac3:'transparent',color:T.tx,
                fontFamily:T.font,fontSize:12,textAlign:'left',cursor:'pointer'}}>{l}</button>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:10,color:T.tx3,lineHeight:1.4}}>
            Press <kbd style={{fontFamily:T.mono,color:T.tx2}}>⌘K</kbd> to open palette and see the difference.
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
