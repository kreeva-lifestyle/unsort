// Settings + Login scenes
const {useState:stUseState} = React;

const ST_TABS = [
  {id:'brands',label:'Brands',icon:'tag'},
  {id:'categories',label:'Categories',icon:'box'},
  {id:'locations',label:'Locations',icon:'grid'},
  {id:'users',label:'Users',icon:'user'},
  {id:'profile',label:'Profile',icon:'settings'},
];

function ST_Section({title,sub,onAdd,addLabel='Add',children}){
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}}>
        <div>
          <div style={{fontFamily:T.sora,fontSize:18,fontWeight:600,color:T.tx,letterSpacing:-.3}}>{title}</div>
          <div style={{fontSize:12,color:T.tx3,marginTop:2}}>{sub}</div>
        </div>
        {onAdd && <Btn kind="primary" icon="plus" onClick={onAdd}>{addLabel}</Btn>}
      </div>
      {children}
    </div>
  );
}

function ST_Brands({onToast}){
  const [items,setItems] = stUseState([
    {name:'TANUKA',prefix:'TN',skus:248,active:true},
    {name:'FUSIONIC',prefix:'FN',skus:184,active:true},
    {name:'SVARAA',prefix:'SW',skus:96,active:true},
    {name:'Heritage Line',prefix:'HL',skus:0,active:false},
  ]);
  return (
    <ST_Section title="Brands" sub="Master list — used in Brand Tags, Inventory, Challans" onAdd={()=>onToast('Add brand (mock)')} addLabel="Add brand">
      <Card pad={0}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 100px 100px 110px 90px',gap:14,
          padding:'10px 16px',borderBottom:`1px solid ${T.bd}`,
          fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
          <div>Brand</div><div>SKU prefix</div><div style={{textAlign:'right'}}>SKUs</div><div>Status</div><div/>
        </div>
        {items.map((b,i)=>(
          <div key={b.name} style={{display:'grid',gridTemplateColumns:'1fr 100px 100px 110px 90px',gap:14,
            padding:'14px 16px',borderBottom:i<items.length-1?`1px solid ${T.bd}`:'none',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:T.s3,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontFamily:T.sora,fontSize:12,fontWeight:700,color:T.ac2}}>{b.name[0]}</div>
              <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{b.name}</div>
            </div>
            <div style={{fontFamily:T.mono,fontSize:12,color:T.tx2}}>{b.prefix}</div>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,textAlign:'right',fontWeight:600}}>{b.skus}</div>
            <div><Pill tone={b.active?'gr':'neutral'} dot>{b.active?'Active':'Archived'}</Pill></div>
            <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
              <button onClick={()=>onToast('Edit '+b.name)} style={{background:'transparent',border:`1px solid ${T.bd}`,
                borderRadius:6,width:28,height:28,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon n="edit" s={12}/>
              </button>
              <button onClick={()=>onToast('Archive '+b.name)} style={{background:'transparent',border:`1px solid ${T.bd}`,
                borderRadius:6,width:28,height:28,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon n="trash" s={12}/>
              </button>
            </div>
          </div>
        ))}
      </Card>
    </ST_Section>
  );
}

function ST_Categories({onToast}){
  const cats = [
    {name:'Co-ord Set',count:42},{name:'Dress',count:68},{name:'Gown',count:31},
    {name:'Jumpsuit',count:18},{name:'Kurta',count:54},{name:'Saree',count:29},
    {name:'Top',count:91},{name:'Bottom',count:73},{name:'Dupatta',count:24},
  ];
  return (
    <ST_Section title="Product categories" sub="Used to group SKUs in inventory and reports" onAdd={()=>onToast('Add category (mock)')} addLabel="Add category">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
        {cats.map(c=>(
          <Card key={c.name} pad={14} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{c.name}</div>
              <div style={{fontSize:11,color:T.tx3,marginTop:2}}>{c.count} SKUs</div>
            </div>
            <button style={{background:'transparent',border:`1px solid ${T.bd}`,
              borderRadius:6,width:28,height:28,color:T.tx3,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon n="edit" s={12}/>
            </button>
          </Card>
        ))}
      </div>
    </ST_Section>
  );
}

function ST_Locations({onToast}){
  const locs = [
    {name:'Showroom · Katargam',type:'Sale point',skus:412,address:'16, Amba Bhuvan, Surat'},
    {name:'Warehouse · Pandesara',type:'Storage',skus:1284,address:'Plot 88, GIDC Pandesara'},
    {name:'Workshop · Begumpura',type:'Production',skus:38,address:'Lane 4, Begumpura'},
  ];
  return (
    <ST_Section title="Locations" sub="Where your inventory physically lives" onAdd={()=>onToast('Add location (mock)')} addLabel="Add location">
      {locs.map((l,i)=>(
        <Card key={l.name} pad={16} style={{marginBottom:10,display:'flex',gap:14,alignItems:'center'}}>
          <div style={{width:42,height:42,borderRadius:10,background:T.ac3,
            display:'flex',alignItems:'center',justifyContent:'center',color:T.ac2,flexShrink:0}}>
            <Icon n={l.type==='Sale point'?'tag':l.type==='Storage'?'box':'truck'} s={18}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,color:T.tx,fontWeight:600}}>{l.name}</div>
            <div style={{fontSize:11,color:T.tx3,marginTop:3}}>{l.address}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <Pill tone="ac">{l.type}</Pill>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,fontWeight:600,marginTop:4}}>{l.skus} SKUs</div>
          </div>
          <button onClick={()=>onToast('Edit '+l.name)} style={{background:'transparent',border:`1px solid ${T.bd}`,
            borderRadius:7,width:32,height:32,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="edit" s={13}/>
          </button>
        </Card>
      ))}
    </ST_Section>
  );
}

function ST_Users({onToast}){
  const users = [
    {name:'Arya Raichura',email:'arya@aryadesigns.co.in',role:'Owner',pin:true,active:'Active now'},
    {name:'Anand Patel',email:'anand@aryadesigns.co.in',role:'Manager',pin:true,active:'2 hours ago'},
    {name:'Priya Shah',email:'priya@aryadesigns.co.in',role:'Cashier',pin:true,active:'Yesterday'},
    {name:'Rahul (Packer)',email:'rahul@aryadesigns.co.in',role:'Packer',pin:false,active:'Never'},
  ];
  return (
    <ST_Section title="Team" sub={`${users.length} users · roles control access to modules`} onAdd={()=>onToast('Invite user (mock)')} addLabel="Invite user">
      <Card pad={0}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 110px 80px 130px 90px',gap:14,
          padding:'10px 16px',borderBottom:`1px solid ${T.bd}`,
          fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
          <div>User</div><div>Role</div><div>PIN</div><div>Last active</div><div/>
        </div>
        {users.map((u,i)=>(
          <div key={u.email} style={{display:'grid',gridTemplateColumns:'1fr 110px 80px 130px 90px',gap:14,
            padding:'14px 16px',borderBottom:i<users.length-1?`1px solid ${T.bd}`:'none',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
              <div style={{width:34,height:34,borderRadius:8,
                background:`linear-gradient(135deg,${T.ac},${T.bl})`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontFamily:T.sora,fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                {u.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{u.name}</div>
                <div style={{fontSize:11,color:T.tx3,marginTop:1}}>{u.email}</div>
              </div>
            </div>
            <div><Pill tone={u.role==='Owner'?'ac':u.role==='Manager'?'bl':'neutral'}>{u.role}</Pill></div>
            <div><Pill tone={u.pin?'gr':'re'} dot>{u.pin?'Set':'Not set'}</Pill></div>
            <div style={{fontSize:11,color:T.tx3}}>{u.active}</div>
            <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
              <button onClick={()=>onToast('Edit '+u.name)} style={{background:'transparent',border:`1px solid ${T.bd}`,
                borderRadius:6,width:28,height:28,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon n="edit" s={12}/>
              </button>
            </div>
          </div>
        ))}
      </Card>
    </ST_Section>
  );
}

function ST_Profile({onToast}){
  return (
    <ST_Section title="Business profile" sub="Shown on challans, brand tags, and printouts">
      <Card pad={20} style={{marginBottom:14}}>
        <div style={{display:'flex',gap:18,alignItems:'center',marginBottom:18}}>
          <div style={{width:64,height:64,borderRadius:14,
            background:`linear-gradient(135deg,${T.ac},${T.bl})`,
            display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',
            fontFamily:T.sora,fontSize:24,fontWeight:800}}>A</div>
          <div>
            <div style={{fontFamily:T.sora,fontSize:18,fontWeight:600,color:T.tx}}>Arya Designs</div>
            <div style={{fontSize:12,color:T.tx3,marginTop:3}}>GST 24AABCA1234F1Z5 · Surat, Gujarat</div>
          </div>
          <Btn kind="ghost" icon="edit" style={{marginLeft:'auto'}}>Change logo</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {[
            ['Business name','Arya Designs'],
            ['GSTIN','24AABCA1234F1Z5'],
            ['Phone','+91 98250 12345'],
            ['Email','hello@aryadesigns.co.in'],
            ['Address','16, Amba Bhuvan, Near Kasanagar Circle'],
            ['City / PIN','Surat-395004, Gujarat'],
          ].map(([l,v])=>(
            <div key={l}>
              <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:5}}>{l}</div>
              <input defaultValue={v}
                style={{width:'100%',background:T.s,border:`1px solid ${T.bd}`,borderRadius:7,
                  padding:'8px 10px',color:T.tx,fontFamily:T.font,fontSize:13,outline:'none'}}/>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
          <Btn kind="primary" icon="check" onClick={()=>onToast('Profile saved')}>Save changes</Btn>
        </div>
      </Card>
    </ST_Section>
  );
}

function SettingsScene({onToast}){
  const [tab,setTab] = stUseState('brands');
  return (
    <div style={{padding:'28px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx,letterSpacing:-.5}}>Settings</div>
        <div style={{fontSize:12,color:T.tx3,marginTop:3}}>Master data · team · profile</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:24,alignItems:'start'}}>
        <div style={{position:'sticky',top:14}}>
          {ST_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',
              background:tab===t.id?T.ac3:'transparent',
              color:tab===t.id?T.ac2:T.tx2,
              border:'none',borderRadius:8,cursor:'pointer',
              fontSize:13,fontWeight:tab===t.id?500:400,fontFamily:T.font,
              textAlign:'left',marginBottom:2}}>
              <Icon n={t.icon} s={15}/>{t.label}
            </button>
          ))}
        </div>
        <div>
          {tab==='brands' && <ST_Brands onToast={onToast}/>}
          {tab==='categories' && <ST_Categories onToast={onToast}/>}
          {tab==='locations' && <ST_Locations onToast={onToast}/>}
          {tab==='users' && <ST_Users onToast={onToast}/>}
          {tab==='profile' && <ST_Profile onToast={onToast}/>}
        </div>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────
function LoginScene({onLogin}){
  const [step,setStep] = stUseState('phone');
  const [phone,setPhone] = stUseState('98250 12345');
  const [otp,setOtp] = stUseState(['','','','','','']);
  const [err,setErr] = stUseState('');

  const sendOTP = ()=>{
    if(phone.replace(/\s/g,'').length<10){ setErr('Enter a valid phone'); return; }
    setErr('');
    setStep('otp');
  };
  const setDigit = (i,v)=>{
    const d = v.replace(/\D/g,'').slice(-1);
    setOtp(o=>{const n=[...o];n[i]=d;return n;});
    if(d && i<5) document.getElementById('otp-'+(i+1))?.focus();
  };
  const verify = ()=>{
    if(otp.join('').length<6){ setErr('Enter all 6 digits'); return; }
    onLogin();
  };

  return (
    <div style={{minHeight:'100vh',background:T.bg,position:'relative',overflow:'hidden',
      display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:T.font,color:T.tx}}>
      {/* Ambient */}
      <div style={{position:'absolute',top:-200,right:-100,width:600,height:600,
        background:`radial-gradient(circle,${T.ac}40 0%,transparent 60%)`,filter:'blur(80px)'}}/>
      <div style={{position:'absolute',bottom:-200,left:-100,width:500,height:500,
        background:`radial-gradient(circle,${T.bl}30 0%,transparent 60%)`,filter:'blur(80px)'}}/>

      <div style={{position:'relative',zIndex:2,display:'grid',gridTemplateColumns:'1fr 420px',gap:60,
        maxWidth:1080,width:'100%',alignItems:'center'}}>
        {/* Brand panel */}
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:32}}>
            <div style={{width:44,height:44,borderRadius:12,
              background:`linear-gradient(135deg,${T.ac},${T.bl})`,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontFamily:T.sora,fontWeight:800,fontSize:22,color:'#fff',
              boxShadow:`0 10px 30px ${T.ac}55`}}>D</div>
            <div>
              <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:T.tx,letterSpacing:-.4}}>DailyOffice</div>
              <div style={{fontSize:11,color:T.tx3,fontFamily:T.mono,marginTop:2}}>Cash Khata · Inventory · Tags</div>
            </div>
          </div>
          <div style={{fontFamily:T.sora,fontSize:42,fontWeight:700,color:T.tx,letterSpacing:-1,lineHeight:1.05,maxWidth:520}}>
            One office.<br/>
            <span style={{background:`linear-gradient(135deg,${T.ac2},${T.bl})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Every counter.</span>
          </div>
          <div style={{fontSize:14,color:T.tx2,lineHeight:1.6,marginTop:18,maxWidth:480}}>
            Run your shop, warehouse and packing bench from one app. Built for Indian retail — Gujarati, Hindi, English.
          </div>
          <div style={{display:'flex',gap:24,marginTop:32}}>
            {[
              ['1.2k','Khata entries / mo'],
              ['18','Brands'],
              ['400+','SKUs'],
            ].map(([n,l])=>(
              <div key={l}>
                <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:T.ac2,letterSpacing:-.4}}>{n}</div>
                <div style={{fontSize:11,color:T.tx3,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Login card */}
        <div style={{background:T.s,border:`1px solid ${T.bd2}`,borderRadius:18,padding:32,
          backdropFilter:'blur(20px)',boxShadow:'0 30px 80px rgba(0,0,0,.5)'}}>
          <div style={{fontFamily:T.sora,fontSize:20,fontWeight:700,color:T.tx,letterSpacing:-.3}}>
            {step==='phone'?'Sign in':'Enter OTP'}
          </div>
          <div style={{fontSize:12,color:T.tx3,marginTop:4,marginBottom:24}}>
            {step==='phone'?'We\'ll send a 6-digit OTP to your phone':`Sent to +91 ${phone}`}
          </div>

          {step==='phone' ? (
            <div>
              <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:6}}>Phone number</div>
              <div style={{display:'flex',gap:6,alignItems:'stretch'}}>
                <div style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,padding:'0 12px',
                  display:'flex',alignItems:'center',color:T.tx,fontFamily:T.mono,fontSize:14,fontWeight:600}}>+91</div>
                <input value={phone} onChange={e=>setPhone(e.target.value)} autoFocus
                  onKeyDown={e=>e.key==='Enter'&&sendOTP()}
                  style={{flex:1,background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,
                    padding:'12px 14px',color:T.tx,fontFamily:T.mono,fontSize:16,fontWeight:600,outline:'none',letterSpacing:.5}}/>
              </div>
              {err && <div style={{fontSize:12,color:T.re,marginTop:8}}>{err}</div>}
              <button onClick={sendOTP}
                style={{width:'100%',marginTop:18,padding:'14px',borderRadius:10,border:'none',cursor:'pointer',
                  background:`linear-gradient(135deg,${T.ac},${T.bl})`,
                  color:'#fff',fontFamily:T.sora,fontSize:14,fontWeight:600,
                  boxShadow:`0 10px 30px ${T.ac}55`}}>
                Send OTP
              </button>
              <div style={{textAlign:'center',marginTop:18,fontSize:11,color:T.tx3}}>
                By continuing you agree to the <span style={{color:T.tx2,textDecoration:'underline',cursor:'pointer'}}>Terms</span> & <span style={{color:T.tx2,textDecoration:'underline',cursor:'pointer'}}>Privacy</span>.
              </div>
            </div>
          ):(
            <div>
              <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>6-digit code</div>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                {otp.map((d,i)=>(
                  <input key={i} id={'otp-'+i} value={d} onChange={e=>setDigit(i,e.target.value)}
                    onKeyDown={e=>e.key==='Backspace'&&!d&&i>0&&document.getElementById('otp-'+(i-1))?.focus()}
                    autoFocus={i===0} maxLength={1}
                    style={{flex:'1 1 0',minWidth:0,width:0,aspectRatio:'1',background:T.s2,border:`1px solid ${d?T.ac:T.bd}`,
                      borderRadius:8,color:T.tx,fontFamily:T.sora,fontSize:22,fontWeight:700,
                      textAlign:'center',outline:'none',transition:'border-color .15s'}}/>
                ))}
              </div>
              {err && <div style={{fontSize:12,color:T.re,marginBottom:8}}>{err}</div>}
              <div style={{fontSize:11,color:T.tx3,marginBottom:14,display:'flex',justifyContent:'space-between'}}>
                <button onClick={()=>setStep('phone')} style={{background:'transparent',border:'none',
                  color:T.tx2,cursor:'pointer',fontSize:11,fontFamily:T.font,padding:0}}>← Change number</button>
                <button style={{background:'transparent',border:'none',
                  color:T.ac2,cursor:'pointer',fontSize:11,fontFamily:T.font,padding:0}}>Resend in 28s</button>
              </div>
              <button onClick={verify}
                style={{width:'100%',padding:'14px',borderRadius:10,border:'none',cursor:'pointer',
                  background:`linear-gradient(135deg,${T.ac},${T.bl})`,
                  color:'#fff',fontFamily:T.sora,fontSize:14,fontWeight:600,
                  boxShadow:`0 10px 30px ${T.ac}55`}}>
                Verify & sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.SettingsScene = SettingsScene;
window.LoginScene = LoginScene;
