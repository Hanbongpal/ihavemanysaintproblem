const $=x=>document.getElementById(x), DAYS=["일","월","화","수","목","금","토"];
const ALARM_KEY="makeTimerAlarmsV2", PS_KEY="makeTimerPomoV1", UI_KEY="makeTimerUiV1";
const DEFAULTS={focusS:1500,restS:300,rounds:4,longRestS:900,longEvery:4,auto:true,noteOn:true,note:"",msg:"",
 msgFocus:"집중 종료 - 휴식 시간입니다.",msgRest:"휴식 종료 - 다시 집중하세요.",msgDone:"설정한 반복이 모두 끝났습니다.",youtube:""};
const clone=o=>JSON.parse(JSON.stringify(o));
function load(k,def){try{let v=JSON.parse(localStorage.getItem(k));return v==null?def:v}catch{return def}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function migrate(a){ // 예전 '분' 단위 저장값을 '초' 단위로 변환
 if(a.focus!=null&&a.focusS==null)a.focusS=a.focus*60;
 if(a.rest!=null&&a.restS==null)a.restS=a.rest*60;
 if(a.longRest!=null&&a.longRestS==null)a.longRestS=a.longRest*60;
 ["focus","rest","longRest"].forEach(k=>delete a[k]);
 return Object.assign(clone(DEFAULTS),a);
}
let alarms=load(ALARM_KEY,[]).map(migrate), ps=migrate(load(PS_KEY,{})), ui=load(UI_KEY,{"p-time":true});
let selected=[], pomo=false, lastMinute="", tab="alarm", ringPomo=false;
let P={phase:"idle",round:1,remaining:0,total:0,running:false,endAt:0,cfg:null};

function pad(n){return String(n).padStart(2,"0")}
function num(v,min,max,def){v=Math.round(+v);return isNaN(v)?def:Math.min(max,Math.max(min,v))}
function esc(t){return String(t).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function fmt(s){return pad(Math.floor(s/60))+":"+pad(s%60)}
function fmtDur(s){let m=Math.floor(s/60),r=s%60;return m?(r?m+"분 "+r+"초":m+"분"):r+"초"}
function fmtLong(t){let h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return (h?h+"시간 ":"")+(m?m+"분 ":"")+(s?s+"초":"")||"0초"}
function nt(c){return c&&c.noteOn&&c.note?c.note:""} // 노트가 켜져 있을 때만 노트 반환
function saveAlarms(){store(ALARM_KEY,alarms)}
function dayText(d){return !d.length?"한 번만":d.length===7?"매일":d.map(x=>DAYS[x]).join(" ")}

/* ---------- 공통: 접이식 상세 설정 폼 ---------- */
function acc(k,title,body,cls,extra){
 return `<div class="acc ${ui[k]?"open":""} ${cls||""}" data-k="${k}"><button type="button" class="acchead"><span>${title}</span><span class="headr">${extra||""}<span class="chev">▾</span></span></button><div class="accbody">${body}</div></div>`;
}
document.addEventListener("click",e=>{
 let sw=e.target.closest(".notesw");
 if(sw){ // 노트 켜기/끄기 스위치
  let on=!sw.classList.contains("on");sw.classList.toggle("on",on);sw.setAttribute("aria-checked",on);
  applyNoteState(sw.closest(".acc"),on);
  sw.dispatchEvent(new Event("change",{bubbles:true}));return;
 }
 let h=e.target.closest(".acchead");if(!h)return;
 let a=h.parentElement;a.classList.toggle("open");ui[a.dataset.k]=a.classList.contains("open");store(UI_KEY,ui);
});
function applyNoteState(a,on){
 if(!a)return;a.classList.toggle("noteoff",!on);
 let t=a.querySelector("textarea");if(t)t.disabled=!on;
}
function durRow(x,id,label,sec,dis){
 return `<label>${label}</label><div class="dur"><input type="number" min="0" id="${x}${id}M" value="${Math.floor(sec/60)}" ${dis}><span>분</span><input type="number" min="0" max="59" id="${x}${id}S" value="${sec%60}" ${dis}><span>초</span></div>`;
}
function settingsHtml(x,c,dis){
 dis=dis||"";
 const presets=[[1500,300,"25 / 5"],[3000,600,"50 / 10"],[5400,1200,"90 / 20"],[900,180,"15 / 3"]]
  .map(([f,r,t])=>`<button type="button" data-f="${f}" data-r="${r}" ${dis}>${t}</button>`).join("");
 const time=`<label>빠른 설정 (집중 / 휴식, 분)</label><div class="presets" id="${x}Presets">${presets}</div>
  ${durRow(x,"Focus","집중 시간",c.focusS,dis)}${durRow(x,"Rest","휴식 시간",c.restS,dis)}
  <label>반복 횟수</label><input type="number" min="1" max="99" id="${x}Rounds" value="${c.rounds}" ${dis}>
  ${durRow(x,"Long","긴 휴식 시간 (0 = 없음)",c.longRestS,dis)}
  <label>긴 휴식 간격 (몇 회마다, 0 = 없음)</label><input type="number" min="0" max="99" id="${x}Every" value="${c.longEvery}" ${dis}>
  <label class="chk"><input type="checkbox" id="${x}Auto" ${c.auto?"checked":""}> 다음 단계 자동 시작</label>
  <div class="info" id="${x}Total"></div>`;
 const note=`<div class="notefield"><label>노트 (화면과 알림에 함께 표시)</label><textarea id="${x}Note" rows="3" maxlength="300" placeholder="예: 수학 3단원 문제풀이" ${c.noteOn?"":"disabled"}>${esc(c.note)}</textarea><div class="info notehint">노트가 꺼져 있으면 화면·알림에 표시되지 않아요. (내용은 그대로 저장됩니다)</div></div>
  <div class="g-norm"><label>알람 알림 문구</label><input id="${x}Msg" maxlength="80" placeholder="알람 시간이 되었습니다." value="${esc(c.msg)}"></div>
  <div class="g-pomo"><label>집중 종료 알림 문구</label><input id="${x}MsgFocus" maxlength="80" value="${esc(c.msgFocus)}">
  <label>휴식 종료 알림 문구</label><input id="${x}MsgRest" maxlength="80" value="${esc(c.msgRest)}">
  <label>전체 종료 알림 문구</label><input id="${x}MsgDone" maxlength="80" value="${esc(c.msgDone)}"></div>`;
 const audio=`<label>YouTube 주소</label><input id="${x}Yt" placeholder="https://www.youtube.com/watch?v=..." value="${esc(c.youtube)}">
  <div class="info">알람/세션 시작 때 재생을 시도합니다. 브라우저 자동재생 정책상 화면을 한 번 클릭해야 할 수 있습니다.</div>`;
 const sw=`<span class="switch notesw ${c.noteOn?"on":""}" id="${x}NoteSw" role="switch" aria-checked="${!!c.noteOn}" aria-label="노트 사용"><i></i></span>`;
 return acc(x+"-time","⏱ 포모도로 시간 설정",time,"g-pomo")+acc(x+"-note","📝 알림 · 노트",note,c.noteOn?"":"noteoff",sw)+acc(x+"-audio","🎵 음원",audio);
}
function readForm(x){
 const v=id=>$(x+id), dur=(id,mn,mx,df)=>num(+v(id+"M").value*60+ +v(id+"S").value,mn,mx,df);
 return{focusS:dur("Focus",1,10800,DEFAULTS.focusS),restS:dur("Rest",1,3600,DEFAULTS.restS),longRestS:dur("Long",0,5400,DEFAULTS.longRestS),
  rounds:num(v("Rounds").value,1,99,DEFAULTS.rounds),longEvery:num(v("Every").value,0,99,DEFAULTS.longEvery),auto:v("Auto").checked,noteOn:v("NoteSw").classList.contains("on"),
  note:v("Note").value.trim(),msg:v("Msg").value.trim(),msgFocus:v("MsgFocus").value.trim(),msgRest:v("MsgRest").value.trim(),
  msgDone:v("MsgDone").value.trim(),youtube:v("Yt").value.trim()};
}
function setDur(x,id,sec){$(x+id+"M").value=Math.floor(sec/60);$(x+id+"S").value=sec%60}
function writeNums(x,c){setDur(x,"Focus",c.focusS);setDur(x,"Rest",c.restS);setDur(x,"Long",c.longRestS);$(x+"Rounds").value=c.rounds;$(x+"Every").value=c.longEvery}
function formChanged(x){
 let c=readForm(x);
 $(x+"Total").textContent="예상 총 시간: "+fmtLong(totalSeconds(c));
 document.querySelectorAll("#"+x+"Presets [data-f]").forEach(b=>b.classList.toggle("sel",+b.dataset.f===c.focusS&&+b.dataset.r===c.restS));
}
function bindForm(wrap,x,cb){
 $(wrap).onchange=()=>{let c=readForm(x);writeNums(x,c);if(cb)cb(c);formChanged(x)};
 document.querySelectorAll("#"+wrap+" [data-f]").forEach(b=>b.onclick=()=>{
  setDur(x,"Focus",+b.dataset.f);setDur(x,"Rest",+b.dataset.r);
  $(x+"FocusM").dispatchEvent(new Event("change",{bubbles:true}));
 });
 formChanged(x);
}

/* ---------- 알람 목록 ---------- */
function render(){
 if(tab!=="alarm")return;
 let main=$("main");
 if(!alarms.length){main.innerHTML='<div class="section">알람</div><div class="empty">등록된 알람이 없습니다.<br>오른쪽 위 + 버튼으로 추가하세요.</div>';return}
 main.innerHTML='<div class="section">알람</div>'+alarms.map((a,i)=>`
 <div class="alarm ${a.on?"":"off"}">
  <div><div class="alarmtime">${a.time}</div><div class="meta">${esc(a.label||"알람")} ${a.youtube?"· 🎵 YouTube":""}</div>
  <div class="sub">${dayText(a.days)}${a.pomo?` · 포모도로 ${fmtDur(a.focusS)}/${fmtDur(a.restS)} × ${a.rounds}`:""}</div>
  ${nt(a)?`<div class="sub">📝 ${esc(nt(a))}</div>`:""}</div>
  <div class="switch ${a.on?"on":""}" onclick="toggle(${i})"><i></i></div>
 </div>`).join("");
}
window.toggle=i=>{alarms[i].on=!alarms[i].on;saveAlarms();render()}

/* ---------- 알람 추가 시트 ---------- */
function setMode(p){pomo=p;$("pomoMode").classList.toggle("sel",p);$("onceMode").classList.toggle("sel",!p);$("aForm").classList.toggle("pm",p)}
function openSheet(){
 selected=[];$("sheet").classList.add("show");$("time").value="07:00";$("label").value="";
 $("aForm").innerHTML=settingsHtml("a",DEFAULTS);setMode(false);bindForm("aForm","a");
 $("days").innerHTML=DAYS.map((d,i)=>`<button type="button" class="day" data-day="${i}">${d}</button>`).join("");
 document.querySelectorAll(".day").forEach(b=>b.onclick=()=>{let n=+b.dataset.day;if(selected.includes(n)){selected=selected.filter(x=>x!==n);b.classList.remove("sel")}else{selected.push(n);b.classList.add("sel")}});
}
$("add").onclick=openSheet;$("cancel").onclick=()=>$("sheet").classList.remove("show");
$("onceMode").onclick=()=>setMode(false);$("pomoMode").onclick=()=>setMode(true);
$("save").onclick=()=>{
 let time=$("time").value;if(!time)return;
 alarms.push(Object.assign({time,days:[...selected].sort(),label:$("label").value.trim(),on:true,pomo,last:""},readForm("a")));
 alarms.sort((a,b)=>a.time.localeCompare(b.time));saveAlarms();render();$("sheet").classList.remove("show");
}

/* ---------- 시계 / 알람 울림 ---------- */
function clock(){
 let d=new Date(), current=pad(d.getHours())+":"+pad(d.getMinutes());
 $("now").textContent=current;$("date").textContent=d.toLocaleDateString("ko-KR",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
 if(current!==lastMinute){lastMinute=current;check(d,current)}
}
function check(d,current){
 alarms.forEach(a=>{
  if(!a.on||a.time!==current)return;
  let key=d.toDateString()+"|"+current;
  if(a.last===key)return;
  if(a.days.length&&!a.days.includes(d.getDay()))return;
  a.last=key;if(!a.days.length)a.on=false;saveAlarms();render();trigger(a);
 });
}
function youtubeId(url){
 try{let u=new URL(url);if(u.hostname.includes("youtu.be"))return u.pathname.slice(1);if(u.searchParams.get("v"))return u.searchParams.get("v");let m=u.pathname.match(/\/shorts\/([^/]+)/);return m?m[1]:""}catch{return""}
}
function playYT(url,h){
 let id=youtubeId(url);if(!id)return;
 $(h||"playerHolder").innerHTML=`<iframe class="player" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&loop=1&playlist=${encodeURIComponent(id)}" allow="autoplay; encrypted-media"></iframe>`;
}
function notify(title,body){if("Notification"in window&&Notification.permission==="granted")new Notification(title,{body})}
function pnotify(c,title,msg){notify(title,msg+(nt(c)?"\n📝 "+nt(c):""))}
function trigger(a){
 $("ringTime").textContent=a.time;$("ringLabel").textContent=a.label||"알람";
 $("ringNote").textContent=nt(a)?"📝 "+nt(a):"";$("ringNote").style.display=nt(a)?"block":"none";
 $("ringDetail").textContent=a.pomo?`포모도로 ${fmtDur(a.focusS)} 집중 → ${fmtDur(a.restS)} 휴식 × ${a.rounds}회`:(a.msg||"알람 시간이 되었습니다.");
 $("stop").textContent=a.pomo?"확인 · 포모도로 보기":"확인 / 알람 끄기";
 $("ring").classList.add("show");ringPomo=!!a.pomo;
 notify("⏰ "+(a.label||"알람"),(a.pomo?"포모도로를 시작합니다.":(a.msg||"설정한 시간이 되었습니다."))+(nt(a)?"\n📝 "+nt(a):""));
 if(a.pomo)pomoStart(a);else playYT(a.youtube,"playerHolder");
}
$("stop").onclick=()=>{
 $("ring").classList.remove("show");$("playerHolder").innerHTML="";
 if(ringPomo){ringPomo=false;$("pomoTab").click()}
}

/* ---------- 포모도로 엔진 ---------- */
function restLen(c,r){return c.longEvery>0&&c.longRestS>0&&r%c.longEvery===0?c.longRestS:c.restS}
function totalSeconds(c){let t=c.focusS*c.rounds;for(let r=1;r<c.rounds;r++)t+=restLen(c,r);return t}
function phaseLen(){let c=P.cfg;return P.phase==="focus"?c.focusS:restLen(c,P.round)}
function beep(){try{let c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.setValueAtTime(.2,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.8);o.start();o.stop(c.currentTime+.8)}catch{}}
function pomoStart(cfg){
 P={phase:"focus",round:1,remaining:0,total:0,running:true,endAt:0,cfg};
 P.total=P.remaining=phaseLen();P.endAt=Date.now()+P.remaining*1000;
 $("pomoPlayer").innerHTML="";if(cfg.youtube)playYT(cfg.youtube,"pomoPlayer");
 renderPomo();
}
function pomoMain(){
 if(P.phase==="idle"||P.phase==="done")return pomoStart(ps);
 if(P.running){P.remaining=Math.max(0,Math.ceil((P.endAt-Date.now())/1000));P.running=false}
 else{P.running=true;P.endAt=Date.now()+P.remaining*1000}
 renderPomo();
}
function pomoReset(){
 P={phase:"idle",round:1,remaining:0,total:0,running:false,endAt:0,cfg:null};
 $("pomoPlayer").innerHTML="";renderPomo();
}
function nextPhase(){
 let c=P.cfg;
 if(P.phase==="focus"){
  if(P.round>=c.rounds){
   P.phase="done";P.running=false;P.remaining=0;$("pomoPlayer").innerHTML="";
   pnotify(c,"포모도로 종료",c.msgDone||DEFAULTS.msgDone);beep();renderPomo();return;
  }
  P.phase="rest";pnotify(c,"집중 종료",c.msgFocus||DEFAULTS.msgFocus);
 }else{P.round++;P.phase="focus";pnotify(c,"휴식 종료",c.msgRest||DEFAULTS.msgRest)}
 beep();
 P.total=P.remaining=phaseLen();
 if(c.auto)P.endAt=Date.now()+P.remaining*1000;else P.running=false;
 renderPomo();
}
function pomoLoop(){
 if(P.running){P.remaining=Math.max(0,Math.ceil((P.endAt-Date.now())/1000));if(P.remaining<=0)nextPhase()}
 updatePomoUI();
}
function updatePomoUI(){
 let idle=P.phase==="idle",done=P.phase==="done",active=!idle&&!done,c=active?P.cfg:ps,s=idle?ps.focusS:P.remaining;
 document.title=P.running?fmt(s)+" · 메이크 타임머":"메이크 타임머";
 if(tab!=="pomo"||!$("pClock"))return;
 $("pClock").textContent=fmt(s);
 $("pPhase").textContent={idle:"준비",focus:"집중",rest:"휴식",done:"완료 🎉"}[P.phase];
 $("pPhase").className="pphase "+P.phase;
 $("pRound").textContent=(idle?0:P.round)+" / "+c.rounds+" 회"+(active&&!P.running?" · 일시정지":"");
 $("pBar").style.width=(P.total?Math.min(100,(1-P.remaining/P.total)*100):0)+"%";
 $("pMain").textContent=!active?"시작":P.running?"일시정지":"계속";
 let nv=$("pNoteView");nv.textContent=nt(c)?"📝 "+nt(c):"";nv.style.display=nt(c)?"":"none";
}
function renderPomo(){
 if(tab!=="pomo")return;
 let active=!(P.phase==="idle"||P.phase==="done"),dis=active?"disabled":"";
 $("main").innerHTML=`<div class="section">포모도로</div>
 <div class="pclock"><div class="pphase" id="pPhase"></div><div class="ptime" id="pClock"></div><div class="pbar"><i id="pBar"></i></div><div class="pround" id="pRound"></div></div>
 <div class="pnoteview" id="pNoteView"></div>
 <div class="pbtns"><button class="pmain" id="pMain"></button><button class="pres" id="pReset">초기화</button></div>
 <div class="section">상세 설정</div>
 ${active&&P.cfg!==ps?'<div class="info">알람에서 시작된 세션입니다. 아래 설정은 다음에 직접 시작할 때부터 적용됩니다.</div>':""}
 ${active&&P.cfg===ps?'<div class="info">진행 중에는 시간·횟수 설정이 잠깁니다. 초기화하면 다시 바꿀 수 있습니다.</div>':""}
 <div class="form pm" id="pForm">${settingsHtml("p",ps,dis)}</div>`;
 bindForm("pForm","p",c=>{Object.assign(ps,c);store(PS_KEY,ps);updatePomoUI()});
 $("pNote").oninput=()=>{ps.note=$("pNote").value.trim();store(PS_KEY,ps);updatePomoUI()};
 $("pMain").onclick=pomoMain;$("pReset").onclick=pomoReset;
 updatePomoUI();
}

/* ---------- 탭 / 시작 ---------- */
$("alarmTab").onclick=()=>{tab="alarm";$("alarmTab").classList.add("active");$("pomoTab").classList.remove("active");render()}
$("pomoTab").onclick=()=>{tab="pomo";$("pomoTab").classList.add("active");$("alarmTab").classList.remove("active");renderPomo()}
setInterval(clock,1000);setInterval(pomoLoop,250);
clock();render();
if("Notification"in window)document.addEventListener("click",()=>Notification.requestPermission(),{once:true});
