import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, getDocs,
  collection, onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN_EMAIL = "aakrutijain08@gmail.com";
const firebaseConfig = {
  apiKey: "AIzaSyDHR2rYRY9aWssll1FTwZ5SvNdd8Zp6kUM",
  authDomain: "sweatsquad-3190c.firebaseapp.com",
  projectId: "sweatsquad-3190c",
  storageBucket: "sweatsquad-3190c.firebasestorage.app",
  messagingSenderId: "814441946921",
  appId: "1:814441946921:web:a5c28f2a8907894491a138"
};
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

const challengesCol   = ()=> collection(db,"challenges");
const participantsCol = (cid)=> collection(db,"challenges",cid,"participants");
const checkinsCol     = (cid,uid)=> collection(db,"challenges",cid,"checkins",uid,"days");
const dietDayRef      = (uid,date)=> doc(db,"diet_checkins",uid,"days",date);
const dietStatsRef    = (uid)=> doc(db,"diet_stats",uid);

const TODAY   = new Date().toISOString().slice(0,10);
const COLORS  = ["#6C63FF","#FF6584","#43D9AD","#FFB347","#5BC8F5","#f472b6","#34d399","#fb923c"];
const TYPE_ICONS = {"Running":"🏃","Gym / Workout":"🏋","Steps":"👟","Cycling":"🚴","Yoga":"🧘","Custom":"⚡"};
const DEFAULT_DIET_RULES = [
  {id:"protein",  label:"Protein target met",        icon:"🥩",points:1},
  {id:"calories", label:"Stayed within calorie goal", icon:"⚖️",points:1},
  {id:"nojunk",   label:"No junk food",               icon:"🚫",points:1},
  {id:"veggies",  label:"Ate fruits / vegetables",    icon:"🥦",points:1},
  {id:"nosugar",  label:"No sugary drinks",           icon:"🧃",points:1},
];
const DIET_STREAK_BONUSES    = {3:2,7:5,14:10,21:15,30:25};
const FITNESS_STREAK_BONUSES = {5:3,7:5,10:8,14:12,20:18,25:22,30:30};
const WEEKLY_CHEAT_TOKENS    = 2;
const WEEKLY_FITNESS_PASSES  = 2;

const FITNESS_BADGES = [
  {id:"streak_5",  icon:"🔥",name:"On Fire",         check:s=>s.streak>=5,  progress:s=>({cur:Math.min(s.streak,5), max:5})},
  {id:"streak_7",  icon:"⚡",name:"Week Warrior",    check:s=>s.streak>=7,  progress:s=>({cur:Math.min(s.streak,7), max:7})},
  {id:"streak_10", icon:"💥",name:"Unstoppable",     check:s=>s.streak>=10, progress:s=>({cur:Math.min(s.streak,10),max:10})},
  {id:"streak_14", icon:"🏅",name:"Two Week Beast",  check:s=>s.streak>=14, progress:s=>({cur:Math.min(s.streak,14),max:14})},
  {id:"streak_20", icon:"👑",name:"Consistency King",check:s=>s.streak>=20, progress:s=>({cur:Math.min(s.streak,20),max:20})},
  {id:"streak_25", icon:"💎",name:"Diamond Streak",  check:s=>s.streak>=25, progress:s=>({cur:Math.min(s.streak,25),max:25})},
  {id:"streak_30", icon:"🌟",name:"Legend",          check:s=>s.streak>=30, progress:s=>({cur:Math.min(s.streak,30),max:30})},
  {id:"no_zero",   icon:"💪",name:"No Zero Days",    check:(s,c)=>s.completedDays>=c, progress:(s,c)=>({cur:s.completedDays,max:c})},
  {id:"distance",  icon:"🏃",name:"Distance Beast",  check:s=>(s.totalKm||0)>=50, progress:s=>({cur:Math.min(s.totalKm||0,50),max:50})},
  {id:"early",     icon:"🌅",name:"Early Bird",      check:s=>s.earlyBird||false, progress:s=>({cur:s.earlyBird?1:0,max:1})},
];
const DIET_BADGES = [
  {id:"clean_5",      icon:"🥗",name:"Clean Eater",   desc:"Score 5/5 for 5 days in a row",   check:ds=>ds.perfectStreak>=5},
  {id:"diet_10",      icon:"🎯",name:"Diet Warrior",  desc:"Diet streak for 10 days",          check:ds=>ds.dietStreak>=10},
  {id:"no_zero_diet", icon:"💚",name:"No Zero Diet",  desc:"Log diet every day for 7 days",    check:ds=>ds.logStreak>=7},
  {id:"comeback",     icon:"🔄",name:"Comeback Mode", desc:"Resume after a missed day",        check:ds=>ds.comebacks>=1},
  {id:"cheat_wise",   icon:"🎭",name:"Cheat Wisely",  desc:"Use all cheat tokens in a week",   check:ds=>(ds.tokensUsed||0)>=2},
];

const randColor   = ()=> COLORS[Math.floor(Math.random()*COLORS.length)];
const mkInitials  = n=> n.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
const daysBetween = (a,b)=> Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
const daysLeft    = c=> Math.max(0,daysBetween(TODAY,c.endDate));
const totalDays   = c=> daysBetween(c.startDate,c.endDate)+1;
const pct         = (v,t)=> t?Math.min(100,Math.round(v/t*100)):0;
const isUpcoming  = c=> c.startDate > TODAY;
const isActive    = c=> c.startDate <= TODAY && c.endDate >= TODAY;
const getWeekStart= ()=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().slice(0,10); };

function calcFitnessPoints(rules,form,currentStreak,usePass=false){
  if(usePass) return 0; // pass days earn no points but don't break streak
  if(!form.completed) return 0;
  let pts=0;
  (rules||[]).forEach(r=>{
    if(r.condition==="completed")         pts+=+r.points;
    if(r.condition==="duration_gt_45"  && +form.duration>45)   pts+=+r.points;
    if(r.condition==="steps_gte_5000"  && +form.steps>=5000)   pts+=+r.points;
    if(r.condition==="steps_gte_10000" && +form.steps>=10000)  pts+=+r.points;
    if(r.condition==="steps_gte_15000" && +form.steps>=15000)  pts+=+r.points;
    if(r.condition==="distance_gt_3"   && +form.distance>3)    pts+=+r.points;
    if(r.condition==="distance_gt_7"   && +form.distance>7)    pts+=+r.points;
  });
  const ns=currentStreak+1;
  if(FITNESS_STREAK_BONUSES[ns]) pts+=FITNESS_STREAK_BONUSES[ns];
  return pts;
}
function calcDietScore(rules,checks){ return (rules||DEFAULT_DIET_RULES).reduce((s,r)=>s+(checks[r.id]?r.points:0),0); }
function maxDietScore(rules){ return (rules||DEFAULT_DIET_RULES).reduce((s,r)=>s+r.points,0); }

const css={
  app:    {minHeight:"100vh",background:"#0d0d14",color:"#e8e8f0",fontFamily:"system-ui,sans-serif",fontSize:14},
  nav:    {position:"fixed",top:0,left:0,right:0,zIndex:50,height:52,background:"rgba(13,13,20,.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1e1e2e",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px"},
  logo:   {fontWeight:800,fontSize:17,color:"#8b7cf8"},
  tabBar: {position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"rgba(13,13,20,.97)",borderTop:"1px solid #1e1e2e",display:"flex"},
  tab:    on=>({flex:1,background:"none",border:"none",padding:"6px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer",color:on?"#8b7cf8":"#555",fontWeight:on?700:400,fontSize:10}),
  scroll: {position:"fixed",top:52,bottom:56,left:0,right:0,overflowY:"auto",WebkitOverflowScrolling:"touch"},
  inner:  {maxWidth:480,margin:"0 auto",padding:"12px 14px 24px"},
  card:   {background:"#13131f",border:"1px solid #1e1e2e",borderRadius:14,padding:14,marginBottom:10},
  chip:   (c="#8b7cf8")=>({display:"inline-flex",alignItems:"center",background:c+"22",color:c,padding:"2px 9px",borderRadius:999,fontSize:11,fontWeight:600}),
  btn:    (v="primary",sm=false)=>({
    display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
    padding:sm?"6px 13px":"11px 18px",borderRadius:10,fontSize:sm?12:14,
    fontWeight:600,cursor:"pointer",border:"none",userSelect:"none",
    ...(v==="primary"?{background:"linear-gradient(135deg,#8b7cf8,#6c63ff)",color:"#fff"}
      :v==="green"   ?{background:"linear-gradient(135deg,#43d9ad,#22b88a)",color:"#fff"}
      :v==="orange"  ?{background:"linear-gradient(135deg,#ffb347,#f08030)",color:"#fff"}
      :v==="ghost"   ?{background:"transparent",color:"#8b7cf8",border:"1px solid #8b7cf8"}
      :               {background:"#1a1a2e",color:"#ccc",border:"1px solid #2a2a42"})
  }),
  input:  {width:"100%",background:"#1a1a2e",border:"1px solid #2a2a42",borderRadius:10,padding:"10px 13px",color:"#e8e8f0",fontSize:14,outline:"none",boxSizing:"border-box"},
  label:  {fontSize:12,fontWeight:600,color:"#888",marginBottom:5,display:"block",marginTop:12},
  bar:    {height:5,borderRadius:999,background:"#1e1e2e",overflow:"hidden"},
  barFill:(p,c="#8b7cf8")=>({height:"100%",borderRadius:999,width:p+"%",background:`linear-gradient(90deg,${c},${c}99)`,transition:"width .6s"}),
  avatar: (c,s=36)=>({width:s,height:s,borderRadius:"50%",background:c+"33",color:c,border:`2px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:Math.max(9,s*.35),flexShrink:0}),
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:56},
  sheet:  {background:"#13131f",borderRadius:"18px 18px 0 0",border:"1px solid #2a2a42",padding:22,paddingBottom:80,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",overflowX:"hidden"},
  toggle: on=>({width:44,height:24,borderRadius:999,cursor:"pointer",border:"none",background:on?"#43d9ad":"#2a2a42",position:"relative",transition:"background .2s",flexShrink:0}),
};

function Confetti({active}){
  const [show,setShow]=useState(false);
  useEffect(()=>{if(active){setShow(true);const t=setTimeout(()=>setShow(false),2800);return()=>clearTimeout(t);}},[active]);
  if(!show) return null;
  const items=Array.from({length:35},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*.6,col:["#8b7cf8","#ff6584","#43d9ad","#ffb347","#5bc8f5"][i%5],sz:4+Math.random()*7}));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999,overflow:"hidden"}}>
      <style>{`@keyframes cf{to{transform:translateY(105vh) rotate(900deg);opacity:0}}`}</style>
      {items.map(p=><div key={p.id} style={{position:"absolute",left:p.left+"%",top:-12,width:p.sz,height:p.sz,borderRadius:"50%",background:p.col,animation:`cf 2.4s ${p.delay}s ease-in forwards`}}/>)}
    </div>
  );
}

function Toggle({on,onChange}){
  return(
    <button style={css.toggle(on)} onClick={()=>onChange(!on)}>
      <div style={{position:"absolute",top:2,left:on?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
    </button>
  );
}

function LoginScreen(){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function handleGoogle(){
    setBusy(true); setError("");
    try{ await signInWithPopup(auth,new GoogleAuthProvider()); }
    catch(e){ setError("Sign-in failed. Please try again."); console.error(e); setBusy(false); }
  }
  return(
    <div style={{minHeight:"100vh",background:"#0d0d14",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:360,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:12}}>💪</div>
        <div style={{fontWeight:800,fontSize:26,color:"#8b7cf8",marginBottom:6}}>Sweat Squad</div>
        <div style={{color:"#666",fontSize:14,marginBottom:36}}>Compete with friends. Stay consistent.</div>
        <button onClick={handleGoogle} disabled={busy} style={{width:"100%",padding:"13px 20px",borderRadius:12,border:"1px solid #2a2a42",background:"#13131f",color:"#e8e8f0",fontSize:15,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C40.9 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          {busy?"Signing in…":"Continue with Google"}
        </button>
        {error&&<div style={{color:"#ff6584",fontSize:12,marginTop:12}}>{error}</div>}
        <div style={{color:"#333",fontSize:11,marginTop:24}}>Syncs across all your devices.</div>
      </div>
    </div>
  );
}

// ── MINI CALENDAR ─────────────────────────────────────────────────────────────
function MiniCalendar({startDate,endDate,checkins,selectedDate,onSelect}){
  const [viewYear,setViewYear]=useState(()=>new Date(selectedDate).getFullYear());
  const [viewMonth,setViewMonth]=useState(()=>new Date(selectedDate).getMonth());
  const firstDay=new Date(viewYear,viewMonth,1);
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  const startPad=firstDay.getDay();
  const challStart=new Date(startDate);
  const challEnd=new Date(endDate<TODAY?endDate:TODAY);
  function prevMonth(){ if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }
  function nextMonth(){ if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }
  const monthName=new Date(viewYear,viewMonth).toLocaleString("default",{month:"long"});
  return(
    <div style={{background:"#1a1a2e",borderRadius:12,padding:12,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={prevMonth} style={{background:"none",border:"none",color:"#8b7cf8",fontSize:18,cursor:"pointer",padding:"0 6px"}}>‹</button>
        <span style={{fontWeight:700,fontSize:14}}>{monthName} {viewYear}</span>
        <button onClick={nextMonth} style={{background:"none",border:"none",color:"#8b7cf8",fontSize:18,cursor:"pointer",padding:"0 6px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:"#555",fontWeight:600,padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array.from({length:startPad},(_,i)=><div key={"p"+i}/>)}
        {Array.from({length:daysInMonth},(_,i)=>{
          const d=new Date(viewYear,viewMonth,i+1);
          const dateStr=d.toISOString().slice(0,10);
          const loggable=d>=challStart&&d<=challEnd;
          const logged=!!checkins[dateStr];
          const usedPass=checkins[dateStr]?.usePass;
          const selected=dateStr===selectedDate;
          let bg="#0d0d14",color="#555",border="1px solid transparent";
          if(selected){bg="#8b7cf8";color="#fff";border="1px solid #8b7cf8";}
          else if(usedPass&&loggable){bg="#ffb34722";color="#ffb347";border="1px solid #ffb34755";}
          else if(logged&&loggable){bg="#8b7cf822";color="#8b7cf8";border="1px solid #8b7cf855";}
          else if(loggable){bg="#1e1e2e";color="#e8e8f0";border="1px solid #2a2a42";}
          return(
            <div key={i+1} onClick={()=>loggable&&onSelect(dateStr)} style={{textAlign:"center",padding:"6px 2px",borderRadius:8,fontSize:12,fontWeight:selected?700:400,background:bg,color,border,cursor:loggable?"pointer":"default",opacity:loggable?1:0.25,position:"relative"}}>
              {i+1}
              {logged&&!selected&&<div style={{position:"absolute",bottom:1,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:usedPass?"#ffb347":"#43d9ad"}}/>}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10,marginTop:8,fontSize:10,color:"#555",flexWrap:"wrap"}}>
        <span><span style={{color:"#8b7cf8"}}>■</span> Selected</span>
        <span><span style={{color:"#43d9ad"}}>●</span> Done</span>
        <span><span style={{color:"#ffb347"}}>●</span> Pass used</span>
      </div>
    </div>
  );
}

// ── FITNESS CHECK-IN MODAL ────────────────────────────────────────────────────
function CheckInModal({challenge,myCheckins,currentStreak,fitnessPassesLeft,onClose,onSubmit}){
  const [selDate,setSelDate]=useState(TODAY);
  const [form,setForm]=useState({completed:true,duration:"",distance:"",steps:"",note:"",usePass:false});
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const alreadyLogged=!!myCheckins[selDate];
  const pts=calcFitnessPoints(challenge.rules,form,currentStreak,form.usePass);
  const streakBonus=FITNESS_STREAK_BONUSES[currentStreak+1]||0;
  useEffect(()=>{
    if(myCheckins[selDate]){ const e=myCheckins[selDate]; setForm({completed:e.completed??true,duration:e.duration||"",distance:e.distance||"",steps:e.steps||"",note:e.note||"",usePass:e.usePass||false}); }
    else setForm({completed:true,duration:"",distance:"",steps:"",note:"",usePass:false});
  },[selDate]);
  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:32}}>{challenge.emoji}</div>
          <div style={{fontWeight:800,fontSize:18}}>Fitness Check-In</div>
          <div style={{color:"#666",fontSize:12}}>Select a date to log</div>
        </div>
        <MiniCalendar startDate={challenge.startDate} endDate={challenge.endDate} checkins={myCheckins} selectedDate={selDate} onSelect={setSelDate}/>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 12px",background:"#13131f",borderRadius:10,border:"1px solid #2a2a42"}}>
          <span style={{fontSize:16}}>📅</span>
          <div style={{flex:1}}>
            <span style={{fontWeight:700}}>{selDate===TODAY?"Today":selDate}</span>
            {alreadyLogged&&<span style={{...css.chip("#ffb347"),marginLeft:8,fontSize:10}}>Already logged — will overwrite</span>}
            {selDate<TODAY&&!alreadyLogged&&<span style={{...css.chip("#8b7cf8"),marginLeft:8,fontSize:10}}>Past date</span>}
          </div>
        </div>

        {/* Out pass */}
        {fitnessPassesLeft>0&&(
          <div style={{...css.card,padding:12,marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>🎫</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13}}>Use Out Pass</div>
                <div style={{fontSize:11,color:"#666"}}>{fitnessPassesLeft} left this week · Streak stays intact, no points</div>
              </div>
              <Toggle on={form.usePass} onChange={v=>set("usePass",v)}/>
            </div>
          </div>
        )}

        {!form.usePass&&<>
          <div style={css.label}>Did you complete the activity?</div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <button style={{...css.btn(form.completed?"primary":"secondary"),flex:1}} onClick={()=>set("completed",true)}>✅ Yes!</button>
            <button style={{...css.btn(!form.completed?"primary":"secondary"),flex:1}} onClick={()=>set("completed",false)}>❌ Missed</button>
          </div>
          {form.completed&&<>
            <div style={css.label}>Duration (min) <span style={{color:"#555",fontWeight:400}}>(optional)</span></div>
            <input type="number" value={form.duration} onChange={e=>set("duration",e.target.value)} style={css.input} placeholder="e.g. 45"/>
            {["Running","Cycling"].includes(challenge.type)&&<>
              <div style={css.label}>Distance (km)</div>
              <input type="number" value={form.distance} onChange={e=>set("distance",e.target.value)} style={css.input} placeholder="e.g. 5.2"/>
            </>}
            <div style={css.label}>Steps <span style={{color:"#555",fontWeight:400}}>{challenge.type!=="Steps"?"(optional)":""}</span></div>
            <input type="number" value={form.steps} onChange={e=>set("steps",e.target.value)} style={css.input} placeholder={challenge.type==="Steps"?"e.g. 11000":"optional"}/>
            <div style={css.label}>Note (optional)</div>
            <input value={form.note} onChange={e=>set("note",e.target.value)} style={css.input} placeholder="How did it feel?"/>
            <div style={{background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:12,padding:14,textAlign:"center",margin:"14px 0"}}>
              <div style={{fontSize:11,color:"#888"}}>Points you'll earn</div>
              <div style={{fontSize:36,fontWeight:900,color:"#8b7cf8"}}>+{pts}</div>
              {streakBonus>0&&selDate===TODAY&&<div style={{fontSize:12,color:"#ffb347",marginTop:4}}>🔥 Includes +{streakBonus} streak bonus!</div>}
            </div>
          </>}
        </>}
        {form.usePass&&<div style={{background:"#1a1a10",border:"1px solid #ffb347",borderRadius:12,padding:14,textAlign:"center",margin:"14px 0"}}>
          <div style={{fontSize:24}}>🎫</div>
          <div style={{fontWeight:700,color:"#ffb347",marginTop:4}}>Out pass applied</div>
          <div style={{fontSize:12,color:"#666",marginTop:4}}>Your streak will be protected. No points earned.</div>
        </div>}
        <button style={{...css.btn("primary"),width:"100%",padding:"13px"}} onClick={()=>onSubmit(form,pts,selDate)}>🚀 Submit for {selDate===TODAY?"Today":selDate}</button>
        <button style={{...css.btn("secondary"),width:"100%",marginTop:8}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── DIET CHECK-IN MODAL ───────────────────────────────────────────────────────
function DietCheckinModal({rules,dietStats,recentDays,onClose,onSubmit}){
  const defaultRules=rules||DEFAULT_DIET_RULES;
  const dietStart=new Date(); dietStart.setDate(dietStart.getDate()-29);
  const dietStartStr=dietStart.toISOString().slice(0,10);
  const [selDate,setSelDate]=useState(TODAY);
  const [checks,setChecks]=useState(Object.fromEntries(defaultRules.map(r=>[r.id,false])));
  const [note,setNote]=useState("");
  const [useCheat,setUseCheat]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const tokensLeft=dietStats?.tokensLeft??WEEKLY_CHEAT_TOKENS;
  const score=calcDietScore(defaultRules,checks);
  const maxScore=maxDietScore(defaultRules);
  const isGreat=score>=Math.ceil(maxScore*0.8);
  const alreadyLogged=!!recentDays[selDate];
  useEffect(()=>{
    if(recentDays[selDate]?.checks) setChecks({...Object.fromEntries(defaultRules.map(r=>[r.id,false])),...recentDays[selDate].checks});
    else setChecks(Object.fromEntries(defaultRules.map(r=>[r.id,false])));
  },[selDate]);
  async function submit(){ setSubmitted(true); await onSubmit({checks,note,score,maxScore,useCheat,date:selDate,timestamp:Date.now()}); }
  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
        {!submitted?<>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:32}}>🥗</div>
            <div style={{fontWeight:800,fontSize:18}}>Diet Check-In</div>
          </div>
          <MiniCalendar startDate={dietStartStr} endDate={TODAY} checkins={recentDays} selectedDate={selDate} onSelect={setSelDate}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 12px",background:"#13131f",borderRadius:10,border:"1px solid #2a2a42"}}>
            <span>📅</span>
            <span style={{fontWeight:700}}>{selDate===TODAY?"Today":selDate}</span>
            {alreadyLogged&&<span style={{...css.chip("#ffb347"),marginLeft:8,fontSize:10}}>Will overwrite</span>}
          </div>
          {defaultRules.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #1e1e2e"}}>
              <span style={{fontSize:20,width:28}}>{r.icon}</span>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{r.label}</div><div style={{fontSize:11,color:"#666"}}>+{r.points} pts</div></div>
              <Toggle on={checks[r.id]} onChange={v=>setChecks(p=>({...p,[r.id]:v}))}/>
            </div>
          ))}
          <div style={{background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:12,padding:12,textAlign:"center",margin:"14px 0"}}>
            <div style={{fontSize:11,color:"#888",marginBottom:4}}>Nutrition Score</div>
            <div style={{fontSize:36,fontWeight:900,color:isGreat?"#43d9ad":"#8b7cf8"}}>{score}<span style={{fontSize:18,color:"#555"}}>/{maxScore}</span></div>
            <div style={css.bar}><div style={css.barFill(pct(score,maxScore),isGreat?"#43d9ad":"#8b7cf8")}/></div>
          </div>
          {tokensLeft>0&&selDate===TODAY&&(
            <div style={{...css.card,padding:12,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>🎭</span>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Use Cheat Token</div><div style={{fontSize:11,color:"#666"}}>{tokensLeft} left this week</div></div>
                <Toggle on={useCheat} onChange={setUseCheat}/>
              </div>
            </div>
          )}
          <div style={css.label}>Note (optional)</div>
          <input value={note} onChange={e=>setNote(e.target.value)} style={{...css.input,marginBottom:14}} placeholder="How was your diet today?"/>
          <button style={{...css.btn(isGreat?"green":"primary"),width:"100%",padding:"13px"}} onClick={submit}>Submit 🥗</button>
          <button style={{...css.btn("secondary"),width:"100%",marginTop:8}} onClick={onClose}>Cancel</button>
        </>:(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:8}}>{isGreat?"🎉":"💪"}</div>
            <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>{isGreat?"Great job!":"Keep going!"}</div>
            <div style={{fontSize:36,fontWeight:900,color:isGreat?"#43d9ad":"#8b7cf8",margin:"10px 0"}}>{score}/{maxScore}</div>
            <button style={{...css.btn("primary"),width:"100%",marginTop:16}} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AWARD BADGE MODAL ─────────────────────────────────────────────────────────
function AwardBadgeModal({participants,onClose,onAward}){
  const [selUser,setSelUser]=useState(participants[0]?.userId||"");
  const [emoji,setEmoji]=useState("🏆");
  const [name,setName]=useState("");
  const commonEmojis=["🏆","⭐","🔥","💪","🥇","🎯","👑","💎","🚀","🎉","🌟","🥊","🏅","💯","🦁","👸","💅","💍","✨","🌸","🦋","💃","🌺","🎀","💖","👒","🫅","🪄","🦄","💫","🍑","🧿","🫶"];
  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:28}}>🎖️</div>
          <div style={{fontWeight:800,fontSize:17}}>Award Custom Badge</div>
        </div>
        <div style={css.label}>Select Participant</div>
        <select value={selUser} onChange={e=>setSelUser(e.target.value)} style={{...css.input,marginBottom:4}}>
          {participants.map(p=><option key={p.userId} value={p.userId}>{p.userName}</option>)}
        </select>
        <div style={css.label}>Choose Emoji</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
          {commonEmojis.map(e=>(
            <button key={e} onClick={()=>setEmoji(e)} style={{fontSize:22,background:emoji===e?"#8b7cf822":"#1a1a2e",border:`1px solid ${emoji===e?"#8b7cf8":"#2a2a42"}`,borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>
              {e}
            </button>
          ))}
        </div>
        <div style={css.label}>Or type any emoji</div>
        <input value={emoji} onChange={e=>setEmoji(e.target.value)} style={{...css.input,fontSize:24,textAlign:"center"}} maxLength={4}/>
        <div style={css.label}>Badge Name *</div>
        <input value={name} onChange={e=>setName(e.target.value)} style={css.input} placeholder="e.g. MVP, Iron Will, Team Player"/>
        <div style={{background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:12,padding:14,textAlign:"center",margin:"14px 0"}}>
          <div style={{fontSize:36}}>{emoji}</div>
          <div style={{fontWeight:700,marginTop:4}}>{name||"Badge Name"}</div>
          <div style={{fontSize:12,color:"#666",marginTop:2}}>Custom badge</div>
        </div>
        <button style={{...css.btn("primary"),width:"100%",marginBottom:8}} onClick={()=>name.trim()&&onAward(selUser,emoji,name.trim())}>
          Award Badge 🎖️
        </button>
        <button style={{...css.btn("secondary"),width:"100%"}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── MANAGE AWARDS MODAL ──────────────────────────────────────────────────────
function ManageAwardsModal({participants, challengeId, me, onClose}){
  const [selUser, setSelUser] = useState(participants[0]?.userId||"");
  const [saving, setSaving] = useState(false);

  const selPart = participants.find(p=>p.userId===selUser);
  const headstartLog = selPart?.headstartLog||[];
  const customBadges = selPart?.customBadges||[];
  const totalHeadstart = headstartLog.reduce((s,h)=>s+h.pts,0);

  async function removeHeadstart(idx){
    if(!window.confirm("Remove this headstart entry?")) return;
    setSaving(true);
    const pRef = doc(db,"challenges",challengeId,"participants",selUser);
    const newLog = headstartLog.filter((_,i)=>i!==idx);
    const removedPts = headstartLog[idx].pts;
    const pSnap = await getDoc(pRef);
    if(pSnap.exists()){
      await updateDoc(pRef,{
        headstartLog: newLog,
        points: Math.max(0,(pSnap.data().points||0)-removedPts)
      });
    }
    setSaving(false);
  }

  async function removeBadge(idx){
    if(!window.confirm("Remove this badge?")) return;
    setSaving(true);
    const pRef = doc(db,"challenges",challengeId,"participants",selUser);
    const newBadges = customBadges.filter((_,i)=>i!==idx);
    await updateDoc(pRef,{customBadges: newBadges});
    setSaving(false);
  }

  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:28}}>⚙️</div>
          <div style={{fontWeight:800,fontSize:17}}>Manage Awards</div>
          <div style={{fontSize:12,color:"#666"}}>Remove headstart points or custom badges</div>
        </div>

        <div style={css.label}>Select Participant</div>
        <select value={selUser} onChange={e=>setSelUser(e.target.value)} style={{...css.input,marginBottom:16}}>
          {participants.map(p=><option key={p.userId} value={p.userId}>{p.userName}</option>)}
        </select>

        {/* Headstart entries */}
        <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>
          ⚡ Headstart Points
          {totalHeadstart>0&&<span style={{...css.chip("#ffb347"),marginLeft:8}}>{totalHeadstart} pts total</span>}
        </div>
        {headstartLog.length===0
          ?<div style={{color:"#555",fontSize:12,marginBottom:16}}>No headstart points given.</div>
          :<div style={{marginBottom:16}}>
            {headstartLog.map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#1a1a2e",borderRadius:10,marginBottom:6,border:"1px solid #2a2a42"}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#8b7cf8"}}>+{h.pts} pts</div>
                  {h.reason&&<div style={{fontSize:11,color:"#666"}}>{h.reason}</div>}
                  <div style={{fontSize:10,color:"#555"}}>{h.givenAt}</div>
                </div>
                <button onClick={()=>removeHeadstart(i)} disabled={saving}
                  style={{...css.btn("secondary",true),color:"#ff6584",border:"1px solid #ff658444",padding:"5px 10px"}}>
                  {saving?"…":"✕"}
                </button>
              </div>
            ))}
          </div>
        }

        {/* Custom badges */}
        <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🎖️ Custom Badges</div>
        {customBadges.length===0
          ?<div style={{color:"#555",fontSize:12,marginBottom:16}}>No custom badges awarded.</div>
          :<div style={{marginBottom:16}}>
            {customBadges.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#1a1a2e",borderRadius:10,marginBottom:6,border:"1px solid #ffb34755"}}>
                <span style={{fontSize:24}}>{b.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#ffb347"}}>{b.name}</div>
                  <div style={{fontSize:10,color:"#555"}}>{b.awardedAt}</div>
                </div>
                <button onClick={()=>removeBadge(i)} disabled={saving}
                  style={{...css.btn("secondary",true),color:"#ff6584",border:"1px solid #ff658444",padding:"5px 10px"}}>
                  {saving?"…":"✕"}
                </button>
              </div>
            ))}
          </div>
        }

        <button style={{...css.btn("secondary"),width:"100%"}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
function HeadstartModal({participants,onClose,onGive}){
  const [selUser,setSelUser]=useState(participants[0]?.userId||"");
  const [pts,setPts]=useState(5);
  const [reason,setReason]=useState("");
  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:28}}>⚡</div>
          <div style={{fontWeight:800,fontSize:17}}>Give Headstart Points</div>
          <div style={{fontSize:12,color:"#666"}}>Award bonus points to a participant</div>
        </div>
        <div style={css.label}>Select Participant</div>
        <select value={selUser} onChange={e=>setSelUser(e.target.value)} style={{...css.input,marginBottom:4}}>
          {participants.map(p=><option key={p.userId} value={p.userId}>{p.userName} ({p.points} pts)</option>)}
        </select>
        <div style={css.label}>Points to Award</div>
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          {[3,5,10,15,20].map(v=><button key={v} style={{...css.btn(pts===v?"primary":"secondary",true),flex:1}} onClick={()=>setPts(v)}>{v}</button>)}
        </div>
        <input type="number" min={1} value={pts} onChange={e=>setPts(+e.target.value)} style={css.input} placeholder="Custom points"/>
        <div style={css.label}>Reason (optional)</div>
        <input value={reason} onChange={e=>setReason(e.target.value)} style={{...css.input,marginBottom:14}} placeholder="e.g. Joining late, special effort…"/>
        <div style={{background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:12,padding:14,textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:"#888"}}>Points to award</div>
          <div style={{fontSize:36,fontWeight:900,color:"#8b7cf8"}}>+{pts}</div>
        </div>
        <button style={{...css.btn("primary"),width:"100%",marginBottom:8}} onClick={()=>pts>0&&onGive(selUser,pts,reason)}>
          Give Points ⚡
        </button>
        <button style={{...css.btn("secondary"),width:"100%"}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function BadgesTab({myStats,challengeTotalDays}){
  const earned=FITNESS_BADGES.filter(b=>b.check(myStats||{},challengeTotalDays)).map(b=>b.id);
  return(
    <div>
      <div style={{...css.card,marginBottom:14}}>
        <div style={{fontWeight:700,marginBottom:10}}>⚡ Streak Bonuses</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {Object.entries(FITNESS_STREAK_BONUSES).map(([d,p])=>{ const hit=(myStats?.streak||0)>=(+d);
            return <div key={d} style={{background:hit?"#1a1630":"#0d0d14",border:`1px solid ${hit?"#8b7cf8":"#2a2a42"}`,borderRadius:10,padding:"8px 12px",textAlign:"center",opacity:hit?1:0.5,minWidth:56}}>
              <div style={{fontWeight:800,color:hit?"#8b7cf8":"#666",fontSize:15}}>{d}d</div>
              <div style={{fontSize:11,color:hit?"#43d9ad":"#555",fontWeight:600}}>+{p}pts</div>
            </div>;
          })}
        </div>
      </div>
      {/* custom badges */}
      {(myStats?.customBadges||[]).length>0&&<>
        <div style={{fontWeight:700,marginBottom:8}}>🎖️ Custom Badges</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
          {(myStats?.customBadges||[]).map((b,i)=>(
            <div key={i} style={{background:"#1a1630",border:"1px solid #ffb347",borderRadius:12,padding:"10px 12px",textAlign:"center",minWidth:72}}>
              <div style={{fontSize:24}}>{b.emoji}</div>
              <div style={{fontSize:10,color:"#ffb347",fontWeight:600,marginTop:2}}>{b.name}</div>
            </div>
          ))}
        </div>
      </>}
      <div style={{fontWeight:700,marginBottom:8}}>🏅 Fitness Badges</div>
      {FITNESS_BADGES.map(b=>{ const isEarned=earned.includes(b.id); const {cur,max}=b.progress(myStats||{},challengeTotalDays);
        return(
          <div key={b.id} style={{...css.card,padding:14,border:`1px solid ${isEarned?"#8b7cf8":"#1e1e2e"}`,background:isEarned?"#1a1630":"#13131f",opacity:isEarned?1:0.6,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:26,width:44,height:44,borderRadius:12,background:isEarned?"#2a2040":"#0d0d14",display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${isEarned?"#8b7cf8":"#2a2a42"}`,filter:isEarned?"none":"grayscale(1)",flexShrink:0}}>{b.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                  <div style={{fontWeight:700,fontSize:14}}>{b.name}</div>
                  {isEarned&&<span style={{...css.chip("#43d9ad"),fontSize:10}}>Earned ✓</span>}
                </div>
                <div style={css.bar}><div style={css.barFill(pct(cur,max),isEarned?"#8b7cf8":"#444")}/></div>
                <div style={{fontSize:11,color:isEarned?"#8b7cf8":"#555",marginTop:4,fontWeight:600}}>{isEarned?"Completed!":`${cur} / ${max}`}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FriendProfile({user,challenges,onClose}){
  const [allStats,setAllStats]=useState({});
  const [dietStats,setDietStats]=useState(null);
  useEffect(()=>{
    const theirC=challenges.filter(c=>(c.memberIds||[]).includes(user.id));
    const unsubs=theirC.map(c=>onSnapshot(doc(db,"challenges",c.id,"participants",user.id),snap=>{ if(snap.exists()) setAllStats(p=>({...p,[c.id]:snap.data()})); }));
    const du=onSnapshot(dietStatsRef(user.id),snap=>{ if(snap.exists()) setDietStats(snap.data()); });
    return()=>{ unsubs.forEach(u=>u()); du(); };
  },[user.id,challenges]);
  const totalPts=Object.values(allStats).reduce((s,p)=>s+(p.points||0),0)+(dietStats?.totalPoints||0);
  const maxStreak=Object.values(allStats).reduce((s,p)=>Math.max(s,p.streak||0),0);
  const theirC=challenges.filter(c=>(c.memberIds||[]).includes(user.id));
  const fitBadgeIds=[...new Set(Object.values(allStats).flatMap(p=>p.badges||[]))];
  const dietBadgeIds=dietStats?.badges||[];
  const customBadges=[...new Set(Object.values(allStats).flatMap(p=>p.customBadges||[]))];
  return(
    <div style={css.overlay} onMouseDown={onClose}>
      <div style={{...css.sheet,maxHeight:"88vh",paddingBottom:40}} onMouseDown={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          <div style={css.avatar(user.color,54)}>{user.initials}</div>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:18}}>{user.name}</div><div style={{fontSize:12,color:"#666"}}>{theirC.length} challenges</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#666",fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center",marginBottom:18}}>
          {[[totalPts,"Total Pts","🏆"],[maxStreak,"Streak","🔥"],[dietStats?.avgScore?.toFixed(1)||"—","Diet Avg","🥗"]].map(([v,l,ic])=>(
            <div key={l} style={{background:"#0d0d14",borderRadius:10,padding:"8px 4px",border:"1px solid #1e1e2e"}}>
              <div>{ic}</div><div style={{fontWeight:800,color:"#8b7cf8",fontSize:14}}>{v}</div><div style={{fontSize:10,color:"#666"}}>{l}</div>
            </div>
          ))}
        </div>
        {customBadges.length>0&&<>
          <div style={{fontWeight:700,marginBottom:8}}>🎖️ Custom Badges</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {customBadges.map((b,i)=><div key={i} style={{background:"#1a1630",border:"1px solid #ffb347",borderRadius:10,padding:"8px 10px",textAlign:"center",minWidth:60}}>
              <div style={{fontSize:20}}>{b.emoji}</div>
              <div style={{fontSize:9,color:"#ffb347",fontWeight:600,marginTop:2}}>{b.name}</div>
            </div>)}
          </div>
        </>}
        {(fitBadgeIds.length>0||dietBadgeIds.length>0)&&<>
          <div style={{fontWeight:700,marginBottom:8}}>🏅 Badges</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
            {[...fitBadgeIds,...dietBadgeIds].map(bid=>{ const b=[...FITNESS_BADGES,...DIET_BADGES].find(x=>x.id===bid); if(!b) return null;
              return <div key={bid} style={{background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:10,padding:"8px 10px",textAlign:"center",minWidth:60}}>
                <div style={{fontSize:20}}>{b.icon}</div>
                <div style={{fontSize:9,color:"#8b7cf8",fontWeight:600,marginTop:2,lineHeight:1.3}}>{b.name}</div>
              </div>;
            })}
          </div>
        </>}
        <div style={{fontWeight:700,marginBottom:10}}>🎯 Challenges</div>
        {theirC.map(c=>{ const st=allStats[c.id]; return(
          <div key={c.id} style={{...css.card,padding:12,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <span style={{fontSize:20}}>{c.emoji}</span>
              <div style={{flex:1,fontWeight:600,fontSize:13}}>{c.name}</div>
              {isUpcoming(c)?<span style={css.chip("#ffb347")}>⏳</span>:<span style={{fontSize:11,color:"#ff9848"}}>{daysLeft(c)}d left</span>}
            </div>
            {st&&!isUpcoming(c)&&<div style={{display:"flex",gap:12,fontSize:11}}>
              <span style={{color:"#8b7cf8"}}>🏆 {st.points} pts</span>
              <span style={{color:"#ff9848"}}>🔥 {st.streak}</span>
              <span style={{color:"#43d9ad"}}>✅ {st.completedDays}d</span>
            </div>}
          </div>
        );})}
      </div>
    </div>
  );
}

function ProfileTab({uid,meUser,allUsers,challenges,isAdmin}){
  const [search,setSearch]=useState("");
  const [viewing,setViewing]=useState(null);
  const [removing,setRemoving]=useState(null);
  const others=allUsers.filter(u=>u.id!==uid);
  const filtered=search.trim()?others.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())):others;
  async function handleRemoveUser(targetUser){
    if(!window.confirm(`Remove ${targetUser.name} from the app entirely?`)) return;
    setRemoving(targetUser.id);
    try{
      for(const c of challenges){
        if((c.memberIds||[]).includes(targetUser.id)){
          await updateDoc(doc(db,"challenges",c.id),{memberIds:(c.memberIds||[]).filter(id=>id!==targetUser.id)});
          await deleteDoc(doc(db,"challenges",c.id,"participants",targetUser.id));
        }
      }
      const dietDays=await getDocs(collection(db,"diet_checkins",targetUser.id,"days"));
      for(const d of dietDays.docs) await deleteDoc(d.ref);
      await deleteDoc(dietStatsRef(targetUser.id)).catch(()=>{});
      await deleteDoc(doc(db,"users",targetUser.id));
    } catch(e){ console.error(e); }
    setRemoving(null); setViewing(null);
  }
  return(
    <div style={{paddingBottom:20}}>
      {viewing&&<FriendProfile user={viewing} challenges={challenges} onClose={()=>setViewing(null)}/>}
      <div style={{fontWeight:800,fontSize:20,marginBottom:12}}>Profile</div>
      <div onClick={()=>setViewing(meUser)} style={{...css.card,background:"linear-gradient(135deg,#1a1630,#13131f)",border:"1px solid #8b7cf8",cursor:"pointer",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={css.avatar(meUser.color,52)}>{meUser.initials}</div>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:18}}>{meUser.name}</div><div style={{fontSize:12,color:"#666"}}>Tap to view full profile</div></div>
          <span style={css.chip()}>You</span>
        </div>
      </div>
      <div style={{fontWeight:700,marginBottom:10}}>🔍 Find Friends</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} style={{...css.input,marginBottom:12}} placeholder="Search by name…"/>
      {filtered.length===0&&search.trim()
        ?<div style={{...css.card,color:"#555",textAlign:"center",padding:16}}>No users found.</div>
        :filtered.map(u=>{
          const shared=challenges.filter(c=>(c.memberIds||[]).includes(uid)&&(c.memberIds||[]).includes(u.id)).length;
          return <div key={u.id} style={{...css.card,display:"flex",alignItems:"center",gap:12,borderColor:"#2a2a42"}}>
            <div onClick={()=>setViewing(u)} style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0,cursor:"pointer"}}>
              <div style={css.avatar(u.color,42)}>{u.initials}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>{u.name}</div><div style={{fontSize:11,color:"#666"}}>{shared>0?`${shared} shared challenge${shared>1?"s":""}`:"No shared challenges"}</div></div>
              <span style={{color:"#8b7cf8",fontSize:18}}>›</span>
            </div>
            {isAdmin&&<button onClick={()=>handleRemoveUser(u)} disabled={removing===u.id} style={{...css.btn("secondary",true),color:"#ff6584",border:"1px solid #ff658444",padding:"5px 10px",flexShrink:0}}>{removing===u.id?"…":"🗑️"}</button>}
          </div>;
        })
      }
      {!search.trim()&&others.length===0&&<div style={{...css.card,color:"#555",textAlign:"center",padding:20}}>No other users yet.</div>}
    </div>
  );
}

function DietTab({uid}){
  const [dietStats,setDietStats]=useState(null);
  const [recentDays,setRecentDays]=useState({});
  const [showCheckin,setShowCheckin]=useState(false);
  const [confetti,setConfetti]=useState(false);
  useEffect(()=>{ return onSnapshot(dietStatsRef(uid),snap=>{ setDietStats(snap.exists()?snap.data():null); }); },[uid]);
  useEffect(()=>{ return onSnapshot(collection(db,"diet_checkins",uid,"days"),snap=>{ const m={}; snap.docs.forEach(d=>{ m[d.id]=d.data(); }); setRecentDays(m); }); },[uid]);
  const checkedToday=!!recentDays[TODAY];
  const dietStreak=dietStats?.dietStreak||0;
  const tokensLeft=dietStats?.tokensLeft??WEEKLY_CHEAT_TOKENS;
  const avgScore=dietStats?.avgScore||0;
  const totalLogged=Object.keys(recentDays).length;
  async function handleDietCheckin(data){
    await setDoc(dietDayRef(uid,data.date),data);
    const prev=dietStats||{dietStreak:0,longestStreak:0,logStreak:0,perfectStreak:0,totalPoints:0,avgScore:0,tokensLeft:WEEKLY_CHEAT_TOKENS,tokensUsed:0,comebacks:0,badges:[],weekStart:getWeekStart()};
    const isGoodDay=data.score>=Math.ceil((data.maxScore||5)*0.8);
    const newStreak=isGoodDay?(prev.dietStreak||0)+1:(data.useCheat?prev.dietStreak:0);
    const newLongest=Math.max(prev.longestStreak||0,newStreak);
    const newPerfect=data.score===data.maxScore?(prev.perfectStreak||0)+1:0;
    let bonusPts=0; if(isGoodDay&&DIET_STREAK_BONUSES[newStreak]) bonusPts=DIET_STREAK_BONUSES[newStreak];
    const newAvg=totalLogged>0?((prev.avgScore||0)*totalLogged+data.score)/(totalLogged+1):data.score;
    const weekStart=getWeekStart();
    const newTokens=prev.weekStart===weekStart?(data.useCheat?Math.max(0,(prev.tokensLeft??2)-1):(prev.tokensLeft??2)):WEEKLY_CHEAT_TOKENS-(data.useCheat?1:0);
    const newStats={dietStreak:newStreak,longestStreak:newLongest,logStreak:(prev.logStreak||0)+1,perfectStreak:newPerfect,totalPoints:(prev.totalPoints||0)+data.score+bonusPts,avgScore:Math.round(newAvg*10)/10,tokensLeft:newTokens,tokensUsed:(prev.tokensUsed||0)+(data.useCheat?1:0),comebacks:(prev.comebacks||0),weekStart};
    const newBadges=DIET_BADGES.filter(b=>b.check(newStats)&&!(prev.badges||[]).includes(b.id)).map(b=>b.id);
    await setDoc(dietStatsRef(uid),{...newStats,badges:[...(prev.badges||[]),...newBadges]});
    if(data.score>=(data.maxScore||5)*0.8){ setConfetti(true); setTimeout(()=>setConfetti(false),3000); }
    setShowCheckin(false);
  }
  const heatCells=Array.from({length:30},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-29+i); const key=d.toISOString().slice(0,10); const day=recentDays[key]; const s=day?pct(day.score,day.maxScore||5):null; return{key,col:s===null?"#0d0d14":s>=80?"#43d9ad":s>=60?"#8b7cf8":s>=40?"#ffb347":"#ff6584",done:!!day,score:day?.score,max:day?.maxScore}; });
  return(
    <div style={{paddingBottom:20}}>
      <Confetti active={confetti}/>
      {showCheckin&&<DietCheckinModal rules={DEFAULT_DIET_RULES} dietStats={dietStats} recentDays={recentDays} onClose={()=>setShowCheckin(false)} onSubmit={handleDietCheckin}/>}
      <div style={{...css.card,background:"linear-gradient(135deg,#0d2416,#13131f)",border:"1px solid #43d9ad",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{fontSize:32}}>🥗</div>
          <div><div style={{fontWeight:800,fontSize:17}}>Daily Nutrition</div><div style={{fontSize:12,color:"#666"}}>{TODAY}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center",marginBottom:14}}>
          {[[dietStats?.totalPoints||0,"pts","🏆"],[dietStreak,"streak","🔥"],[dietStats?.longestStreak||0,"best","⭐"],[avgScore.toFixed(1),"avg","📊"]].map(([v,l,ic])=>(
            <div key={l} style={{background:"#0d0d14",borderRadius:10,padding:"8px 4px",border:"1px solid #1e1e2e"}}>
              <div>{ic}</div><div style={{fontWeight:800,color:"#43d9ad",fontSize:15}}>{v}</div><div style={{fontSize:10,color:"#666"}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontSize:13,color:"#888"}}>🎭 Cheat tokens:</span>
          <div style={{display:"flex",gap:6}}>{Array.from({length:WEEKLY_CHEAT_TOKENS},(_,i)=><div key={i} style={{width:20,height:20,borderRadius:"50%",background:i<tokensLeft?"#ffb347":"#2a2a42",border:`2px solid ${i<tokensLeft?"#ffb347":"#444"}`}}/>)}</div>
        </div>
        {!checkedToday
          ?<button style={{...css.btn("green"),width:"100%"}} onClick={()=>setShowCheckin(true)}>Log Today's Diet 🥗</button>
          :<div style={{background:"#0d2416",border:"1px solid #43d9ad",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>✅</span>
            <div style={{flex:1}}><div style={{fontWeight:700,color:"#43d9ad"}}>Diet logged! {recentDays[TODAY]?.score}/{recentDays[TODAY]?.maxScore||5}</div></div>
            <button style={css.btn("secondary",true)} onClick={()=>setShowCheckin(true)}>Edit / Past</button>
          </div>
        }
      </div>
      <div style={{fontWeight:700,marginBottom:8}}>📅 30-Day Heatmap</div>
      <div style={css.card}>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {heatCells.map(({key,col,done,score,max})=><div key={key} title={`${key}${done?`: ${score}/${max}`:""}`} style={{width:14,height:14,borderRadius:3,background:col,border:`1px solid ${col==="#0d0d14"?"#2a2a42":col}`}}/>)}
        </div>
        <div style={{display:"flex",gap:10,marginTop:8,fontSize:10,color:"#555",flexWrap:"wrap"}}>
          <span style={{color:"#43d9ad"}}>■ 80%+</span><span style={{color:"#8b7cf8"}}>■ 60%+</span><span style={{color:"#ffb347"}}>■ 40%+</span><span style={{color:"#ff6584"}}>■ &lt;40%</span><span>░ Not logged</span>
        </div>
      </div>
      <div style={{fontWeight:700,marginBottom:8}}>⚡ Diet Streak Bonuses</div>
      <div style={{...css.card,padding:12}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {Object.entries(DIET_STREAK_BONUSES).map(([d,p])=>{ const hit=dietStreak>=(+d);
            return <div key={d} style={{background:hit?"#0d2416":"#0d0d14",border:`1px solid ${hit?"#43d9ad":"#2a2a42"}`,borderRadius:10,padding:"6px 10px",textAlign:"center",opacity:hit?1:0.5}}>
              <div style={{fontWeight:800,color:hit?"#43d9ad":"#666",fontSize:13}}>{d}d</div>
              <div style={{fontSize:10,color:hit?"#43d9ad":"#555"}}>+{p}pts</div>
            </div>;
          })}
        </div>
      </div>
      {totalLogged>0&&<>
        <div style={{fontWeight:700,marginBottom:8}}>📊 Insights</div>
        <div style={css.card}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{color:"#888"}}>Days Logged</span><span style={{fontWeight:700}}>{totalLogged}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{color:"#888"}}>Avg Score</span><span style={{fontWeight:700,color:"#43d9ad"}}>{avgScore.toFixed(1)}/{DEFAULT_DIET_RULES.length}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#888"}}>Consistency</span><span style={{fontWeight:700,color:"#8b7cf8"}}>{pct(totalLogged,30)}%</span></div>
        </div>
      </>}
      <div style={{fontWeight:700,marginBottom:8}}>🏅 Diet Badges</div>
      {DIET_BADGES.map(b=>{ const earned=(dietStats?.badges||[]).includes(b.id);
        return <div key={b.id} style={{...css.card,padding:12,border:`1px solid ${earned?"#43d9ad":"#1e1e2e"}`,background:earned?"#0d2416":"#13131f",opacity:earned?1:0.5,marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:24,width:40,height:40,borderRadius:10,background:earned?"#1a3020":"#0d0d14",display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${earned?"#43d9ad":"#2a2a42"}`,filter:earned?"none":"grayscale(1)",flexShrink:0}}>{b.icon}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><div style={{fontWeight:700}}>{b.name}</div>{earned&&<span style={{...css.chip("#43d9ad"),fontSize:10}}>Earned ✓</span>}</div>
              <div style={{fontSize:12,color:"#666"}}>{b.desc}</div>
            </div>
          </div>
        </div>;
      })}
    </div>
  );
}

// ── CHALLENGE DETAIL ──────────────────────────────────────────────────────────
function ChallengeDetail({challengeId,me,meUser,allUsers,isAdmin,onBack,onEdit}){
  const [challenge,setChallenge]=useState(null);
  const [participants,setParticipants]=useState([]);
  const [myCheckins,setMyCheckins]=useState({});
  const [tab,setTab]=useState("leaderboard");
  const [showCheckin,setShowCheckin]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [showAwardBadge,setShowAwardBadge]=useState(false);
  const [showHeadstart,setShowHeadstart]=useState(false);
  const [showManageAwards,setShowManageAwards]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [confetti,setConfetti]=useState(false);
  const [newBadges,setNewBadges]=useState([]);
  const [joining,setJoining]=useState(false);
  const [fitnessPassesLeft,setFitnessPassesLeft]=useState(WEEKLY_FITNESS_PASSES);

  useEffect(()=>{ return onSnapshot(doc(db,"challenges",challengeId),snap=>{ if(snap.exists()) setChallenge({id:snap.id,...snap.data()}); }); },[challengeId]);
  useEffect(()=>{ return onSnapshot(participantsCol(challengeId),snap=>{ setParticipants(snap.docs.map(d=>({id:d.id,...d.data()}))); }); },[challengeId]);
  useEffect(()=>{ return onSnapshot(checkinsCol(challengeId,me),snap=>{ const m={}; snap.docs.forEach(d=>{ m[d.id]=d.data(); }); setMyCheckins(m); }); },[challengeId,me]);

  // calculate fitness passes left this week
  useEffect(()=>{
    const weekStart=getWeekStart();
    const passesUsed=Object.entries(myCheckins).filter(([date,v])=>date>=weekStart&&v.usePass).length;
    setFitnessPassesLeft(Math.max(0,WEEKLY_FITNESS_PASSES-passesUsed));
  },[myCheckins]);

  async function handleJoin(){
    setJoining(true);
    await updateDoc(doc(db,"challenges",challengeId),{memberIds:arrayUnion(me)});
    const pRef=doc(db,"challenges",challengeId,"participants",me);
    const pSnap=await getDoc(pRef);
    if(!pSnap.exists()) await setDoc(pRef,{userId:me,userName:meUser.name,userInitials:meUser.initials,color:meUser.color,points:0,streak:0,longestStreak:0,completedDays:0,totalKm:0,earlyBird:false,badges:[],customBadges:[],passesUsed:0});
    setJoining(false);
  }

  async function handleCheckin(form,pts,date){
    const isEarly=date===TODAY&&new Date().getHours()<9;
    await setDoc(doc(db,"challenges",challengeId,"checkins",me,"days",date),{...form,pts,timestamp:serverTimestamp()});
    const pRef=doc(db,"challenges",challengeId,"participants",me);
    const pSnap=await getDoc(pRef);
    const prev=pSnap.exists()?pSnap.data():{userId:me,userName:meUser.name,userInitials:meUser.initials,color:meUser.color,points:0,streak:0,longestStreak:0,completedDays:0,totalKm:0,earlyBird:false,customBadges:[]};
    const allCheckins={...myCheckins,[date]:{...form,pts}};
    let streak=0,completedDays=0,totalKm=0;
    // count completed days (pass days don't count as completed but don't break streak)
    Object.entries(allCheckins).forEach(([,v])=>{ if(v.completed&&!v.usePass){ completedDays++; totalKm+=(+v.distance||0); } });
    // streak: consecutive days (pass days count as "not broken")
    const sortedDates=Object.keys(allCheckins).sort().reverse();
    let prevD=null;
    for(const d of sortedDates){
      const v=allCheckins[d];
      if(prevD===null){ if(d===TODAY){streak=1;prevD=d;}else break; }
      else{ if(daysBetween(d,prevD)===1){streak++;prevD=d;}else break; }
    }
    const longestStreak=Math.max(prev.longestStreak||0,streak);
    const updatedStats={...prev,points:(prev.points||0)+pts,streak,longestStreak,completedDays,totalKm,earlyBird:prev.earlyBird||isEarly};
    const td=challenge?totalDays(challenge):30;
    const before=FITNESS_BADGES.filter(b=>b.check(prev,td)).map(b=>b.id);
    const after=FITNESS_BADGES.filter(b=>b.check(updatedStats,td)).map(b=>b.id);
    const justEarned=after.filter(b=>!before.includes(b));
    if(justEarned.length) setNewBadges(justEarned);
    await setDoc(pRef,{...updatedStats,badges:after});
    setShowCheckin(false); setConfetti(true); setTimeout(()=>setConfetti(false),3000);
  }

  async function handleAwardBadge(targetUid,emoji,name){
    const pRef=doc(db,"challenges",challengeId,"participants",targetUid);
    const pSnap=await getDoc(pRef);
    if(pSnap.exists()){
      const existing=pSnap.data().customBadges||[];
      await updateDoc(pRef,{customBadges:[...existing,{emoji,name,awardedAt:TODAY,awardedBy:me}]});
    }
    setShowAwardBadge(false);
  }

  async function handleHeadstart(targetUid,pts,reason){
    const pRef=doc(db,"challenges",challengeId,"participants",targetUid);
    const pSnap=await getDoc(pRef);
    if(pSnap.exists()){
      const prev=pSnap.data();
      await updateDoc(pRef,{points:(prev.points||0)+pts,headstartLog:[...(prev.headstartLog||[]),{pts,reason,givenBy:me,givenAt:TODAY}]});
    }
    setShowHeadstart(false);
  }

  async function handleRemoveFromChallenge(targetUid){
    if(!window.confirm("Remove this user from the challenge?")) return;
    await updateDoc(doc(db,"challenges",challengeId),{memberIds:(challenge.memberIds||[]).filter(id=>id!==targetUid)});
    await deleteDoc(doc(db,"challenges",challengeId,"participants",targetUid));
  }

  async function handleDelete(){
    setDeleting(true);
    const pSnap=await getDocs(participantsCol(challengeId));
    for(const d of pSnap.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db,"challenges",challengeId));
    setDeleting(false); onBack();
  }

  if(!challenge) return <div style={{padding:40,textAlign:"center",color:"#555"}}>Loading…</div>;

  const isMember=(challenge.memberIds||[]).includes(me);
  const isOrganiser=challenge.createdBy===me||isAdmin;
  const upcoming=isUpcoming(challenge);
  const canEdit=upcoming&&isOrganiser;
  const checkedToday=!!myCheckins[TODAY];
  const myStats=participants.find(p=>p.userId===me);
  const tr=daysLeft(challenge); const td=totalDays(challenge); const elapsed=td-tr;
  const ranked=[...participants].sort((a,b)=>b.points-a.points);
  const medals=["🥇","🥈","🥉"];
  const TABS=["leaderboard","badges","progress","rules","members"];
  const missedCount=Math.max(0,elapsed-Object.keys(myCheckins).length);

  return(
    <div style={{paddingBottom:20}}>
      <Confetti active={confetti}/>
      {showCheckin&&<CheckInModal challenge={challenge} myCheckins={myCheckins} currentStreak={myStats?.streak||0} fitnessPassesLeft={fitnessPassesLeft} onClose={()=>setShowCheckin(false)} onSubmit={handleCheckin}/>}
      {showAwardBadge&&<AwardBadgeModal participants={participants} onClose={()=>setShowAwardBadge(false)} onAward={handleAwardBadge}/>}
      {showHeadstart&&<HeadstartModal participants={participants} onClose={()=>setShowHeadstart(false)} onGive={handleHeadstart}/>}
      {showManageAwards&&<ManageAwardsModal participants={participants} challengeId={challengeId} me={me} onClose={()=>setShowManageAwards(false)}/>}
      {newBadges.length>0&&(
        <div style={{position:"fixed",top:64,left:"50%",transform:"translateX(-50%)",zIndex:300,background:"#1a1630",border:"1px solid #8b7cf8",borderRadius:14,padding:"12px 20px",textAlign:"center",minWidth:220}}>
          <div style={{fontSize:11,color:"#888",marginBottom:4}}>Badge Unlocked! 🎉</div>
          {newBadges.map(bid=>{ const b=FITNESS_BADGES.find(x=>x.id===bid); return b?<div key={bid} style={{fontWeight:700,fontSize:15}}>{b.icon} {b.name}</div>:null; })}
          <button style={{fontSize:11,color:"#666",background:"none",border:"none",cursor:"pointer",marginTop:6}} onClick={()=>setNewBadges([])}>dismiss</button>
        </div>
      )}
      {showDeleteConfirm&&(
        <div style={css.overlay} onMouseDown={()=>setShowDeleteConfirm(false)}>
          <div style={css.sheet} onMouseDown={e=>e.stopPropagation()}>
            <div style={{textAlign:"center",marginBottom:18}}>
              <div style={{fontSize:36}}>🗑️</div>
              <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>Delete Challenge?</div>
              <div style={{color:"#888",fontSize:13}}>This will permanently delete <b style={{color:"#e8e8f0"}}>{challenge?.name}</b>.</div>
            </div>
            <button style={{...css.btn("primary"),width:"100%",background:"linear-gradient(135deg,#ff6584,#e04060)",marginBottom:8}} onClick={handleDelete} disabled={deleting}>{deleting?"Deleting…":"Yes, Delete"}</button>
            <button style={{...css.btn("secondary"),width:"100%"}} onClick={()=>setShowDeleteConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div style={{background:"linear-gradient(180deg,#1a1630 0%,#0d0d14 100%)",padding:"14px 14px 18px",borderBottom:"1px solid #1e1e2e"}}>
        <button style={{...css.btn("ghost",true),marginBottom:10}} onClick={onBack}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <span style={{fontSize:34}}>{challenge.emoji}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:19}}>{challenge.name}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              <span style={css.chip()}>{challenge.type}</span>
              {upcoming&&<span style={css.chip("#ffb347")}>⏳ Upcoming</span>}
              {!upcoming&&isActive(challenge)&&<span style={css.chip("#43d9ad")}>🟢 Active</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            {canEdit&&<button style={{...css.btn("ghost",true),fontSize:11}} onClick={()=>onEdit&&onEdit(challengeId)}>✏️ Edit</button>}
            {isOrganiser&&<button style={{...css.btn("secondary",true),color:"#ff6584",border:"1px solid #ff658444"}} onClick={()=>setShowDeleteConfirm(true)}>🗑️</button>}
          </div>
        </div>
        <p style={{color:"#888",fontSize:13,margin:"0 0 12px"}}>{challenge.description}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {[["Days",td,"📅"],[upcoming?"Starts in":"Left",upcoming?daysBetween(TODAY,challenge.startDate):tr,"⏳"],["Members",(challenge.memberIds||[]).length||participants.length,"👥"]].map(([l,v,ic])=>(
            <div key={l} style={{background:"#13131f",borderRadius:10,padding:"8px 4px",textAlign:"center",border:"1px solid #1e1e2e"}}>
              <div style={{fontSize:16}}>{ic}</div><div style={{fontWeight:800,fontSize:17,color:"#8b7cf8"}}>{v}</div><div style={{fontSize:10,color:"#666"}}>{l}</div>
            </div>
          ))}
        </div>
        {!upcoming&&<><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666",marginBottom:4}}><span>Progress</span><span>{pct(elapsed,td)}%</span></div><div style={css.bar}><div style={css.barFill(pct(elapsed,td))}/></div></>}
        {upcoming&&<div style={{fontSize:12,color:"#ffb347",marginTop:4}}>🗓 {challenge.startDate} → {challenge.endDate}</div>}
      </div>

      <div style={{padding:"12px 14px"}}>
        {/* Organiser tools — always visible to organiser once challenge has participants */}
        {isOrganiser&&participants.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",gap:8,marginBottom:6}}>
              <button style={{...css.btn("secondary"),flex:1,fontSize:12}} onClick={()=>setShowHeadstart(true)}>⚡ Headstart</button>
              <button style={{...css.btn("secondary"),flex:1,fontSize:12}} onClick={()=>setShowAwardBadge(true)}>🎖️ Award Badge</button>
            </div>
            <button style={{...css.btn("secondary"),width:"100%",fontSize:12,color:"#ff9848",border:"1px solid #ff984855"}} onClick={()=>setShowManageAwards(true)}>
              ⚙️ Manage / Remove Awards
            </button>
          </div>
        )}

        {/* Fitness passes */}
        {isMember&&!upcoming&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 12px",background:"#13131f",borderRadius:10,border:"1px solid #1e1e2e"}}>
            <span style={{fontSize:13,color:"#888"}}>🎫 Out passes:</span>
            <div style={{display:"flex",gap:5}}>
              {Array.from({length:WEEKLY_FITNESS_PASSES},(_,i)=><div key={i} style={{width:18,height:18,borderRadius:"50%",background:i<fitnessPassesLeft?"#8b7cf8":"#2a2a42",border:`2px solid ${i<fitnessPassesLeft?"#8b7cf8":"#444"}`}}/>)}
            </div>
            <span style={{fontSize:11,color:"#555"}}>this week</span>
          </div>
        )}

        {!isMember?(
          <div style={{background:"linear-gradient(135deg,#1a2a16,#13131f)",border:"1px solid #43d9ad",borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontWeight:700,marginBottom:4}}>🎯 {upcoming?"Join this upcoming challenge!":"Join this challenge!"}</div>
            <button style={{...css.btn("green"),width:"100%"}} onClick={handleJoin} disabled={joining}>{joining?"Joining…":"Join Challenge 🚀"}</button>
          </div>
        ):upcoming?(
          <div style={{background:"#1a2010",border:"1px solid #ffb347",borderRadius:12,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>⏳</span>
            <div><div style={{fontWeight:700,color:"#ffb347"}}>You're in! Starts {challenge.startDate}</div><div style={{fontSize:12,color:"#666"}}>Check-in opens on start date.</div></div>
          </div>
        ):!checkedToday?(
          <div style={{background:"linear-gradient(135deg,#1a1630,#13131f)",border:"1px solid #8b7cf8",borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontWeight:700,marginBottom:4}}>🎯 Log today's activity</div>
            {missedCount>0&&<div style={{fontSize:12,color:"#ffb347",marginBottom:6}}>⚠️ {missedCount} unlogged day{missedCount>1?"s":""} — use calendar to backfill.</div>}
            <button style={{...css.btn("primary"),width:"100%"}} onClick={()=>setShowCheckin(true)}>Check In Now ⚡</button>
          </div>
        ):(
          <div style={{marginBottom:12}}>
            <div style={{background:"#0d2416",border:"1px solid #43d9ad",borderRadius:12,padding:12,display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:22}}>✅</span>
              <div style={{flex:1}}><div style={{fontWeight:700,color:"#43d9ad",fontSize:13}}>Checked in today!</div></div>
              <button style={{...css.btn("ghost",true),fontSize:11}} onClick={()=>setShowCheckin(true)}>Edit ✏️</button>
            </div>
            {elapsed>1&&<button style={{...css.btn("secondary"),width:"100%",fontSize:12}} onClick={()=>setShowCheckin(true)}>📅 Log / edit a previous day</button>}
          </div>
        )}

        {myStats&&!upcoming&&(
          <div style={{...css.card,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center",marginBottom:12}}>
            {[[myStats.points,"pts","🏆"],[myStats.streak,"streak","🔥"],[myStats.longestStreak,"best","⭐"],[myStats.completedDays,"done","✅"]].map(([v,l,ic])=>(
              <div key={l}><div>{ic}</div><div style={{fontWeight:800,fontSize:17,color:"#8b7cf8"}}>{v}</div><div style={{fontSize:10,color:"#666"}}>{l}</div></div>
            ))}
          </div>
        )}

        <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto"}}>
          {TABS.map(t=><button key={t} style={{...css.btn(tab===t?"primary":"secondary",true),flexShrink:0,textTransform:"capitalize"}} onClick={()=>setTab(t)}>{t}</button>)}
        </div>

        {tab==="leaderboard"&&<>
          {ranked.map((r,i)=>(
            <div key={r.userId} style={{display:"flex",alignItems:"center",gap:12,padding:"14px",borderRadius:14,marginBottom:8,background:i===0?"linear-gradient(135deg,#1a1630,#13131f)":"#13131f",border:`1px solid ${i===0?"#8b7cf8":"#1e1e2e"}`}}>
              <span style={{fontSize:20,width:26,textAlign:"center",flexShrink:0}}>{medals[i]||`#${i+1}`}</span>
              <div style={css.avatar(r.color||"#8b7cf8",40)}>{r.userInitials||"?"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>{r.userName}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  <div style={{background:"#0d0d14",borderRadius:8,padding:"5px 6px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#666",marginBottom:2}}>POINTS</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#8b7cf8"}}>{r.points}</div>
                  </div>
                  <div style={{background:"#0d0d14",borderRadius:8,padding:"5px 6px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#666",marginBottom:2}}>STREAK</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#ff9848"}}>{r.streak}🔥</div>
                  </div>
                  <div style={{background:"#0d0d14",borderRadius:8,padding:"5px 6px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#666",marginBottom:2}}>DAYS</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#43d9ad"}}>{r.completedDays}</div>
                  </div>
                </div>
                {(r.customBadges||[]).length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                  {(r.customBadges||[]).map((b,i)=><span key={i} title={b.name} style={{fontSize:16}}>{b.emoji}</span>)}
                </div>}
                {(r.badges||[]).length>0&&<div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap"}}>{(r.badges||[]).slice(0,5).map(bid=>{ const b=FITNESS_BADGES.find(x=>x.id===bid); return b?<span key={bid} title={b.name} style={{fontSize:13}}>{b.icon}</span>:null; })}</div>}
              </div>
            </div>
          ))}
          {ranked.length===0&&<div style={{textAlign:"center",color:"#555",padding:24}}>No check-ins yet. Be first! 💪</div>}
        </>}

        {tab==="badges"&&<BadgesTab myStats={myStats} challengeTotalDays={td}/>}

        {tab==="progress"&&<>
          <div style={{fontWeight:700,marginBottom:8}}>Your Heatmap</div>
          <div style={css.card}>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {Array.from({length:td},(_,i)=>{ const d=new Date(challenge.startDate); d.setDate(d.getDate()+i); const key=d.toISOString().slice(0,10); const done=!!myCheckins[key]; const isPass=myCheckins[key]?.usePass; const isPast=key<=TODAY;
                return <div key={key} title={key} style={{width:14,height:14,borderRadius:3,background:isPass?"#ffb34766":done?"#8b7cf8":isPast?"#1e1e2e":"#0d0d14",border:`1px solid ${isPass?"#ffb347":done?"#8b7cf8":"#2a2a42"}`}}/>;
              })}
            </div>
            <div style={{fontSize:11,color:"#555",marginTop:8}}>🟣 Done &nbsp;🟠 Pass &nbsp;⬛ Missed &nbsp;░ Upcoming</div>
          </div>
          <div style={{fontWeight:700,marginBottom:8}}>Group Completion</div>
          {participants.map(p=>(
            <div key={p.userId} style={{...css.card,padding:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={css.avatar(p.color||"#8b7cf8",28)}>{p.userInitials||"?"}</div>
                <div style={{flex:1,fontWeight:600,fontSize:13}}>{p.userName}</div>
                <span style={{fontSize:12,color:"#8b7cf8",fontWeight:700}}>{pct(p.completedDays,elapsed||1)}%</span>
              </div>
              <div style={css.bar}><div style={css.barFill(pct(p.completedDays,elapsed||1),p.color||"#8b7cf8")}/></div>
            </div>
          ))}
        </>}

        {tab==="rules"&&(challenge.rules||[]).map((r,i)=>(
          <div key={i} style={{...css.card,padding:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>{r.label}</div><span style={css.chip("#43d9ad")}>+{r.points} pts</span>
          </div>
        ))}

        {tab==="members"&&participants.map(p=>(
          <div key={p.userId} style={css.card}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={css.avatar(p.color||"#8b7cf8",42)}>{p.userInitials||"?"}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700}}>{p.userName} {p.userId===me&&<span style={css.chip()}>You</span>}</div>
                {(p.customBadges||[]).length>0&&<div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>{p.customBadges.map((b,i)=><span key={i} title={b.name} style={{fontSize:15}}>{b.emoji}</span>)}</div>}
                {(p.headstartLog||[]).length>0&&<div style={{fontSize:11,color:"#ffb347",marginTop:2}}>⚡ {p.headstartLog.reduce((s,h)=>s+h.pts,0)} headstart pts</div>}
              </div>
              <div style={{textAlign:"right"}}><div style={{fontWeight:800,color:"#8b7cf8"}}>{p.points} pts</div><div style={{fontSize:11,color:"#666"}}>🔥{p.streak}</div></div>
              {(isAdmin||challenge?.createdBy===me)&&p.userId!==me&&(
                <button onClick={()=>handleRemoveFromChallenge(p.userId)} style={{...css.btn("secondary",true),color:"#ff6584",border:"1px solid #ff658444",padding:"5px 10px",flexShrink:0}}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CREATE CHALLENGE ──────────────────────────────────────────────────────────
const TEMPLATES=[
  {name:"30-Day Warrior",type:"Gym / Workout",days:30,desc:"30 days of consistent workouts.",rules:[{label:"Workout done",condition:"completed",points:1},{label:"Session > 45 min",condition:"duration_gt_45",points:2}]},
  {name:"10K Steps",type:"Steps",days:21,desc:"Hit 10,000 steps every day.",rules:[{label:"10k+ steps",condition:"steps_gte_10000",points:1},{label:"15k+ steps",condition:"steps_gte_15000",points:1}]},
  {name:"Run 50 KM",type:"Running",days:14,desc:"Accumulate 50 km in 2 weeks.",rules:[{label:"Run > 3 km",condition:"distance_gt_3",points:1},{label:"Run > 7 km",condition:"distance_gt_7",points:2}]},
  {name:"21-Day Discipline",type:"Custom",days:21,desc:"You define the rules.",rules:[{label:"Completed today",condition:"completed",points:1}]},
];

function ChallengeForm({me,meUser,initial,onSave,onBack,saveLabel="🚀 Create Challenge"}){
  const [step,setStep]=useState(0);
  const [saving,setSaving]=useState(false);
  const [useCustomDates,setUseCustomDates]=useState(!!initial?.useCustomDates);
  const [form,setForm]=useState(initial||{name:"",type:"Gym / Workout",days:30,startDate:TODAY,endDate:"",desc:"",rules:[{id:"r0",label:"",condition:"completed",points:1}]});
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  useEffect(()=>{
    if(!useCustomDates){ const end=new Date(form.startDate); end.setDate(end.getDate()+form.days-1); setF("endDate",end.toISOString().slice(0,10)); }
  },[form.days,form.startDate,useCustomDates]);
  function applyTpl(t){ setForm(p=>({...p,name:t.name,type:t.type,days:t.days,desc:t.desc,rules:t.rules.map((r,i)=>({...r,id:"r"+i}))})); setStep(1); }
  function addRule(){ setF("rules",[...form.rules,{id:"r"+Date.now(),label:"",condition:"completed",points:1}]); }
  function setRule(id,k,v){ setF("rules",form.rules.map(r=>r.id===id?{...r,[k]:v}:r)); }
  function delRule(id){ setF("rules",form.rules.filter(r=>r.id!==id)); }
  const isUpcomingChallenge=form.startDate>TODAY;
  async function save(){ setSaving(true); await onSave(form); setSaving(false); }
  return(
    <div style={{paddingBottom:20}}>
      <button style={{...css.btn("ghost",true),margin:"0 0 12px"}} onClick={onBack}>← Back</button>
      <div style={{fontWeight:800,fontSize:19,marginBottom:2}}>{saveLabel.includes("Create")?"Create":"Edit"} Challenge</div>
      <div style={{color:"#666",fontSize:12,marginBottom:14}}>Step {step+1} of 3</div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>{["Template","Details","Rules"].map((s,i)=><div key={s} style={{flex:1,height:3,borderRadius:999,background:i<=step?"#8b7cf8":"#1e1e2e"}}/>)}</div>

      {step===0&&!initial&&<>
        {TEMPLATES.map(t=><div key={t.name} onClick={()=>applyTpl(t)} style={{...css.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderColor:"#2a2a42"}}>
          <span style={{fontSize:26}}>{TYPE_ICONS[t.type]}</span>
          <div style={{flex:1}}><div style={{fontWeight:700}}>{t.name}</div><div style={{fontSize:12,color:"#666"}}>{t.desc}</div></div>
          <span style={{color:"#8b7cf8",fontSize:18}}>›</span>
        </div>)}
        <button style={{...css.btn("ghost"),width:"100%",marginTop:4}} onClick={()=>setStep(1)}>Start from scratch →</button>
      </>}
      {(step===1||(initial&&step===0))&&<>
        <div style={css.label}>Challenge Name *</div>
        <input value={form.name} onChange={e=>setF("name",e.target.value)} style={css.input} placeholder="e.g. Summer Shred"/>
        <div style={css.label}>Type</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{Object.entries(TYPE_ICONS).map(([t,ic])=><button key={t} style={css.btn(form.type===t?"primary":"secondary",true)} onClick={()=>setF("type",t)}>{ic} {t}</button>)}</div>
        <div style={css.label}>Duration</div>
        <div style={{display:"flex",gap:6,marginBottom:6}}>{[7,14,21,30].map(d=><button key={d} style={{...css.btn(!useCustomDates&&form.days===d?"primary":"secondary",true),flex:1}} onClick={()=>{setUseCustomDates(false);setF("days",d);}}>{d}d</button>)}</div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <Toggle on={useCustomDates} onChange={v=>setUseCustomDates(v)}/>
          <span style={{fontSize:13,color:"#888"}}>Set custom start & end dates</span>
        </div>
        {!useCustomDates&&<>
          <div style={css.label}>Start Date</div>
          <input type="date" value={form.startDate} onChange={e=>setF("startDate",e.target.value)} style={css.input}/>
          <div style={{fontSize:12,color:"#666",marginTop:6}}>End date: <b style={{color:"#e8e8f0"}}>{form.endDate}</b>{isUpcomingChallenge&&<span style={{...css.chip("#ffb347"),marginLeft:8}}>⏳ Upcoming</span>}</div>
        </>}
        {useCustomDates&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={css.label}>Start Date</div><input type="date" value={form.startDate} onChange={e=>setF("startDate",e.target.value)} style={css.input}/></div>
            <div><div style={css.label}>End Date</div><input type="date" value={form.endDate} min={form.startDate} onChange={e=>setF("endDate",e.target.value)} style={css.input}/></div>
          </div>
          {form.startDate&&form.endDate&&<div style={{fontSize:12,color:"#666",marginTop:6}}>{daysBetween(form.startDate,form.endDate)+1} days{form.startDate>TODAY&&<span style={{...css.chip("#ffb347"),marginLeft:8}}>⏳ Upcoming</span>}</div>}
        </>}
        <div style={css.label}>Description</div>
        <input value={form.desc||form.description||""} onChange={e=>setF("desc",e.target.value)} style={css.input} placeholder="What's this about?"/>
        <div style={{display:"flex",gap:8,marginTop:16}}>
          {!initial&&<button style={{...css.btn("secondary"),flex:1}} onClick={()=>setStep(0)}>← Back</button>}
          <button style={{...css.btn("primary"),flex:2}} onClick={()=>form.name.trim()&&form.endDate?setStep(initial?1:2):alert("Please enter a name and end date")}>Next: Rules →</button>
        </div>
      </>}
      {(step===2||(initial&&step===1))&&<>
        <div style={{fontWeight:700,marginBottom:10}}>Scoring rules</div>
        {form.rules.map((r,i)=>(
          <div key={r.id} style={{...css.card,marginBottom:8}}>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input value={r.label} onChange={e=>setRule(r.id,"label",e.target.value)} style={{...css.input,flex:1}} placeholder={`Rule ${i+1}`}/>
              <button style={{...css.btn("secondary",true),color:"#ff6584",padding:"6px 10px"}} onClick={()=>delRule(r.id)}>✕</button>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={r.condition} onChange={e=>setRule(r.id,"condition",e.target.value)} style={{...css.input,flex:2,padding:"8px 10px"}}>
                <option value="completed">Completed today</option>
                <option value="duration_gt_45">Duration &gt; 45 min</option>
                <option value="steps_gte_5000">Steps ≥ 5,000</option>
                <option value="steps_gte_10000">Steps ≥ 10,000</option>
                <option value="steps_gte_15000">Steps ≥ 15,000</option>
                <option value="distance_gt_3">Distance &gt; 3 km</option>
                <option value="distance_gt_7">Distance &gt; 7 km</option>
              </select>
              <input type="number" min={1} value={r.points} onChange={e=>setRule(r.id,"points",+e.target.value)} style={{...css.input,width:60}}/>
              <span style={{fontSize:12,color:"#666",flexShrink:0}}>pts</span>
            </div>
          </div>
        ))}
        <button style={{...css.btn("ghost"),width:"100%",marginBottom:14}} onClick={addRule}>+ Add Rule</button>
        <div style={{display:"flex",gap:8}}>
          <button style={{...css.btn("secondary"),flex:1}} onClick={()=>setStep(initial?0:1)}>← Back</button>
          <button style={{...css.btn("primary"),flex:2}} onClick={save} disabled={saving}>{saving?"Saving…":saveLabel}</button>
        </div>
      </>}
    </div>
  );
}

function CreateChallenge({me,meUser,onCreated,onBack}){
  async function handleSave(form){
    const c={name:form.name,type:form.type,emoji:TYPE_ICONS[form.type]||"⚡",startDate:form.startDate,endDate:form.endDate,description:form.desc||form.description||"",memberIds:[me],createdBy:me,status:"active",rules:form.rules.filter(r=>r.label),createdAt:serverTimestamp()};
    const ref=await addDoc(challengesCol(),c);
    await setDoc(doc(db,"challenges",ref.id,"participants",me),{userId:me,userName:meUser.name,userInitials:meUser.initials,color:meUser.color,points:0,streak:0,longestStreak:0,completedDays:0,totalKm:0,earlyBird:false,badges:[],customBadges:[],passesUsed:0});
    onCreated(ref.id);
  }
  return <ChallengeForm me={me} meUser={meUser} onSave={handleSave} onBack={onBack} saveLabel="🚀 Create Challenge"/>;
}

function EditChallenge({challenge,me,meUser,onSaved,onBack}){
  const initial={name:challenge.name,type:challenge.type,days:totalDays(challenge),startDate:challenge.startDate,endDate:challenge.endDate,desc:challenge.description||"",rules:challenge.rules||[],useCustomDates:true};
  async function handleSave(form){
    await updateDoc(doc(db,"challenges",challenge.id),{name:form.name,type:form.type,emoji:TYPE_ICONS[form.type]||"⚡",startDate:form.startDate,endDate:form.endDate,description:form.desc||form.description||"",rules:form.rules.filter(r=>r.label)});
    onSaved();
  }
  return <ChallengeForm me={me} meUser={meUser} initial={initial} onSave={handleSave} onBack={onBack} saveLabel="💾 Save Changes"/>;
}

function ChallengesList({challenges,me,onSelect,onCreate}){
  const mine=challenges.filter(c=>(c.memberIds||[]).includes(me));
  const joinable=challenges.filter(c=>!(c.memberIds||[]).includes(me));
  const active=mine.filter(c=>isActive(c));
  const myUpcoming=mine.filter(c=>isUpcoming(c));
  const joinableActive=joinable.filter(c=>isActive(c));
  const joinableUpcoming=joinable.filter(c=>isUpcoming(c));
  const SH=({label,color="#888"})=><div style={{fontWeight:700,fontSize:11,color,marginBottom:8,marginTop:16,letterSpacing:1}}>{label}</div>;
  const CC=({c,joined})=>{
    const tr=daysLeft(c); const td=totalDays(c); const elapsed=td-tr; const up=isUpcoming(c);
    return <div onClick={()=>onSelect(c.id)} style={{...css.card,cursor:"pointer",borderColor:joined?"#2a2a42":up?"#43d9ad44":"#8b7cf844"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:up?0:10}}>
        <span style={{fontSize:26}}>{c.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14}}>{c.name}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
            <span style={css.chip()}>{c.type}</span>
            {up&&<span style={css.chip("#ffb347")}>⏳ Upcoming</span>}
            {!joined&&<span style={css.chip("#43d9ad")}>Tap to join</span>}
          </div>
        </div>
        <div style={{textAlign:"right",fontSize:11,flexShrink:0}}>
          {up?<div style={{color:"#ffb347",fontWeight:700}}>in {daysBetween(TODAY,c.startDate)}d</div>:<div style={{color:"#ff9848",fontWeight:700}}>{tr}d left</div>}
          <div style={{color:"#555",marginTop:2}}>{(c.memberIds||[]).length} members</div>
        </div>
      </div>
      {!up&&<><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666",marginBottom:3,marginTop:8}}><span>Progress</span><span>{pct(elapsed,td)}%</span></div><div style={css.bar}><div style={css.barFill(pct(elapsed,td))}/></div></>}
      <div style={{fontSize:11,color:"#555",marginTop:up?8:6}}>{c.startDate} → {c.endDate}</div>
    </div>;
  };
  return(
    <div style={{paddingBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div><div style={{fontWeight:800,fontSize:20}}>Challenges</div><div style={{color:"#666",fontSize:12}}>{active.length} active · {myUpcoming.length} upcoming</div></div>
        <button style={css.btn("primary",true)} onClick={onCreate}>+ New</button>
      </div>
      {active.length>0&&<><SH label="YOUR ACTIVE" color="#8b7cf8"/>{active.map(c=><CC key={c.id} c={c} joined={true}/>)}</>}
      {myUpcoming.length>0&&<><SH label="YOUR UPCOMING" color="#ffb347"/>{myUpcoming.map(c=><CC key={c.id} c={c} joined={true}/>)}</>}
      {joinableActive.length>0&&<><SH label="ACTIVE — JOIN NOW" color="#43d9ad"/>{joinableActive.map(c=><CC key={c.id} c={c} joined={false}/>)}</>}
      {joinableUpcoming.length>0&&<><SH label="UPCOMING — JOIN BEFORE IT STARTS" color="#43d9ad"/>{joinableUpcoming.map(c=><CC key={c.id} c={c} joined={false}/>)}</>}
      {challenges.length===0&&<div style={{...css.card,textAlign:"center",color:"#555",padding:32}}>No challenges yet.<br/>Tap <b style={{color:"#8b7cf8"}}>+ New</b> to create one!</div>}
    </div>
  );
}

function HomeTab({uid,meUser,challenges,mineChallenges,onGoChallenge,onCreateChallenge}){
  const [myAllStats,setMyAllStats]=useState({});
  const [dietStats,setDietStats]=useState(null);
  useEffect(()=>{
    const unsubs=mineChallenges.map(c=>onSnapshot(doc(db,"challenges",c.id,"participants",uid),snap=>{ if(snap.exists()) setMyAllStats(p=>({...p,[c.id]:snap.data()})); }));
    const du=onSnapshot(dietStatsRef(uid),snap=>{ if(snap.exists()) setDietStats(snap.data()); });
    return()=>{ unsubs.forEach(u=>u()); du(); };
  },[uid,mineChallenges.map(c=>c.id).join(",")]);
  const fitnessPts=Object.values(myAllStats).reduce((s,p)=>s+(p.points||0),0);
  const dietPts=dietStats?.totalPoints||0;
  const totalPts=fitnessPts+dietPts;
  const maxStreak=Object.values(myAllStats).reduce((s,p)=>Math.max(s,p.streak||0),0);
  const allBadgeIds=[...new Set([...Object.values(myAllStats).flatMap(p=>p.badges||[]),...(dietStats?.badges||[])])];
  const customBadges=[...new Set(Object.values(myAllStats).flatMap(p=>p.customBadges||[]))];
  const activeChallenges=mineChallenges.filter(c=>isActive(c));
  const upcomingChallenges=mineChallenges.filter(c=>isUpcoming(c));
  return(
    <div style={{paddingBottom:20}}>
      <div style={{...css.card,background:"linear-gradient(135deg,#1a1630,#13131f)",border:"1px solid #8b7cf8",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
          <div style={css.avatar(meUser.color,50)}>{meUser.initials}</div>
          <div><div style={{fontWeight:800,fontSize:17}}>Hey, {meUser.name.split(" ")[0]} 👋</div><div style={{fontSize:12,color:"#666"}}>{TODAY}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center",marginBottom:14}}>
          {[[totalPts,"Total","🏆"],[fitnessPts,"Fitness","🏋"],[dietPts,"Diet","🥗"],[maxStreak,"Streak","🔥"]].map(([v,l,ic])=>(
            <div key={l} style={{background:"#0d0d14",borderRadius:10,padding:"6px 4px",border:"1px solid #1e1e2e"}}>
              <div style={{fontSize:14}}>{ic}</div><div style={{fontWeight:800,color:"#8b7cf8",fontSize:14}}>{v}</div><div style={{fontSize:9,color:"#666"}}>{l}</div>
            </div>
          ))}
        </div>
        {customBadges.length>0&&<>
          <div style={{fontWeight:700,fontSize:11,color:"#ffb347",marginBottom:6}}>🎖️ CUSTOM BADGES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {customBadges.map((b,i)=><div key={i} style={{background:"#0d0d14",border:"1px solid #ffb347",borderRadius:10,padding:"5px 9px",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:14}}>{b.emoji}</span><span style={{fontSize:9,color:"#ffb347",fontWeight:600}}>{b.name}</span>
            </div>)}
          </div>
        </>}
        {allBadgeIds.length>0&&<>
          <div style={{fontWeight:700,fontSize:11,color:"#888",marginBottom:6}}>YOUR BADGES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {allBadgeIds.map(bid=>{ const b=[...FITNESS_BADGES,...DIET_BADGES].find(x=>x.id===bid); if(!b) return null;
              return <div key={bid} style={{background:"#0d0d14",border:"1px solid #8b7cf8",borderRadius:10,padding:"5px 9px",display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:14}}>{b.icon}</span><span style={{fontSize:9,color:"#8b7cf8",fontWeight:600}}>{b.name}</span>
              </div>;
            })}
          </div>
        </>}
        {allBadgeIds.length===0&&customBadges.length===0&&<div style={{fontSize:12,color:"#555"}}>No badges yet — start checking in!</div>}
      </div>
      {activeChallenges.length>0&&<>
        <div style={{fontWeight:700,marginBottom:10}}>📅 Active Challenges</div>
        {activeChallenges.map(c=>(
          <div key={c.id} onClick={()=>onGoChallenge(c.id)} style={{...css.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>{c.emoji}</span>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{c.name}</div><div style={{fontSize:11,color:"#666"}}>{daysLeft(c)}d left · {(c.memberIds||[]).length} members</div></div>
            <span style={{color:"#8b7cf8",fontSize:18}}>›</span>
          </div>
        ))}
      </>}
      {upcomingChallenges.length>0&&<>
        <div style={{fontWeight:700,marginBottom:10,marginTop:16}}>⏳ Upcoming</div>
        {upcomingChallenges.map(c=>(
          <div key={c.id} onClick={()=>onGoChallenge(c.id)} style={{...css.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderColor:"#ffb34755"}}>
            <span style={{fontSize:24}}>{c.emoji}</span>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{c.name}</div><div style={{fontSize:11,color:"#666"}}>Starts in {daysBetween(TODAY,c.startDate)}d</div></div>
            <span style={css.chip("#ffb347")}>⏳</span>
          </div>
        ))}
      </>}
      {mineChallenges.length===0&&(
        <div style={{...css.card,textAlign:"center",padding:28}}>
          <div style={{fontSize:36,marginBottom:8}}>🏋</div>
          <div style={{fontWeight:700,marginBottom:4}}>No challenges yet</div>
          <div style={{color:"#666",fontSize:13,marginBottom:16}}>Create one and invite your friends!</div>
          <button style={{...css.btn("primary"),width:"100%"}} onClick={onCreateChallenge}>+ Create a Challenge</button>
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [uid,setUid]=useState(null);
  const [meUser,setMeUser]=useState(null);
  const [challenges,setChallenges]=useState([]);
  const [allUsers,setAllUsers]=useState([]);
  const [tab,setTab]=useState("home");
  const [selectedCid,setSelectedCid]=useState(null);
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    return onAuthStateChanged(auth,async user=>{
      if(user){
        setUid(user.uid);
        const userRef=doc(db,"users",user.uid);
        const snap=await getDoc(userRef);
        if(snap.exists()){ setMeUser({id:snap.id,...snap.data(),email:user.email}); }
        else{
          const newUser={id:user.uid,name:user.displayName||"User",initials:mkInitials(user.displayName||"U"),color:COLORS[Math.floor(Math.random()*COLORS.length)],badges:[],email:user.email||"",createdAt:serverTimestamp()};
          await setDoc(userRef,newUser); setMeUser(newUser);
        }
      } else { setUid(null); setMeUser(null); }
      setLoading(false);
    });
  },[]);

  useEffect(()=>{ return onSnapshot(challengesCol(),snap=>{ setChallenges(snap.docs.map(d=>({id:d.id,...d.data()}))); }); },[]);
  useEffect(()=>{ return onSnapshot(collection(db,"users"),snap=>{ setAllUsers(snap.docs.map(d=>({id:d.id,...d.data()}))); }); },[]);

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#0d0d14",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40}}>💪</div>
      <div style={{color:"#8b7cf8",fontWeight:700,fontSize:18}}>Sweat Squad</div>
      <div style={{color:"#555",fontSize:12}}>Loading…</div>
    </div>
  );
  if(!uid) return <LoginScreen/>;
  if(!meUser) return(
    <div style={{minHeight:"100vh",background:"#0d0d14",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40}}>💪</div>
      <div style={{color:"#8b7cf8",fontWeight:700}}>Setting up your profile…</div>
      <div style={{color:"#555",fontSize:12}}>This only takes a moment</div>
    </div>
  );

  const isAdmin=meUser?.email===ADMIN_EMAIL;
  const NAV=[{id:"home",icon:"🏠",label:"Home"},{id:"challenges",icon:"🏋",label:"Fitness"},{id:"diet",icon:"🥗",label:"Diet"},{id:"profile",icon:"👤",label:"Profile"}];
  const mineChallenges=challenges.filter(c=>(c.memberIds||[]).includes(uid));
  const editingChallenge=editing?challenges.find(c=>c.id===editing):null;

  return(
    <div style={css.app}>
      <div style={css.nav}>
        <span style={css.logo}>Sweat Squad 💪</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#43d9ad",boxShadow:"0 0 6px #43d9ad"}}/>
          <span style={{fontSize:11,color:"#43d9ad",fontWeight:600}}>Live</span>
          <div style={css.avatar(meUser.color,30)}>{meUser.initials}</div>
          <button onClick={()=>signOut(auth)} onMouseEnter={e=>{e.currentTarget.style.background="#2a1a1a";e.currentTarget.style.color="#ff6584";e.currentTarget.style.borderColor="#ff6584";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#888";e.currentTarget.style.borderColor="#2a2a42";}} style={{background:"none",border:"1px solid #2a2a42",borderRadius:8,color:"#888",fontSize:11,padding:"4px 8px",cursor:"pointer",transition:"all .15s"}}>Sign out</button>
        </div>
      </div>
      <div style={css.scroll}>
        <div style={css.inner}>
          {tab==="home"&&<HomeTab uid={uid} meUser={meUser} challenges={challenges} mineChallenges={mineChallenges} onGoChallenge={id=>{setSelectedCid(id);setTab("challenges");}} onCreateChallenge={()=>{setTab("challenges");setCreating(true);}}/>}
          {tab==="challenges"&&!selectedCid&&!creating&&!editing&&<ChallengesList challenges={challenges} me={uid} onSelect={id=>{setSelectedCid(id);setCreating(false);setEditing(null);}} onCreate={()=>setCreating(true)}/>}
          {tab==="challenges"&&creating&&!editing&&!selectedCid&&<CreateChallenge me={uid} meUser={meUser} onBack={()=>setCreating(false)} onCreated={id=>{setCreating(false);setSelectedCid(id);}}/>}
          {tab==="challenges"&&editing&&editingChallenge&&!selectedCid&&<EditChallenge challenge={editingChallenge} me={uid} meUser={meUser} onBack={()=>setEditing(null)} onSaved={()=>{setEditing(null);}}/>}
          {tab==="challenges"&&selectedCid&&!creating&&!editing&&<ChallengeDetail challengeId={selectedCid} me={uid} meUser={meUser} allUsers={allUsers} isAdmin={isAdmin} onBack={()=>setSelectedCid(null)} onEdit={id=>{setEditing(id);setSelectedCid(null);}}/>}
          {tab==="diet"&&<DietTab uid={uid}/>}
          {tab==="profile"&&<ProfileTab uid={uid} meUser={meUser} allUsers={allUsers} challenges={challenges} isAdmin={isAdmin}/>}
        </div>
      </div>
      <div style={css.tabBar}>
        {NAV.map(n=><button key={n.id} style={css.tab(tab===n.id)} onClick={()=>{setTab(n.id);setSelectedCid(null);setCreating(false);setEditing(null);}}><span style={{fontSize:18}}>{n.icon}</span><span>{n.label}</span></button>)}
      </div>
    </div>
  );
}