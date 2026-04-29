// Cash Challan module — table + Sales Challan/Return popup
// Self-contained scene; uses tokens from components.jsx (T, Icon, Btn, Pill, Card, SAMPLE)

const CHALLAN_DATA = [
  {no:1247, customer:'Rao Textiles', phone:'+91 98XXX 21847', date:'4 Dec 2025', dateRel:'Today',
    items:[{sku:'MYN-FLEX-42-BLK',desc:'Flex Pro Sneaker · 42 · Black',qty:2,price:2499,disc:0},
           {sku:'FLK-COT-L-WHT',desc:'Cotton Tee Classic · L · White',qty:4,price:499,disc:50}],
    shipping:120, paid:0, total:6962, status:'unpaid', mode:'', tags:['B2B','priority'], isReturn:false, ageDays:0},
  {no:1246, customer:'Sharma Emporium', phone:'+91 98XXX 12309', date:'4 Dec 2025', dateRel:'Today',
    items:[{sku:'MYN-DEN-32-IND',desc:'Slim Denim · 32 · Indigo',qty:3,price:1799,disc:0}],
    shipping:0, paid:8250, total:8250, status:'paid', mode:'UPI', tags:['retail'], isReturn:false, ageDays:0},
  {no:1245, customer:'Lakshmi Sarees', phone:'+91 99XXX 45612', date:'2 Dec 2025', dateRel:'2d ago',
    items:[{sku:'MYN-SAR-FRE-RED',desc:'Silk Saree · Free · Red',qty:1,price:4999,disc:0},
           {sku:'AJI-KUR-M-MRN',desc:'Kurta Regular · M · Maroon',qty:2,price:1299,disc:200}],
    shipping:200, paid:3000, total:6800, status:'partial', mode:'Cash', tags:['B2B'], isReturn:false, ageDays:2},
  {no:1244, customer:'City Wholesale', phone:'+91 90XXX 33112', date:'1 Dec 2025', dateRel:'3d ago',
    items:[{sku:'FLK-SHO-9-BRN',desc:'Leather Loafer · 9 · Brown',qty:8,price:2199,disc:1000},
           {sku:'MYN-FLEX-42-BLK',desc:'Flex Pro Sneaker · 42 · Black',qty:6,price:2499,disc:0}],
    shipping:500, paid:24500, total:24500, status:'paid', mode:'Bank Transfer', tags:['B2B','wholesale'], isReturn:false, ageDays:3},
  {no:1243, customer:'Megha Collections', phone:'+91 87XXX 99001', date:'30 Nov 2025', dateRel:'5d ago',
    items:[{sku:'MYN-DEN-32-IND',desc:'Slim Denim · 32 · Indigo',qty:1,price:1799,disc:0}],
    shipping:0, paid:0, total:3200, status:'draft', mode:'', tags:[], isReturn:false, ageDays:5},
  {no:1242, customer:'Rao Textiles', phone:'+91 98XXX 21847', date:'29 Nov 2025', dateRel:'6d ago',
    items:[{sku:'MYN-FLEX-42-BLK',desc:'Flex Pro Sneaker · 42 · Black',qty:1,price:2499,disc:0}],
    shipping:0, paid:0, total:2499, status:'unpaid', mode:'', tags:['B2B'], isReturn:false, ageDays:6},
  {no:1241, customer:'Sharma Emporium', phone:'+91 98XXX 12309', date:'28 Nov 2025', dateRel:'7d ago',
    items:[{sku:'AJI-KUR-M-MRN',desc:'Kurta Regular · M · Maroon',qty:-1,price:1299,disc:0}],
    shipping:0, paid:1299, total:-1299, status:'paid', mode:'Cash', tags:['return'], isReturn:true, sourceNo:1238, ageDays:7},
  {no:1240, customer:'Devi Textiles', phone:'+91 91XXX 80021', date:'28 Nov 2025', dateRel:'7d ago',
    items:[{sku:'FLK-COT-L-WHT',desc:'Cotton Tee Classic · L · White',qty:12,price:499,disc:200}],
    shipping:80, paid:0, total:5868, status:'voided', mode:'', tags:[], isReturn:false, ageDays:7},
];

const STATUS_TONE = {paid:'gr',unpaid:'re',partial:'yl',draft:'bl',voided:'neutral'};
const STATUS_LABEL = {paid:'Paid',unpaid:'Unpaid',partial:'Partial',draft:'Draft',voided:'Voided'};

// ─────────────────────────────────────────────────────────
function CashChallanScene({onToast}){
  const [search,setSearch] = React.useState('');
  const [statusFilter,setStatusFilter] = React.useState([]);
  const [tagFilter,setTagFilter] = React.useState([]);
  const [filterOpen,setFilterOpen] = React.useState(false);
  const [preset,setPreset] = React.useState('all');
  const [sort,setSort] = React.useState({key:'no',dir:'desc'});
  const [openMenu,setOpenMenu] = React.useState(null);
  const [modalOpen,setModalOpen] = React.useState(false);
  const [modalMode,setModalMode] = React.useState('challan'); // 'challan' | 'return'
  const [editingChallan,setEditingChallan] = React.useState(null);
  const [data,setData] = React.useState(CHALLAN_DATA);
  const [view,setView] = React.useState('table'); // table | ledger | ledgerDetail | analytics | cashbook
  const [ledgerCustomer,setLedgerCustomer] = React.useState(null);
  const [auditFor,setAuditFor] = React.useState(null);
  const [reminderFor,setReminderFor] = React.useState(null);
  const [erpOpen,setErpOpen] = React.useState(false);

  React.useEffect(()=>{
    const h = e=>{ if(!e.target.closest('[data-cm]')) setOpenMenu(null); };
    document.addEventListener('click',h);
    return ()=>document.removeEventListener('click',h);
  },[]);

  const ALL_TAGS = ['B2B','retail','wholesale','priority','return'];
  const PRESETS = [
    {id:'all',label:'All'},
    {id:'unpaid',label:'Unpaid',filter:{status:['unpaid','partial']}},
    {id:'overdue',label:'Overdue · 4+ days',filter:{status:['unpaid','partial'],minAge:4}},
    {id:'today',label:'Today',filter:{today:true}},
    {id:'returns',label:'Returns',filter:{returns:true}},
  ];
  const applyPreset = (p)=>{
    setPreset(p.id);
    if(p.id==='all'){ setStatusFilter([]); setTagFilter([]); return; }
    if(p.filter?.status) setStatusFilter(p.filter.status); else setStatusFilter([]);
    if(p.filter?.returns) setTagFilter(['return']); else setTagFilter([]);
  };

  // Filter + sort
  const visible = React.useMemo(()=>{
    let rows = data.filter(r=>{
      if(search){
        const s = search.toLowerCase();
        if(!`${r.no} ${r.customer} ${r.items.map(i=>i.sku).join(' ')}`.toLowerCase().includes(s)) return false;
      }
      if(statusFilter.length && !statusFilter.includes(r.status)) return false;
      if(tagFilter.length && !tagFilter.some(t=>r.tags.includes(t))) return false;
      if(preset==='today' && r.dateRel!=='Today') return false;
      if(preset==='overdue' && r.ageDays<4) return false;
      if(preset==='returns' && !r.isReturn) return false;
      return true;
    });
    rows.sort((a,b)=>{
      const k = sort.key, d = sort.dir==='asc'?1:-1;
      if(k==='no') return (a.no-b.no)*d;
      if(k==='customer') return a.customer.localeCompare(b.customer)*d;
      if(k==='total') return (a.total-b.total)*d;
      if(k==='age') return (a.ageDays-b.ageDays)*d;
      return 0;
    });
    return rows;
  },[data,search,statusFilter,tagFilter,preset,sort]);

  const totals = visible.reduce((acc,r)=>{
    if(r.status==='voided') return acc;
    acc.gross += r.total;
    acc.collected += r.paid;
    acc.outstanding += (r.total - r.paid);
    return acc;
  },{gross:0,collected:0,outstanding:0});

  const activeCount = statusFilter.length + tagFilter.length;

  if(view==='ledger') return <LedgerScreen onBack={()=>setView('table')}
    onOpenDetail={(name)=>{setLedgerCustomer(name);setView('ledgerDetail');}} onToast={onToast}/>;
  if(view==='ledgerDetail') return <LedgerDetailScreen customerName={ledgerCustomer}
    onBack={()=>setView('ledger')} onToast={onToast}/>;
  if(view==='analytics') return <AnalyticsScreen onBack={()=>setView('table')} onToast={onToast}/>;
  if(view==='cashbook') return <CashBookStub onBack={()=>setView('table')}/>;

  const SortHead = ({k,children,align='left',w})=>(
    <button onClick={()=>setSort(s=>({key:k,dir:s.key===k && s.dir==='desc'?'asc':'desc'}))}
      style={{background:'transparent',border:'none',color:T.tx3,fontSize:10,fontWeight:600,
        textTransform:'uppercase',letterSpacing:1.6,fontFamily:T.font,cursor:'pointer',
        display:'flex',alignItems:'center',gap:4,padding:0,
        textAlign:align,justifyContent:align==='right'?'flex-end':'flex-start',width:w||'auto'}}>
      {children}
      {sort.key===k && <Icon n={sort.dir==='asc'?'up':'down'} s={9}/>}
    </button>
  );

  return (
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:20,gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:6}}>Cash Challan</div>
          <div style={{fontFamily:T.sora,fontSize:28,fontWeight:700,letterSpacing:-.5,color:T.tx}}>Sales challans</div>
          <div style={{color:T.tx2,fontSize:13,marginTop:4}}>
            {visible.length} of {data.length} challans
            {activeCount>0 && <span style={{color:T.ac2}}> · {activeCount} filter active</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <Btn icon="cash" onClick={()=>setView('cashbook')}>CashBook</Btn>
          <Btn icon="book" onClick={()=>setView('ledger')}>Ledger</Btn>
          <Btn icon="chart" onClick={()=>setView('analytics')}>Analytics</Btn>
          <Btn icon="rotate" onClick={()=>{setModalMode('return');setEditingChallan(null);setModalOpen(true);}}>New return</Btn>
          <Btn icon="plus" kind="primary" onClick={()=>{setModalMode('challan');setEditingChallan(null);setModalOpen(true);}}>New challan</Btn>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        {[
          {label:'Gross sales',value:`₹${totals.gross.toLocaleString('en-IN')}`,sub:`${visible.filter(r=>r.status!=='voided').length} active`,tone:'tx'},
          {label:'Collected',value:`₹${totals.collected.toLocaleString('en-IN')}`,sub:`${Math.round(totals.collected/Math.max(1,totals.gross)*100)}% rate`,tone:'gr'},
          {label:'Outstanding',value:`₹${Math.max(0,totals.outstanding).toLocaleString('en-IN')}`,sub:'unpaid + partial',tone:totals.outstanding>0?'yl':'tx'},
          {label:'Overdue',value:visible.filter(r=>(r.status==='unpaid'||r.status==='partial')&&r.ageDays>=4).length,sub:'4+ days',tone:'re'},
        ].map(k=>(
          <Card key={k.label} pad={14} style={{borderLeft:`2px solid ${k.tone==='gr'?T.gr:k.tone==='yl'?T.yl:k.tone==='re'?T.re:T.bd}`}}>
            <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:6}}>{k.label}</div>
            <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:k.tone==='gr'?T.gr:k.tone==='yl'?T.yl:k.tone==='re'?T.re:T.tx,letterSpacing:-.5}}>{k.value}</div>
            <div style={{fontSize:11,color:T.tx3,marginTop:4}}>{k.sub}</div>
          </Card>
        ))}
      </div>

      {/* Toolbar: presets + search + filter */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:activeCount?12:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4,padding:4,background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:9}}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>applyPreset(p)} style={{
              padding:'6px 11px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:T.font,
              fontSize:12,fontWeight:500,
              background:preset===p.id?T.ac3:'transparent',
              color:preset===p.id?T.ac2:T.tx2,transition:'all .1s'}}>{p.label}</button>
          ))}
        </div>

        <div style={{flex:1,minWidth:200,maxWidth:340,position:'relative'}}>
          <div style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:T.tx3}}>
            <Icon n="search" s={14}/>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Challan #, customer, SKU…" style={{
            width:'100%',height:34,paddingLeft:34,paddingRight:12,
            background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
            color:T.tx,fontSize:12.5,fontFamily:T.font,outline:'none'}}/>
        </div>

        <div style={{position:'relative'}} data-cm>
          <button onClick={()=>setFilterOpen(o=>!o)} style={{
            display:'inline-flex',alignItems:'center',gap:8,height:34,padding:'0 12px',
            background:filterOpen||activeCount?T.ac3:T.glass1,
            border:`1px solid ${filterOpen||activeCount?'rgba(99,102,241,.35)':T.bd}`,
            borderRadius:8,color:activeCount?T.ac2:T.tx,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:T.font}}>
            <Icon n="settings" s={13}/>Filters
            {activeCount>0 && <span style={{background:T.ac,color:'#fff',borderRadius:10,padding:'1px 7px',fontSize:10,fontFamily:T.mono,fontWeight:600}}>{activeCount}</span>}
            <Icon n="chev" s={11} c={T.tx3}/>
          </button>
          {filterOpen && (
            <>
              <div onClick={()=>setFilterOpen(false)} style={{position:'fixed',inset:0,zIndex:100}}/>
              <div style={{position:'absolute',top:42,right:0,width:380,zIndex:101,
                background:T.s,border:`1px solid ${T.bd2}`,borderRadius:12,overflow:'hidden',
                boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
                <div style={{padding:'14px 18px',borderBottom:`1px solid ${T.bd}`,display:'flex',justifyContent:'space-between'}}>
                  <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx}}>Filter challans</div>
                  {activeCount>0 && <button onClick={()=>{setStatusFilter([]);setTagFilter([])}} style={{background:'transparent',border:'none',color:T.tx3,fontSize:11,cursor:'pointer'}}>Clear all</button>}
                </div>
                <div style={{padding:'14px 18px'}}>
                  <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:8}}>Status</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
                    {Object.keys(STATUS_LABEL).map(s=>{
                      const on = statusFilter.includes(s);
                      return <button key={s} onClick={()=>setStatusFilter(f=>on?f.filter(x=>x!==s):[...f,s])}
                        style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${on?'rgba(99,102,241,.3)':T.bd}`,
                          background:on?T.ac3:'transparent',color:on?T.ac2:T.tx2,
                          fontSize:11.5,cursor:'pointer',fontFamily:T.font}}>{STATUS_LABEL[s]}</button>;
                    })}
                  </div>
                  <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:8}}>Tag</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {ALL_TAGS.map(t=>{
                      const on = tagFilter.includes(t);
                      return <button key={t} onClick={()=>setTagFilter(f=>on?f.filter(x=>x!==t):[...f,t])}
                        style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${on?'rgba(99,102,241,.3)':T.bd}`,
                          background:on?T.ac3:'transparent',color:on?T.ac2:T.tx2,
                          fontSize:11.5,cursor:'pointer',fontFamily:T.font}}>{t}</button>;
                    })}
                  </div>
                </div>
                <div style={{padding:'12px 18px',borderTop:`1px solid ${T.bd}`,background:T.glass1,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:T.tx3}}>{visible.length} matches</span>
                  <Btn kind="primary" onClick={()=>setFilterOpen(false)} style={{height:30}}>Done</Btn>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active chips */}
      {activeCount>0 && (
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginRight:4}}>Active:</span>
          {statusFilter.map(s=>(
            <button key={'s'+s} onClick={()=>setStatusFilter(f=>f.filter(x=>x!==s))} style={chipStyle()}>
              <span style={{color:T.tx3,fontSize:10}}>Status:</span>{STATUS_LABEL[s]}<XIcon/>
            </button>
          ))}
          {tagFilter.map(t=>(
            <button key={'t'+t} onClick={()=>setTagFilter(f=>f.filter(x=>x!==t))} style={chipStyle()}>
              <span style={{color:T.tx3,fontSize:10}}>Tag:</span>{t}<XIcon/>
            </button>
          ))}
          <button onClick={()=>{setStatusFilter([]);setTagFilter([])}} style={{background:'transparent',border:'none',color:T.tx3,fontSize:11,cursor:'pointer',textDecoration:'underline',fontFamily:T.font}}>Clear all</button>
        </div>
      )}

      {/* Table */}
      <Card pad={0} style={{overflowX:'auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'80px minmax(180px,1.4fr) minmax(200px,1.6fr) 90px 130px 130px 110px 52px',
          padding:'12px 18px',borderBottom:`1px solid ${T.bd}`,gap:14,alignItems:'center',minWidth:1020}}>
          <SortHead k="no">#</SortHead>
          <SortHead k="customer">Customer</SortHead>
          <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600}}>Items</div>
          <SortHead k="age">Age</SortHead>
          <SortHead k="total" align="right">Total</SortHead>
          <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,textAlign:'right'}}>Balance</div>
          <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600}}>Status</div>
          <div></div>
        </div>

        {visible.length===0 && (
          <div style={{padding:'60px 20px',textAlign:'center'}}>
            <div style={{fontSize:13,color:T.tx2}}>No challans match these filters</div>
          </div>
        )}

        {visible.map(r=>{
          const balance = r.total - r.paid;
          const tone = STATUS_TONE[r.status];
          const isOverdue = (r.status==='unpaid'||r.status==='partial') && r.ageDays>=4;
          return (
            <div key={r.no} onClick={()=>{setEditingChallan(r);setModalMode(r.isReturn?'return':'challan');setModalOpen(true);}}
              style={{display:'grid',gridTemplateColumns:'80px minmax(180px,1.4fr) minmax(200px,1.6fr) 90px 130px 130px 110px 52px',
                padding:'14px 18px',borderBottom:`1px solid ${T.bd}`,gap:14,alignItems:'center',
                cursor:'pointer',transition:'background .1s',minWidth:1020,
                opacity:r.status==='voided'?.5:1}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.03)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:T.mono,fontSize:13,color:T.tx,fontWeight:500}}>#{r.no}</span>
                  {r.isReturn && <Pill tone="ac" dot>RET</Pill>}
                </div>
                <div style={{fontSize:10,color:T.tx3,marginTop:2}}>{r.dateRel}</div>
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,color:T.tx,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.customer}</div>
                <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono,marginTop:2}}>{r.phone}</div>
                {r.tags.length>0 && <div style={{display:'flex',gap:4,marginTop:6}}>
                  {r.tags.slice(0,2).map(t=><span key={t} style={{fontSize:10,padding:'2px 6px',background:T.glass2,borderRadius:4,color:T.tx3}}>{t}</span>)}
                </div>}
              </div>
              <div style={{fontSize:12,color:T.tx2,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{r.items.length} item{r.items.length>1?'s':''}</span>
                  <span style={{color:T.tx3}}>·</span>
                  <span style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{r.items.reduce((s,i)=>s+Math.abs(i.qty),0)} qty</span>
                </div>
                <div style={{fontSize:11,color:T.tx2,marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {r.items.slice(0,2).map(i=>i.desc.split(' · ')[0]).join(', ')}
                  {r.items.length>2 && <span style={{color:T.tx3}}> +{r.items.length-2}</span>}
                </div>
              </div>
              <div>
                {isOverdue ? <Pill tone="re" dot>{r.ageDays}d</Pill> :
                 r.ageDays===0 ? <span style={{fontSize:11,color:T.tx2}}>Today</span> :
                 <span style={{fontSize:11,color:T.tx3}}>{r.ageDays}d ago</span>}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:r.total<0?T.ac2:T.tx,letterSpacing:-.3}}>
                  {r.total<0?'−':''}₹{Math.abs(r.total).toLocaleString('en-IN')}
                </div>
                {r.mode && <div style={{fontSize:10,color:T.tx3,marginTop:2,fontFamily:T.mono}}>{r.mode}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                {r.status==='paid' ? <span style={{fontSize:11,color:T.gr,fontWeight:500}}>Settled</span> :
                 r.status==='voided' ? <span style={{fontSize:11,color:T.tx3}}>—</span> :
                 r.status==='draft' ? <span style={{fontSize:11,color:T.bl}}>Draft</span> : (
                  <>
                    <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.yl}}>₹{balance.toLocaleString('en-IN')}</div>
                    {r.paid>0 && <div style={{fontSize:10,color:T.tx3,marginTop:2}}>of ₹{r.total.toLocaleString('en-IN')}</div>}
                  </>
                )}
              </div>
              <div><Pill tone={tone} dot>{STATUS_LABEL[r.status]}</Pill></div>
              <div style={{position:'relative',display:'flex',justifyContent:'flex-end'}} data-cm>
                <button onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===r.no?null:r.no);}}
                  style={{background:'transparent',border:`1px solid ${openMenu===r.no?T.bd2:'transparent'}`,
                    borderRadius:6,width:30,height:30,cursor:'pointer',color:T.tx2,
                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
                {openMenu===r.no && (
                  <div onClick={e=>e.stopPropagation()} style={{position:'absolute',right:0,top:36,width:200,zIndex:50,
                    background:T.s,border:`1px solid ${T.bd2}`,borderRadius:9,overflow:'hidden',
                    boxShadow:'0 14px 30px rgba(0,0,0,.5)'}}>
                    {[
                      {icon:'search',label:'View challan',action:()=>{setOpenMenu(null);setEditingChallan(r);setModalMode(r.isReturn?'return':'challan');setModalOpen(true);}},
                      {icon:'edit',label:'Edit',action:()=>{setOpenMenu(null);setEditingChallan(r);setModalMode(r.isReturn?'return':'challan');setModalOpen(true);},disabled:r.status==='voided'},
                      {icon:'rotate',label:'Create return',action:()=>{setOpenMenu(null);setEditingChallan(null);setModalMode('return');setModalOpen(true);onToast?.(`Returning from #${r.no}`);},disabled:r.isReturn||r.status==='voided'},
                      {icon:'cash',label:'Record payment',action:()=>{setOpenMenu(null);onToast?.('Payment dialog…');},disabled:r.status==='paid'||r.status==='voided'},
                      {icon:'tag',label:'Send reminder',action:()=>{setOpenMenu(null);setReminderFor(r);},disabled:r.status==='paid'||r.status==='voided'},
                      {icon:'clock',label:'Audit trail',action:()=>{setOpenMenu(null);setAuditFor(r);}},
                    ].map(m=>(
                      <button key={m.label} onClick={m.action} disabled={m.disabled}
                        style={{width:'100%',padding:'8px 12px',background:'transparent',border:'none',
                          display:'flex',alignItems:'center',gap:10,
                          color:m.disabled?T.tx3:T.tx,fontSize:12.5,
                          cursor:m.disabled?'not-allowed':'pointer',fontFamily:T.font,textAlign:'left',
                          opacity:m.disabled?.4:1}}
                        onMouseEnter={e=>{if(!m.disabled) e.currentTarget.style.background='rgba(255,255,255,.04)'}}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Icon n={m.icon} s={13} c={T.tx2}/>{m.label}
                      </button>
                    ))}
                    <div style={{height:1,background:T.bd}}/>
                    <button onClick={()=>{setOpenMenu(null);onToast?.(`Voided #${r.no}`);}}
                      disabled={r.status==='voided'}
                      style={{width:'100%',padding:'8px 12px',background:'transparent',border:'none',
                        display:'flex',alignItems:'center',gap:10,color:T.re,fontSize:12.5,
                        cursor:r.status==='voided'?'not-allowed':'pointer',opacity:r.status==='voided'?.4:1,
                        fontFamily:T.font,textAlign:'left'}}
                      onMouseEnter={e=>{if(r.status!=='voided') e.currentTarget.style.background='rgba(248,113,113,.06)'}}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <Icon n="x" s={13}/>Void challan
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <ChallanModal open={modalOpen} mode={modalMode} editing={editingChallan}
        onClose={()=>setModalOpen(false)}
        onSave={(payload)=>{
          setModalOpen(false);
          onToast?.(`${payload.isReturn?'Return':'Challan'} #${payload.no} ${editingChallan?'updated':'created'}`);
          if(!editingChallan && !payload.isReturn) setTimeout(()=>setErpOpen(true),400);
        }}/>
      <AuditTrailPopup open={!!auditFor} challanNo={auditFor?.no} onClose={()=>setAuditFor(null)}/>
      <ReminderPopup open={!!reminderFor} customer={reminderFor?.customer}
        onClose={()=>setReminderFor(null)}
        onSend={(p)=>onToast?.(`WhatsApp opened → +91 ${p}`)}/>
      <ErpReminderPopup open={erpOpen} onClose={()=>setErpOpen(false)}/>
    </div>
  );
}

const chipStyle = ()=>({display:'inline-flex',alignItems:'center',gap:6,padding:'4px 6px 4px 10px',
  background:T.ac3,border:'1px solid rgba(99,102,241,.25)',borderRadius:6,
  color:T.ac2,fontSize:11.5,fontFamily:T.font,cursor:'pointer'});
const XIcon = ()=>(<span style={{width:16,height:16,borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.06)'}}><Icon n="x" s={10}/></span>);

// ─────────────────────────────────────────────────────────
// Sales Challan / Sales Return modal
// ─────────────────────────────────────────────────────────
const PAYMENT_MODES = ['Cash','UPI','Bank Transfer','Cheque','Card'];
const SAMPLE_CUSTOMERS = [
  {name:'Rao Textiles',phone:'+91 98XXX 21847',gstin:'27ABCDE1234F1Z5',outstanding:17800,address:'Shop 12, Mangaldas Market, Mumbai'},
  {name:'Sharma Emporium',phone:'+91 98XXX 12309',gstin:'07PQRSX5678H2Z1',outstanding:0,address:'B-44 Karol Bagh, Delhi'},
  {name:'Lakshmi Sarees',phone:'+91 99XXX 45612',gstin:'',outstanding:6800,address:'Pondy Bazaar, Chennai'},
  {name:'City Wholesale',phone:'+91 90XXX 33112',gstin:'29XYZAB9012K3Z9',outstanding:0,address:'Avenue Rd, Bengaluru'},
];
const RETURN_SOURCES = [
  {no:1238,customer:'Sharma Emporium',date:'25 Nov',total:5196,
    items:[{sku:'AJI-KUR-M-MRN',desc:'Kurta Regular · M · Maroon',qty:4,price:1299,disc:0,returned:0}]},
  {no:1230,customer:'Rao Textiles',date:'20 Nov',total:9996,
    items:[{sku:'MYN-FLEX-42-BLK',desc:'Flex Pro Sneaker · 42 · Black',qty:4,price:2499,disc:0,returned:0}]},
];

function ChallanModal({open,mode,editing,onClose,onSave}){
  const isReturn = mode==='return';
  const [customerOpen,setCustomerOpen] = React.useState(false);
  const [customer,setCustomer] = React.useState(null);
  const [customerQ,setCustomerQ] = React.useState('');
  const [returnSource,setReturnSource] = React.useState(null);
  const [items,setItems] = React.useState([{sku:'',desc:'',qty:1,price:0,disc:0,discType:'flat'}]);
  const [shipping,setShipping] = React.useState(0);
  const [paymentMode,setPaymentMode] = React.useState('');
  const [amountPaid,setAmountPaid] = React.useState(0);
  const [paymentDate,setPaymentDate] = React.useState('2025-12-04');
  const [notes,setNotes] = React.useState('');
  const [tags,setTags] = React.useState([]);
  const [skuFocus,setSkuFocus] = React.useState(null); // index of focused sku row
  const [skuQ,setSkuQ] = React.useState('');

  const challanNo = editing?.no || 1248;

  // Hydrate from editing
  React.useEffect(()=>{
    if(!open) return;
    if(editing){
      setCustomer({name:editing.customer,phone:editing.phone,gstin:'',outstanding:0,address:''});
      setItems(editing.items.map(i=>({...i,discType:i.disc>0?'flat':'flat'})));
      setShipping(editing.shipping||0);
      setPaymentMode(editing.mode||'');
      setAmountPaid(editing.paid||0);
      setNotes('');
      setTags(editing.tags||[]);
    } else {
      setCustomer(null); setReturnSource(null);
      setItems([{sku:'',desc:'',qty:isReturn?-1:1,price:0,disc:0,discType:'flat'}]);
      setShipping(0); setPaymentMode(''); setAmountPaid(0); setNotes(''); setTags([]);
    }
  },[open,editing,isReturn]);

  if(!open) return null;

  const computeLine = (it)=>{
    const lt = it.qty * it.price;
    const d = it.discType==='percentage' ? Math.min(lt*(it.disc||0)/100,Math.abs(lt)) : Math.min(it.disc||0,Math.abs(lt));
    return Math.round((lt - (lt<0?-Math.abs(d):Math.abs(d)))*100)/100;
  };
  const subtotal = items.reduce((s,i)=>s+computeLine(i),0);
  const totalDisc = items.reduce((s,i)=>s+(i.qty*i.price-computeLine(i)),0);
  const shipClamped = Math.max(0, shipping);
  const grandTotal = Math.round(subtotal + (isReturn?0:shipClamped));
  const balance = grandTotal - (amountPaid||0);
  const status = isReturn ? 'paid' : amountPaid<=0 ? 'unpaid' : amountPaid>=grandTotal ? 'paid' : 'partial';

  const pickCustomer = (c)=>{ setCustomer(c); setCustomerOpen(false); setCustomerQ(''); };
  const pickSku = (idx,sku)=>{
    const n = [...items];
    n[idx] = {...n[idx], sku:sku.sku, desc:`${sku.product} · ${sku.size} · ${sku.color}`, price:sku.mrp};
    setItems(n); setSkuFocus(null); setSkuQ('');
  };
  const addRow = ()=>setItems([...items,{sku:'',desc:'',qty:isReturn?-1:1,price:0,disc:0,discType:'flat'}]);
  const removeRow = (i)=>setItems(items.filter((_,x)=>x!==i));
  const updateRow = (i,patch)=>setItems(items.map((it,x)=>x===i?{...it,...patch}:it));

  const filteredCustomers = SAMPLE_CUSTOMERS.filter(c=>!customerQ || c.name.toLowerCase().includes(customerQ.toLowerCase()) || c.phone.includes(customerQ));
  const filteredSkus = SAMPLE.skus.filter(s=>!skuQ || s.sku.toLowerCase().includes(skuQ.toLowerCase()) || s.product.toLowerCase().includes(skuQ.toLowerCase()));

  const lockItems = isReturn && !!returnSource; // when return is bound to source, items are locked

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:600,
      background:'rgba(2,4,10,.78)',backdropFilter:'blur(6px)',
      display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 24px',overflowY:'auto'}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%',maxWidth:'min(1080px, calc(100vw - 48px))',background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:14,boxShadow:'0 30px 80px rgba(0,0,0,.6)',overflow:'visible'}}>

        {/* Header */}
        <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.bd}`,
          display:'flex',justifyContent:'space-between',alignItems:'center',
          background:isReturn?'linear-gradient(180deg,rgba(99,102,241,.06),transparent)':'transparent'}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:38,height:38,borderRadius:9,
              background:isReturn?T.ac3:'rgba(52,211,153,.1)',
              border:`1px solid ${isReturn?'rgba(99,102,241,.25)':'rgba(52,211,153,.2)'}`,
              display:'flex',alignItems:'center',justifyContent:'center',
              color:isReturn?T.ac2:T.gr}}>
              <Icon n={isReturn?'rotate':'cash'} s={18}/>
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <h2 style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3,margin:0}}>
                  {editing ? `${isReturn?'Return':'Challan'} #${challanNo}` : `New ${isReturn?'sales return':'sales challan'}`}
                </h2>
                {isReturn && <Pill tone="ac" dot>RETURN</Pill>}
                {editing && <Pill tone={STATUS_TONE[editing.status]} dot>{STATUS_LABEL[editing.status]}</Pill>}
              </div>
              <div style={{fontSize:11,color:T.tx3,marginTop:3,fontFamily:T.mono}}>
                {editing ? `Created ${editing.dateRel}` : `Will be assigned #${challanNo} on save`}
                {isReturn && returnSource && <span> · linked to <span style={{color:T.ac2}}>#{returnSource.no}</span></span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${T.bd}`,
            borderRadius:7,width:32,height:32,color:T.tx2,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="x" s={14}/>
          </button>
        </div>

        {/* Body */}
        <div style={{padding:'18px 22px',display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:20}}>
          {/* LEFT column */}
          <div style={{minWidth:0}}>
            {/* Return-source selector (only in return mode, before items) */}
            {isReturn && (
              <div style={{marginBottom:16,padding:14,background:T.glass1,
                border:`1px dashed ${returnSource?'rgba(99,102,241,.3)':T.bd2}`,borderRadius:10}}>
                <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:8}}>
                  Original challan {returnSource && '· locked'}
                </div>
                {!returnSource ? (
                  <>
                    <div style={{position:'relative'}}>
                      <input placeholder="Search by challan #, customer, SKU…" style={modalInput()}/>
                    </div>
                    <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
                      {RETURN_SOURCES.map(rs=>(
                        <button key={rs.no} onClick={()=>{
                          setReturnSource(rs);
                          setCustomer(SAMPLE_CUSTOMERS.find(c=>c.name===rs.customer));
                          setItems(rs.items.map(i=>({...i,qty:-i.qty,discType:'flat'})));
                        }} style={{
                          display:'flex',justifyContent:'space-between',alignItems:'center',
                          padding:'8px 12px',background:T.glass2,border:`1px solid ${T.bd}`,
                          borderRadius:6,color:T.tx,fontSize:12,cursor:'pointer',textAlign:'left'}}>
                          <div>
                            <span style={{fontFamily:T.mono,color:T.ac2}}>#{rs.no}</span>
                            <span style={{margin:'0 8px',color:T.tx3}}>·</span>
                            <span>{rs.customer}</span>
                            <span style={{margin:'0 8px',color:T.tx3}}>·</span>
                            <span style={{color:T.tx3}}>{rs.date}</span>
                          </div>
                          <span style={{fontFamily:T.mono,color:T.tx2}}>₹{rs.total.toLocaleString('en-IN')}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <span style={{fontFamily:T.mono,color:T.ac2,fontWeight:500}}>#{returnSource.no}</span>
                      <span style={{margin:'0 8px',color:T.tx3}}>·</span>
                      <span style={{color:T.tx,fontWeight:500}}>{returnSource.customer}</span>
                      <span style={{margin:'0 8px',color:T.tx3}}>·</span>
                      <span style={{color:T.tx3,fontSize:11}}>{returnSource.date} · ₹{returnSource.total.toLocaleString('en-IN')}</span>
                    </div>
                    <button onClick={()=>{setReturnSource(null);setItems([{sku:'',desc:'',qty:-1,price:0,disc:0,discType:'flat'}]);}} style={{
                      background:'transparent',border:'none',color:T.tx3,fontSize:11,cursor:'pointer',textDecoration:'underline'}}>Change</button>
                  </div>
                )}
              </div>
            )}

            {/* Customer */}
            <div style={{marginBottom:16}}>
              <label style={modalLabel()}>Customer {!isReturn && <span style={{color:T.re}}>*</span>}</label>
              <div style={{position:'relative'}} data-cm>
                {customer ? (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'10px 12px',background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                      <div style={{width:32,height:32,borderRadius:7,background:T.ac3,
                        display:'flex',alignItems:'center',justifyContent:'center',color:T.ac2,fontWeight:600,fontSize:13}}>
                        {customer.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{customer.name}</div>
                        <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono}}>{customer.phone}{customer.gstin && ` · GST ${customer.gstin}`}</div>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      {customer.outstanding>0 && <Pill tone="yl" dot>₹{customer.outstanding.toLocaleString('en-IN')} due</Pill>}
                      {!isReturn && <button onClick={()=>setCustomer(null)} style={{background:'transparent',border:'none',color:T.tx3,fontSize:11,cursor:'pointer',textDecoration:'underline'}}>Change</button>}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{position:'relative'}}>
                      <div style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:T.tx3}}><Icon n="search" s={14}/></div>
                      <input value={customerQ} onChange={e=>{setCustomerQ(e.target.value);setCustomerOpen(true);}}
                        onFocus={()=>setCustomerOpen(true)} placeholder="Search customer or add new…"
                        style={{...modalInput(),paddingLeft:34}}/>
                    </div>
                    {customerOpen && (
                      <div style={{position:'absolute',top:42,left:0,right:0,zIndex:30,
                        background:T.s,border:`1px solid ${T.bd2}`,borderRadius:9,
                        boxShadow:'0 14px 30px rgba(0,0,0,.5)',maxHeight:280,overflowY:'auto'}}>
                        {filteredCustomers.map(c=>(
                          <button key={c.name} onClick={()=>pickCustomer(c)} style={{
                            width:'100%',padding:'10px 12px',background:'transparent',border:'none',
                            display:'flex',justifyContent:'space-between',alignItems:'center',
                            color:T.tx,fontSize:12.5,cursor:'pointer',fontFamily:T.font,textAlign:'left',
                            borderBottom:`1px solid ${T.bd}`}}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.04)'}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <div>
                              <div style={{fontWeight:500}}>{c.name}</div>
                              <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono,marginTop:2}}>{c.phone}</div>
                            </div>
                            {c.outstanding>0 && <Pill tone="yl">₹{c.outstanding.toLocaleString('en-IN')}</Pill>}
                          </button>
                        ))}
                        <button style={{width:'100%',padding:'10px 12px',background:T.ac3,border:'none',
                          display:'flex',alignItems:'center',gap:8,color:T.ac2,fontSize:12.5,
                          cursor:'pointer',fontFamily:T.font,fontWeight:500,textAlign:'left'}}>
                          <Icon n="plus" s={13}/>Add new customer "{customerQ||'…'}"
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Items table */}
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <label style={{...modalLabel(),margin:0}}>Items {isReturn && lockItems && '(quantities adjustable)'}</label>
                <span style={{fontSize:11,color:T.tx3}}>{items.length} row{items.length>1?'s':''}</span>
              </div>
              <div style={{border:`1px solid ${T.bd}`,borderRadius:9,overflow:'visible'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.6fr 70px 100px 110px 90px 32px',
                  padding:'10px 12px',gap:10,background:T.glass1,borderBottom:`1px solid ${T.bd}`,
                  fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
                  <span>SKU / item</span>
                  <span style={{textAlign:'right'}}>Qty</span>
                  <span style={{textAlign:'right'}}>Price</span>
                  <span style={{textAlign:'right'}}>Discount</span>
                  <span style={{textAlign:'right'}}>Total</span>
                  <span></span>
                </div>
                {items.map((it,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1.6fr 70px 100px 110px 90px 32px',
                    padding:'10px 12px',gap:10,borderBottom:i<items.length-1?`1px solid ${T.bd}`:'none',alignItems:'center'}}>
                    <div style={{position:'relative',minWidth:0}} data-cm>
                      <input value={it.sku} onChange={e=>{updateRow(i,{sku:e.target.value});setSkuQ(e.target.value);setSkuFocus(i);}}
                        onFocus={()=>{setSkuFocus(i);setSkuQ(it.sku);}}
                        disabled={lockItems}
                        placeholder="Type SKU or scan…" style={{...modalInput(),fontFamily:T.mono,fontSize:11.5,padding:'6px 8px',height:32,
                          opacity:lockItems?.6:1}}/>
                      {it.desc && <div style={{fontSize:11,color:T.tx2,marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.desc}</div>}
                      {skuFocus===i && !lockItems && filteredSkus.length>0 && (
                        <div style={{position:'absolute',top:34,left:0,width:380,zIndex:25,
                          background:T.s,border:`1px solid ${T.bd2}`,borderRadius:8,
                          boxShadow:'0 14px 30px rgba(0,0,0,.5)',maxHeight:240,overflowY:'auto'}}>
                          {filteredSkus.slice(0,6).map(s=>(
                            <button key={s.sku} onClick={()=>pickSku(i,s)} style={{
                              width:'100%',padding:'8px 10px',background:'transparent',border:'none',
                              display:'flex',justifyContent:'space-between',alignItems:'center',
                              color:T.tx,fontSize:12,cursor:'pointer',textAlign:'left',
                              borderBottom:`1px solid ${T.bd}`,fontFamily:T.font}}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.04)'}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <div style={{minWidth:0}}>
                                <div style={{fontFamily:T.mono,fontSize:10.5,color:T.tx3}}>{s.sku}</div>
                                <div style={{fontSize:12,color:T.tx,fontWeight:500,marginTop:2}}>{s.product} · {s.size} · {s.color}</div>
                              </div>
                              <span style={{fontFamily:T.mono,fontSize:11,color:T.tx2}}>₹{s.mrp}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="number" value={it.qty} onChange={e=>updateRow(i,{qty:Number(e.target.value)})}
                      style={{...modalInput(),textAlign:'right',padding:'6px 8px',height:32,fontFamily:T.mono}}/>
                    <input type="number" value={it.price||''} onChange={e=>updateRow(i,{price:Number(e.target.value)})}
                      disabled={lockItems}
                      placeholder="0" style={{...modalInput(),textAlign:'right',padding:'6px 8px',height:32,fontFamily:T.mono,opacity:lockItems?.6:1}}/>
                    <div style={{display:'flex',gap:2,alignItems:'center',height:32}}>
                      <select value={it.discType} onChange={e=>updateRow(i,{discType:e.target.value})} disabled={lockItems}
                        style={{...modalInput(),width:36,padding:'4px 2px',height:32,textAlign:'center',fontSize:11,opacity:lockItems?.6:1}}>
                        <option value="flat">₹</option><option value="percentage">%</option>
                      </select>
                      <input type="number" value={it.disc||''} onChange={e=>updateRow(i,{disc:Number(e.target.value)})} disabled={lockItems}
                        placeholder="0" style={{...modalInput(),flex:1,textAlign:'right',padding:'6px 6px',height:32,fontFamily:T.mono,opacity:lockItems?.6:1}}/>
                    </div>
                    <div style={{textAlign:'right',fontFamily:T.mono,fontSize:12,color:computeLine(it)<0?T.ac2:T.tx,fontWeight:500}}>
                      {computeLine(it)<0?'−':''}₹{Math.abs(computeLine(it)).toLocaleString('en-IN')}
                    </div>
                    <button onClick={()=>removeRow(i)} disabled={items.length===1}
                      style={{background:'transparent',border:'none',color:T.tx3,cursor:items.length===1?'not-allowed':'pointer',
                        opacity:items.length===1?.3:1,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                      <Icon n="x" s={14}/>
                    </button>
                  </div>
                ))}
                {!lockItems && (
                  <button onClick={addRow} style={{width:'100%',padding:'9px',background:T.glass1,border:'none',
                    borderTop:`1px dashed ${T.bd2}`,color:T.ac2,fontSize:12,fontWeight:500,cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontFamily:T.font}}>
                    <Icon n="plus" s={13}/>Add row
                  </button>
                )}
              </div>
            </div>

            {/* Notes + tags */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <label style={modalLabel()}>Notes</label>
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
                  placeholder={isReturn?'Reason for return…':'Internal note for this challan…'}
                  style={{...modalInput(),resize:'vertical',padding:'8px 12px',height:'auto',minHeight:54,fontFamily:T.font}}/>
              </div>
              <div>
                <label style={modalLabel()}>Tags</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,padding:'7px 8px',
                  background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:7,minHeight:54,alignItems:'flex-start'}}>
                  {tags.map(t=>(
                    <span key={t} style={{display:'inline-flex',alignItems:'center',gap:4,
                      padding:'3px 4px 3px 8px',background:T.ac3,borderRadius:5,fontSize:11,color:T.ac2}}>
                      {t}<button onClick={()=>setTags(tags.filter(x=>x!==t))} style={{background:'transparent',border:'none',color:T.ac2,cursor:'pointer',padding:0,display:'flex'}}><Icon n="x" s={10}/></button>
                    </span>
                  ))}
                  <input placeholder="+ tag" onKeyDown={e=>{
                    if(e.key==='Enter' && e.target.value){setTags([...tags,e.target.value]);e.target.value='';e.preventDefault();}
                  }} style={{background:'transparent',border:'none',outline:'none',color:T.tx,fontSize:11.5,flex:1,minWidth:60,fontFamily:T.font}}/>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT column: totals + payment */}
          <div style={{minWidth:0}}>
            <div style={{position:'sticky',top:0}}>
              <Card pad={16} style={{background:T.s2}}>
                <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:12}}>
                  {isReturn ? 'Refund summary' : 'Bill summary'}
                </div>

                <Row label="Subtotal" value={subtotal} mono/>
                {totalDisc!==0 && <Row label="Discount" value={-totalDisc} mono color={T.gr}/>}
                {!isReturn && (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0'}}>
                    <span style={{fontSize:12,color:T.tx2}}>Shipping</span>
                    <input type="number" value={shipping||''} onChange={e=>setShipping(Number(e.target.value))}
                      placeholder="0" style={{...modalInput(),width:90,textAlign:'right',padding:'5px 8px',height:28,fontFamily:T.mono,fontSize:12}}/>
                  </div>
                )}
                <div style={{height:1,background:T.bd,margin:'10px 0'}}/>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}}>
                  <span style={{fontSize:13,color:T.tx,fontWeight:500}}>{isReturn?'Refund total':'Grand total'}</span>
                  <span style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:isReturn?T.ac2:T.tx,letterSpacing:-.5}}>
                    {isReturn?'−':''}₹{Math.abs(grandTotal).toLocaleString('en-IN')}
                  </span>
                </div>

                {!isReturn && (
                  <>
                    <div style={{height:1,background:T.bd,margin:'14px 0 10px'}}/>
                    <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>Payment</div>
                    <label style={modalLabel()}>Mode</label>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
                      {PAYMENT_MODES.map(m=>(
                        <button key={m} onClick={()=>setPaymentMode(paymentMode===m?'':m)} style={{
                          padding:'5px 9px',borderRadius:5,border:`1px solid ${paymentMode===m?'rgba(99,102,241,.3)':T.bd}`,
                          background:paymentMode===m?T.ac3:'transparent',color:paymentMode===m?T.ac2:T.tx2,
                          fontSize:11,cursor:'pointer',fontFamily:T.font}}>{m}</button>
                      ))}
                    </div>

                    <label style={modalLabel()}>Amount paid</label>
                    <div style={{display:'flex',gap:6,marginBottom:6}}>
                      <input type="number" value={amountPaid||''} onChange={e=>setAmountPaid(Number(e.target.value))}
                        placeholder="0" style={{...modalInput(),flex:1,fontFamily:T.mono,textAlign:'right'}}/>
                      <button onClick={()=>setAmountPaid(grandTotal)} style={{padding:'0 10px',background:T.glass2,border:`1px solid ${T.bd}`,borderRadius:7,color:T.tx2,fontSize:11,cursor:'pointer',fontFamily:T.font,whiteSpace:'nowrap'}}>Full</button>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:T.glass1,borderRadius:7}}>
                      <span style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.2,fontWeight:600}}>Balance</span>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontFamily:T.mono,fontSize:13,fontWeight:600,color:balance>0?T.yl:balance<0?T.gr:T.tx}}>₹{Math.abs(balance).toLocaleString('en-IN')}</span>
                        <Pill tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Pill>
                      </div>
                    </div>
                  </>
                )}

                {isReturn && (
                  <div style={{marginTop:14,padding:10,background:'rgba(99,102,241,.06)',borderRadius:8,
                    border:'1px solid rgba(99,102,241,.18)',display:'flex',gap:10,alignItems:'flex-start'}}>
                    <div style={{color:T.ac2,marginTop:1}}><Icon n="rotate" s={14}/></div>
                    <div>
                      <div style={{fontSize:11.5,color:T.tx,fontWeight:500,marginBottom:2}}>Refund will be issued in cash</div>
                      <div style={{fontSize:10.5,color:T.tx3,lineHeight:1.5}}>
                        CashBook entry of ₹{Math.abs(grandTotal).toLocaleString('en-IN')} will be created on save. Inventory restored.
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {customer && customer.outstanding>0 && !isReturn && (
                <div style={{marginTop:10,padding:10,background:'rgba(251,191,36,.05)',borderRadius:8,
                  border:'1px solid rgba(251,191,36,.15)',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <div style={{color:T.yl,marginTop:1}}><Icon n="alert" s={13}/></div>
                  <div style={{fontSize:11,color:T.tx2,lineHeight:1.5}}>
                    <span style={{color:T.yl,fontWeight:500}}>{customer.name}</span> has ₹{customer.outstanding.toLocaleString('en-IN')} pending from previous challans.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'14px 22px',borderTop:`1px solid ${T.bd}`,
          display:'flex',justifyContent:'space-between',alignItems:'center',
          background:T.glass1}}>
          <div style={{display:'flex',gap:6,alignItems:'center',fontSize:11,color:T.tx3}}>
            <span style={{fontFamily:T.mono,padding:'2px 6px',border:`1px solid ${T.bd2}`,borderRadius:4}}>⌘S</span>
            <span>Save</span>
            <span style={{margin:'0 6px',color:T.bd2}}>·</span>
            <span style={{fontFamily:T.mono,padding:'2px 6px',border:`1px solid ${T.bd2}`,borderRadius:4}}>Esc</span>
            <span>Cancel</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            {!isReturn && <Btn icon="up">Save as draft</Btn>}
            <Btn icon="book">Print</Btn>
            <Btn kind="primary" icon="check"
              onClick={()=>onSave({no:challanNo,isReturn,customer,items,grandTotal,status,amountPaid,paymentMode})}>
              {isReturn?'Process return':editing?'Save changes':`Save & ${amountPaid>=grandTotal?'mark paid':'send'}`}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

const modalInput = ()=>({
  width:'100%',background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:7,
  padding:'9px 12px',color:T.tx,fontSize:12.5,fontFamily:T.font,outline:'none',height:36,
});
const modalLabel = ()=>({
  display:'block',fontSize:10,color:T.tx3,textTransform:'uppercase',
  letterSpacing:1.5,fontWeight:600,marginBottom:6,fontFamily:T.font,
});

const Row = ({label,value,mono,color})=>(
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0'}}>
    <span style={{fontSize:12,color:T.tx2}}>{label}</span>
    <span style={{fontFamily:mono?T.mono:T.font,fontSize:12.5,color:color||T.tx,fontWeight:500}}>
      {value<0?'−':''}₹{Math.abs(value).toLocaleString('en-IN')}
    </span>
  </div>
);

window.CashChallanScene = CashChallanScene;
