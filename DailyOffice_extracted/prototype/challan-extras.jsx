// Cash Challan — secondary screens & popups: Ledger, Analytics, Audit Trail, Reminder, ERP, CashBook stub
// All triggered from the existing buttons in the Cash Challan header. No new functionality introduced.

// ─────────────── Ledger (list + detail) ────────────────
const LEDGER_CUSTOMERS = [
  {name:'Rao Textiles',count:12,total:148400,paid:130600,outstanding:17800},
  {name:'Sharma Emporium',count:8,total:62150,paid:62150,outstanding:0},
  {name:'Lakshmi Sarees',count:6,total:38800,paid:32000,outstanding:6800},
  {name:'City Wholesale',count:14,total:284500,paid:284500,outstanding:0},
  {name:'Megha Collections',count:3,total:9420,paid:6220,outstanding:3200},
  {name:'Devi Textiles',count:5,total:24380,paid:18512,outstanding:5868},
];
const LEDGER_CHALLANS = {
  'Rao Textiles':[
    {no:1247,date:'4 Dec 25',status:'unpaid',isReturn:false,total:6962},
    {no:1244,date:'1 Dec 25',status:'paid',isReturn:false,total:24500},
    {no:1242,date:'29 Nov 25',status:'unpaid',isReturn:false,total:2499},
    {no:1230,date:'20 Nov 25',status:'paid',isReturn:false,total:9996},
    {no:1224,date:'14 Nov 25',status:'paid',isReturn:false,total:18200},
    {no:1219,date:'10 Nov 25',status:'paid',isReturn:true,total:-3500},
  ],
};

function LedgerScreen({onBack,onOpenDetail,onToast}){
  const [search,setSearch] = React.useState('');
  const visible = LEDGER_CUSTOMERS.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()));
  const totalOutstanding = visible.reduce((s,c)=>s+c.outstanding,0);

  return (
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
          width:34,height:34,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon n="chev" s={14} c={T.tx2}/>
        </button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:4}}>Cash Challan · Ledger</div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,letterSpacing:-.4,color:T.tx}}>Customer ledger</div>
        </div>
        <Btn icon="up" onClick={()=>onToast?.('Exported ledger.pdf')}>Export PDF</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:18}}>
        <Card pad={14}>
          <div style={kpiLabel}>Total customers</div>
          <div style={kpiValue(T.tx)}>{visible.length}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>active in last 30 days</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${T.gr}`}}>
          <div style={kpiLabel}>Lifetime billed</div>
          <div style={kpiValue(T.gr)}>₹{visible.reduce((s,c)=>s+c.total,0).toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>across {visible.reduce((s,c)=>s+c.count,0)} challans</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${totalOutstanding>0?T.re:T.gr}`}}>
          <div style={kpiLabel}>Outstanding</div>
          <div style={kpiValue(totalOutstanding>0?T.re:T.gr)}>₹{totalOutstanding.toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>{visible.filter(c=>c.outstanding>0).length} customers with dues</div>
        </Card>
      </div>

      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14}}>
        <div style={{flex:1,maxWidth:340,position:'relative'}}>
          <div style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:T.tx3}}><Icon n="search" s={14}/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Customer name, phone…"
            style={{width:'100%',height:34,paddingLeft:34,paddingRight:12,
              background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
              color:T.tx,fontSize:12.5,fontFamily:T.font,outline:'none'}}/>
        </div>
        <span style={{fontSize:11,color:T.tx3,marginLeft:'auto'}}>{visible.length} customers · {visible.filter(c=>c.outstanding>0).length} with dues</span>
      </div>

      <Card pad={0}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 100px 130px 130px 130px 60px',
          padding:'12px 18px',borderBottom:`1px solid ${T.bd}`,gap:14,alignItems:'center'}}>
          {['Customer','Challans','Billed','Paid','Outstanding',''].map((h,i)=>(
            <div key={i} style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,
              textAlign:i>=2&&i<5?'right':'left'}}>{h}</div>
          ))}
        </div>
        {visible.map(c=>(
          <div key={c.name} onClick={()=>onOpenDetail(c.name)}
            style={{display:'grid',gridTemplateColumns:'2fr 100px 130px 130px 130px 60px',
              padding:'14px 18px',borderBottom:`1px solid ${T.bd}`,gap:14,alignItems:'center',
              cursor:'pointer',transition:'background .1s'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.03)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:30,height:30,borderRadius:7,background:T.ac3,display:'flex',
                alignItems:'center',justifyContent:'center',color:T.ac2,fontWeight:600,fontSize:12}}>
                {c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
              </div>
              <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{c.name}</div>
            </div>
            <div style={{fontFamily:T.mono,fontSize:12,color:T.tx2}}>{c.count}</div>
            <div style={{textAlign:'right',fontFamily:T.mono,fontSize:12,color:T.tx2}}>₹{c.total.toLocaleString('en-IN')}</div>
            <div style={{textAlign:'right',fontFamily:T.mono,fontSize:12,color:T.gr}}>₹{c.paid.toLocaleString('en-IN')}</div>
            <div style={{textAlign:'right'}}>
              <span style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:c.outstanding>0?T.re:T.gr}}>
                ₹{c.outstanding.toLocaleString('en-IN')}
              </span>
              <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1,marginTop:2}}>
                {c.outstanding>0?'Due':'Clear'}
              </div>
            </div>
            <div style={{textAlign:'right',color:T.tx3}}><Icon n="chev" s={14}/></div>
          </div>
        ))}
        <button onClick={()=>onToast?.('Loaded 500 more customers')} style={{
          width:'100%',padding:11,background:T.glass1,border:'none',borderTop:`1px dashed ${T.bd2}`,
          color:T.ac2,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:T.font}}>
          Load 500 more customers
        </button>
      </Card>
    </div>
  );
}

function LedgerDetailScreen({customerName,onBack,onToast}){
  const cust = LEDGER_CUSTOMERS.find(c=>c.name===customerName);
  const challans = LEDGER_CHALLANS[customerName] || LEDGER_CHALLANS['Rao Textiles'];
  if(!cust) return null;
  return (
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
          width:34,height:34,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon n="chev" s={14} c={T.tx2}/>
        </button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:4}}>Ledger · {customerName}</div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,letterSpacing:-.4,color:T.tx}}>{customerName}</div>
            {cust.outstanding>0 && <Pill tone="re" dot>₹{cust.outstanding.toLocaleString('en-IN')} due</Pill>}
            {cust.outstanding===0 && <Pill tone="gr" dot>Clear</Pill>}
          </div>
        </div>
        <Btn icon="up" onClick={()=>onToast?.('Sent statement via WhatsApp')}>Send statement</Btn>
        <Btn icon="up" onClick={()=>onToast?.('Exported ledger PDF')}>Export PDF</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        <Card pad={14}>
          <div style={kpiLabel}>Total challans</div>
          <div style={kpiValue(T.tx)}>{cust.count}</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${T.ac}`}}>
          <div style={kpiLabel}>Lifetime billed</div>
          <div style={kpiValue(T.ac2)}>₹{cust.total.toLocaleString('en-IN')}</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${T.gr}`}}>
          <div style={kpiLabel}>Paid</div>
          <div style={kpiValue(T.gr)}>₹{cust.paid.toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>{Math.round(cust.paid/cust.total*100)}% recovery</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${cust.outstanding>0?T.re:T.gr}`}}>
          <div style={kpiLabel}>Outstanding</div>
          <div style={kpiValue(cust.outstanding>0?T.re:T.gr)}>₹{cust.outstanding.toLocaleString('en-IN')}</div>
        </Card>
      </div>

      <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>
        Challan history
      </div>
      <Card pad={0}>
        {challans.map(c=>(
          <div key={c.no} style={{display:'grid',gridTemplateColumns:'90px 110px 1fr 130px',
            padding:'14px 18px',borderBottom:`1px solid ${T.bd}`,gap:14,alignItems:'center',cursor:'pointer'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.03)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,fontWeight:500}}>#{c.no}</div>
            <div style={{fontSize:12,color:T.tx3}}>{c.date}</div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <Pill tone={STATUS_TONE[c.status]} dot>{STATUS_LABEL[c.status]}</Pill>
              {c.isReturn && <Pill tone="ac" dot>RETURN</Pill>}
            </div>
            <div style={{textAlign:'right',fontFamily:T.sora,fontSize:14,fontWeight:600,
              color:c.total<0?T.ac2:T.tx,letterSpacing:-.3}}>
              {c.total<0?'−':''}₹{Math.abs(c.total).toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────── Analytics ────────────────
const ANALYTICS_DATA = {
  totalRevenue:284620, count:148, returnsCount:7, voidedCount:3,
  byMode:{Cash:118400, UPI:92800, 'Bank Transfer':56400, Cheque:12200, Card:4820},
  daily:[18,24,32,28,46,38,52,44,38,62,48,56,72,68,82,74,68,86,92,78].map((v,i)=>({d:i+15,v:v*1000})),
};

function AnalyticsScreen({onBack,onToast}){
  const [from,setFrom] = React.useState('2025-11-01');
  const [to,setTo] = React.useState('2025-12-04');
  const a = ANALYTICS_DATA;
  const maxDaily = Math.max(...a.daily.map(d=>d.v));
  const totalByMode = Object.values(a.byMode).reduce((s,v)=>s+v,0);

  return (
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
          width:34,height:34,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon n="chev" s={14} c={T.tx2}/>
        </button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:4}}>Cash Challan · Analytics</div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,letterSpacing:-.4,color:T.tx}}>Revenue analytics</div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,padding:'4px 6px'}}>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
            style={{background:'transparent',border:'none',color:T.tx,fontSize:12,fontFamily:T.mono,outline:'none',padding:'4px',colorScheme:'dark'}}/>
          <span style={{color:T.tx3,fontSize:11}}>→</span>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)}
            style={{background:'transparent',border:'none',color:T.tx,fontSize:12,fontFamily:T.mono,outline:'none',padding:'4px',colorScheme:'dark'}}/>
        </div>
        <Btn icon="up" onClick={()=>onToast?.('Exported CSV')}>Export</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        <Card pad={14} style={{borderLeft:`2px solid ${T.gr}`}}>
          <div style={kpiLabel}>Net revenue</div>
          <div style={kpiValue(T.gr)}>₹{a.totalRevenue.toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,color:T.gr,marginTop:4}}>▲ 18% vs prev period</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${T.ac}`}}>
          <div style={kpiLabel}>Sales</div>
          <div style={kpiValue(T.ac2)}>{a.count}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>avg ₹{Math.round(a.totalRevenue/a.count).toLocaleString('en-IN')}</div>
        </Card>
        <Card pad={14} style={{borderLeft:`2px solid ${T.yl}`}}>
          <div style={kpiLabel}>Returns</div>
          <div style={kpiValue(T.yl)}>{a.returnsCount}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>{(a.returnsCount/a.count*100).toFixed(1)}% rate</div>
        </Card>
        <Card pad={14}>
          <div style={kpiLabel}>Voided</div>
          <div style={kpiValue(T.tx3)}>{a.voidedCount}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>excluded from total</div>
        </Card>
      </div>

      {/* Daily revenue chart */}
      <Card pad={20} style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx}}>Daily revenue</div>
            <div style={{fontSize:11,color:T.tx3,marginTop:2}}>last 20 days</div>
          </div>
          <div style={{display:'flex',gap:14,fontSize:11,color:T.tx3}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
              <span style={{width:8,height:8,borderRadius:2,background:T.ac}}/>Revenue
            </span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:6,height:160,padding:'0 4px'}}>
          {a.daily.map((d,i)=>(
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
              <div style={{width:'100%',background:`linear-gradient(180deg,${T.ac} 0%,${T.ac2} 100%)`,
                height:`${(d.v/maxDaily)*140}px`,borderRadius:'3px 3px 0 0',
                opacity:i===a.daily.length-1?1:.7,transition:'opacity .15s'}}/>
              <div style={{fontSize:9,color:T.tx3,fontFamily:T.mono}}>{d.d}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Payment mode breakup + insights */}
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:14}}>
        <Card pad={20}>
          <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx,marginBottom:14}}>Payment mode breakup</div>
          {Object.entries(a.byMode).map(([mode,amt])=>{
            const pct = (amt/totalByMode)*100;
            return (
              <div key={mode} style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:12.5,color:T.tx,fontWeight:500}}>{mode}</span>
                  <span style={{fontSize:12,color:T.tx2,fontFamily:T.mono}}>
                    ₹{amt.toLocaleString('en-IN')} <span style={{color:T.tx3}}>· {pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div style={{height:6,background:T.glass2,borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pct}%`,
                    background:mode==='Cash'?T.gr:mode==='UPI'?T.ac:mode==='Bank Transfer'?T.bl:mode==='Cheque'?T.yl:T.tx2,
                    borderRadius:3}}/>
                </div>
              </div>
            );
          })}
        </Card>
        <Card pad={20}>
          <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx,marginBottom:14}}>Top customers</div>
          {LEDGER_CUSTOMERS.slice().sort((a,b)=>b.total-a.total).slice(0,5).map((c,i)=>(
            <div key={c.name} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',
              borderBottom:i<4?`1px solid ${T.bd}`:'none'}}>
              <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3,width:20}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,color:T.tx,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                <div style={{fontSize:10.5,color:T.tx3,fontFamily:T.mono,marginTop:2}}>{c.count} challans</div>
              </div>
              <div style={{fontFamily:T.mono,fontSize:12,color:T.tx2}}>₹{(c.total/1000).toFixed(1)}k</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─────────────── CashBook stub ────────────────
function CashBookStub({onBack}){
  return (
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:8,
          width:34,height:34,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon n="chev" s={14} c={T.tx2}/>
        </button>
        <div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:4}}>Quick switch</div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx}}>CashBook</div>
        </div>
      </div>
      <Card pad={32} style={{textAlign:'center'}}>
        <div style={{width:48,height:48,borderRadius:12,background:'rgba(52,211,153,.1)',
          border:'1px solid rgba(52,211,153,.2)',color:T.gr,
          display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
          <Icon n="cash" s={22}/>
        </div>
        <div style={{fontSize:14,color:T.tx,fontWeight:500,marginBottom:6}}>CashBook opens here</div>
        <div style={{fontSize:12,color:T.tx3,maxWidth:380,margin:'0 auto'}}>
          Same module embedded inside Cash Challan — daily cash position, pending handovers, expense entries.
        </div>
      </Card>
    </div>
  );
}

// ─────────────── Audit Trail popup ────────────────
const AUDIT_SAMPLE = [
  {action:'PAYMENT',details:'₹3,000 paid via Cash for #1245',by:'Anand',when:'Today, 2:18 PM'},
  {action:'EDIT',details:'Discount changed: ₹0 → ₹200 on AJI-KUR-M-MRN',by:'Arya',when:'Today, 11:42 AM'},
  {action:'CREATE',details:'Challan #1245 created for Lakshmi Sarees · ₹6,800',by:'Arya',when:'2 Dec, 3:24 PM'},
];
function AuditTrailPopup({open,challanNo,onClose}){
  if(!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:610,
      background:'rgba(2,4,10,.7)',backdropFilter:'blur(4px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%',maxWidth:540,background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:12,boxShadow:'0 30px 80px rgba(0,0,0,.6)',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.bd}`,
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <Icon n="clock" s={16} c={T.ac2}/>
            <div>
              <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx}}>Audit trail</div>
              <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono,marginTop:2}}>Challan #{challanNo}</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${T.bd}`,
            borderRadius:6,width:28,height:28,color:T.tx2,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="x" s={12}/>
          </button>
        </div>
        <div style={{padding:'14px 20px',maxHeight:'60vh',overflowY:'auto'}}>
          {AUDIT_SAMPLE.map((a,i)=>{
            const tone = a.action==='CREATE'?T.ac2:a.action==='PAYMENT'?T.gr:a.action==='EDIT'?T.yl:T.tx2;
            return (
              <div key={i} style={{display:'flex',gap:12,padding:'10px 0',
                borderBottom:i<AUDIT_SAMPLE.length-1?`1px solid ${T.bd}`:'none'}}>
                <div style={{width:8,height:8,borderRadius:4,background:tone,marginTop:6,flexShrink:0,
                  boxShadow:`0 0 0 3px ${tone}22`}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:10,color:tone,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase'}}>{a.action}</span>
                    <span style={{fontSize:11,color:T.tx3}}>·</span>
                    <span style={{fontSize:11,color:T.tx3}}>{a.when}</span>
                  </div>
                  <div style={{fontSize:12.5,color:T.tx,lineHeight:1.45,marginBottom:3}}>{a.details}</div>
                  <div style={{fontSize:11,color:T.tx3}}>by {a.by}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────── Reminder phone popup ────────────────
function ReminderPopup({open,customer,onClose,onSend}){
  const [phone,setPhone] = React.useState('');
  React.useEffect(()=>{ if(open) setPhone(''); },[open]);
  if(!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:610,
      background:'rgba(2,4,10,.7)',backdropFilter:'blur(4px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%',maxWidth:380,background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:12,boxShadow:'0 30px 80px rgba(0,0,0,.6)',padding:'18px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <div style={{width:36,height:36,borderRadius:8,background:'rgba(52,211,153,.1)',
            border:'1px solid rgba(52,211,153,.2)',color:T.gr,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="bell" s={16}/>
          </div>
          <div>
            <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx}}>Send WhatsApp reminder</div>
            <div style={{fontSize:11,color:T.tx3,marginTop:2}}>To {customer || 'customer'}</div>
          </div>
        </div>
        <div style={{fontSize:12,color:T.tx2,lineHeight:1.5,marginBottom:14,padding:'10px 12px',
          background:T.glass1,borderRadius:7}}>
          No phone on file. Enter number to send reminder.
        </div>
        <label style={modalLabel()}>Phone number</label>
        <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:14,
          background:T.glass1,border:`1px solid ${T.bd}`,borderRadius:7,paddingLeft:12}}>
          <span style={{color:T.tx3,fontFamily:T.mono,fontSize:12.5}}>+91</span>
          <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}
            placeholder="98XXX 12345" autoFocus maxLength={10}
            style={{flex:1,background:'transparent',border:'none',padding:'9px 12px',
              color:T.tx,fontSize:12.5,fontFamily:T.mono,outline:'none'}}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={onClose} style={{flex:1,justifyContent:'center'}}>Cancel</Btn>
          <Btn kind="primary" icon="check" onClick={()=>{onSend?.(phone);onClose();}}
            style={{flex:1,justifyContent:'center',opacity:phone.length<10?.4:1,pointerEvents:phone.length<10?'none':'auto'}}>
            Send via WhatsApp
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────── ERP reminder popup ────────────────
function ErpReminderPopup({open,onClose}){
  if(!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:610,
      background:'rgba(2,4,10,.7)',backdropFilter:'blur(4px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%',maxWidth:380,background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:12,boxShadow:'0 30px 80px rgba(0,0,0,.6)',padding:'22px 22px',textAlign:'center'}}>
        <div style={{width:48,height:48,borderRadius:12,
          background:'rgba(251,191,36,.1)',border:'1px solid rgba(251,191,36,.2)',color:T.yl,
          display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
          <Icon n="alert" s={22}/>
        </div>
        <div style={{fontFamily:T.sora,fontSize:16,fontWeight:600,color:T.tx,marginBottom:8}}>Hi Arya!</div>
        <div style={{fontSize:12.5,color:T.tx2,lineHeight:1.55,marginBottom:18}}>
          Reminder to manually <span style={{color:T.yl,fontWeight:500}}>reduce these inventory items in your ERP</span>. Cash Challan does not sync stock automatically.
        </div>
        <Btn kind="primary" onClick={onClose} style={{width:'100%',justifyContent:'center'}}>Got it</Btn>
      </div>
    </div>
  );
}

const kpiLabel = {fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:6};
const kpiValue = (color)=>({fontFamily:T.sora,fontSize:22,fontWeight:700,color,letterSpacing:-.5});

Object.assign(window,{LedgerScreen,LedgerDetailScreen,AnalyticsScreen,CashBookStub,AuditTrailPopup,ReminderPopup,ErpReminderPopup});
