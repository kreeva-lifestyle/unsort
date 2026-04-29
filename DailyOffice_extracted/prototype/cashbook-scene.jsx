// CashBook scene — opening balance, expenses, sales, handovers
const {useState:csUseState,useMemo:csUseMemo} = React;

const CB_CATEGORIES = ['Shipping','Staff','Supplies','Travel','Utilities','Misc'];

const inr = n => '₹' + Number(n||0).toLocaleString('en-IN');

function StatTile({label,value,tone='neutral',icon,sub}){
  const tones = {
    neutral:{fg:T.tx,bd:T.bd},
    gr:{fg:T.gr,bd:'rgba(52,211,153,.18)'},
    re:{fg:T.re,bd:'rgba(248,113,113,.18)'},
    ac:{fg:T.ac2,bd:'rgba(99,102,241,.22)'},
    yl:{fg:T.yl,bd:'rgba(251,191,36,.18)'},
  };
  const t = tones[tone];
  return (
    <div style={{background:T.s2,border:`1px solid ${t.bd}`,borderRadius:11,padding:'14px 16px',
      flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:4}}>
      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:T.tx3,
        textTransform:'uppercase',letterSpacing:1.6,fontWeight:600}}>
        {icon && <Icon n={icon} s={11}/>}{label}
      </div>
      <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:t.fg,letterSpacing:-.4,lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:11,color:T.tx3}}>{sub}</div>}
    </div>
  );
}

function CBExpenseRow({e,onDelete}){
  return (
    <div style={{display:'grid',gridTemplateColumns:'90px 1fr 130px 90px 80px 40px',gap:14,
      alignItems:'center',padding:'12px 14px',borderBottom:`1px solid ${T.bd}`}}>
      <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{e.time}</div>
      <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{e.name}</div>
      <Pill tone="ac">{e.cat}</Pill>
      <div style={{fontFamily:T.mono,fontSize:13,color:T.re,textAlign:'right',fontWeight:600}}>−{inr(e.amount)}</div>
      <div style={{fontSize:11,color:T.tx3,textAlign:'right'}}>Cash</div>
      <button onClick={()=>onDelete(e.id)} style={{background:'transparent',border:'none',
        color:T.tx3,cursor:'pointer',padding:6,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}
        onMouseEnter={ev=>{ev.currentTarget.style.color=T.re;ev.currentTarget.style.background='rgba(248,113,113,.08)';}}
        onMouseLeave={ev=>{ev.currentTarget.style.color=T.tx3;ev.currentTarget.style.background='transparent';}}>
        <Icon n="trash" s={13}/>
      </button>
    </div>
  );
}

function AddExpenseModal({open,onClose,onSave}){
  const [amount,setAmount] = csUseState('');
  const [category,setCategory] = csUseState(CB_CATEGORIES[0]);
  const [desc,setDesc] = csUseState('');
  const [err,setErr] = csUseState('');

  if(!open) return null;
  const submit = ()=>{
    const a = Number(amount);
    if(!a || a<=0){ setErr('Amount must be > 0'); return; }
    if(!desc.trim()){ setErr('Description required'); return; }
    onSave({amount:a,cat:category,name:desc.trim()});
    setAmount('');setDesc('');setErr('');
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,background:'rgba(6,8,16,.7)',
      backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:14,padding:24,width:480,maxWidth:'100%',
        boxShadow:'0 30px 80px rgba(0,0,0,.5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3}}>Add expense</div>
            <div style={{fontSize:12,color:T.tx3,marginTop:2}}>Cash out · today</div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${T.bd}`,
            borderRadius:8,width:32,height:32,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="x" s={14}/>
          </button>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Amount (₹)</div>
            <input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" autoFocus
              style={{width:'100%',background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,
                padding:'12px 14px',color:T.tx,fontFamily:T.sora,fontSize:24,fontWeight:700,
                letterSpacing:-.5,outline:'none'}}/>
          </div>

          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Category</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {CB_CATEGORIES.map(c=>(
                <button key={c} onClick={()=>setCategory(c)} style={{
                  padding:'7px 12px',borderRadius:6,fontSize:12,fontFamily:T.font,fontWeight:500,
                  border:`1px solid ${category===c?T.ac:T.bd}`,
                  background:category===c?T.ac3:'transparent',
                  color:category===c?T.ac2:T.tx2,cursor:'pointer'}}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Description</div>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="DTDC pickup / chai / printer toner…"
              style={{width:'100%',background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,
                padding:'10px 12px',color:T.tx,fontFamily:T.font,fontSize:13,outline:'none'}}/>
          </div>

          {err && <div style={{fontSize:12,color:T.re,padding:'8px 10px',
            background:'rgba(248,113,113,.06)',border:`1px solid rgba(248,113,113,.18)`,borderRadius:7}}>{err}</div>}

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:6}}>
            <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" icon="plus" onClick={submit}>Add expense</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function HandoverModal({open,onClose,onSave,available}){
  const [amount,setAmount] = csUseState(String(Math.max(0,available)));
  const [recipient,setRecipient] = csUseState('Anand');
  const [notes,setNotes] = csUseState('');
  const [reason,setReason] = csUseState('');

  React.useEffect(()=>{ if(open) setAmount(String(Math.max(0,available))); },[open,available]);

  if(!open) return null;
  const amt = Number(amount)||0;
  const differs = Math.abs(amt-available)>0.01;

  const submit = ()=>{
    if(!amt || amt<=0) return;
    if(differs && !reason.trim()) return;
    onSave({amount:amt,to:recipient,notes,reason:differs?reason:null});
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,background:'rgba(6,8,16,.7)',
      backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.s,border:`1px solid ${T.bd2}`,
        borderRadius:14,padding:24,width:560,maxWidth:'100%'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <div style={{fontFamily:T.sora,fontSize:18,fontWeight:700,color:T.tx,letterSpacing:-.3}}>Hand over cash</div>
            <div style={{fontSize:12,color:T.tx3,marginTop:2}}>Cash out from till</div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${T.bd}`,
            borderRadius:8,width:32,height:32,color:T.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon n="x" s={14}/>
          </button>
        </div>

        {/* Breakdown */}
        <div style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:10,padding:14,marginBottom:16}}>
          <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600,marginBottom:8}}>Available cash · today</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',rowGap:6,fontFamily:T.mono,fontSize:12}}>
            <div style={{color:T.tx3}}>Opening</div><div style={{color:T.tx2,textAlign:'right'}}>{inr(2000)}</div>
            <div style={{color:T.tx3}}>+ Cash sales</div><div style={{color:T.gr,textAlign:'right'}}>+{inr(15400)}</div>
            <div style={{color:T.tx3}}>− Returns</div><div style={{color:T.re,textAlign:'right'}}>−{inr(800)}</div>
            <div style={{color:T.tx3}}>− Expenses</div><div style={{color:T.re,textAlign:'right'}}>−{inr(1950)}</div>
            <div style={{gridColumn:'1/3',height:1,background:T.bd,margin:'4px 0'}}/>
            <div style={{color:T.tx,fontWeight:600}}>Available</div>
            <div style={{color:T.gr,fontWeight:700,textAlign:'right'}}>{inr(available)}</div>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Amount (₹)</div>
            <input value={amount} onChange={e=>setAmount(e.target.value)}
              style={{width:'100%',background:T.s2,border:`1px solid ${differs?T.yl:T.bd}`,borderRadius:8,
                padding:'12px 14px',color:T.tx,fontFamily:T.sora,fontSize:24,fontWeight:700,
                letterSpacing:-.5,outline:'none'}}/>
            {differs && <div style={{fontSize:11,color:T.yl,marginTop:6}}>
              Differs from available by {inr(Math.abs(amt-available))} — reason required.
            </div>}
          </div>

          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Hand over to</div>
            <div style={{display:'flex',gap:6}}>
              {['Anand','Priya','Owner'].map(r=>(
                <button key={r} onClick={()=>setRecipient(r)} style={{
                  flex:1,padding:'10px',borderRadius:8,fontSize:12,fontFamily:T.font,fontWeight:500,
                  border:`1px solid ${recipient===r?T.ac:T.bd}`,
                  background:recipient===r?T.ac3:'transparent',
                  color:recipient===r?T.ac2:T.tx2,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <Icon n="user" s={12}/>{r}
                </button>
              ))}
            </div>
          </div>

          {differs && (
            <div>
              <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Reason for difference</div>
              <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is the amount different?"
                style={{width:'100%',background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,
                  padding:'10px 12px',color:T.tx,fontFamily:T.font,fontSize:13,outline:'none'}}/>
            </div>
          )}

          <div>
            <div style={{fontSize:11,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600,marginBottom:6}}>Notes (optional)</div>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any additional context…"
              style={{width:'100%',background:T.s2,border:`1px solid ${T.bd}`,borderRadius:8,
                padding:'10px 12px',color:T.tx,fontFamily:T.font,fontSize:13,outline:'none'}}/>
          </div>

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:6}}>
            <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" icon="check" onClick={submit}>Confirm handover</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashBookScene({onToast}){
  const [tab,setTab] = csUseState('expenses');
  const [showAdd,setShowAdd] = csUseState(false);
  const [showHandover,setShowHandover] = csUseState(false);
  const [opening,setOpening] = csUseState(2000);
  const [editingOpen,setEditingOpen] = csUseState(false);
  const [openingInput,setOpeningInput] = csUseState('2000');
  const [expenses,setExpenses] = csUseState(SAMPLE.expenses.map((e,i)=>({...e,id:e.id||'e'+i})));
  const [sales] = csUseState([
    {no:'CH-2024-0846',party:'Sharma Emporium',amount:8250,time:'9:42 AM',mode:'Cash'},
    {no:'CH-2024-0844',party:'City Wholesale',amount:4500,time:'11:20 AM',mode:'Cash'},
    {no:'CH-2024-0848',party:'Walk-in',amount:2650,time:'2:14 PM',mode:'Cash'},
  ]);
  const [handovers] = csUseState([
    {date:'2 Dec',from:'Arya',to:'Anand',amount:8400,status:'pending',notes:'EOD'},
    {date:'1 Dec',from:'Arya',to:'Owner',amount:14200,status:'confirmed',notes:''},
    {date:'30 Nov',from:'Anand',to:'Owner',amount:9600,status:'confirmed',notes:''},
  ]);

  const cashIn = sales.reduce((s,r)=>s+r.amount,0);
  const cashOut = expenses.reduce((s,e)=>s+e.amount,0);
  const closing = opening + cashIn - cashOut;

  const addExpense = (data)=>{
    const time = new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true});
    setExpenses(p=>[{id:'e'+Date.now(),time,...data},...p]);
    setShowAdd(false);
    onToast('Expense added',`−${inr(data.amount)} · ${data.cat}`);
  };
  const delExpense = (id)=>{
    const e = expenses.find(x=>x.id===id);
    setExpenses(p=>p.filter(x=>x.id!==id));
    onToast('Expense deleted',e?.name);
  };
  const handover = (data)=>{
    setShowHandover(false);
    onToast('Handover sent',`${inr(data.amount)} → ${data.to}`);
  };

  return (
    <div style={{padding:'28px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
        <div>
          <div style={{fontFamily:T.sora,fontSize:24,fontWeight:700,color:T.tx,letterSpacing:-.5}}>CashBook</div>
          <div style={{fontSize:12,color:T.tx3,marginTop:3}}>Wed, 4 Dec 2024 · single till · all amounts in ₹</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn kind="ghost" icon="chart">Export CSV</Btn>
          <Btn kind="ghost" icon="cash" onClick={()=>setShowHandover(true)}>Hand over</Btn>
          <Btn kind="primary" icon="plus" onClick={()=>setShowAdd(true)}>Add expense</Btn>
        </div>
      </div>

      {/* Summary stat strip */}
      <div style={{display:'flex',gap:12,marginBottom:8}}>
        <div style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:11,padding:'14px 16px',
          flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:4}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.6,fontWeight:600}}>Opening balance</div>
            {!editingOpen && <button onClick={()=>setEditingOpen(true)} style={{background:'transparent',
              border:'none',color:T.tx3,cursor:'pointer',padding:2}}><Icon n="edit" s={12}/></button>}
          </div>
          {editingOpen ? (
            <div style={{display:'flex',gap:6,marginTop:2}}>
              <input value={openingInput} onChange={e=>setOpeningInput(e.target.value)} autoFocus
                style={{flex:1,background:T.s,border:`1px solid ${T.ac}`,borderRadius:7,
                  padding:'6px 10px',color:T.tx,fontFamily:T.sora,fontSize:18,fontWeight:700,outline:'none'}}/>
              <button onClick={()=>{setOpening(Number(openingInput)||0);setEditingOpen(false);onToast('Opening balance updated');}}
                style={{background:T.ac,border:'none',borderRadius:7,padding:'0 10px',color:'#fff',cursor:'pointer'}}>
                <Icon n="check" s={13}/>
              </button>
            </div>
          ):(
            <div style={{fontFamily:T.sora,fontSize:22,fontWeight:700,color:T.tx,letterSpacing:-.4,lineHeight:1.1}}>{inr(opening)}</div>
          )}
        </div>
        <StatTile label="Cash in" value={'+'+inr(cashIn)} tone="gr" icon="up" sub={`${sales.length} sales`}/>
        <StatTile label="Cash out" value={'−'+inr(cashOut)} tone="re" icon="down" sub={`${expenses.length} expenses`}/>
        <StatTile label="Closing balance" value={inr(closing)} tone="ac" icon="cash" sub="As of now"/>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,borderBottom:`1px solid ${T.bd}`,marginTop:20,marginBottom:0}}>
        {[
          ['expenses','Expenses',expenses.length],
          ['sales','Cash sales',sales.length],
          ['handovers','Handovers',handovers.length],
        ].map(([k,l,n])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            background:'transparent',border:'none',padding:'10px 14px',cursor:'pointer',
            fontFamily:T.font,fontSize:13,fontWeight:500,
            color:tab===k?T.tx:T.tx3,
            borderBottom:`2px solid ${tab===k?T.ac:'transparent'}`,
            marginBottom:-1,display:'flex',alignItems:'center',gap:8}}>
            {l}
            <span style={{fontFamily:T.mono,fontSize:10,color:T.tx3,
              padding:'1px 6px',background:T.s2,borderRadius:4,border:`1px solid ${T.bd}`}}>{n}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Card pad={0} style={{borderTopLeftRadius:0,borderTopRightRadius:0,borderTop:'none'}}>
        {tab==='expenses' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'90px 1fr 130px 90px 80px 40px',gap:14,
              padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
              fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
              <div>Time</div><div>Description</div><div>Category</div>
              <div style={{textAlign:'right'}}>Amount</div><div style={{textAlign:'right'}}>Mode</div><div/>
            </div>
            {expenses.length===0 ? (
              <div style={{padding:'40px 20px',textAlign:'center',color:T.tx3,fontSize:13}}>
                No expenses today. <button onClick={()=>setShowAdd(true)} style={{background:'transparent',border:'none',color:T.ac2,cursor:'pointer',textDecoration:'underline'}}>Add the first one</button>.
              </div>
            ) : expenses.map(e=><CBExpenseRow key={e.id} e={e} onDelete={delExpense}/>)}
            <div style={{display:'grid',gridTemplateColumns:'90px 1fr 130px 90px 80px 40px',gap:14,
              padding:'12px 14px',background:T.glass1,
              fontFamily:T.mono,fontSize:12,color:T.tx2}}>
              <div/><div style={{fontWeight:600,color:T.tx}}>Total</div><div/>
              <div style={{textAlign:'right',color:T.re,fontWeight:700}}>−{inr(cashOut)}</div>
              <div/><div/>
            </div>
          </div>
        )}
        {tab==='sales' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'90px 140px 1fr 100px 90px',gap:14,
              padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
              fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
              <div>Time</div><div>Challan</div><div>Party</div>
              <div>Mode</div><div style={{textAlign:'right'}}>Amount</div>
            </div>
            {sales.map(s=>(
              <div key={s.no} style={{display:'grid',gridTemplateColumns:'90px 140px 1fr 100px 90px',gap:14,
                padding:'12px 14px',borderBottom:`1px solid ${T.bd}`,alignItems:'center'}}>
                <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{s.time}</div>
                <div style={{fontFamily:T.mono,fontSize:12,color:T.ac2}}>{s.no}</div>
                <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{s.party}</div>
                <div><Pill tone="gr" dot>Cash</Pill></div>
                <div style={{fontFamily:T.mono,fontSize:13,color:T.gr,textAlign:'right',fontWeight:600}}>+{inr(s.amount)}</div>
              </div>
            ))}
            <div style={{display:'grid',gridTemplateColumns:'90px 140px 1fr 100px 90px',gap:14,
              padding:'12px 14px',background:T.glass1,fontFamily:T.mono,fontSize:12}}>
              <div/><div/><div style={{color:T.tx,fontWeight:600}}>Total</div><div/>
              <div style={{textAlign:'right',color:T.gr,fontWeight:700}}>+{inr(cashIn)}</div>
            </div>
          </div>
        )}
        {tab==='handovers' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'90px 1fr 1fr 130px 110px 100px',gap:14,
              padding:'10px 14px',borderBottom:`1px solid ${T.bd}`,
              fontSize:10,color:T.tx3,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>
              <div>Date</div><div>From</div><div>To</div>
              <div style={{textAlign:'right'}}>Amount</div><div>Status</div><div>Notes</div>
            </div>
            {handovers.map((h,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'90px 1fr 1fr 130px 110px 100px',gap:14,
                padding:'12px 14px',borderBottom:`1px solid ${T.bd}`,alignItems:'center'}}>
                <div style={{fontFamily:T.mono,fontSize:11,color:T.tx3}}>{h.date}</div>
                <div style={{fontSize:13,color:T.tx2,display:'flex',alignItems:'center',gap:6}}><Icon n="user" s={12}/>{h.from}</div>
                <div style={{fontSize:13,color:T.tx,fontWeight:500,display:'flex',alignItems:'center',gap:6}}><Icon n="arrow" s={12}/>{h.to}</div>
                <div style={{fontFamily:T.mono,fontSize:13,color:T.tx,textAlign:'right',fontWeight:600}}>{inr(h.amount)}</div>
                <div><Pill tone={h.status==='confirmed'?'gr':'yl'} dot>{h.status}</Pill></div>
                <div style={{fontSize:11,color:T.tx3}}>{h.notes||'—'}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddExpenseModal open={showAdd} onClose={()=>setShowAdd(false)} onSave={addExpense}/>
      <HandoverModal open={showHandover} onClose={()=>setShowHandover(false)} onSave={handover} available={closing}/>
    </div>
  );
}

window.CashBookScene = CashBookScene;
