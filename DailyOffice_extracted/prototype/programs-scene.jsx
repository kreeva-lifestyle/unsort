// Programs scene — garment manufacturing recipe sheet (selling/manufacturing SKU,
// brand matchings, work parts breakdown, fabric program, voice notes, share/QR/PDF)
const {useState:pgUseState,useMemo:pgUseMemo} = React;

const PG_SAMPLE = [
  {
    id:'pg1', uid:'PRG-A41-117', sellingSku:'TNDRS177', mfgSku:'TND-AW25-117',
    image:'tanuka-co-ord.jpg', updated:'18m ago', updatedBy:'Arya', voiceNote:true, voiceDur:'0:42',
    matchings:[
      {brand:'TANUKA', label:'A41 / Maroon block'},
      {brand:'JIO', label:'JIO-A41'},
    ],
    work:[
      {part:'Front panel',  stitch:1450, type:'piece', oneRs:0.18, rate:0.42, mp:1, mpc:0.85, total:609,  fabric:'Crepe Maroon', fm:0.85},
      {part:'Back panel',   stitch:1280, type:'piece', oneRs:0.18, rate:0.42, mp:1, mpc:0.78, total:538,  fabric:'Crepe Maroon', fm:0.78},
      {part:'Sleeves (pr)', stitch:980,  type:'piece', oneRs:0.20, rate:0.45, mp:2, mpc:0.34, total:441,  fabric:'Crepe Maroon', fm:0.68},
      {part:'Dupatta hem',  stitch:560,  type:'meter', oneRs:0.22, rate:0.50, mp:1, mpc:2.10, total:280,  fabric:'Chiffon', fm:2.10},
      {part:'Lining',       stitch:420,  type:'piece', oneRs:0.16, rate:0.38, mp:1, mpc:1.20, total:160,  fabric:'Satin White', fm:1.20},
    ],
    fabric:[
      {part:'Border binding', fm:0.40, fabricName:'Crepe Maroon'},
      {part:'Pocket facing',  fm:0.15, fabricName:'Satin White'},
    ],
  },
  {
    id:'pg2', uid:'PRG-B12-088', sellingSku:'FNGNS210', mfgSku:'FUS-AW25-088',
    image:null, updated:'2h ago', updatedBy:'Anand', voiceNote:false,
    matchings:[{brand:'FUSIONIC', label:'B12 / Indigo'}],
    work:[
      {part:'Bodice',  stitch:1820, type:'piece', oneRs:0.20, rate:0.48, mp:1, mpc:1.10, total:874,  fabric:'Georgette Indigo', fm:1.10},
      {part:'Skirt',   stitch:2200, type:'meter', oneRs:0.22, rate:0.52, mp:1, mpc:3.20, total:1144, fabric:'Georgette Indigo', fm:3.20},
      {part:'Sleeves', stitch:760,  type:'piece', oneRs:0.18, rate:0.42, mp:2, mpc:0.32, total:319,  fabric:'Georgette Indigo', fm:0.64},
    ],
    fabric:[],
  },
  {
    id:'pg3', uid:'PRG-C44-201', sellingSku:'SWDRS901', mfgSku:'SVR-AW25-201',
    image:null, updated:'yesterday', updatedBy:'Arya', voiceNote:true, voiceDur:'1:08',
    matchings:[
      {brand:'SVARAA', label:'C44 / Black'},
      {brand:'TANUKA', label:'A88 (cross-seasonal)'},
    ],
    work:[
      {part:'Dress body', stitch:2400, type:'piece', oneRs:0.20, rate:0.46, mp:1, mpc:2.40, total:1104, fabric:'Crepe Black', fm:2.40},
      {part:'Yoke',       stitch:540,  type:'piece', oneRs:0.18, rate:0.40, mp:1, mpc:0.20, total:216,  fabric:'Crepe Black', fm:0.20},
    ],
    fabric:[
      {part:'Inner lining', fm:1.80, fabricName:'Satin Black'},
    ],
  },
  {
    id:'pg4', uid:'PRG-A88-410', sellingSku:'TNGWN410', mfgSku:'TND-AW25-410',
    image:null, updated:'2d ago', updatedBy:'Anand', voiceNote:false,
    matchings:[{brand:'TANUKA', label:'A88 / Red'}],
    work:[
      {part:'Gown body', stitch:3100, type:'meter', oneRs:0.22, rate:0.50, mp:1, mpc:4.20, total:1550, fabric:'Silk Red', fm:4.20},
      {part:'Sleeves',   stitch:880,  type:'piece', oneRs:0.18, rate:0.42, mp:2, mpc:0.45, total:370,  fabric:'Silk Red', fm:0.90},
    ],
    fabric:[],
  },
];

// Compact metric block used inside cards
function PgMetric({label,value,tone,mono}){
  const color = tone==='gr'?T.gr:tone==='bl'?T.bl:tone==='ac'?T.ac2:T.tx;
  return (
    <div>
      <div style={{fontSize:9,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:4}}>{label}</div>
      <div style={{fontFamily:mono?T.mono:T.sora,fontSize:18,fontWeight:700,color,letterSpacing:-.3}}>{value}</div>
    </div>
  );
}

function PgSectionTitle({color,count,children}){
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
      <div style={{width:3,height:14,borderRadius:2,background:color}}/>
      <div style={{fontFamily:T.sora,fontSize:13,fontWeight:600,color:T.tx,letterSpacing:-.2}}>{children}</div>
      {count!=null && (
        <div style={{fontFamily:T.mono,fontSize:10,color:T.tx3,padding:'2px 7px',
          border:`1px solid ${T.bd}`,borderRadius:10}}>{count}</div>
      )}
    </div>
  );
}

// ── List view ──
function ProgramsList({rows,onView,onEdit,onAction}){
  const [search,setSearch] = pgUseState('');
  const [brand,setBrand] = pgUseState('');
  const allBrands = pgUseMemo(()=>{
    const s = new Set();
    rows.forEach(r=>r.matchings.forEach(m=>s.add(m.brand)));
    return [...s];
  },[rows]);

  const filtered = rows.filter(r=>{
    if(brand && !r.matchings.some(m=>m.brand===brand)) return false;
    if(!search) return true;
    const q = search.toLowerCase();
    return r.uid.toLowerCase().includes(q) ||
      r.sellingSku.toLowerCase().includes(q) ||
      r.mfgSku.toLowerCase().includes(q) ||
      r.matchings.some(m=>m.brand.toLowerCase().includes(q)||(m.label||'').toLowerCase().includes(q));
  });

  const totalFM = (r)=>r.work.reduce((s,p)=>s+p.fm,0)+r.fabric.reduce((s,p)=>s+p.fm,0);
  const totalWork = (r)=>r.work.reduce((s,p)=>s+p.total,0);

  return (
    <div style={{padding:'28px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
        <div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx,letterSpacing:-.5}}>Programs</div>
          <div style={{fontSize:12,color:T.tx3,marginTop:3}}>
            {rows.length} recipes · stitching + fabric breakdown per SKU · share, QR, PDF
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn kind="ghost" icon="globe" onClick={()=>onAction('Toggled Gujarati')}>ગુ</Btn>
          <Btn kind="primary" icon="plus" onClick={()=>onAction('Add program (mock)')}>Add program</Btn>
        </div>
      </div>

      {/* Filter bar */}
      <Card pad={12} style={{marginBottom:12}}>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:240,position:'relative'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search UID, SKU, brand, matching label…"
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
            {allBrands.map(b=>(
              <button key={b} onClick={()=>setBrand(b)} style={{padding:'7px 11px',borderRadius:6,fontSize:11,
                fontFamily:T.font,fontWeight:500,border:`1px solid ${brand===b?T.ac:T.bd}`,
                background:brand===b?T.ac3:'transparent',color:brand===b?T.ac2:T.tx2,cursor:'pointer'}}>{b}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card pad={0}>
        <div style={{display:'grid',
          gridTemplateColumns:'140px 1fr 130px 110px 110px 90px 220px',gap:12,
          padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
          fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
          <div>Program UID</div>
          <div>Selling · Manufacturing</div>
          <div>Brands</div>
          <div style={{textAlign:'right'}}>Fabric m</div>
          <div style={{textAlign:'right'}}>Work total</div>
          <div>Updated</div>
          <div style={{textAlign:'right'}}>Actions</div>
        </div>
        {filtered.map(r=>(
          <div key={r.id} style={{display:'grid',
            gridTemplateColumns:'140px 1fr 130px 110px 110px 90px 220px',gap:12,
            padding:'13px 14px',borderBottom:`1px solid ${T.bd}`,alignItems:'center',cursor:'pointer'}}
            onClick={()=>onView(r)}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.02)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontFamily:T.mono,fontSize:11,color:T.ac2,fontWeight:600}}>{r.uid}</div>
              {r.voiceNote && <div style={{color:T.yl,display:'flex',alignItems:'center'}} title={`Voice note · ${r.voiceDur}`}><Icon n="mic" s={12}/></div>}
            </div>
            <div>
              <div style={{fontFamily:T.mono,fontSize:12,color:T.tx,fontWeight:500}}>{r.sellingSku}</div>
              <div style={{fontFamily:T.mono,fontSize:10,color:T.tx3,marginTop:2}}>{r.mfgSku}</div>
            </div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {r.matchings.slice(0,2).map((m,i)=><Pill key={i} tone="ac">{m.brand}</Pill>)}
              {r.matchings.length>2 && <Pill>+{r.matchings.length-2}</Pill>}
            </div>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.bl,textAlign:'right',fontWeight:600}}>
              {totalFM(r).toFixed(2)} m
            </div>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.gr,textAlign:'right',fontWeight:600}}>
              ₹{totalWork(r).toLocaleString('en-IN')}
            </div>
            <div style={{fontSize:10,color:T.tx3}}>
              <div>{r.updated}</div>
              <div style={{marginTop:2,color:T.tx2}}>{r.updatedBy}</div>
            </div>
            <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
              <button onClick={()=>onView(r)} title="View"
                style={{...pgIconBtn,color:T.ac2,borderColor:'rgba(99,102,241,.25)'}}><Icon n="eye" s={12}/></button>
              <button onClick={()=>onEdit(r)} title="Edit" style={pgIconBtn}><Icon n="edit" s={12}/></button>
              <button onClick={()=>onAction(`QR for ${r.uid}`)} title="QR" style={pgIconBtn}><Icon n="qr" s={12}/></button>
              <button onClick={()=>onAction(`PDF for ${r.uid}`)} title="PDF" style={pgIconBtn}><Icon n="file" s={12}/></button>
              <button onClick={()=>onAction('Share link copied','Token rotated')} title="Copy share link" style={pgIconBtn}><Icon n="link" s={12}/></button>
            </div>
          </div>
        ))}
        {filtered.length===0 && (
          <div style={{padding:'40px 20px',textAlign:'center',color:T.tx3,fontSize:13}}>No programs match.</div>
        )}
      </Card>
    </div>
  );
}

const pgIconBtn = {
  width:26, height:26, borderRadius:6, border:`1px solid ${T.bd}`,
  background:'transparent', color:T.tx2, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center'
};

// ── Detail view ──
function ProgramsDetail({row,onBack,onEdit,onAction}){
  const [showFabricBreakdown,setShowFabricBreakdown] = pgUseState(false);
  const workTotal = row.work.reduce((s,p)=>s+p.total,0);
  const workFM = row.work.reduce((s,p)=>s+p.fm,0);
  const fabricFM = row.fabric.reduce((s,p)=>s+p.fm,0);
  const grandFM = workFM+fabricFM;

  const fabricBreakdown = pgUseMemo(()=>{
    const map = {};
    [...row.work,...row.fabric].forEach(p=>{
      const name = (p.fabric||p.fabricName||'').trim();
      if(name && p.fm) map[name] = (map[name]||0)+p.fm;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[row]);

  return (
    <div style={{padding:'28px 32px',maxWidth:1180,margin:'0 auto'}}>
      {/* Breadcrumb header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,
        paddingBottom:16,borderBottom:`1px solid ${T.bd}`}}>
        <div>
          <button onClick={onBack} style={{background:'transparent',border:'none',color:T.tx3,
            fontSize:11,cursor:'pointer',padding:0,fontFamily:T.font,display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
            <Icon n="arrow-left" s={12}/> Programs
          </button>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{fontFamily:T.sora,fontSize:26,fontWeight:700,color:T.tx,letterSpacing:-.5}}>{row.uid}</div>
            {row.voiceNote && (
              <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 9px',
                background:'rgba(251,191,36,.08)',border:`1px solid rgba(251,191,36,.2)`,borderRadius:14,
                color:T.yl,fontSize:10,fontWeight:600}}>
                <Icon n="mic" s={11}/> Voice · {row.voiceDur}
              </div>
            )}
          </div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>Updated {row.updated} · by {row.updatedBy}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <Btn kind="ghost" icon="qr" onClick={()=>onAction(`QR for ${row.uid}`)}>QR</Btn>
          <Btn kind="ghost" icon="file" onClick={()=>onAction(`PDF for ${row.uid}`)}>PDF</Btn>
          <Btn kind="ghost" icon="link" onClick={()=>onAction('Share link copied')}>Share</Btn>
          <Btn kind="primary" icon="edit" onClick={()=>onEdit(row)}>Edit</Btn>
        </div>
      </div>

      {/* SKU + image strip */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 280px',gap:12,marginBottom:18}}>
        <Card pad={14}>
          <PgMetric label="Selling SKU" value={row.sellingSku} tone="ac" mono/>
        </Card>
        <Card pad={14}>
          <PgMetric label="Manufacturing SKU" value={row.mfgSku} tone="bl" mono/>
        </Card>
        <Card pad={0}>
          <div style={{height:'100%',minHeight:80,display:'flex',alignItems:'center',justifyContent:'center',
            background:row.image?'transparent':T.glass2,
            backgroundImage:row.image?`linear-gradient(135deg,${T.ac}30,${T.bl}20)`:'none',
            color:T.tx3,fontSize:11,gap:8,padding:14}}>
            {row.image ? (
              <>
                <div style={{width:48,height:48,borderRadius:8,background:T.glass2,
                  display:'flex',alignItems:'center',justifyContent:'center',color:T.ac2}}>
                  <Icon n="image" s={20}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:T.tx,fontWeight:500}}>{row.image}</div>
                  <a onClick={e=>{e.preventDefault();onAction('Opened original');}} href="#"
                    style={{fontSize:10,color:T.ac2,textDecoration:'none'}}>Open original ↗</a>
                </div>
              </>
            ) : (
              <><Icon n="image" s={16}/> No image attached</>
            )}
          </div>
        </Card>
      </div>

      {/* Voice note bar */}
      {row.voiceNote && (
        <Card pad={12} style={{marginBottom:18,display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>onAction('Playing voice note')} style={{
            width:36,height:36,borderRadius:18,border:`1px solid ${T.bd2}`,
            background:`linear-gradient(135deg,${T.yl}, #f59e0b)`,color:'#1a1305',
            cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="play" s={14}/>
          </button>
          <div style={{flex:1}}>
            <div style={{fontSize:12,color:T.tx,fontWeight:500}}>Voice note</div>
            <div style={{fontSize:10,color:T.tx3,marginTop:2}}>{row.voiceDur} · recorded by {row.updatedBy}</div>
          </div>
          <div style={{flex:2,height:24,background:T.glass2,borderRadius:4,position:'relative',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:2,height:'100%',padding:'0 6px'}}>
              {Array(48).fill(0).map((_,i)=>(
                <div key={i} style={{flex:1,height:`${20+Math.sin(i*1.3)*40+Math.cos(i*0.7)*30}%`,
                  background:i<14?T.yl:T.tx3,opacity:i<14?1:0.4,borderRadius:1}}/>
              ))}
            </div>
          </div>
          <div style={{fontFamily:T.mono,fontSize:10,color:T.tx3,minWidth:36,textAlign:'right'}}>0:12 / {row.voiceDur}</div>
        </Card>
      )}

      {/* Brand matchings */}
      <div style={{marginBottom:18}}>
        <PgSectionTitle color={T.yl} count={row.matchings.length}>Brand matchings</PgSectionTitle>
        <Card pad={0}>
          <div style={{display:'grid',gridTemplateColumns:'180px 1fr',
            padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
            fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
            <div>Brand</div><div>Matching label</div>
          </div>
          {row.matchings.map((m,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'180px 1fr',
              padding:'12px 14px',
              borderBottom:i<row.matchings.length-1?`1px solid ${T.bd}`:'none',alignItems:'center'}}>
              <div><Pill tone="ac">{m.brand}</Pill></div>
              <div style={{fontSize:12,color:T.tx2,fontFamily:T.mono}}>{m.label||'—'}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Work program */}
      <div style={{marginBottom:18}}>
        <PgSectionTitle color={T.gr} count={row.work.length}>Work program</PgSectionTitle>
        <Card pad={0}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:920}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${T.bd}`}}>
                  <th style={pgTh}>Part</th>
                  <th style={pgThR}>Stitch</th>
                  <th style={pgTh}>Type</th>
                  <th style={pgThR}>1₹</th>
                  <th style={pgThR}>Rate</th>
                  <th style={pgThR}>1MP</th>
                  <th style={pgThR}>m / pc</th>
                  <th style={pgThR}>Total</th>
                  <th style={pgTh}>Fabric</th>
                  <th style={pgThR}>FM</th>
                </tr>
              </thead>
              <tbody>
                {row.work.map((p,i)=>(
                  <tr key={i} style={{borderBottom:i<row.work.length-1?`1px solid ${T.bd}`:'none'}}>
                    <td style={pgTd}>{p.part}</td>
                    <td style={pgTdR}>{p.stitch.toLocaleString('en-IN')}</td>
                    <td style={{...pgTd,color:T.tx3,fontSize:11}}>{p.type}</td>
                    <td style={pgTdR}>{p.oneRs.toFixed(2)}</td>
                    <td style={pgTdR}>{p.rate.toFixed(2)}</td>
                    <td style={{...pgTdR,color:T.ac2,fontWeight:600}}>{p.mp}</td>
                    <td style={pgTdR}>{p.mpc.toFixed(2)}</td>
                    <td style={{...pgTdR,fontFamily:T.sora,color:T.gr,fontWeight:700}}>₹{p.total}</td>
                    <td style={{...pgTd,color:T.tx2,fontSize:11}}>{p.fabric}</td>
                    <td style={{...pgTdR,color:T.bl,fontWeight:600}}>{p.fm.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Fabric program */}
      {row.fabric.length>0 && (
        <div style={{marginBottom:18}}>
          <PgSectionTitle color={T.bl} count={row.fabric.length}>Fabric program (extras)</PgSectionTitle>
          <Card pad={0}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${T.bd}`}}>
                  <th style={{...pgTh,width:'55%'}}>Part</th>
                  <th style={pgTh}>Fabric</th>
                  <th style={pgThR}>Meters</th>
                </tr>
              </thead>
              <tbody>
                {row.fabric.map((p,i)=>(
                  <tr key={i} style={{borderBottom:i<row.fabric.length-1?`1px solid ${T.bd}`:'none'}}>
                    <td style={pgTd}>{p.part}</td>
                    <td style={{...pgTd,color:T.tx2,fontSize:11}}>{p.fabricName}</td>
                    <td style={{...pgTdR,color:T.bl,fontWeight:600}}>{p.fm.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Totals */}
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>
        <div onClick={()=>setShowFabricBreakdown(v=>!v)}
          style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:14,
            padding:'12px 16px',background:'rgba(56,189,248,.06)',
            border:`1px solid rgba(56,189,248,.2)`,borderRadius:10,cursor:'pointer'}}>
          <span style={{fontSize:11,color:T.tx2,fontWeight:600}}>Grand fabric total</span>
          <span style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.bl,letterSpacing:-.3}}>
            {grandFM.toFixed(2)} m
          </span>
          <span style={{fontSize:10,color:T.tx3,
            transform:showFabricBreakdown?'rotate(90deg)':'rotate(0)',transition:'transform .15s'}}>▶</span>
        </div>
        {showFabricBreakdown && (
          <div style={{padding:'10px 14px',background:T.glass1,border:`1px solid ${T.bd}`,
            borderRadius:8,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
            {fabricBreakdown.map(([name,m])=>(
              <div key={name} style={{display:'flex',justifyContent:'space-between',
                padding:'8px 10px',background:T.glass2,borderRadius:6}}>
                <span style={{fontSize:11,color:T.tx2}}>{name}</span>
                <span style={{fontFamily:T.mono,fontSize:11,color:T.bl,fontWeight:600}}>{m.toFixed(2)} m</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:14,
          padding:'12px 16px',background:'rgba(52,211,153,.06)',
          border:`1px solid rgba(52,211,153,.2)`,borderRadius:10}}>
          <span style={{fontSize:11,color:T.tx2,fontWeight:600}}>Grand work total</span>
          <span style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.gr,letterSpacing:-.3}}>
            ₹{workTotal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* History */}
      <div style={{borderTop:`1px solid ${T.bd}`,paddingTop:14}}>
        <PgSectionTitle color={T.tx3}>Recent history</PgSectionTitle>
        <div style={{display:'flex',flexDirection:'column',gap:0}}>
          {[
            {when:'18 min ago',who:'Arya',what:'Updated stitch rate on Sleeves (pr)',from:'0.42',to:'0.45'},
            {when:'2 hours ago',who:'Anand',what:'Added matching for JIO',from:null,to:'JIO-A41'},
            {when:'Yesterday',who:'Arya',what:'Recorded voice note',from:null,to:'0:42 mp3'},
            {when:'3 days ago',who:'Arya',what:'Created program',from:null,to:row.uid},
          ].map((h,i)=>(
            <div key={i} style={{display:'flex',gap:12,padding:'10px 4px',
              borderBottom:i<3?`1px solid ${T.bd}`:'none'}}>
              <div style={{width:6,height:6,borderRadius:3,background:T.ac2,marginTop:6,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:T.tx}}>{h.what}</div>
                {h.from && (
                  <div style={{fontSize:10,color:T.tx3,marginTop:2,fontFamily:T.mono}}>
                    {h.from} → <span style={{color:T.gr}}>{h.to}</span>
                  </div>
                )}
                {!h.from && h.to && (
                  <div style={{fontSize:10,color:T.tx3,marginTop:2,fontFamily:T.mono}}>{h.to}</div>
                )}
              </div>
              <div style={{fontSize:10,color:T.tx3,textAlign:'right'}}>
                <div>{h.when}</div>
                <div style={{marginTop:2,color:T.tx2}}>{h.who}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const pgTh = {textAlign:'left',padding:'10px 14px',fontSize:9,color:T.tx3,
  textTransform:'uppercase',letterSpacing:1.5,fontWeight:600};
const pgThR = {...pgTh,textAlign:'right'};
const pgTd = {padding:'10px 14px',fontSize:12,color:T.tx,fontFamily:T.mono};
const pgTdR = {...pgTd,textAlign:'right'};

// ── Top-level scene ──
function ProgramsScene({onToast}){
  const [rows] = pgUseState(PG_SAMPLE);
  const [active,setActive] = pgUseState(null);

  const handleAction = (title,sub)=>onToast(title,sub);

  if(active){
    const fresh = rows.find(r=>r.id===active.id) || active;
    return <ProgramsDetail row={fresh}
      onBack={()=>setActive(null)}
      onEdit={()=>onToast('Edit program (mock)','Form would open here')}
      onAction={handleAction}/>;
  }
  return <ProgramsList rows={rows}
    onView={r=>setActive(r)}
    onEdit={r=>onToast(`Edit ${r.uid}`,'Form would open here')}
    onAction={handleAction}/>;
}

window.ProgramsScene = ProgramsScene;
