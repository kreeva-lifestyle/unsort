// PackStation scene — mobile-first AWB scanner
const {useState:psUseState,useRef:psUseRef,useEffect:psUseEffect} = React;

const PS_COURIERS = [
  {id:'dtdc',label:'DTDC',color:'#FBBF24',brands:['Myntra','Flipkart']},
  {id:'delhivery',label:'Delhivery',color:'#F87171',brands:['Ajio','Nykaa']},
  {id:'bluedart',label:'Blue Dart',color:'#38BDF8',brands:['Amazon']},
  {id:'shadowfax',label:'Shadowfax',color:'#A78BFA',brands:['Meesho']},
];

function PSSetup({onStart}){
  const [courier,setCourier] = psUseState(PS_COURIERS[0]);
  const [brand,setBrand] = psUseState(courier.brands[0]);
  const [camera,setCamera] = psUseState('Cam-A');

  return (
    <div style={{padding:'8px 16px 24px',display:'flex',flexDirection:'column',gap:18}}>
      <div style={{textAlign:'center',padding:'4px 0 8px'}}>
        <div style={{width:64,height:64,margin:'0 auto 12px',borderRadius:16,
          background:`linear-gradient(135deg,${T.ac},${T.bl})`,
          display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',
          boxShadow:`0 10px 30px ${T.ac}66`}}>
          <Icon n="scan" s={28}/>
        </div>
        <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3}}>Start a packing session</div>
        <div style={{fontSize:12,color:T.tx3,marginTop:3}}>Choose courier · brand · camera</div>
      </div>

      <div>
        <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>Courier</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {PS_COURIERS.map(c=>{
            const sel = courier.id===c.id;
            return (
              <button key={c.id} onClick={()=>{setCourier(c);setBrand(c.brands[0]);}} style={{
                background:sel?T.s:T.s2,border:`1px solid ${sel?c.color:T.bd}`,borderRadius:11,
                padding:'14px 12px',color:T.tx,cursor:'pointer',textAlign:'left',
                display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:6,height:6,borderRadius:3,background:c.color,boxShadow:`0 0 6px ${c.color}`}}/>
                  <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600}}>{c.label}</div>
                </div>
                <div style={{fontSize:10,color:T.tx3}}>{c.brands.join(' · ')}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>Brand</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {courier.brands.map(b=>(
            <button key={b} onClick={()=>setBrand(b)} style={{
              flex:1,padding:'12px 10px',borderRadius:9,fontSize:13,fontFamily:T.font,fontWeight:500,
              border:`1px solid ${brand===b?T.ac:T.bd}`,
              background:brand===b?T.ac3:T.s2,
              color:brand===b?T.ac2:T.tx2,cursor:'pointer'}}>{b}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>Camera / station</div>
        <div style={{display:'flex',gap:6}}>
          {['Cam-A','Cam-B','Cam-C'].map(c=>(
            <button key={c} onClick={()=>setCamera(c)} style={{
              flex:1,padding:'12px 10px',borderRadius:9,fontSize:13,fontFamily:T.font,fontWeight:500,
              border:`1px solid ${camera===c?T.ac:T.bd}`,
              background:camera===c?T.ac3:T.s2,
              color:camera===c?T.ac2:T.tx2,cursor:'pointer'}}>{c}</button>
          ))}
        </div>
      </div>

      <button onClick={()=>onStart({courier,brand,camera})}
        style={{marginTop:8,padding:16,borderRadius:12,border:'none',cursor:'pointer',
          background:`linear-gradient(135deg,${T.ac},${T.bl})`,
          color:'#fff',fontFamily:T.sora,fontSize:15,fontWeight:600,
          boxShadow:`0 10px 30px ${T.ac}55`,
          display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        <Icon n="scan" s={18}/>Start scanning
      </button>
    </div>
  );
}

function PSScanner({session,onEnd}){
  const [scans,setScans] = psUseState([
    {awb:'AWB28819204371',time:'2 min ago',ok:true},
    {awb:'AWB28819204370',time:'2 min ago',ok:true},
    {awb:'AWB99182734221',time:'3 min ago',ok:false,reason:'duplicate'},
    {awb:'AWB28819204369',time:'3 min ago',ok:true},
    {awb:'AWB28819204368',time:'4 min ago',ok:true},
  ]);
  const [input,setInput] = psUseState('');
  const [flash,setFlash] = psUseState(null);
  const [cameraOn,setCameraOn] = psUseState(false);
  const inputRef = psUseRef(null);
  const sessionCount = scans.filter(s=>s.ok).length;

  psUseEffect(()=>{ inputRef.current?.focus(); },[]);

  const submit = (awb)=>{
    if(!awb || awb.length<4) return;
    const dup = scans.some(s=>s.awb===awb);
    if(dup){
      setFlash('error');
      setScans(p=>[{awb,time:'just now',ok:false,reason:'duplicate'},...p]);
    } else {
      setFlash('success');
      setScans(p=>[{awb,time:'just now',ok:true,pending:true},...p]);
      setTimeout(()=>setScans(p=>p.map(s=>s.awb===awb?{...s,pending:false}:s)),900);
    }
    setInput('');
    setTimeout(()=>setFlash(null),350);
    inputRef.current?.focus();
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',position:'relative'}}>
      {/* Flash overlay */}
      {flash && <div style={{position:'absolute',inset:0,zIndex:50,pointerEvents:'none',
        background:flash==='success'?'rgba(52,211,153,.18)':'rgba(248,113,113,.22)',
        animation:'psflash .35s ease-out'}}/>}

      {/* Session pill */}
      <div style={{padding:'8px 16px 12px',display:'flex',gap:8,alignItems:'center'}}>
        <div style={{flex:1,background:T.s2,border:`1px solid ${T.bd}`,borderRadius:10,padding:'10px 12px',
          display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:6,height:6,borderRadius:3,background:session.courier.color,
            boxShadow:`0 0 8px ${session.courier.color}`}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:T.tx,fontWeight:600}}>{session.courier.label} · {session.brand}</div>
            <div style={{fontSize:10,color:T.tx3,marginTop:1}}>{session.camera} · started 8m ago</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.ac2,letterSpacing:-.3,lineHeight:1}}>{sessionCount}</div>
            <div style={{fontSize:9,color:T.tx3,textTransform:'uppercase',letterSpacing:1.2,marginTop:1}}>scanned</div>
          </div>
        </div>
        <button onClick={onEnd} style={{background:T.s2,border:`1px solid ${T.bd}`,
          borderRadius:10,width:42,height:42,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon n="x" s={16}/>
        </button>
      </div>

      {/* Camera viewport */}
      <div style={{margin:'0 16px',background:'#000',borderRadius:14,
        height:200,position:'relative',overflow:'hidden',
        border:`1px solid ${T.bd2}`}}>
        {cameraOn ? (
          <div style={{position:'absolute',inset:0,
            background:'radial-gradient(ellipse at center,rgba(99,102,241,.15) 0%,#000 70%)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{width:'70%',height:80,border:`2px solid ${T.ac2}`,borderRadius:8,position:'relative'}}>
              <div style={{position:'absolute',top:-6,left:-6,width:18,height:18,borderTop:`3px solid ${T.ac}`,borderLeft:`3px solid ${T.ac}`}}/>
              <div style={{position:'absolute',top:-6,right:-6,width:18,height:18,borderTop:`3px solid ${T.ac}`,borderRight:`3px solid ${T.ac}`}}/>
              <div style={{position:'absolute',bottom:-6,left:-6,width:18,height:18,borderBottom:`3px solid ${T.ac}`,borderLeft:`3px solid ${T.ac}`}}/>
              <div style={{position:'absolute',bottom:-6,right:-6,width:18,height:18,borderBottom:`3px solid ${T.ac}`,borderRight:`3px solid ${T.ac}`}}/>
              <div style={{position:'absolute',top:'50%',left:'4%',right:'4%',height:2,background:T.ac,
                animation:'psscan 1.6s ease-in-out infinite',boxShadow:`0 0 12px ${T.ac}`}}/>
            </div>
          </div>
        ):(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:T.tx2}}>
            <div style={{width:48,height:48,borderRadius:12,background:'rgba(255,255,255,.04)',
              display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon n="scan" s={22}/>
            </div>
            <div style={{fontSize:12,color:T.tx3}}>Camera off · type or scan AWB</div>
          </div>
        )}
        <button onClick={()=>setCameraOn(c=>!c)} style={{position:'absolute',bottom:10,right:10,
          background:'rgba(0,0,0,.6)',border:`1px solid ${T.bd2}`,borderRadius:8,padding:'6px 10px',
          color:'#fff',fontSize:11,fontFamily:T.font,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
          <Icon n="dot" s={8} c={cameraOn?'#34D399':'#F87171'}/>
          {cameraOn?'Camera on':'Turn on'}
        </button>
      </div>

      {/* Input */}
      <div style={{padding:'14px 16px 8px'}}>
        <div style={{position:'relative'}}>
          <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
            onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();submit(input.trim());}}}
            placeholder="Type or scan AWB…"
            style={{width:'100%',background:T.s,border:`2px solid ${T.ac}`,borderRadius:12,
              padding:'14px 16px',color:T.tx,fontFamily:T.mono,fontSize:16,fontWeight:600,outline:'none',
              letterSpacing:.5}}/>
          <div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
            color:T.tx3,fontSize:10,fontFamily:T.mono,padding:'2px 6px',
            background:T.s2,borderRadius:4,border:`1px solid ${T.bd}`}}>↵</div>
        </div>
      </div>

      {/* Recent scans */}
      <div style={{flex:1,overflow:'auto',padding:'4px 16px 16px'}}>
        <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,
          marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Recent scans</span>
          <span style={{color:T.tx3}}>{scans.length} this session</span>
        </div>
        {scans.map((s,i)=>(
          <div key={i} style={{
            background:s.ok?T.s2:'rgba(248,113,113,.06)',
            border:`1px solid ${s.ok?T.bd:'rgba(248,113,113,.18)'}`,
            borderRadius:11,padding:'12px 14px',marginBottom:7,
            display:'flex',alignItems:'center',gap:11,opacity:s.pending?.7:1}}>
            <div style={{width:32,height:32,borderRadius:8,
              background:s.ok?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)',
              color:s.ok?T.gr:T.re,
              display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Icon n={s.ok?'check':'x'} s={15}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,fontWeight:600,letterSpacing:.3}}>{s.awb}</div>
              <div style={{fontSize:10,color:T.tx3,marginTop:2,display:'flex',gap:6,alignItems:'center'}}>
                {s.time}
                {s.pending && <span style={{color:T.yl}}>· syncing</span>}
                {!s.ok && s.reason && <span style={{color:T.re,textTransform:'uppercase',letterSpacing:.5,fontWeight:600}}>· {s.reason}</span>}
              </div>
            </div>
            {i===0 && s.ok && (
              <button onClick={()=>setScans(p=>p.filter((_,j)=>j!==0))} style={{background:'transparent',
                border:`1px solid ${T.bd}`,borderRadius:7,padding:'5px 9px',color:T.tx3,fontSize:10,fontFamily:T.font,cursor:'pointer',
                display:'flex',alignItems:'center',gap:4}}>
                <Icon n="undo" s={11}/>Undo
              </button>
            )}
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{__html:`
        @keyframes psflash{0%{opacity:1}100%{opacity:0}}
        @keyframes psscan{0%,100%{transform:translateY(-30px)}50%{transform:translateY(30px)}}
      `}}/>
    </div>
  );
}

function PackStationMobile({onToast}){
  const [session,setSession] = psUseState(null);
  return session
    ? <PSScanner session={session} onEnd={()=>{onToast('Session ended','42 AWBs scanned · synced');setSession(null);}}/>
    : <PSSetup onStart={setSession}/>;
}

// Desktop fallback — show device frame inline
function PackStationScene({onToast}){
  return (
    <div style={{padding:'40px 32px',maxWidth:1200,margin:'0 auto'}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx,letterSpacing:-.5}}>PackStation</div>
        <div style={{fontSize:12,color:T.tx3,marginTop:3}}>Mobile-first AWB scanner · use a phone or scan handset for best experience</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:24,alignItems:'start'}}>
        <Card>
          <div style={{fontFamily:T.sora,fontSize:16,fontWeight:600,color:T.tx,marginBottom:14}}>Today's sessions</div>
          {[
            {courier:'DTDC',brand:'Myntra',cam:'Cam-A',count:142,by:'Anand',at:'9:14 AM'},
            {courier:'Delhivery',brand:'Ajio',cam:'Cam-B',count:88,by:'Priya',at:'10:42 AM'},
            {courier:'Blue Dart',brand:'Amazon',cam:'Cam-A',count:54,by:'Anand',at:'1:22 PM'},
            {courier:'DTDC',brand:'Flipkart',cam:'Cam-C',count:31,by:'Arya',at:'2:50 PM'},
          ].map((s,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'140px 110px 1fr 100px 90px 80px',gap:14,
              padding:'12px 4px',borderBottom:i<3?`1px solid ${T.bd}`:'none',alignItems:'center'}}>
              <div style={{fontSize:13,color:T.tx,fontWeight:600}}>{s.courier}</div>
              <div><Pill tone="ac">{s.brand}</Pill></div>
              <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono}}>{s.cam} · {s.by} · {s.at}</div>
              <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,textAlign:'right'}}>{s.count}</div>
              <div style={{fontSize:10,color:T.tx3,textAlign:'right'}}>scanned</div>
              <Btn kind="ghost" style={{height:28,padding:'0 10px',fontSize:11}}>View</Btn>
            </div>
          ))}
          <div style={{marginTop:14,padding:'12px 4px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx2}}>Total today</div>
            <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:T.gr,letterSpacing:-.3}}>315 AWBs</div>
          </div>
        </Card>
        <Card>
          <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx,marginBottom:8}}>Open on phone</div>
          <div style={{fontSize:12,color:T.tx3,lineHeight:1.5,marginBottom:14}}>
            Scan the QR with your packing-bench phone, or use the device frame on the right when you toggle "mobile" view in the prototype.
          </div>
          <div style={{aspectRatio:'1',background:'#fff',borderRadius:10,padding:14,
            display:'grid',gridTemplateColumns:'repeat(21,1fr)',gridTemplateRows:'repeat(21,1fr)',gap:0}}>
            {Array(21*21).fill(0).map((_,i)=>{
              const r = Math.floor(i/21), c = i%21;
              const corner = (r<7&&c<7)||(r<7&&c>13)||(r>13&&c<7);
              const cornerInner = (r>=2&&r<=4&&c>=2&&c<=4)||(r>=2&&r<=4&&c>=16&&c<=18)||(r>=16&&r<=18&&c>=2&&c<=4);
              const fill = corner ? !((r===0||r===6||c===0||c===6)&&!cornerInner) : ((r*c+r+c)%3===0||(r*7+c*3)%5===0);
              return <div key={i} style={{background:fill?'#000':'#fff'}}/>;
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

window.PackStationScene = PackStationScene;
window.PackStationMobile = PackStationMobile;
