// DailyOffice prototype — shared UI primitives, tokens, sample data
const T = {
  bg:'#060810', s:'#0B0F19', s2:'#0F1420', s3:'#141B2B',
  glass1:'rgba(255,255,255,0.02)', glass2:'rgba(255,255,255,0.04)',
  bd:'rgba(255,255,255,0.06)', bd2:'rgba(255,255,255,0.10)',
  tx:'#E8EEF7', tx2:'#9AA8C2', tx3:'#6B7890',
  ac:'#6366F1', ac2:'#818CF8', ac3:'rgba(99,102,241,.12)',
  gr:'#34D399', yl:'#FBBF24', re:'#F87171', bl:'#38BDF8',
  font:"'Inter',system-ui,-apple-system,sans-serif",
  sora:"'Sora',system-ui,sans-serif",
  mono:"'JetBrains Mono',ui-monospace,monospace",
};

// ── Icon set (stroke-based, 1.7 weight) ────────────────────
const Icon = ({n,s=16,c='currentColor'}) => {
  const p = {width:s,height:s,viewBox:'0 0 24 24',fill:'none',stroke:c,strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round'};
  const I = {
    search:<svg {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>,
    cmd:<svg {...p}><path d="M18 6a3 3 0 10-3 3h6M6 18a3 3 0 103-3V9M9 9h6v6"/></svg>,
    plus:<svg {...p}><path d="M12 5v14M5 12h14"/></svg>,
    scan:<svg {...p}><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M7 12h10"/></svg>,
    cash:<svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>,
    truck:<svg {...p}><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>,
    alert:<svg {...p}><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>,
    check:<svg {...p}><path d="M20 6L9 17l-5-5"/></svg>,
    x:<svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>,
    undo:<svg {...p}><path d="M3 7v6h6M3 13a9 9 0 1014 6"/></svg>,
    clock:<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
    trash:<svg {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"/></svg>,
    box:<svg {...p}><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>,
    arrow:<svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
    up:<svg {...p}><path d="M7 17L17 7M8 7h9v9"/></svg>,
    down:<svg {...p}><path d="M17 7L7 17M16 17H7V8"/></svg>,
    dot:<svg {...p}><circle cx="12" cy="12" r="4" fill={c}/></svg>,
    edit:<svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2 2 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    user:<svg {...p}><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>,
    bell:<svg {...p}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>,
    menu:<svg {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>,
    grid:<svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    tag:<svg {...p}><path d="M20 12l-8 8-9-9V3h8l9 9z"/><circle cx="7" cy="7" r="1.5" fill={c}/></svg>,
    book:<svg {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V2H6.5A2.5 2.5 0 004 4.5v15zM20 22H6.5A2.5 2.5 0 014 19.5"/></svg>,
    settings:<svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>,
    chart:<svg {...p}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>,
    chev:<svg {...p}><path d="M9 18l6-6-6-6"/></svg>,
    rotate:<svg {...p}><path d="M12 4v4M12 16v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>,
    globe:<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>,
    mic:<svg {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/></svg>,
    qr:<svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M20 14v3M14 20h3M20 20v.01"/></svg>,
    play:<svg {...p}><path d="M6 4l14 8-14 8V4z" fill={c}/></svg>,
    image:<svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>,
    'arrow-left':<svg {...p}><path d="M19 12H5M11 18l-6-6 6-6"/></svg>,
    eye:<svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    link:<svg {...p}><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>,
    file:<svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>,
  };
  return I[n] || null;
};

// ── Buttons + inputs ──────────────────────────────────────
const Btn = ({kind='ghost',icon,children,onClick,style={},kbd}) => {
  const base = {display:'inline-flex',alignItems:'center',gap:8,height:34,padding:'0 14px',
    borderRadius:8,fontFamily:T.font,fontSize:13,fontWeight:500,cursor:'pointer',
    border:'1px solid transparent',transition:'all .15s',letterSpacing:-.1,whiteSpace:'nowrap'};
  const styles = {
    primary:{background:T.ac,color:'#fff',boxShadow:'0 1px 0 rgba(255,255,255,.1) inset, 0 4px 12px rgba(99,102,241,.25)'},
    ghost:{background:T.glass1,color:T.tx,border:`1px solid ${T.bd}`},
    danger:{background:'rgba(248,113,113,.08)',color:T.re,border:`1px solid rgba(248,113,113,.2)`},
    success:{background:'rgba(52,211,153,.08)',color:T.gr,border:`1px solid rgba(52,211,153,.2)`},
  };
  return (
    <button onClick={onClick} style={{...base,...styles[kind],...style}}
      onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.15)'}
      onMouseLeave={e=>e.currentTarget.style.filter='none'}>
      {icon && <Icon n={icon} s={14}/>}
      {children}
      {kbd && <span style={{fontFamily:T.mono,fontSize:10,opacity:.6,marginLeft:4,padding:'2px 5px',border:`1px solid ${T.bd2}`,borderRadius:4}}>{kbd}</span>}
    </button>
  );
};

const Pill = ({tone='neutral',children,dot}) => {
  const tones = {
    neutral:{bg:'rgba(255,255,255,.04)',fg:T.tx2,bd:T.bd},
    gr:{bg:'rgba(52,211,153,.1)',fg:T.gr,bd:'rgba(52,211,153,.2)'},
    yl:{bg:'rgba(251,191,36,.1)',fg:T.yl,bd:'rgba(251,191,36,.2)'},
    re:{bg:'rgba(248,113,113,.1)',fg:T.re,bd:'rgba(248,113,113,.2)'},
    bl:{bg:'rgba(56,189,248,.1)',fg:T.bl,bd:'rgba(56,189,248,.2)'},
    ac:{bg:'rgba(99,102,241,.12)',fg:T.ac2,bd:'rgba(99,102,241,.25)'},
  };
  const t = tones[tone];
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',
    borderRadius:6,background:t.bg,color:t.fg,border:`1px solid ${t.bd}`,
    fontSize:11,fontWeight:500,fontFamily:T.font,letterSpacing:.1}}>
    {dot && <span style={{width:6,height:6,borderRadius:3,background:t.fg}}/>}
    {children}
  </span>;
};

const Card = ({children,style={},pad=20}) => (
  <div style={{background:T.s2,border:`1px solid ${T.bd}`,borderRadius:12,padding:pad,
    boxShadow:'0 1px 0 rgba(255,255,255,.02) inset',...style}}>{children}</div>
);

// ── Sample data (Indian retail) ────────────────────────────
const SAMPLE = {
  skus:[
    {sku:'MYN-FLEX-42-BLK',brand:'Myntra',product:'Flex Pro Sneaker',size:'42',color:'Black',mrp:2499,ean:'8901234567890',jio:'JIO-4421'},
    {sku:'FLK-COT-L-WHT',brand:'Flipkart',product:'Cotton Tee Classic',size:'L',color:'White',mrp:499,ean:'8901234567891',jio:'JIO-4422'},
    {sku:'MYN-DEN-32-IND',brand:'Myntra',product:'Slim Denim',size:'32',color:'Indigo',mrp:1799,ean:'8901234567892',jio:'JIO-4423'},
    {sku:'AJI-KUR-M-MRN',brand:'Ajio',product:'Kurta Regular',size:'M',color:'Maroon',mrp:1299,ean:'8901234567893',jio:'JIO-4424'},
    {sku:'MYN-SAR-FRE-RED',brand:'Myntra',product:'Silk Saree',size:'Free',color:'Red',mrp:4999,ean:'8901234567894',jio:'JIO-4425'},
    {sku:'FLK-SHO-9-BRN',brand:'Flipkart',product:'Leather Loafer',size:'9',color:'Brown',mrp:2199,ean:'8901234567895',jio:'JIO-4426'},
  ],
  challans:[
    {no:'CH-2024-0847',party:'Rao Textiles',amount:12400,date:'28 Nov',status:'overdue',days:4},
    {no:'CH-2024-0846',party:'Sharma Emporium',amount:8250,date:'29 Nov',status:'paid',days:0},
    {no:'CH-2024-0845',party:'Lakshmi Sarees',amount:6800,date:'30 Nov',status:'overdue',days:2},
    {no:'CH-2024-0844',party:'City Wholesale',amount:24500,date:'1 Dec',status:'paid',days:0},
    {no:'CH-2024-0843',party:'Megha Collections',amount:3200,date:'2 Dec',status:'pending',days:0},
    {no:'CH-2024-0842',party:'Rao Textiles',amount:5400,date:'3 Dec',status:'paid',days:0},
  ],
  expenses:[
    {id:'e1',name:'DTDC pickup charges',amount:450,cat:'Shipping',time:'10:24 AM'},
    {id:'e2',name:'Chai & samosa',amount:180,cat:'Staff',time:'11:45 AM'},
    {id:'e3',name:'Printer toner refill',amount:1200,cat:'Supplies',time:'1:12 PM'},
    {id:'e4',name:'Auto fare — bank',amount:120,cat:'Travel',time:'3:40 PM'},
  ],
  customers:[
    {name:'Rao Textiles',out:17800,last:'2 days ago'},
    {name:'Sharma Emporium',out:8250,last:'Today'},
    {name:'Lakshmi Sarees',out:6800,last:'Yesterday'},
    {name:'City Wholesale',out:0,last:'Today'},
  ],
};

Object.assign(window,{T,Icon,Btn,Pill,Card,SAMPLE});
