// Universal undo toast system + inline change history
function UndoToasts({toasts,onUndo,onDismiss}){
  return (
    <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:900,
      display:'flex',flexDirection:'column',gap:10,alignItems:'center'}}>
      <style>{`@keyframes tslide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}`}</style>
      {toasts.map(t=>(
        <div key={t.id} style={{
          display:'flex',alignItems:'center',gap:14,padding:'12px 16px 12px 14px',
          background:T.s,border:`1px solid ${T.bd2}`,borderRadius:10,
          boxShadow:'0 20px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.02)',
          fontFamily:T.font,minWidth:320,animation:'tslide .2s ease-out',
          position:'relative',overflow:'hidden',
        }}>
          {/* progress bar */}
          <div style={{position:'absolute',bottom:0,left:0,height:2,background:t.undoable?T.ac:T.gr,
            width:`${t.progress}%`,transition:'width .1s linear'}}/>
          <div style={{width:32,height:32,borderRadius:8,
            background:t.undoable?'rgba(248,113,113,.08)':'rgba(52,211,153,.08)',
            border:`1px solid ${t.undoable?'rgba(248,113,113,.2)':'rgba(52,211,153,.2)'}`,
            color:t.undoable?T.re:T.gr,
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon n={t.undoable?'trash':'check'} s={15}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:T.tx,fontWeight:500}}>{t.title}</div>
            {t.sub && <div style={{fontSize:11,color:T.tx3,marginTop:1}}>{t.sub}</div>}
          </div>
          {t.undoable && (
            <Btn kind="ghost" icon="undo" onClick={()=>onUndo(t.id)} style={{height:30,padding:'0 12px'}}>
              Undo <span style={{fontFamily:T.mono,fontSize:10,opacity:.5,marginLeft:4}}>Z</span>
            </Btn>
          )}
          <button onClick={()=>onDismiss(t.id)} style={{background:'transparent',border:'none',
            color:T.tx3,cursor:'pointer',padding:4,display:'flex'}}>
            <Icon n="x" s={14}/>
          </button>
        </div>
      ))}
    </div>
  );
}

function ChangeHistory({open,row,onClose}){
  if(!open||!row) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(3,5,10,.6)',
      backdropFilter:'blur(6px)',zIndex:800,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:460,background:T.s,
        border:`1px solid ${T.bd2}`,borderRadius:12,overflow:'hidden',
        boxShadow:'0 40px 80px rgba(0,0,0,.5)'}}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.bd}`,
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:T.sora,fontSize:14,fontWeight:600,color:T.tx}}>Change history</div>
            <div style={{fontSize:11,color:T.tx3,marginTop:2,fontFamily:T.mono}}>{row.sku}</div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:T.tx3,cursor:'pointer'}}>
            <Icon n="x" s={16}/>
          </button>
        </div>
        <div style={{padding:'8px 0',maxHeight:320,overflowY:'auto'}}>
          {row.history.map((h,i)=>(
            <div key={i} style={{padding:'12px 20px',display:'flex',gap:12,
              borderBottom:i<row.history.length-1?`1px solid ${T.bd}`:'none'}}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                <div style={{width:8,height:8,borderRadius:4,background:i===0?T.ac:T.tx3,
                  boxShadow:i===0?`0 0 8px ${T.ac}`:'none'}}/>
                {i<row.history.length-1 && <div style={{width:1,flex:1,background:T.bd,marginTop:4}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:T.tx,fontWeight:500}}>
                  {h.action}
                  {h.from && <span> · <span style={{color:T.tx3,textDecoration:'line-through'}}>{h.from}</span> → <span style={{color:T.gr}}>{h.to}</span></span>}
                </div>
                <div style={{fontSize:11,color:T.tx3,marginTop:3}}>
                  {h.by} · {h.when}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:'12px 20px',borderTop:`1px solid ${T.bd}`,background:T.glass1,
          fontSize:11,color:T.tx3,textAlign:'center'}}>
          Showing last {row.history.length} changes
        </div>
      </div>
    </div>
  );
}

window.UndoToasts = UndoToasts;
window.ChangeHistory = ChangeHistory;
