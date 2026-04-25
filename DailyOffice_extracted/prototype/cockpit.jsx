// Dashboard cockpit — "Today's 3 things" + deep-linked stats + WoW deltas
function Cockpit({onOpenPalette, onDeepLink, onToast}){
  const todayThings = [
    {
      id:'overdue', tone:'re', icon:'alert',
      title:'4 challans overdue · ₹12,400',
      sub:'Rao Textiles, Lakshmi Sarees, 2 more',
      cta:'Send reminders',
      action:()=>{ onDeepLink('challan-overdue'); onToast('Opening overdue list…'); }
    },
    {
      id:'drycl', tone:'yl', icon:'clock',
      title:'11 items in dry-clean > 7 days',
      sub:'Stuck at vendor — review status',
      cta:'Review items',
      action:()=>{ onDeepLink('inventory-drycl'); onToast('Filtering inventory…'); }
    },
    {
      id:'cash', tone:'bl', icon:'cash',
      title:'₹8,400 cash not handed over',
      sub:'From yesterday\'s shift · Anand',
      cta:'Start handover',
      action:()=>{ onDeepLink('cashbook-handover'); onToast('Opening handover…'); }
    },
  ];

  return (
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600,marginBottom:6}}>Dashboard · Wednesday</div>
          <div style={{fontFamily:T.sora,fontSize:28,fontWeight:700,letterSpacing:-.5,color:T.tx}}>Good morning, Arya</div>
          <div style={{color:T.tx2,fontSize:13,marginTop:4}}>4 Dec · Here's what needs your attention today</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn icon="search" onClick={onOpenPalette} kbd="⌘K">Search anything</Btn>
          <Btn kind="primary" icon="plus">New challan</Btn>
        </div>
      </div>

      {/* Today's 3 things */}
      <div style={{marginBottom:28}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <div style={{width:6,height:6,borderRadius:3,background:T.ac,boxShadow:`0 0 12px ${T.ac}`}}/>
          <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx}}>Today's 3 things</div>
          <div style={{flex:1,height:1,background:`linear-gradient(90deg,${T.bd} 0%,transparent 100%)`}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {todayThings.map(t=>(
            <Card key={t.id} style={{padding:18,display:'flex',flexDirection:'column',gap:14,minHeight:150,
              borderLeft:`3px solid ${t.tone==='re'?T.re:t.tone==='yl'?T.yl:T.bl}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <Pill tone={t.tone} dot>Attention</Pill>
                <div style={{color:t.tone==='re'?T.re:t.tone==='yl'?T.yl:T.bl}}>
                  <Icon n={t.icon} s={18}/>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:T.sora,fontSize:15,fontWeight:600,color:T.tx,marginBottom:4,lineHeight:1.35}}>{t.title}</div>
                <div style={{fontSize:12,color:T.tx2}}>{t.sub}</div>
              </div>
              <Btn kind="ghost" icon="arrow" onClick={t.action} style={{alignSelf:'flex-start'}}>{t.cta}</Btn>
            </Card>
          ))}
        </div>
      </div>

      {/* Stat tiles — deep linked */}
      <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr 1fr 1fr',gap:14,marginBottom:28}}>
        {/* Hero: revenue */}
        <Card pad={22} style={{cursor:'pointer'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:2,fontWeight:600}}>Revenue · today</div>
            <Pill tone="gr" dot><Icon n="up" s={10}/> 18%</Pill>
          </div>
          <div style={{fontFamily:T.sora,fontSize:42,fontWeight:700,letterSpacing:-1.5,color:T.tx,lineHeight:1}}>₹42,180</div>
          <div style={{color:T.tx2,fontSize:12,marginTop:6}}>▲ ₹6,420 vs last Wed · 38 sales</div>
          {/* mini sparkline */}
          <svg viewBox="0 0 240 40" style={{width:'100%',height:40,marginTop:16}}>
            <defs>
              <linearGradient id="rgrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={T.ac} stopOpacity=".35"/>
                <stop offset="100%" stopColor={T.ac} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 28 L20 22 L40 26 L60 18 L80 24 L100 14 L120 20 L140 10 L160 16 L180 8 L200 12 L220 6 L240 10"
              stroke={T.ac} strokeWidth="1.8" fill="none"/>
            <path d="M0 28 L20 22 L40 26 L60 18 L80 24 L100 14 L120 20 L140 10 L160 16 L180 8 L200 12 L220 6 L240 10 L240 40 L0 40 Z"
              fill="url(#rgrad)"/>
            <circle cx="220" cy="6" r="3" fill={T.ac}/>
          </svg>
        </Card>
        {[
          {label:'Scans today',value:'127',delta:'+12',tone:'gr'},
          {label:'Cash available',value:'₹18.4k',delta:'−₹2.1k',tone:'yl'},
          {label:'Unsorted',value:'43',delta:'+8',tone:'re'},
        ].map(s=>(
          <Card key={s.label} pad={18}>
            <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.8,fontWeight:600,marginBottom:10}}>{s.label}</div>
            <div style={{fontFamily:T.sora,fontSize:26,fontWeight:700,color:T.tx,letterSpacing:-.5}}>{s.value}</div>
            <div style={{color:s.tone==='gr'?T.gr:s.tone==='yl'?T.yl:T.re,fontSize:11,marginTop:6,fontWeight:500}}>{s.delta} vs yesterday</div>
          </Card>
        ))}
      </div>

      {/* Top customers + tasks */}
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14}}>
        <Card pad={0}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.bd}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx}}>Top customers · outstanding</div>
            <span style={{fontSize:11,color:T.tx3}}>Click to open ledger</span>
          </div>
          {SAMPLE.customers.map((c,i)=>(
            <div key={c.name} onClick={()=>onToast(`Opening ${c.name}'s ledger…`)}
              style={{padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',
                borderBottom:i<3?`1px solid ${T.bd}`:'none',cursor:'pointer',transition:'background .1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,.04)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:32,height:32,borderRadius:8,background:T.s3,border:`1px solid ${T.bd}`,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:T.ac2}}>
                  {c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                </div>
                <div>
                  <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{c.name}</div>
                  <div style={{fontSize:11,color:T.tx3}}>Last: {c.last}</div>
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:c.out?T.yl:T.gr}}>
                  {c.out?`₹${c.out.toLocaleString('en-IN')}`:'Settled'}
                </div>
              </div>
            </div>
          ))}
        </Card>
        <Card pad={0}>
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.bd}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx}}>Quick tasks</div>
            <Pill>3 open</Pill>
          </div>
          {['Call DTDC about missed pickup','Reorder Myntra return bags','Check damaged stock — rack 4'].map((t,i)=>(
            <div key={i} style={{padding:'10px 20px',display:'flex',gap:10,alignItems:'center',borderBottom:i<2?`1px solid ${T.bd}`:'none'}}>
              <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${T.bd2}`,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12,color:T.tx2}}>{t}</div>
            </div>
          ))}
          <div style={{padding:'10px 20px',borderTop:`1px solid ${T.bd}`}}>
            <input placeholder="+ Add task (Enter)" style={{width:'100%',background:'transparent',border:'none',
              color:T.tx,fontSize:12,fontFamily:T.font,outline:'none'}}/>
          </div>
        </Card>
      </div>
    </div>
  );
}

window.Cockpit = Cockpit;
