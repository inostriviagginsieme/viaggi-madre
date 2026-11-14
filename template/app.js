/* Webapp figlia: tutto il contenuto arriva da trip.json, generato dalla webapp madre. */
var T=null, LS="", S=null, KV=null, APP_VER="", AUTH=null, PUB=null;
var $=function(id){return document.getElementById(id);};
function esc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function safeUrl(u){u=String(u||"");return /^(https?:|tel:|mailto:)/i.test(u)?esc(u):"#";}
function pill(t,c){return '<span class="pill '+(c||"")+'">'+t+'</span>';}
function eur(n){return (Math.round(n*100)/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";}
function eur0(n){return Math.round(n).toLocaleString("it-IT")+" €";}
function toast(t){var d=document.createElement("div");
  d.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:96px;background:#2F3A3B;color:#FFFDF8;padding:10px 16px;border-radius:99px;font-size:13px;font-weight:800;z-index:1500;box-shadow:0 8px 20px rgba(0,0,0,.3);max-width:88vw;text-align:center";
  d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.style.transition="opacity .4s";d.style.opacity=0;setTimeout(function(){d.remove();},420);},2100);}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

/* ============ STATO: locale + chiavi sincronizzate ============ */
function save(){try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}}
function load(){
  var d=null;try{d=JSON.parse(localStorage.getItem(LS)||"null");}catch(e){}
  S=d||{};S.kv=S.kv||{};S.dirty=S.dirty||{};S.rev=S.rev||0;S.code=S.code||"";S.notified=S.notified||{};
  KV=S.kv;
  var mine=(T.people||[]).filter(function(p){return AUTH&&p.u===AUTH.u;})[0];S.me=mine?mine.id:null;
}
function g(k,def){return (KV[k]&&KV[k].v!=null)?KV[k].v:def;}
function put(k,v){KV[k]={v:v,ts:Date.now()};S.dirty[k]=1;save();schedSync();}
function keys(prefix){return Object.keys(KV).filter(function(k){return k.indexOf(prefix)===0&&KV[k].v!=null;});}
function person(id){return (T.people||[]).filter(function(p){return p.id===id;})[0];}
function me(){return person(S.me)||T.people[0];}
function av(p,small){
  if(!p)return "";
  var inner=p.face?'<img src="'+esc(p.face)+'" alt="">':esc((p.name||"?")[0].toUpperCase());
  return '<div class="av'+(small?" s":"")+'" style="background:'+esc(p.color)+'">'+inner+'</div>';
}

/* ============ PIANO ============ */
var POI={}, DAYS=[];
function plan(){
  var p=g("plan",null);
  if(!p){p={};DAYS.forEach(function(D){p[D.id]=D.items.slice();});}
  DAYS.forEach(function(D){p[D.id]=(p[D.id]||[]).filter(function(i){return POI[i];});});
  return p;
}
function parked(){return (g("parked",null)||T.parked||[]).filter(function(i){return POI[i];});}
function resetPlan(){if(!confirm("Rimetto il programma com'era all'inizio? Vale per tutto il gruppo."))return;
  var p={};DAYS.forEach(function(D){p[D.id]=D.items.slice();});put("plan",p);put("parked",(T.parked||[]).slice());renderAll();}
function toMin(s){var p=String(s||"09:00").split(":");return (+p[0])*60+(+p[1]||0);}
function hhmm(m){m=Math.round(m);var h=Math.floor(m/60)%24,x=m%60;return (h<10?"0":"")+h+":"+(x<10?"0":"")+x;}
function dur(m){var h=Math.floor(m/60),x=m%60;return h?(h+"h"+(x?(x<10?"0":"")+x:"")):(x+"'");}
function hav(a,b){var R=6371000,t=Math.PI/180,dl=(b.lat-a.lat)*t,dg=(b.lon-a.lon)*t,la=(a.lat+b.lat)/2*t,x=dg*Math.cos(la);return Math.sqrt(dl*dl+x*x)*R;}
function geo(p){return p&&typeof p.lat==="number"&&typeof p.lon==="number";}
function transfer(a,b){
  if(!geo(a)||!geo(b))return null;
  var d=hav(a,b)*1.28; if(d<95)return null;
  if(d<1500){var m=Math.max(3,Math.round(d/75));return {mode:"walk",min:m,d:d,txt:"a piedi "+m+" min · "+Math.round(d/10)*10+" m"};}
  var m2=b.trMin||(d>30000?Math.round(d/1000)+15:Math.round(d/380)+12);
  return {mode:"ride",min:m2,d:d,txt:"circa "+m2+" min"+(b.stop?" · "+b.stop:" con i mezzi o in taxi")};
}
function schedule(D){
  var ids=plan()[D.id]||[], t=toMin(D.start), out=[], prev=null, walked=0, cost=0, di=DAYS.indexOf(D), H=T.lodging;
  if(di>0&&geo(H)){var f=ids.map(function(i){return POI[i];}).filter(geo)[0]; if(f&&hav(H,f)>60)prev=H;}
  ids.forEach(function(id){
    var p=POI[id]; if(!p)return;
    var tr=transfer(prev,p); if(tr){t+=tr.min; if(tr.mode==="walk")walked+=tr.d;}
    var gap=0; if(p.at&&toMin(p.at)>t){gap=toMin(p.at)-t;t=toMin(p.at);}
    out.push({id:id,p:p,st:t,tr:tr,gap:gap,from:geo(prev)?prev:null});
    t+=(p.min||30); cost+=(+p.price||0);
    if(geo(p))prev=p;
  });
  var back=null;
  if(di<DAYS.length-1&&geo(H)&&prev&&hav(prev,H)>200){back=transfer(prev,{lat:H.lat,lon:H.lon,stop:"rientro all'alloggio"}); if(back){t+=back.min; if(back.mode==="walk")walked+=back.d;}}
  return {rows:out,end:t,km:walked/1000,cost:cost,back:back,last:prev};
}
function gmaps(from,to,mode){return 'https://www.google.com/maps/dir/?api=1&origin='+from.lat+','+from.lon+'&destination='+to.lat+','+to.lon+'&travelmode='+(mode==="walk"?"walking":(T.localMode||"transit"));}
function trLink(r){if(!r.tr||!r.from||!geo(r.p))return "";return ' <a href="'+gmaps(r.from,r.p,r.tr.mode)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-weight:800;white-space:nowrap">Maps</a>';}
function todayDay(){var s=localDate(new Date());for(var i=0;i<DAYS.length;i++)if(DAYS[i].date===s)return i;return -1;}
function localDate(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dlabel(D){return D.dow+" "+D.n+" "+D.mon;}
function dshort(D){return D.dow.slice(0,3)+" "+("0"+D.n).slice(-2)+" "+D.mon.slice(0,3);}
function stamp(D,txt,i){return '<div class="stamp'+(i%2?" g":"")+'">Fatto<br>'+esc(("0"+D.n).slice(-2)+" "+D.mon.slice(0,3))+'<br>'+esc(txt)+'</div>';}
function tk(cls,time,sub,title,meta,extra,click){return '<div class="tk '+cls+'"'+(click?' onclick="'+click+'"':'')+'><div class="h">'+time+(sub?'<small>'+sub+'</small>':'')+'</div><div class="bd"><b>'+title+'</b>'+(meta?'<div class="met">'+meta+'</div>':'')+'</div>'+(extra||'')+'</div>';}
function nowRow(){
  var di=todayDay(); if(di<0)return null;
  var s=schedule(DAYS[di]), now=new Date(), m=now.getHours()*60+now.getMinutes(), cur=null, next=null;
  s.rows.forEach(function(r){if(r.st<=m&&m<r.st+(r.p.min||30))cur=r; else if(r.st>m&&!next)next=r;});
  return {day:di,cur:cur,next:next};
}
function nowCard(){
  var nr=nowRow(), now=new Date(), dep=new Date(T.dates.start+"T"+(DAYS[0].start||"09:00")+":00"), ret=new Date(T.dates.end+"T23:59:00");
  var box=function(k,body){return '<div class="card nowc"><div class="k">'+k+'</div><div class="in">'+body+'</div></div>';};
  if(!nr){
    if(now>ret)return box("Viaggio concluso",'<h3>'+esc(T.title)+'</h3><div class="muted">Le foto stanno in Foto, il diario pure: è il momento del fotolibro.</div>');
    var dd=Math.ceil((dep-now)/86400000), todo=(T.todo||[]).filter(function(t){return !g("todo."+t.id)&&t.pri===1;}).length;
    return box("Imbarco tra "+dd+" giorn"+(dd===1?"o":"i"),'<h3>Si parte '+esc(dlabel(DAYS[0]).toLowerCase())+'</h3><div class="muted">'+(todo?todo+' prenotazioni urgenti ancora da fare.':'Le prenotazioni urgenti sono tutte spuntate.')+' Nei giorni del viaggio qui compaiono la tappa in corso e la prossima.</div>'+
      '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="go(\'s-altro\')">Prenotazioni</button><button class="btn sec" onclick="vTab=0;go(\'s-viaggio\')">'+esc(dshort(DAYS[0]))+'</button></div>');
  }
  var D=DAYS[nr.day], h="";
  if(nr.cur)h+='<h3>'+esc(nr.cur.p.n)+'</h3><div class="muted">dalle '+hhmm(nr.cur.st)+(nr.cur.p.sub?' · '+esc(nr.cur.p.sub):'')+'</div>';
  else if(nr.next)h+='<h3>Prossima tappa alle '+hhmm(nr.next.st)+'</h3>'; else h+='<h3>Giornata finita</h3>';
  if(nr.next)h+='<div class="muted" style="margin-top:6px">Poi: <b>'+esc(nr.next.p.n)+'</b> alle '+hhmm(nr.next.st)+(nr.next.tr?' · '+esc(nr.next.tr.txt):'')+'</div>';
  h+='<div class="row" style="margin-top:10px">'+(nr.cur?'<button class="btn sec" onclick="detail(\''+nr.cur.id+'\')">Scheda</button>':'')+(nr.next?'<button class="btn sec" onclick="detail(\''+nr.next.id+'\')">Prossima</button>':'')+'<button class="btn sec" onclick="vTab='+nr.day+';go(\'s-viaggio\')">La giornata</button></div>';
  return box("Adesso · "+esc(dshort(D)),h);
}

/* ============ SEZIONE VIAGGIO ============ */
var vTab=-1, LMAP=null, LLAY=null; /* -1 sintesi, 0..n giorni, 99 mappa */
function renderViaggio(){
  var ch='<button class="chip'+(vTab===-1?" on":"")+'" onclick="vTab=-1;renderViaggio()">Programma</button>';
  DAYS.forEach(function(D,i){ch+='<button class="chip'+(vTab===i?" on":"")+'" onclick="vTab='+i+';renderViaggio()">'+esc(D.dow.slice(0,3)+" "+("0"+D.n).slice(-2))+'</button>';});
  ch+='<button class="chip'+(vTab===99?" on":"")+'" onclick="vTab=99;renderViaggio()">Mappa</button>';
  $("vChips").innerHTML=ch;
  $("lmapWrap").style.display=vTab===99?"block":"none";
  if(vTab===99){$("vBody").innerHTML=mapChips();drawMap();return;}
  $("vBody").innerHTML=vTab===-1?planHtml():dayHtml(DAYS[vTab]);
}
function planHtml(){
  var h=nowCard(), nr=nowRow(), P=parked();
  h+='<div class="card soft"><h3>Il programma</h3><p class="muted" style="margin-top:6px">'+esc(T.planIntro||"")+' Tocca un biglietto per spostare la tappa, cambiarne l\'ordine o toglierla: orari, tragitti, costi e mappa si ricalcolano.'+(syncOn()?' Le modifiche valgono per tutto il gruppo.':'')+'</p>'+
    '<div class="grid2" style="margin-top:10px"><button class="btn sec" onclick="resetPlan()">Ripristina</button><button class="btn sec" onclick="openSearch()">Cerca</button><button class="btn sec" onclick="vTab=99;renderViaggio()">Mappa</button><button class="btn sec" onclick="openPrintPage()">Stampabile</button></div></div>';
  var tk0=0,tc=0,tn=0;
  DAYS.forEach(function(D,di){
    var s=schedule(D), k=0; tk0+=s.km;tc+=s.cost;tn+=s.rows.length;
    h+='<button class="dh" style="--dc:'+esc(D.c)+'" onclick="vTab='+di+';renderViaggio()"><b>'+esc(dshort(D))+'</b><span>Giorno '+(di+1)+' di '+DAYS.length+'</span></button><div class="dsub">'+esc(D.title)+'</div>'+
      '<div class="daystats">'+pill("fino alle "+hhmm(s.end))+pill("a piedi "+s.km.toFixed(1)+" km")+pill("circa "+eur0(s.cost)+" a testa")+'</div>';
    s.rows.forEach(function(r,i){
      if(r.tr)h+='<div class="trf"><span>'+esc(r.tr.txt)+'</span>'+trLink(r)+'</div>';
      if(r.gap>20&&i>0)h+='<div class="trf"><span>tempo libero · '+dur(r.gap)+'</span></div>';
      var dn=g("ev."+r.id), isNow=nr&&nr.cur&&nr.cur.id===r.id&&nr.day===di;
      h+=tk((r.p.kind==="fix"?"fix ":"")+(dn?"done ":"")+(isNow?"now":""),hhmm(r.st),dur(r.p.min||30),esc(r.p.n),esc([r.p.sub,r.p.priceTxt].filter(Boolean).join(" · ")),dn?stamp(D,(r.p.n||"").split(" ")[0].slice(0,7),k++):"","tapItem('"+D.id+"','"+r.id+"')");
    });
    if(s.back)h+='<div class="trf"><span>rientro · '+esc(s.back.txt)+'</span></div>';
  });
  h+='<div class="tt">Tappe di riserva</div><p class="dsub">Quello che togli dai giorni finisce qui, insieme alle proposte di riserva. Si rimette dove vuoi.</p>';
  if(!P.length)h+='<div class="card flat muted">Niente da parte.</div>';
  P.forEach(function(id){var p=POI[id];h+=tk("pk","+","",esc(p.n),esc([p.sub,p.priceTxt].filter(Boolean).join(" · ")),"","tapItem('parked','"+id+"')");});
  h+='<div class="tt">Il viaggio in numeri</div><div class="card"><div class="kv"><b>Tappe</b><span>'+tn+' in '+DAYS.length+' giorni, '+P.length+' di riserva</span></div><div class="kv"><b>A piedi</b><span>circa '+tk0.toFixed(1)+' km in totale</span></div><div class="kv"><b>Ingressi e pasti</b><span>circa '+eur0(tc)+' a testa secondo il programma. Il quadro completo è in Conti.</span></div></div>';
  return h;
}
function dayHtml(D){
  var s=schedule(D), di=DAYS.indexOf(D), k=0, h='<div class="dh" style="--dc:'+esc(D.c)+'"><b>'+esc(dshort(D))+'</b><span>Giorno '+(di+1)+' di '+DAYS.length+'</span></div><div class="card soft" style="border-top-color:'+esc(D.c)+'"><h3>'+esc(D.title)+'</h3><p class="muted" style="margin:6px 0 0">'+esc(D.intro||"")+'</p><div class="daystats" style="margin:10px 0 0">'+pill(D.start+" → "+hhmm(s.end))+pill("a piedi "+s.km.toFixed(1)+" km")+pill("circa "+eur0(s.cost)+" a testa")+'</div></div>';
  s.rows.forEach(function(r,i){
    var p=r.p, dn=g("ev."+r.id);
    if(r.tr)h+='<div class="trf"><span>'+esc(r.tr.txt)+'</span>'+trLink(r)+'</div>';
    if(r.gap>20&&i>0)h+='<div class="trf"><span>tempo libero · '+dur(r.gap)+'</span></div>';
    h+='<div class="tk'+(p.kind==="fix"?" fix":"")+'"><div class="h">'+hhmm(r.st)+'<small>'+dur(p.min||30)+'</small>'+(dn?'<div class="stamp sm'+(k++%2?" g":"")+'">Fatto<br>'+esc(("0"+D.n).slice(-2)+" "+D.mon.slice(0,3))+'</div>':'')+'</div>'+
      '<div class="bd"><b style="font-size:16.5px">'+esc(p.n)+'</b><div class="met">'+esc(p.sub||"")+'</div><div style="font-size:13.5px;line-height:1.45;margin-top:7px">'+esc(p.desc||"")+'</div>'+
      (p.tip?'<div class="tip"><b>Da sapere</b>'+esc(p.tip)+'</div>':"")+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:9px">'+(p.priceTxt?pill(esc(p.priceTxt),"y"):"")+(p.stop?pill(esc(p.stop)):"")+'</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"><button class="btn'+(dn?" sec":"")+'" style="padding:8px 10px" onclick="tickEv(\''+r.id+'\')">'+(dn?"Togli il timbro":"Timbra: fatta")+'</button>'+(p.url?'<a class="btn sec" style="padding:8px 10px" href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">'+esc(p.urlTxt||"Sito")+'</a>':"")+
      (geo(p)?'<a class="btn sec" style="padding:8px 10px" href="https://www.google.com/maps/dir/?api=1&destination='+p.lat+','+p.lon+'" target="_blank" rel="noopener">Portami lì</a>':"")+
      (p.kind!=="fix"?'<button class="btn ghost" style="padding:8px 10px" onclick="tapItem(\''+D.id+'\',\''+r.id+'\')">Sposta</button>':"")+'</div></div></div>';
  });
  if(s.back)h+='<div class="trf"><span>rientro · '+esc(s.back.txt)+'</span></div>';
  if(!s.rows.length)h+='<div class="card flat muted">Giornata vuota: aggiungi tappe da quelle di riserva, nel Programma.</div>';
  return h;
}
function tickEv(id){put("ev."+id,g("ev."+id)?0:1);renderViaggio();}
function listOf(k){return k==="parked"?parked():(plan()[k]||[]);}
function commit(k,arr,P){if(k==="parked")put("parked",arr);else{P[k]=arr;}}
function tapItem(from,id){
  var p=POI[id], h='<div class="grab"></div><h3>'+esc(p.ico||"")+' '+esc(p.n)+'</h3><div class="muted small" style="margin-bottom:10px">'+esc(p.sub||"")+'</div>';
  h+='<button class="opt" onclick="detail(\''+id+'\')"><span class="dot" style="background:var(--gold)"></span>Leggi la scheda completa</button>';
  if(from!=="parked")h+='<button class="opt" onclick="tickEv(\''+id+'\');closeSheet()"><span class="dot" style="background:var(--sage)"></span>'+(g("ev."+id)?"Togli il timbro":"Timbra: tappa fatta")+'</button>';
  if(p.kind==="fix"&&from!=="parked")h+='<div class="muted small" style="padding:12px 4px 0">Tappa fissa (viaggio, alloggio o trasferimento): non si sposta.</div>';
  else{
    if(from!=="parked"){h+='<button class="opt" onclick="shift(\''+from+'\',\''+id+'\',-1)"><span class="dot" style="background:var(--navy2)"></span>Sposta più presto nella giornata</button><button class="opt" onclick="shift(\''+from+'\',\''+id+'\',1)"><span class="dot" style="background:var(--navy2)"></span>Sposta più tardi nella giornata</button>';}
    DAYS.forEach(function(D){if(D.id!==from)h+='<button class="opt" onclick="moveTo(\''+from+'\',\''+id+'\',\''+D.id+'\')"><span class="dot" style="background:'+esc(D.c)+'"></span>Sposta a '+esc(dlabel(D))+'</button>';});
    if(from!=="parked")h+='<button class="opt" onclick="moveTo(\''+from+'\',\''+id+'\',\'parked\')"><span class="dot" style="background:var(--wine)"></span>Togli dal programma (va tra le tappe da parte)</button>';
  }
  h+='<button class="opt" onclick="closeSheet()" style="justify-content:center;color:var(--ink2)">Annulla</button>';
  openSheet(h);
}
function moveTo(from,id,to){
  var P=plan(), K=parked(), a=from==="parked"?K:P[from], i=a.indexOf(id); if(i<0)return; a.splice(i,1);
  if(to==="parked")K.push(id);
  else{var b=P[to],pos=b.length;
    for(var j=b.length-1;j>=0;j--){var q=POI[b[j]]; if(q&&q.kind==="fix")pos=j; else break;}
    b.splice(pos,0,id);}
  put("plan",P);put("parked",K);closeSheet();renderViaggio();toast(to==="parked"?"Tolta: la ritrovi tra le tappe da parte":"Spostata. Orari e mappa aggiornati");
}
function shift(day,id,dir){var P=plan(),a=P[day],i=a.indexOf(id),j=i+dir;if(i<0||j<0||j>=a.length)return closeSheet();a[i]=a[j];a[j]=id;put("plan",P);closeSheet();renderViaggio();}
function detail(id){
  var p=POI[id], h='<div class="grab"></div><h3>'+esc(p.n)+'</h3><div class="muted small" style="margin:4px 0 10px">'+esc(p.sub||"")+'</div><div style="font-size:14.5px;line-height:1.5">'+esc(p.desc||"")+'</div><div style="margin-top:12px">';
  if(p.priceTxt)h+='<div class="kv"><b>Costo</b><span>'+esc(p.priceTxt)+'</span></div>';
  if(p.min)h+='<div class="kv"><b>Durata</b><span>'+dur(p.min)+'</span></div>';
  if(p.stop)h+='<div class="kv"><b>Come</b><span>'+esc(p.stop)+'</span></div>';
  h+='</div>'+(p.tip?'<div class="tip"><b>Da sapere</b>'+esc(p.tip)+'</div>':"");
  var dd=WDOCS.filter(function(d){return d.poi===id;});
  dd.forEach(function(d){h+=docRow(d);});
  h+='<button class="btn sec full" style="margin-top:10px" onclick="pickDocFor(\''+id+'\')">Aggiungi biglietto o documento</button>';
  if(p.url)h+='<a class="btn full" style="margin-top:8px" href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">'+esc(p.urlTxt||"Apri il sito")+'</a>';
  if(geo(p))h+='<a class="btn ghost full" style="margin-top:8px" href="https://www.google.com/maps/dir/?api=1&destination='+p.lat+','+p.lon+'" target="_blank" rel="noopener">Portami lì da dove sono (Google Maps)</a>';
  h+='<button class="opt" onclick="closeSheet()" style="justify-content:center;color:var(--ink2);margin-top:6px">Chiudi</button>';
  openSheet(h);
}
function openSheet(h){$("sheet").innerHTML=h;$("sheetbg").classList.add("on");}
function closeSheet(){$("sheetbg").classList.remove("on");}

/* -- mappa -- */
var mapFilter="all";
function mapChips(){var h='<div class="chips"><button class="chip'+(mapFilter==="all"?" on":"")+'" onclick="mapFilter=\'all\';renderViaggio()">Tutto</button>';
  DAYS.forEach(function(D){h+='<button class="chip'+(mapFilter===D.id?" on":"")+'" onclick="mapFilter=\''+D.id+'\';renderViaggio()">'+esc(D.dow.slice(0,3)+" "+D.n)+'</button>';});return h+'</div>';}
function drawMap(){
  if(!window.L){$("lmap").innerHTML='<div class="muted small" style="padding:20px">Mappa non disponibile su questo telefono.</div>';return;}
  if(!LMAP){LMAP=L.map("lmap",{zoomControl:true,attributionControl:true}).setView([T.dest.lat||0,T.dest.lon||0],12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(LMAP);LLAY=L.layerGroup().addTo(LMAP);}
  LLAY.clearLayers(); var all=[];
  function ic(c,t){return L.divIcon({className:"",html:'<div class="pin" style="background:'+c+'">'+t+'</div>',iconSize:[26,26],iconAnchor:[13,13]});}
  if(geo(T.lodging)){L.marker([T.lodging.lat,T.lodging.lon],{icon:ic("#2F3A3B","🛏")}).addTo(LLAY).bindPopup("<b>"+esc(T.lodging.n||"Alloggio")+"</b>");all.push([T.lodging.lat,T.lodging.lon]);}
  DAYS.filter(function(D){return mapFilter==="all"||mapFilter===D.id;}).forEach(function(D){
    var pts=[], n=0;
    schedule(D).rows.forEach(function(r){if(!geo(r.p))return; n++; var ll=[r.p.lat,r.p.lon]; pts.push(ll); all.push(ll);
      var m=L.marker(ll,{icon:ic(D.c,n)}).addTo(LLAY); m.on("click",function(){detail(r.id);});});
    if(pts.length>1)L.polyline(pts,{color:D.c,weight:4,opacity:.8}).addTo(LLAY);
  });
  setTimeout(function(){LMAP.invalidateSize(); if(all.length)LMAP.fitBounds(all,{padding:[30,30],maxZoom:15});},60);
}

/* ============ GRUPPO ============ */
function renderGruppo(){
  var h=nowCard()+'<div class="tt">Passeggeri</div><div class="card"><div class="ppl">';
  T.people.forEach(function(p){h+='<div class="pp'+(S.me===p.id?" me":"")+'">'+av(p)+esc(p.name)+(S.me===p.id?'<div class="pill b" style="margin-top:5px">sei tu</div>':'')+'</div>';});
  h+='</div><p class="muted" style="margin:10px 0 0">Sei entrato come <b>'+esc(me().name)+'</b>: foto, spese, diario e lista bagagli portano il tuo nome.</p>'+
    '<div class="row" style="margin-top:12px"><button class="btn" onclick="shareLink()">Condividi l\'app</button><button class="btn sec" onclick="copyLink()">Copia link</button></div></div>';
  if(T.program)h+='<div class="tt">Il programma di massima</div><div class="card"><div style="font-size:14px;white-space:pre-wrap">'+esc(T.program)+'</div></div>';
  if((T.refs||[]).length){h+='<div class="tt">Reference condivise</div><div class="card">';T.refs.forEach(function(r){h+='<div class="kv"><span><a href="'+safeUrl(r.u)+'" target="_blank" rel="noopener">'+esc(r.t||r.u)+'</a></span></div>';});h+='</div>';}
  h+=syncCard();
  $("s-gruppo").innerHTML=h;
}
function shareLink(){var u=location.href.split("#")[0];if(navigator.share)navigator.share({title:T.title,url:u}).catch(function(){});else copyLink();}
function copyLink(){var u=location.href.split("#")[0];if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(function(){toast("Link copiato");},function(){prompt("Copia il link:",u);});else prompt("Copia il link:",u);}

/* ============ META ============ */
var WX=null;
function wxIco(c){c=+c;if(c===0)return ["☀️","sereno"];if(c<=2)return ["🌤","poco nuvoloso"];if(c===3)return ["☁️","coperto"];if(c<=48)return ["🌫","nebbia"];if(c<=57)return ["🌦","pioviggine"];if(c<=67)return ["🌧","pioggia"];if(c<=77)return ["🌨","neve"];if(c<=82)return ["🌦","rovesci"];if(c<=86)return ["🌨","neve"];return ["⛈","temporale"];}
function loadWx(){
  try{var c=JSON.parse(localStorage.getItem(LS+"_wx")||"null");if(c)WX=c;}catch(e){}
  if(navigator.onLine===false||!T.dest.lat)return;
  fetch("https://api.open-meteo.com/v1/forecast?latitude="+T.dest.lat+"&longitude="+T.dest.lon+"&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16")
   .then(function(r){return r.json();}).then(function(j){if(!j||!j.current)return;WX={ts:Date.now(),cur:j.current,daily:j.daily};try{localStorage.setItem(LS+"_wx",JSON.stringify(WX));}catch(e){} if($("s-meta").classList.contains("on"))renderMeta();}).catch(function(){});
}
function wxHtml(){
  if(!WX)return '<div class="card flat"><div class="muted small">Meteo di '+esc(T.dest.name)+': si aggiorna appena c\'è rete.</div></div>';
  var c=WX.cur, ic=wxIco(c.weather_code), age=Math.round((Date.now()-WX.ts)/60000);
  var h='<div class="card"><div class="wx"><div class="big">'+ic[0]+'</div><div><div class="t">'+Math.round(c.temperature_2m)+'°</div><div class="muted small">'+esc(T.dest.name)+' adesso · '+ic[1]+'</div></div></div>', rows="";
  if(WX.daily&&WX.daily.time){var d=WX.daily;
    DAYS.forEach(function(D){var i=d.time.indexOf(D.date); if(i<0)return; var w=wxIco(d.weather_code[i]);
      rows+='<div style="border-top:3px solid '+esc(D.c)+'"><span>'+w[0]+'</span>'+esc(D.dow.slice(0,3)+" "+D.n)+'<br>'+Math.round(d.temperature_2m_max[i])+'° / '+Math.round(d.temperature_2m_min[i])+'°<br>pioggia '+(d.precipitation_probability_max[i]==null?'–':d.precipitation_probability_max[i]+'%')+'</div>';});}
  h+=rows?'<div class="wxd">'+rows+'</div>':'<div class="muted small" style="margin-top:8px">Le previsioni per i giorni del viaggio compaiono qui da 16 giorni prima della partenza.</div>';
  return h+'<div class="muted small" style="margin-top:8px">Dati Open-Meteo, aggiornati '+(age<2?'adesso':age+' min fa')+'.</div></div>';
}
function speak(t){try{var u=new SpeechSynthesisUtterance(t);u.lang=T.dest.langCode||"en-US";u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){toast("Questo telefono non legge ad alta voce");}}
function renderMeta(){
  var I=T.info||{}, h='<div class="card soft"><h3>'+esc(T.dest.name)+(T.dest.country?', '+esc(T.dest.country):'')+'</h3><p style="font-size:14px;margin-top:8px">'+esc(I.intro||"")+'</p></div>';
  if((I.photos||[]).length){h+='<div class="ph">';I.photos.forEach(function(p){h+='<figure><img src="'+esc(p.u)+'" alt="" loading="lazy"><figcaption>'+esc(p.cap||"")+(p.credit?' · '+esc(p.credit):'')+'</figcaption></figure>';});h+='</div>';}
  h+='<div class="tt">Meteo</div>'+wxHtml();
  if(I.climate)h+='<div class="card"><div style="font-size:13.5px">'+esc(I.climate)+'</div></div>';
  if(I.history)h+='<div class="tt">La storia in breve</div><div class="card"><div style="font-size:14px;white-space:pre-wrap">'+esc(I.history)+'</div></div>';
  if((I.facts||[]).length){h+='<div class="tt">In breve</div><div class="card">';I.facts.forEach(function(r){h+='<div class="kv"><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>';});h+='</div>';}
  (I.cards||[]).forEach(function(c){h+='<div class="tt">'+esc(c.t)+'</div><div class="card">';(c.h||[]).forEach(function(r){h+='<div class="kv"><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>';});if(c.note)h+='<div class="tip"><b>Nota</b>'+esc(c.note)+'</div>';h+='</div>';});
  if((I.phrases||[]).length){h+='<div class="tt">Quattro parole sul posto</div><div class="card">';I.phrases.forEach(function(r,i){h+='<div class="kv"><b>'+esc(r.it)+'</b><span>'+esc(r.loc)+(r.pron?' · <i>'+esc(r.pron)+'</i>':'')+(("speechSynthesis" in window)?'<button class="say" onclick="speak(T.info.phrases['+i+'].loc)">🔊</button>':'')+'</span></div>';});h+='</div>';}
  if(I.source)h+='<p class="muted small">'+esc(I.source)+'</p>';
  $("s-meta").innerHTML=h;
}

/* ============ ARRIVO ============ */
function openTripDoc(i){var d=(T.docs||[])[i];if(!d)return;try{var b=atob(d.data.split(",")[1]),u=new Uint8Array(b.length);for(var k=0;k<b.length;k++)u[k]=b.charCodeAt(k);var w=window.open(URL.createObjectURL(new Blob([u],{type:d.type})),"_blank");if(!w)toast("Il telefono ha bloccato la finestra: consenti i popup");}catch(e){toast("Documento non leggibile");}}
function renderArrivo(){
  var X=T.transport||{}, ico={volo:"✈️",treno:"🚆",auto:"🚗"}[X.mode]||"🧭";
  var h='<div class="card soft"><div class="pill b" style="margin-bottom:8px">'+esc(X.modeLabel||X.mode||"")+'</div><h3>'+esc((T.origin&&T.origin.name)||"")+' → '+esc(T.dest.name)+'</h3><p style="font-size:14px;margin-top:8px">'+esc(X.summary||"")+'</p></div>';
  var P=X.params||{};
  h+='<div class="card"><div class="kv"><b>Andata</b><span>'+esc(P.out||"")+'</span></div><div class="kv"><b>Ritorno</b><span>'+esc(P.back||"")+'</span></div><div class="kv"><b>Persone</b><span>'+T.people.length+'</span></div>'+(X.booked?'<div class="tip"><b>Già prenotato</b>'+esc(X.booked)+'</div>':'');
  (X.links||[]).forEach(function(l,i){h+='<a class="btn '+(i?"sec ":"")+'full" style="margin-top:8px" href="'+safeUrl(l.u)+'" target="_blank" rel="noopener">'+esc(l.t)+'</a>';});
  if(X.linkNote)h+='<p class="muted small" style="margin:8px 0 0">'+esc(X.linkNote)+'</p>';
  h+='</div>';
  if((X.bookings||[]).length){h+='<div class="tt">Prenotazioni</div>';
    X.bookings.forEach(function(b,i){var d=(T.docs||[])[b.doc-1], dd=b.date?b.date.slice(8)+"/"+b.date.slice(5,7):"";
      h+='<div class="tk"><div class="h">'+esc(b.dep||"")+'<small>'+esc(dd)+'</small><small style="margin-top:8px;color:var(--ink)">'+esc(b.arr||"")+'</small></div><div class="bd"><b>'+esc((b.fromCode||b.from)+" → "+(b.toCode||b.to))+'</b><div class="met">'+esc([b.from+" → "+b.to,[b.carrier,b.number].filter(Boolean).join(" "),b.seats].filter(Boolean).join(" · "))+'</div>'+
        (b.pnr?'<div style="margin-top:7px">'+pill("Prenotazione "+esc(b.pnr),"b")+'</div>':'')+((b.passengers||[]).length?'<div class="met" style="margin-top:5px">'+esc(b.passengers.join(", "))+'</div>':'')+(b.notes?'<div style="font-size:13px;margin-top:6px">'+esc(b.notes)+'</div>':'')+
        (d?'<button class="btn sec" style="padding:8px 10px;margin-top:9px" onclick="openTripDoc('+(b.doc-1)+')">Apri il documento</button>':'')+'</div></div>';});
    h+='<p class="muted small">Dati letti da Claude dai documenti caricati: controllali una volta sul documento originale.</p>';}
  var LB=X.lodgingBooking; if(LB&&LB.name)h+='<div class="tt">Alloggio prenotato</div><div class="card"><b>'+esc(LB.name)+'</b><div class="muted small">'+esc(LB.address||"")+'</div><div class="kv" style="margin-top:6px"><b>Check-in</b><span>'+esc(LB.checkin||"")+'</span></div><div class="kv"><b>Check-out</b><span>'+esc(LB.checkout||"")+'</span></div>'+(LB.pnr?'<div class="kv"><b>Prenotazione</b><span>'+esc(LB.pnr)+'</span></div>':'')+(LB.notes?'<div style="font-size:13px;margin-top:6px">'+esc(LB.notes)+'</div>':'')+'</div>';
  if((T.docs||[]).length){h+='<div class="tt">Documenti di viaggio</div><div class="card">';T.docs.forEach(function(d,i){h+='<div class="wdoc"><div><span class="pill">'+(d.type==="application/pdf"?"PDF":"FOTO")+'</span></div><div class="bd"><b>'+esc(d.name)+'</b></div><button onclick="openTripDoc('+i+')">Apri</button></div>';});h+='<p class="muted small" style="margin:8px 0 0">Caricati da chi ha organizzato il viaggio, disponibili anche offline per tutti i partecipanti.</p></div>';}
  if((X.routes||[]).length){h+='<div class="tt">Le strade, da Google</div>';
    X.routes.forEach(function(r,i){h+='<div class="card"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1">'+(i===0?"Consigliata: ":"")+esc(r.summary||("Percorso "+(i+1)))+'</b>'+pill(Math.round(r.km)+" km","b")+pill(dur(r.min),"y")+'</div>'+(r.toll?'<div class="muted small" style="margin-top:4px">Pedaggi stimati: '+esc(r.toll)+'</div>':'')+(r.note?'<div class="muted small" style="margin-top:4px">'+esc(r.note)+'</div>':'')+(r.url?'<a class="btn sec full" style="margin-top:8px" href="'+safeUrl(r.url)+'" target="_blank" rel="noopener">Apri in Google Maps</a>':'')+'</div>';});}
  if((X.options||[]).length){h+='<div class="tt">Le opzioni, in ordine di convenienza</div>';
    X.options.forEach(function(o,i){h+='<div class="card"><div style="display:flex;gap:8px;align-items:flex-start"><b style="flex:1">'+(i+1)+'. '+esc(o.t)+'</b>'+(o.price?pill(esc(o.price),"y"):"")+'</div><div style="font-size:13.5px;margin-top:5px">'+esc(o.d||"")+'</div></div>';});
    h+='<p class="muted small">Prezzi e orari sono stime di Claude alla data di creazione dell\'app: il prezzo vero è quello del sito al momento dell\'acquisto.</p>';}
  if((X.tips||[]).length){h+='<div class="card">';X.tips.forEach(function(t){h+='<div class="kv"><span>'+esc(t)+'</span></div>';});h+='</div>';}
  if(X.local)h+='<div class="tt">Muoversi sul posto</div><div class="card"><div style="font-size:13.5px">'+esc(X.local)+'</div></div>';
  var Lg=T.lodging;
  if(Lg&&Lg.n){h+='<div class="tt">Dove si dorme</div><div class="card"><b>'+esc(Lg.n)+'</b><div class="muted small">'+esc(Lg.addr||"")+'</div>'+(Lg.note?'<div style="font-size:13.5px;margin-top:6px">'+esc(Lg.note)+'</div>':'')+(geo(Lg)?'<a class="btn sec full" style="margin-top:8px" href="https://www.google.com/maps/search/?api=1&query='+Lg.lat+','+Lg.lon+'" target="_blank" rel="noopener">Apri in Google Maps</a>':'')+'</div>';}
  else if(T.lodgingAdvice)h+='<div class="tt">Dove dormire</div><div class="card"><div style="font-size:13.5px">'+esc(T.lodgingAdvice)+'</div></div>';
  $("s-arrivo").innerHTML=h;
}

/* ============ CONTI: preventivo, spese di gruppo, consuntivo ============ */
var CATS=[["trasporto","🧭","Viaggio"],["alloggio","🛏","Alloggio"],["pasti","🍽","Pasti"],["visite","🎟","Visite e ingressi"],["spostamenti","🚇","Spostamenti sul posto"],["extra","🛍","Extra"]];
function catLabel(c){var x=CATS.filter(function(k){return k[0]===c;})[0];return x?x[2]:c;}
var expSplit=null, expCat="pasti";
function budgetRows(){
  var N=T.people.length, rows=(T.budget||[]).map(function(b){var amt=g("bud."+b.id,b.amt);return {id:b.id,cat:b.cat,label:b.label,per:b.per,note:b.note,amt:+amt||0,tot:(+amt||0)*(b.per==="persona"?N:1)};});
  keys("budx.").forEach(function(k){var b=KV[k].v;rows.push({id:k.slice(5),custom:1,cat:b.cat,label:b.label,per:"gruppo",amt:+b.amt||0,tot:+b.amt||0});});
  return rows;
}
function expenses(){return keys("exp.").map(function(k){var e=KV[k].v;e.id=k.slice(4);return e;}).sort(function(a,b){return b.ts-a.ts;});}
function balances(){
  var bal={},paid={},share={};T.people.forEach(function(p){bal[p.id]=0;paid[p.id]=0;share[p.id]=0;});
  expenses().forEach(function(e){var sp=(e.split&&e.split.length?e.split:T.people.map(function(p){return p.id;})).filter(function(i){return i in bal;}); if(!sp.length||!(e.who in bal))return;
    paid[e.who]+=e.amt; sp.forEach(function(i){share[i]+=e.amt/sp.length;});});
  T.people.forEach(function(p){bal[p.id]=paid[p.id]-share[p.id];});
  return {bal:bal,paid:paid,share:share};
}
function settle(bal){
  var deb=[],cre=[],out=[];Object.keys(bal).forEach(function(i){var v=Math.round(bal[i]*100)/100;if(v<-0.005)deb.push([i,-v]);else if(v>0.005)cre.push([i,v]);});
  deb.sort(function(a,b){return b[1]-a[1];});cre.sort(function(a,b){return b[1]-a[1];});
  var i=0,j=0;while(i<deb.length&&j<cre.length){var m=Math.min(deb[i][1],cre[j][1]);out.push({from:deb[i][0],to:cre[j][0],amt:m});deb[i][1]-=m;cre[j][1]-=m;if(deb[i][1]<0.005)i++;if(cre[j][1]<0.005)j++;}
  return out;
}
function renderConti(){
  var N=T.people.length, rows=budgetRows(), ex=expenses(), B=balances();
  var prevTot=rows.reduce(function(a,r){return a+r.tot;},0), spent=ex.reduce(function(a,e){return a+e.amt;},0);
  var planCost=0;DAYS.forEach(function(D){planCost+=schedule(D).cost;});
  var h='<div class="card soft"><h3>I conti del viaggio</h3><div class="grid2" style="margin-top:10px">'+
    '<div><div class="muted small">Preventivo del gruppo</div><div class="big">'+eur0(prevTot)+'</div><div class="muted small">'+eur0(prevTot/N)+' a testa</div></div>'+
    '<div><div class="muted small">Speso finora</div><div class="big" style="color:'+(spent>prevTot&&prevTot?"var(--red)":"inherit")+'">'+eur0(spent)+'</div><div class="muted small">'+(prevTot?Math.round(spent/prevTot*100)+"% del preventivo":"")+' · '+eur0(spent/N)+' a testa</div></div></div>'+
    '<div class="bar2" style="margin-top:10px"><i class="'+(spent>prevTot?"over":"")+'" style="width:'+Math.min(100,prevTot?spent/prevTot*100:0)+'%"></i></div></div>';
  /* preventivo */
  h+='<div class="tt">Preventivo per voce</div><div class="card"><p class="muted small" style="margin:0 0 6px">Stime di Claude alla creazione dell\'app, modificabili: scrivi l\'importo vero appena lo conosci. Visite e pasti del programma valgono oggi circa '+eur0(planCost)+' a testa.</p>';
  CATS.forEach(function(c){
    var rr=rows.filter(function(r){return r.cat===c[0];}), tot=rr.reduce(function(a,r){return a+r.tot;},0), sp=ex.filter(function(e){return e.cat===c[0];}).reduce(function(a,e){return a+e.amt;},0);
    if(!rr.length&&!sp)return;
    h+='<div class="brow"><div class="l"><b>'+c[2]+'</b><span class="muted small">speso '+eur0(sp)+' su '+eur0(tot)+'</span></div><div class="bar2"><i class="'+(sp>tot?"over":"")+'" style="width:'+Math.min(100,tot?sp/tot*100:(sp?100:0))+'%"></i></div>';
    rr.forEach(function(r){h+='<div class="l" style="margin-top:7px"><span style="flex:1;min-width:0;font-size:13px">'+esc(r.label)+' <span class="muted small">'+(r.per==="persona"?"a testa":"per il gruppo")+(r.note?" · "+esc(r.note):"")+'</span></span><input class="inp" type="number" inputmode="decimal" value="'+r.amt+'" onchange="setBud(\''+r.id+'\','+(r.custom?1:0)+',this.value)">'+(r.custom?'<button class="xbtn" onclick="delBud(\''+r.id+'\')">×</button>':'')+'</div>';});
    h+='</div>';
  });
  h+='<div class="row" style="margin-top:10px"><input class="inp" id="bxL" placeholder="Nuova voce di preventivo"><input class="inp" id="bxA" type="number" inputmode="decimal" placeholder="€" style="max-width:90px"></div><button class="btn sec full" style="margin-top:8px" onclick="addBud()">Aggiungi voce (categoria: '+esc(catLabel(expCat))+')</button></div>';
  /* spese */
  if(!expSplit)expSplit=T.people.map(function(p){return p.id;});
  h+='<div class="tt">Spese di gruppo</div><div class="card"><p class="muted small" style="margin:0 0 8px">Chi anticipa una spesa la segna qui, indicando tra chi va divisa. In fondo l\'app dice chi deve quanto a chi, con il minor numero di rimborsi.</p>'+
    '<div class="row" style="margin-bottom:8px"><input class="inp" id="expWhat" placeholder="Cosa (es. cena di sabato)"><input class="inp" id="expAmt" type="number" inputmode="decimal" placeholder="€" style="max-width:90px"></div>'+
    '<div class="muted small" style="margin-bottom:4px">Categoria</div><div>'+CATS.map(function(c){return '<button class="tog'+(expCat===c[0]?" on":"")+'" onclick="expCat=\''+c[0]+'\';keepExp()">'+c[1]+' '+c[2]+'</button>';}).join("")+'</div>'+
    '<div class="muted small" style="margin:4px 0">Da dividere tra</div><div>'+T.people.map(function(p){return '<button class="tog'+(expSplit.indexOf(p.id)>=0?" on":"")+'" onclick="togSplit(\''+p.id+'\')">'+esc(p.name)+'</button>';}).join("")+'</div>'+
    '<div class="muted small" style="margin:4px 0">Ha pagato</div><div style="display:flex;gap:6px;flex-wrap:wrap">'+T.people.map(function(p){return '<button class="btn sec" style="padding:9px 11px" onclick="addExp(\''+p.id+'\')">'+esc(p.name)+'</button>';}).join("")+'</div><hr>';
  if(!ex.length)h+='<div class="muted small">Ancora nessuna spesa segnata.</div>';
  ex.forEach(function(e){var p=person(e.who), n=(e.split&&e.split.length)||N;
    h+='<div class="exp">'+av(p,true)+'<div class="bd"><b>'+esc(e.what)+'</b><span class="muted small">'+esc(p?p.name:"?")+' · '+esc(catLabel(e.cat))+' · '+(n===N?"tra tutti":"tra "+n)+' · '+new Date(e.ts).toLocaleDateString("it-IT")+'</span></div><div class="amt">'+eur(e.amt)+'</div><button class="x" onclick="delExp(\''+e.id+'\')">×</button></div>';});
  h+='</div>';
  /* saldi */
  h+='<div class="tt">Chi ha pagato, chi deve</div><div class="card">';
  T.people.forEach(function(p){var b=B.bal[p.id];h+='<div class="exp">'+av(p,true)+'<div class="bd"><b>'+esc(p.name)+'</b><span class="muted small">ha pagato '+eur(B.paid[p.id])+' · la sua quota è '+eur(B.share[p.id])+'</span></div><div class="amt" style="color:'+(b<-0.005?"var(--wine)":b>0.005?"var(--sage)":"inherit")+'">'+(b>0.005?"+":"")+eur(b)+'</div></div>';});
  var st=settle(B.bal);
  if(ex.length)h+='<div class="bal">'+(st.length?'<b>Rimborsi per chiudere i conti</b><br>'+st.map(function(s){return esc(person(s.from).name)+' deve '+eur(s.amt)+' a '+esc(person(s.to).name);}).join('<br>'):'Pari e patta: nessuno deve niente a nessuno.')+'</div>';
  h+='<button class="btn sec full" style="margin-top:10px" onclick="exportCsv()">Scarica i conti in CSV (si apre in Excel)</button></div>';
  $("s-conti").innerHTML=h;
}
function keepExp(){var w=$("expWhat").value,a=$("expAmt").value;renderConti();$("expWhat").value=w;$("expAmt").value=a;}
function togSplit(id){var i=expSplit.indexOf(id);if(i>=0)expSplit.splice(i,1);else expSplit.push(id);keepExp();}
function num(v){return parseFloat(String(v).replace(",","."));}
function addExp(who){var w=$("expWhat").value.trim(),amt=num($("expAmt").value);
  if(!w||!(amt>0)){toast("Scrivi cosa e quanto");return;} if(!expSplit.length){toast("Scegli tra chi dividere");return;}
  put("exp."+uid("e"),{what:w,amt:amt,who:who,cat:expCat,split:expSplit.length===T.people.length?[]:expSplit.slice(),ts:Date.now()});expSplit=null;renderConti();}
function delExp(id){if(!confirm("Elimino questa spesa?"))return;put("exp."+id,null);renderConti();}
function setBud(id,custom,v){var a=num(v);if(!(a>=0))a=0;if(custom){var b=g("budx."+id);b.amt=a;put("budx."+id,b);}else put("bud."+id,a);renderConti();}
function addBud(){var l=$("bxL").value.trim(),a=num($("bxA").value);if(!l||!(a>=0)){toast("Scrivi voce e importo");return;}put("budx."+uid("b"),{label:l,amt:a,cat:expCat});renderConti();}
function delBud(id){put("budx."+id,null);renderConti();}
function exportCsv(){
  var L=["Sezione;Voce;Categoria;Chi;Diviso tra;Importo;Data"], q=function(s){return '"'+String(s==null?"":s).replace(/"/g,'""')+'"';}, n=function(x){return String(Math.round(x*100)/100).replace(".",",");};
  budgetRows().forEach(function(r){L.push(["Preventivo",q(r.label),q(catLabel(r.cat)),"",q(r.per),n(r.tot),""].join(";"));});
  expenses().forEach(function(e){L.push(["Spesa",q(e.what),q(catLabel(e.cat)),q((person(e.who)||{}).name),q((e.split&&e.split.length?e.split:T.people.map(function(p){return p.id;})).map(function(i){return (person(i)||{}).name;}).join(", ")),n(e.amt),new Date(e.ts).toLocaleDateString("it-IT")].join(";"));});
  var B=balances();T.people.forEach(function(p){L.push(["Saldo",q(p.name),"","","",n(B.bal[p.id]),""].join(";"));});
  settle(B.bal).forEach(function(s){L.push(["Rimborso",q(person(s.from).name+" a "+person(s.to).name),"","","",n(s.amt),""].join(";"));});
  dl(new Blob(["\ufeff"+L.join("\r\n")],{type:"text/csv;charset=utf-8"}),T.slug+"_conti.csv");
}

/* ============ FOTO, DIARIO, FOTOLIBRO ============ */
var DB=null, useMem=false, MEM={p:{},d:{}}, BLOBS={}, albumFilter="all", curPhoto=null, WDOCS=[];
function openDB(){return new Promise(function(res){try{if(!window.indexedDB){useMem=true;return res();}
  var rq=indexedDB.open("viaggio_"+T.slug,1);
  rq.onupgradeneeded=function(){var db=rq.result;if(!db.objectStoreNames.contains("p"))db.createObjectStore("p",{keyPath:"id"});if(!db.objectStoreNames.contains("d"))db.createObjectStore("d",{keyPath:"id"});};
  rq.onsuccess=function(){DB=rq.result;res();};rq.onerror=function(){useMem=true;res();};
  setTimeout(function(){if(!DB&&!useMem){useMem=true;res();}},2500);}catch(e){useMem=true;res();}});}
function dbAll(st){return new Promise(function(res){if(useMem||!DB)return res(Object.keys(MEM[st]).map(function(k){return MEM[st][k];}));
  try{var t=DB.transaction(st,"readonly").objectStore(st).getAll();t.onsuccess=function(){res(t.result||[]);};t.onerror=function(){res([]);};}catch(e){res([]);}});}
function dbPut(o,st){return new Promise(function(res){if(useMem||!DB){MEM[st][o.id]=o;return res();}
  try{var t=DB.transaction(st,"readwrite").objectStore(st).put(o);t.onsuccess=function(){res();};t.onerror=function(){MEM[st][o.id]=o;res();};}catch(e){MEM[st][o.id]=o;res();}});}
function dbDel(id,st){return new Promise(function(res){delete MEM[st][id];if(useMem||!DB)return res();
  try{var t=DB.transaction(st,"readwrite").objectStore(st).delete(id);t.onsuccess=function(){res();};t.onerror=function(){res();};}catch(e){res();}});}
async function loadBlobs(){var arr=await dbAll("p");arr.forEach(function(r){if(!BLOBS[r.id])BLOBS[r.id]={blob:r.blob,up:r.up,url:URL.createObjectURL(r.blob)};else BLOBS[r.id].up=r.up;});}
function photos(){return keys("ph.").map(function(k){var m=KV[k].v;return {id:k.slice(3),day:m.day,who:m.who,cap:m.cap||"",ts:m.ts};}).sort(function(a,b){return a.ts-b.ts;});}
function dayFromTs(ts){var s=localDate(new Date(ts)),m=DAYS.filter(function(D){return D.date===s;})[0];return m?m.id:(albumFilter!=="all"?albumFilter:DAYS[0].id);}
function shrink(file,M){return new Promise(function(res,rej){
  var done=function(img,w,h){var s=Math.min(1,(M||2000)/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.round(w*s);c.height=Math.round(h*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(function(b){b?res(b):rej();},"image/jpeg",.82);};
  function fb(){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){done(im,im.naturalWidth,im.naturalHeight);URL.revokeObjectURL(u);};im.onerror=function(){URL.revokeObjectURL(u);rej();};im.src=u;}
  if(window.createImageBitmap)createImageBitmap(file,{imageOrientation:"from-image"}).then(function(bm){done(bm,bm.width,bm.height);}).catch(fb); else fb();});}
async function addFiles(list){var n=0;
  for(var i=0;i<list.length;i++){var f=list[i];if(!f.type||f.type.indexOf("image")<0)continue;
    try{var blob=await shrink(f),ts=f.lastModified||Date.now(),id=uid("p");
      await dbPut({id:id,blob:blob,up:0},"p");BLOBS[id]={blob:blob,up:0,url:URL.createObjectURL(blob)};
      put("ph."+id,{day:dayFromTs(ts),who:me().id,cap:"",ts:ts});n++;}catch(e){}}
  renderFoto();toast(n+(n===1?" foto aggiunta":" foto aggiunte"));}
function renderFoto(){
  var ph=photos(), miss=ph.filter(function(p){return !BLOBS[p.id];}).length;
  $("fotoTop").innerHTML=(useMem?'<div class="card" style="background:#FBECC8">Questo browser non salva le foto in modo permanente: apri il link da Chrome o Safari.</div>':'')+
    '<div class="card soft"><h3>L\'album del viaggio</h3><p class="muted small" style="margin-top:5px">'+(syncOn()?'Ogni partecipante carica le sue foto dal proprio telefono e l\'album si riunisce da solo su tutti i telefoni del gruppo.':'Le foto restano su questo telefono. ')+' Stai caricando come <b>'+esc(me().name)+'</b>.'+(miss?' '+miss+' foto degli altri sono in arrivo.':'')+'</p></div>';
  var ch='<button class="chip'+(albumFilter==="all"?" on":"")+'" onclick="albumFilter=\'all\';renderFoto()">Tutte ('+ph.length+')</button>';
  DAYS.forEach(function(D){var n=ph.filter(function(p){return p.day===D.id;}).length;ch+='<button class="chip'+(albumFilter===D.id?" on":"")+'" onclick="albumFilter=\''+D.id+'\';renderFoto()">'+esc(D.dow.slice(0,3)+" "+D.n)+' ('+n+')</button>';});
  $("albumChips").innerHTML=ch;
  var list=ph.filter(function(p){return albumFilter==="all"||p.day===albumFilter;});
  $("gallery").innerHTML=list.length?'<div class="grid">'+list.map(function(p){var b=BLOBS[p.id],w=person(p.who);
    return '<div class="gcell" onclick="openLb(\''+p.id+'\')">'+(b?'<img src="'+b.url+'" alt="" loading="lazy">':'<img alt="" style="opacity:.4">')+'<span class="who">'+esc(w?w.name:"")+'</span>'+(b&&!b.up&&syncOn()?'<span class="up">in invio</span>':'')+'</div>';}).join("")+'</div>':'<div class="card flat" style="text-align:center"><div class="muted small">Ancora nessuna foto. Comincia tu.</div></div>';
  var h='<div class="tt">Il diario di viaggio</div><div class="card"><p class="muted small" style="margin:0">Ogni sera tre righe a testa: cosa vi ha fatto ridere, cosa non vi aspettavate. Finiscono nei testi del fotolibro.</p>';
  DAYS.forEach(function(D){
    h+='<h4 style="margin-top:14px;border-left:4px solid '+esc(D.c)+';padding-left:8px">'+esc(dshort(D))+'</h4>';
    T.people.forEach(function(p){if(p.id===me().id)return;var v=g("diary."+D.id+"."+p.id,"");if(String(v).trim())h+='<div class="muted small" style="margin-top:4px"><b>'+esc(p.name)+':</b> '+esc(v)+'</div>';});
    h+='<textarea class="diary" placeholder="'+esc(me().name)+', stasera…" oninput="saveDiary(\''+D.id+'\',this.value)">'+esc(g("diary."+D.id+"."+me().id,""))+'</textarea>';
  });
  h+='</div><div class="tt">Il fotolibro</div><div class="card"><p class="small" style="margin:0 0 8px">Claude scrive i testi del fotolibro a partire dal programma, dal diario e dalle didascalie: titolo, dedica, una frase per ogni giornata, chiusura.</p><button class="btn full" onclick="genBook()" id="bookBtn">Scrivi i testi del fotolibro</button><div id="bookBox">'+bookHtml()+'</div><hr>'+
    '<h4>Il libro stampato</h4><p class="muted small" style="margin:6px 0 8px">La webapp impagina il fotolibro in PDF: copertina, dedica, una apertura per ogni giornata con diario e tappe, le foto in ordine, chiusura. Formato A4 orizzontale con copertina rigida. Lo sfogli qui; la stampa la ordina chi organizza il viaggio, dopo averlo approvato.</p>'+pdfBox()+'<button class="btn full" id="pdfBtn" onclick="makePdf()">'+(g("bookpdf",null)?"Impagina di nuovo":"Impagina il fotolibro")+'</button><hr>'+
    '<h4>In alternativa, Journi</h4><p class="muted small" style="margin:6px 0 8px">Journi non riceve libri già impaginati. Dal telefono: «Invia a Journi» apre il menu di condivisione con le foto, e lì si sceglie l\'app Journi (deve essere installata). Dal computer: si scarica lo zip, con foto in ordine cronologico e testi, e si trascina nel sito di Journi.</p>'+
    '<div class="grid2"><button class="btn" onclick="shareToJourni()">Invia a Journi</button><button class="btn sec" onclick="exportZip()">Scarica lo zip</button><button class="btn sec" onclick="exportStory()">Solo i testi</button><a class="btn sec" href="https://www.journiapp.com/" target="_blank" rel="noopener">Apri Journi</a></div></div>';
  $("fotoBottom").innerHTML=h;
}
var diaryT=null;
function saveDiary(day,v){clearTimeout(diaryT);diaryT=setTimeout(function(){put("diary."+day+"."+me().id,v);},600);}
function openLb(id){curPhoto=photos().filter(function(p){return p.id===id;})[0];if(!curPhoto||!BLOBS[id]){toast("Questa foto sta ancora arrivando");curPhoto=null;return;}
  $("lbImg").src=BLOBS[id].url;$("lbCap").value=curPhoto.cap||"";$("lb").classList.add("on");}
function closeLb(){if(curPhoto){var c=$("lbCap").value;if(c!==(curPhoto.cap||""))put("ph."+curPhoto.id,{day:curPhoto.day,who:curPhoto.who,cap:c,ts:curPhoto.ts});}$("lb").classList.remove("on");curPhoto=null;renderFoto();}
function savePhoto(){if(curPhoto)dl(BLOBS[curPhoto.id].blob,T.slug+"_"+curPhoto.id+".jpg");}
async function delPhoto(){if(!curPhoto||!confirm("Elimino questa foto dall'album"+(syncOn()?" di tutto il gruppo":"")+"?"))return;var id=curPhoto.id;put("ph."+id,null);await dbDel(id,"p");delete BLOBS[id];$("lb").classList.remove("on");curPhoto=null;renderFoto();}
function pdfBox(){var m=g("bookpdf",null);if(!m)return "";
  var who=person(m.by);return '<div class="tip" style="margin:0 0 10px"><b>Ultima impaginazione</b>'+m.pages+' pagine, '+m.photos+' foto, '+String(m.mb).replace(".",",")+' MB · '+new Date(m.at).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+(who?' · '+esc(who.name):'')+(S.pdfUrl?'<br><a href="'+safeUrl(S.pdfUrl)+'" target="_blank" rel="noopener">Sfoglia il PDF</a>':'<br>Per sfogliarlo da questo telefono, impaginalo di nuovo.')+'</div>';}
async function makePdf(){
  if(!syncOn()){toast("Serve il collegamento con la webapp madre");return;}
  var ph=photos(), pend=ph.filter(function(p){return BLOBS[p.id]&&!BLOBS[p.id].up;}).length;
  if(pend){toast(pend+" foto devono ancora essere inviate: riprova tra poco");sync();return;}
  var btn=$("pdfBtn");btn.disabled=true;btn.textContent="Impagino (può servire un minuto)…";
  try{await sync();
    var r=await fetch(T.sync.api+"/api/book/"+T.slug+"/pdf",{method:"POST",headers:{"content-type":"application/json","x-trip-token":AUTH.tok},body:"{}"}),j=await r.json();
    if(!r.ok)throw new Error(j.error||"errore");
    S.pdfUrl=j.url;save();await sync();toast("Fotolibro impaginato: "+j.pages+" pagine");
  }catch(e){toast("Non riuscito: "+e.message);}
  renderFoto();
}
function bookHtml(){var b=g("book",null);if(!b)return "";
  var h='<div class="tip" style="margin-top:10px"><b>Titolo</b>'+esc(b.title)+'</div><div class="tip"><b>Dedica</b>'+esc(b.dedication)+'</div>';
  (b.chapters||[]).forEach(function(c){h+='<div class="tip"><b>'+esc(c.title)+'</b>'+esc(c.text)+'</div>';});
  if((b.phrases||[]).length)h+='<div class="tip"><b>Frasi sparse per le pagine</b>'+b.phrases.map(esc).join("<br>")+'</div>';
  return h+'<div class="tip"><b>Chiusura</b>'+esc(b.closing)+'</div>';}
async function genBook(){
  if(!T.sync||!T.sync.api){toast("Serve il collegamento con la webapp madre");return;}
  var btn=$("bookBtn");btn.disabled=true;btn.textContent="Claude sta scrivendo (fino a un minuto)…";
  try{
    var ph=photos(), body={trip:{title:T.title,dest:{name:T.dest.name},dates:T.dates,people:T.people.map(function(p){return {name:p.name};})},days:DAYS.map(function(D){return {date:D.date,title:D.title,stops:(plan()[D.id]||[]).map(function(i){return POI[i].n;}),
      diary:T.people.map(function(p){var v=g("diary."+D.id+"."+p.id,"");return String(v).trim()?p.name+": "+v:"";}).filter(Boolean),caps:ph.filter(function(p){return p.day===D.id&&p.cap;}).map(function(p){return p.cap;})};})};
    var r=await fetch(T.sync.api+"/api/book/"+T.slug,{method:"POST",headers:{"content-type":"application/json","x-trip-token":AUTH.tok},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok)throw new Error(j.error||"errore");
    put("book",j.book);toast("Testi pronti");
  }catch(e){toast("Non riuscito: "+e.message);}
  renderFoto();
}
function storyText(){
  var b=g("book",null), ph=photos(), s=T.title.toUpperCase()+"\n"+T.people.map(function(p){return p.name;}).join(", ")+"\n"+T.dates.start+" / "+T.dates.end+"\n\n";
  if(b)s+="TITOLO DEL FOTOLIBRO\n"+b.title+"\n\nDEDICA\n"+b.dedication+"\n\n";
  DAYS.forEach(function(D,i){
    s+="\n=== "+dlabel(D).toUpperCase()+" · "+D.title.toUpperCase()+" ===\n";
    if(b&&b.chapters&&b.chapters[i])s+=b.chapters[i].title+"\n"+b.chapters[i].text+"\n\n";
    s+="Tappe: "+(plan()[D.id]||[]).map(function(x){return POI[x].n;}).join(" · ")+"\n";
    T.people.forEach(function(p){var v=g("diary."+D.id+"."+p.id,"");if(String(v).trim())s+="Diario di "+p.name+": "+String(v).trim()+"\n";});
    var pp=ph.filter(function(p){return p.day===D.id;});
    if(pp.length){s+="Foto:\n";pp.forEach(function(p,k){s+="  "+String(k+1).padStart(2,"0")+". ["+((person(p.who)||{}).name||"")+"] "+(p.cap||"(senza didascalia)")+"\n";});}
  });
  if(b){if((b.phrases||[]).length)s+="\nFRASI SPARSE\n"+b.phrases.join("\n")+"\n";s+="\nCHIUSURA\n"+b.closing+"\n";}
  return s;
}
function exportStory(){dl(new Blob([storyText()],{type:"text/plain;charset=utf-8"}),T.slug+"_testi_fotolibro.txt");}
function photoName(p,idx){var D=DAYS.filter(function(d){return d.id===p.day;})[0]||DAYS[0];return D.date+"_"+String(idx).padStart(3,"0")+"_"+((person(p.who)||{}).name||"").toLowerCase().replace(/[^a-z]/g,"")+".jpg";}
async function exportZip(){
  var ph=photos().filter(function(p){return BLOBS[p.id];});if(!ph.length)return toast("Non ci sono ancora foto");
  toast("Preparo lo zip…");var files=[];
  for(var i=0;i<ph.length;i++)files.push({name:T.slug+"/"+photoName(ph[i],i+1),data:new Uint8Array(await BLOBS[ph[i].id].blob.arrayBuffer()),date:new Date(ph[i].ts)});
  files.push({name:T.slug+"/testi_fotolibro.txt",data:new TextEncoder().encode(storyText()),date:new Date()});
  dl(makeZip(files),T.slug+"_fotolibro.zip");
}
async function shareToJourni(){
  var ph=photos().filter(function(p){return BLOBS[p.id]&&(albumFilter==="all"||p.day===albumFilter);});
  if(!ph.length)return toast("Non ci sono foto da inviare");
  if(!navigator.canShare){toast("Questo telefono non condivide file da qui: usa lo zip");return;}
  var files=ph.slice(0,30).map(function(p,i){return new File([BLOBS[p.id].blob],photoName(p,i+1),{type:"image/jpeg"});});
  if(!navigator.canShare({files:files})){toast("Condivisione di file non disponibile: usa lo zip");return;}
  try{await navigator.share({files:files,title:T.title});if(ph.length>30)toast("Inviate le prime 30: filtra per giorno e ripeti");}catch(e){}
}
var CRCT=(function(){var t=[],c,n,k;for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u8){var c=0xFFFFFFFF;for(var i=0;i<u8.length;i++)c=CRCT[(c^u8[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){
  var parts=[],cd=[],off=0,enc=new TextEncoder();
  files.forEach(function(f){var name=enc.encode(f.name),c=crc32(f.data),d=f.date||new Date(),tm=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()/2))&0xFFFF,dt=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
    var lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(10,tm,true);lh.setUint16(12,dt,true);lh.setUint32(14,c,true);lh.setUint32(18,f.data.length,true);lh.setUint32(22,f.data.length,true);lh.setUint16(26,name.length,true);
    parts.push(new Uint8Array(lh.buffer),name,f.data);
    var ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(12,tm,true);ch.setUint16(14,dt,true);ch.setUint32(16,c,true);ch.setUint32(20,f.data.length,true);ch.setUint32(24,f.data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,off,true);
    cd.push(new Uint8Array(ch.buffer),name);off+=30+name.length+f.data.length;});
  var cdSize=cd.reduce(function(s,x){return s+x.length;},0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cdSize,true);e.setUint32(16,off,true);
  return new Blob(parts.concat(cd,[new Uint8Array(e.buffer)]),{type:"application/zip"});
}
function dl(blob,name){var u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(u);},1200);}

/* ============ WALLET (solo su questo telefono) ============ */
async function loadDocs(){var arr=await dbAll("d");arr.sort(function(a,b){return a.ts-b.ts;});WDOCS=arr.map(function(d){if(!d.url)try{d.url=URL.createObjectURL(d.blob);}catch(e){}return d;});}
function docRow(d){return '<div class="wdoc"><div>'+'<span class="pill">'+(d.type==="application/pdf"?"PDF":"FOTO")+'</span>'+'</div><div class="bd"><b>'+esc(d.name)+'</b><div class="muted small">'+esc(d.poi&&POI[d.poi]?POI[d.poi].n:"Senza tappa")+'</div></div><button onclick="openDoc(\''+d.id+'\')">Apri</button><button onclick="delDoc(\''+d.id+'\')">×</button></div>';}
function pickDocFor(poi){var i=$("docIn");i.dataset.poi=poi||"";i.click();}
async function addDocs(list,poi){var n=0;for(var i=0;i<list.length;i++){var f=list[i],pdf=f.type==="application/pdf"||/\.pdf$/i.test(f.name||""),img=f.type&&f.type.indexOf("image")===0;if((!pdf&&!img)||f.size>25*1048576)continue;
    try{var blob=img?await shrink(f,2000):f;await dbPut({id:uid("d"),poi:poi||"",name:(f.name||"documento").replace(/\.[^.]+$/,""),type:pdf?"application/pdf":"image/jpeg",blob:blob,ts:Date.now()},"d");n++;}catch(e){}}
  await loadDocs();closeSheet();renderAltro();toast(n+(n===1?" documento salvato":" documenti salvati"));}
function openDoc(id){var d=WDOCS.filter(function(x){return x.id===id;})[0];if(d)window.open(d.url,"_blank");}
async function delDoc(id){if(!confirm("Elimino il documento dal wallet?"))return;await dbDel(id,"d");await loadDocs();closeSheet();renderAltro();}

/* ============ ALTRO: prenotazioni, bagagli, wallet, avvisi, sync, app ============ */
function renderAltro(){
  var h='<div class="tt" style="margin-top:4px">Da prenotare</div><div class="card">', pri=0;
  (T.todo||[]).slice().sort(function(a,b){return a.pri-b.pri;}).forEach(function(t){
    if(t.pri!==pri){pri=t.pri;h+='<h4 style="margin-top:10px">'+(pri===1?"Subito":pri===2?"Nelle prossime settimane":"Prima di partire")+'</h4>';}
    var dn=g("todo."+t.id);h+='<div class="ck'+(dn?" done":"")+'" onclick="put(\'todo.'+t.id+'\','+(dn?0:1)+');renderAltro()"><div class="box">'+(dn?"✓":"")+'</div><div class="bd"><b>'+esc(t.t)+'</b><div class="muted small">'+esc(t.d||"")+'</div>'+(t.u?'<a class="small" href="'+safeUrl(t.u)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+esc(t.uTxt||"apri il link")+'</a>':"")+'</div></div>';});
  if(!(T.todo||[]).length)h+='<div class="muted small">Niente da prenotare.</div>';
  h+='</div><div class="tt">Bagagli e documenti di '+esc(me().name)+'</div><div class="card">';
  (T.pack||[]).forEach(function(c,ci){var done=c.items.filter(function(x,ii){return g("pack."+ci+"_"+ii+"."+me().id);}).length;
    h+='<h4 style="margin-top:12px">'+esc(c.cat)+' · '+done+'/'+c.items.length+'</h4>';
    c.items.forEach(function(x,ii){var k="pack."+ci+"_"+ii+"."+me().id,dn=g(k);h+='<div class="ck'+(dn?" done":"")+'" style="padding:6px 0" onclick="put(\''+k+'\','+(dn?0:1)+');renderAltro()"><div class="box">'+(dn?"✓":"")+'</div><div class="bd"><b style="font-weight:600">'+esc(x)+'</b></div></div>';});});
  h+='</div><div class="tt">Wallet: biglietti e documenti</div><div class="card"><p class="muted small" style="margin:0 0 8px">PDF o foto di biglietti e prenotazioni, salvati su questo telefono e disponibili offline. Si agganciano a una tappa dalla sua scheda.</p>';
  WDOCS.forEach(function(d){h+=docRow(d);});
  h+='<button class="btn sec full" onclick="pickDocFor(\'\')">Aggiungi biglietto o documento</button></div>';
  var nOk=S.notif&&("Notification" in window)&&Notification.permission==="granted";
  h+='<div class="tt">Avvisi e calendario</div><div class="card">'+(nOk?'<div class="pill g" style="margin-bottom:8px">Avvisi attivi su questo telefono</div><button class="btn ghost full" onclick="S.notif=0;save();renderAltro()">Disattiva gli avvisi</button>':'<p class="small" style="margin:0 0 8px">Nei giorni del viaggio, 30 minuti prima di ogni tappa. Funziona con l\'app aperta o in secondo piano da poco; su iPhone solo con l\'app installata.</p><button class="btn full" onclick="enableNotif()">Attiva gli avvisi</button>')+
    '<hr><p class="small" style="margin:0 0 8px">Il metodo che non sbaglia: il programma nel calendario del telefono, con sveglia 30 minuti prima di ogni tappa.</p><button class="btn sec full" onclick="exportIcs()">Scarica il programma nel calendario (.ics)</button></div>';
  h+=syncCard();
  h+='<div class="tt">L\'app sul telefono</div><div class="card"><div class="pill y" style="margin-bottom:8px">Versione '+esc(APP_VER)+'</div><p class="small" style="margin:0 0 8px">Android: menu di Chrome, Installa app. iPhone: in Safari, Condividi, Aggiungi alla schermata Home. Dopo l\'installazione funziona anche offline.</p><div class="row"><button class="btn" onclick="shareLink()">Condividi</button><button class="btn sec" onclick="checkUpdate()">Aggiorna</button></div>'+
    '<button class="btn ghost full" style="margin-top:8px" onclick="showIntro()">Rivedi l\'apertura</button><button class="btn ghost full" style="margin-top:8px" onclick="logout()">Esci ('+esc(AUTH.u)+')</button></div>'+
    '<p class="muted small" style="text-align:center">App generata da «I nostri viaggi insieme» il '+esc((T.gen&&T.gen.at||"").slice(0,10))+'. Itinerario, prezzi e orari proposti da Claude: verificare sui siti ufficiali prima di prenotare.</p>';
  $("s-altro").innerHTML=h;
}
function enableNotif(){if(!("Notification" in window)){toast("Questo telefono non supporta gli avvisi: usa il calendario");return;}
  Notification.requestPermission().then(function(p){if(p==="granted"){S.notif=1;save();renderAltro();showNotif("Avvisi attivi","Ti avviso 30 minuti prima di ogni tappa.");}else toast("Permesso negato: usa il calendario");});}
function showNotif(t,b){try{if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.ready.then(function(r){r.showNotification(t,{body:b,icon:"icon-192.png",tag:"v"+Date.now()});});else new Notification(t,{body:b,icon:"icon-192.png"});}catch(e){}}
function notifTick(){if(!S.notif||!("Notification" in window)||Notification.permission!=="granted")return;var di=todayDay();if(di<0)return;
  var D=DAYS[di],now=new Date(),m=now.getHours()*60+now.getMinutes();
  schedule(D).rows.forEach(function(r){var lead=r.st-m,key=D.id+"_"+r.id;if(lead<=30&&lead>=27&&!S.notified[key]){S.notified[key]=1;save();showNotif("Tra "+lead+" minuti: "+r.p.n,"Alle "+hhmm(r.st)+(r.tr?" · "+r.tr.txt:""));}});}
function icsEsc(s){return String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");}
function exportIcs(){
  var L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//I nostri viaggi insieme//IT","CALSCALE:GREGORIAN","X-WR-CALNAME:"+icsEsc(T.title)];
  function dt(date,min){var extra=Math.floor(min/1440);min=min%1440;var d=new Date(date+"T00:00:00");d.setDate(d.getDate()+extra);var h=Math.floor(min/60),x=min%60;return localDate(d).replace(/-/g,"")+"T"+String(h).padStart(2,"0")+String(x).padStart(2,"0")+"00";}
  DAYS.forEach(function(D){schedule(D).rows.forEach(function(r){var p=r.p;
    L.push("BEGIN:VEVENT","UID:"+T.slug+"-"+D.id+"-"+r.id+"@viaggi","DTSTAMP:"+new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z","DTSTART:"+dt(D.date,r.st),"DTEND:"+dt(D.date,r.st+(p.min||30)),"SUMMARY:"+icsEsc(p.n),"LOCATION:"+icsEsc(p.stop||""),
      "DESCRIPTION:"+icsEsc((p.sub?p.sub+"\n":"")+(r.tr?"Come arrivare: "+r.tr.txt+"\n":"")+(p.priceTxt?"Costo: "+p.priceTxt+"\n":"")+(p.tip||"")),"BEGIN:VALARM","TRIGGER:-PT30M","ACTION:DISPLAY","DESCRIPTION:"+icsEsc("Tra 30 minuti: "+p.n),"END:VALARM","END:VEVENT");});});
  L.push("END:VCALENDAR");dl(new Blob([L.join("\r\n")],{type:"text/calendar;charset=utf-8"}),T.slug+"_programma.ics");
}
function openPrintPage(){
  var h='<h1>'+esc(T.title)+'</h1><div class="phead">'+esc(T.people.map(function(p){return p.name;}).join(", "))+' · '+esc(T.dates.start)+' / '+esc(T.dates.end)+'</div>';
  DAYS.forEach(function(D){var sc=schedule(D);h+='<div class="pday"><h2>'+esc(dlabel(D))+' · '+esc(D.title)+'</h2>';
    sc.rows.forEach(function(r){if(r.tr)h+='<div class="ptr">'+esc(r.tr.txt)+'</div>';h+='<div class="pit"><span class="pbx"></span><span class="pt">'+hhmm(r.st)+'</span><div><b>'+esc(r.p.n)+'</b><span class="pm">'+esc([r.p.sub,r.p.priceTxt,r.p.stop].filter(Boolean).join(" · "))+'</span></div></div>';});h+='</div>';});
  var css='body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:11pt;color:#221B18;max-width:720px;margin:0 auto;padding:16px}.pday{padding-top:14px}.pday+.pday{page-break-before:always}h1{font-size:22pt;margin:0 0 4px}h2{font-size:15pt;border-bottom:2.5pt solid #999;padding-bottom:4px;margin:0 0 8px}.pit{display:flex;gap:12px;padding:6px 0;border-bottom:.4pt dashed #BBB;page-break-inside:avoid}.pt{width:52px;flex:none;font-weight:800}.pit b{display:block}.pm{color:#666;font-size:9.5pt}.ptr{color:#666;font-size:9pt;padding:3px 0 3px 64px;font-style:italic}.pbx{width:14px;height:14px;border:1pt solid #555;border-radius:3px;flex:none;margin-top:3px}.phead{color:#555;font-size:10pt;margin:0 0 14px}.pbtn{background:#4B5C5D;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:800;font-size:14px;margin:0 0 12px}@media print{.pbtn{display:none}}';
  var html='<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(T.title)+' · programma</title><style>'+css+'</style></head><body><button class="pbtn" onclick="window.print()">Stampa o salva come PDF</button>'+h+'</body></html>';
  var w=window.open(URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"})),"_blank");if(!w)toast("Il telefono ha bloccato la finestra: consenti i popup");
}
function checkUpdate(){toast("Controllo aggiornamenti…");if(!("serviceWorker" in navigator)||!navigator.serviceWorker.controller){location.reload();return;}
  navigator.serviceWorker.getRegistration().then(function(r){if(!r){location.reload();return;}return r.update().then(function(){var w=r.installing||r.waiting;if(w){w.postMessage({type:"SKIP_WAITING"});setTimeout(function(){location.reload();},3000);}else toast("Sei già alla versione più recente");});}).catch(function(){location.reload();});}

/* ============ RICERCA ============ */
function norm(t){return String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function openSearch(){$("srch").classList.add("on");doSearch();setTimeout(function(){$("srchIn").focus();},50);}
function closeSearch(){$("srch").classList.remove("on");}
function doSearch(){
  var q=norm($("srchIn").value).trim(), box=$("srchRes");
  if(q.length<2){box.innerHTML='<div class="muted small" style="text-align:center;padding:30px">Scrivi almeno due lettere.</div>';return;}
  var P=plan(), hits=[];
  Object.keys(POI).forEach(function(id){var p=POI[id];if(norm([p.n,p.sub,p.desc,p.tip,p.stop].join(" ")).indexOf(q)<0)return;
    var di=-1;DAYS.forEach(function(D,i){if((P[D.id]||[]).indexOf(id)>=0)di=i;});
    hits.push('<button class="tk pk" style="grid-template-columns:1fr;padding:10px 12px" onclick="closeSearch();'+(di>=0?'vTab='+di+';go(\'s-viaggio\');':'')+'detail(\''+id+'\')"><div><b>'+esc(p.n)+'</b><div class="muted small">'+(di>=0?esc(dlabel(DAYS[di])):"da parte")+(p.sub?' · '+esc(p.sub):'')+'</div></div></button>');});
  (T.todo||[]).forEach(function(t){if(norm(t.t+" "+t.d).indexOf(q)>=0)hits.push('<button class="tk pk" style="grid-template-columns:1fr;padding:10px 12px" onclick="closeSearch();go(\'s-altro\')"><div><b>'+esc(t.t)+'</b><div class="muted small">'+esc(t.d||"")+'</div></div></button>');});
  box.innerHTML=hits.length?hits.slice(0,40).join(""):'<div class="muted small" style="text-align:center;padding:30px">Nessun risultato.</div>';
}

/* ============ SINCRONIZZAZIONE CON LA MADRE ============ */
var syncing=false, syncState="", syncTimer=null;
function syncOn(){return !!(T.sync&&T.sync.api&&AUTH&&AUTH.tok);}
function schedSync(){if(!syncOn())return;clearTimeout(syncTimer);syncTimer=setTimeout(sync,2500);}
function syncCard(){
  if(!syncOn())return "";
  return '<div class="tt">Dati condivisi del gruppo</div><div class="card"><div class="pill '+(syncState==="ok"?"g":syncState==="err"?"r":"y")+'" style="margin-bottom:8px">'+(syncState==="ok"?"Sincronizzato"+(S.last?" alle "+new Date(S.last).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}):""):syncState==="err"?"Accesso scaduto: esci ed entra di nuovo con le credenziali aggiornate":syncState==="off"?"Offline: le modifiche partono appena torna la rete":"Sincronizzazione in corso (il primo collegamento può richiedere un minuto)")+'</div><p class="small" style="margin:0 0 8px">Programma, spese, bagagli, diario e foto sono in comune tra i telefoni del gruppo.</p><button class="btn sec full" onclick="sync(true)">Sincronizza ora</button></div>';
}
async function sync(manual){
  if(!syncOn()||syncing)return; if(navigator.onLine===false){syncState="off";return;}
  syncing=true;
  try{
    var sent={},ks=Object.keys(S.dirty);ks.forEach(function(k){if(KV[k])sent[k]=KV[k];});
    var r=await fetch(T.sync.api+"/api/sync/"+T.slug,{method:"POST",headers:{"content-type":"application/json","x-trip-token":AUTH.tok},body:JSON.stringify({since:S.rev,changes:sent})});
    if(r.status===401){syncState="err";syncing=false;renderCurrent();return;}
    if(!r.ok)throw new Error("http "+r.status);
    var j=await r.json(), changed=false;
    Object.keys(j.changes||{}).forEach(function(k){var c=j.changes[k];if(!KV[k]||c.ts>KV[k].ts||(c.ts===KV[k].ts&&JSON.stringify(c.v)!==JSON.stringify(KV[k].v))){KV[k]={v:c.v,ts:c.ts};changed=true;}});
    ks.forEach(function(k){if(KV[k]&&sent[k]&&KV[k].ts<=sent[k].ts)delete S.dirty[k];});
    S.rev=j.rev;S.last=Date.now();syncState="ok";save();
    var moved=await photoSync();
    if(changed||moved||manual){var a=document.activeElement;if(!a||!/INPUT|TEXTAREA/.test(a.tagName))renderCurrent();}
    if(manual)toast("Sincronizzato");
  }catch(e){syncState=navigator.onLine===false?"off":"";}
  syncing=false;
}
async function photoSync(){
  var moved=0, base=T.sync.api+"/api/sync/"+T.slug+"/photo/", hd={"x-trip-token":AUTH.tok}, ph=photos();
  for(var i=0;i<ph.length&&moved<8;i++){var p=ph[i],b=BLOBS[p.id];
    if(b&&!b.up){try{var r=await fetch(base+p.id,{method:"PUT",headers:Object.assign({"content-type":"image/jpeg"},hd),body:b.blob});if(r.ok){b.up=1;await dbPut({id:p.id,blob:b.blob,up:1},"p");moved++;}}catch(e){break;}}
    else if(!b){try{var r2=await fetch(base+p.id,{headers:hd});if(r2.ok){var bl=await r2.blob();await dbPut({id:p.id,blob:bl,up:1},"p");BLOBS[p.id]={blob:bl,up:1,url:URL.createObjectURL(bl)};moved++;}}catch(e){break;}}}
  if(moved>=8)setTimeout(sync,1500);
  return moved;
}

/* ============ NAV, INTESTAZIONE, AVVIO ============ */
var TABS=[["s-gruppo","GRUPPO"],["s-meta","META"],["s-arrivo","ARRIVO"],["s-viaggio","VIAGGIO"],["s-conti","CONTI"],["s-foto","FOTO"],["s-altro","ALTRO"]];
var curTab="s-gruppo";
function renderTab(id){({"s-gruppo":renderGruppo,"s-meta":renderMeta,"s-arrivo":renderArrivo,"s-viaggio":renderViaggio,"s-conti":renderConti,"s-foto":renderFoto,"s-altro":renderAltro})[id]();}
function renderCurrent(){renderTab(curTab);countdown();}
function renderAll(){renderCurrent();}
function go(id){curTab=id;document.querySelectorAll("section").forEach(function(s){s.classList.toggle("on",s.id===id);});
  document.querySelectorAll("#nav button").forEach(function(b){b.classList.toggle("on",b.dataset.t===id);});document.body.classList.toggle("slim",id!=="s-gruppo");$("scroll").scrollTo(0,0);renderTab(id);}
function countdown(){
  var now=new Date(),dep=new Date(T.dates.start+"T00:00:00"),ret=new Date(T.dates.end+"T23:59:00"),h;
  if(now<dep){var d=Math.ceil((dep-now)/86400000);h='<small>Mancano</small><b>'+d+' GG</b>';}
  else if(now<ret){var di=todayDay();h='<small>In viaggio</small><b>'+(di>=0?'GIORNO '+(di+1):'OGGI')+'</b>';}
  else h='<small>Viaggio</small><b>FATTO</b>';
  $("cd").innerHTML=h;
}
function header(){
  var X=T.transport||{}, c=T.codes||[], f=function(d){var a=String(d||"").split("-");return a.length===3?a[2]+" "+["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"][+a[1]-1]:"";};
  $("hFrom").textContent=c[0]||"";$("hTo").textContent=c[1]||"";$("hIco").textContent={volo:"✈",treno:"▶",auto:"▶"}[X.mode]||"▶";
  $("hCityF").textContent=(T.origin&&T.origin.name)||"";$("hCityT").textContent=T.dest.name;
  var cell=function(k,v){return '<div><span>'+k+'</span><b>'+esc(v)+'</b></div>';};
  $("hGrid").innerHTML=cell("Passeggeri",T.people.length)+cell("Andata",f(T.dates.start))+cell("Ritorno",f(T.dates.end))+cell("Mezzo",X.mode||"")+cell("Giorni",DAYS.length)+cell("Dati",syncOn()?"in comune":"su questo telefono");
}
function showIntro(){$("intro").style.display="flex";$("intro").style.opacity=1;}
function closeIntro(){var e=$("intro");e.style.opacity=0;setTimeout(function(){e.style.display="none";},500);try{sessionStorage.setItem(LS+"_in","1");}catch(x){}}
function setupSW(){
  if(!("serviceWorker" in navigator)||!(location.protocol==="https:"||location.hostname==="localhost"))return;
  var had=!!navigator.serviceWorker.controller,re=false;
  navigator.serviceWorker.addEventListener("controllerchange",function(){if(re||!had)return;re=true;location.reload();});
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(function(reg){
    function pr(w){if(!w)return;if(w.state==="installed")w.postMessage({type:"SKIP_WAITING"});w.addEventListener("statechange",function(){if(w.state==="installed")w.postMessage({type:"SKIP_WAITING"});});}
    pr(reg.waiting);reg.addEventListener("updatefound",function(){pr(reg.installing);});
    document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")reg.update().catch(function(){});});
  }).catch(function(){});
}
/* ---- accesso: il viaggio è cifrato, lo aprono solo le credenziali dei partecipanti ---- */
function b64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function hex(u){return Array.prototype.map.call(u,function(x){return ("0"+x.toString(16)).slice(-2);}).join("");}
async function openTrip(keyBytes){
  var enc=new Uint8Array(await (await fetch("trip.enc",{cache:"no-cache"})).arrayBuffer());
  var k=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:enc.slice(0,12)},k,enc.slice(12))));
}
async function doLogin(){
  var u=$("lgU").value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,""), p=$("lgP").value.toUpperCase().replace(/[^A-Z0-9]/g,""), E=$("lgE");
  if(!u||!p){E.textContent="Scrivi utente e password.";return;}
  $("lgB").disabled=true;E.textContent="Verifico…";
  try{
    var id=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(PUB.slug+":"+u)))).slice(0,24), e=PUB.users.filter(function(x){return x.id===id;})[0];
    if(!e)throw new Error("no");
    var km=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveKey"]);
    var dk=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(e.s),iterations:PUB.iter,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["decrypt"]);
    var pl=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(e.i)},dk,b64(e.w)));
    AUTH={u:u,k:hex(pl.slice(0,32)),tok:hex(pl.slice(32,48))};
    T=await openTrip(pl.slice(0,32));
    localStorage.setItem("auth_"+PUB.slug,JSON.stringify(AUTH));
    $("login").style.display="none";$("lgP").value="";startApp(true);
  }catch(x){AUTH=null;E.textContent=(window.crypto&&crypto.subtle)?"Utente o password non corretti.":"Questo browser non supporta l'accesso sicuro: apri il link in Chrome o Safari.";}
  $("lgB").disabled=false;
}
function logout(){if(!confirm("Esco da questo telefono? I dati non ancora sincronizzati restano qui e ripartono al prossimo accesso."))return;localStorage.removeItem("auth_"+PUB.slug);location.reload();}
function unhex(h){var u=new Uint8Array(h.length/2);for(var i=0;i<u.length;i++)u[i]=parseInt(h.substr(i*2,2),16);return u;}
async function boot(){
  try{PUB=await (await fetch("auth.json",{cache:"no-cache"})).json();}catch(e){document.body.innerHTML='<p style="padding:30px">Serve la rete per il primo avvio.</p>';return;}
  var pal=PUB.palette||{};Object.keys(pal).forEach(function(k){document.documentElement.style.setProperty("--"+k,pal[k]);});
  $("hTitle").textContent=PUB.title;$("lgT").textContent=PUB.title;$("lgS").textContent=PUB.dateLabel||"";
  try{AUTH=JSON.parse(localStorage.getItem("auth_"+PUB.slug)||"null");}catch(e){}
  if(AUTH&&AUTH.k){try{T=await openTrip(unhex(AUTH.k));}catch(e){T=null;AUTH=null;}}
  if(!T){$("login").style.display="flex";try{setupSW();}catch(e){}return;}
  startApp(false);
}
async function startApp(fresh){
  LS="viaggio_"+T.slug; POI=T.poi||{}; DAYS=T.days||[]; APP_VER=T.ver||"1";
  load();
  $("hTitle").textContent=T.title;header();
  $("inT").textContent=T.title;$("inS").textContent=(T.dateLabel||"")+" · "+T.people.map(function(p){return p.name;}).join(", ");
  $("finT").textContent=T.title;$("verTag").textContent="Versione "+APP_VER;
  $("nav").innerHTML=TABS.map(function(t,i){return '<button data-t="'+t[0]+'" class="'+(i===0?"on":"")+'" onclick="go(\''+t[0]+'\')">'+t[1]+'</button>';}).join("");
  var seen=false;try{seen=sessionStorage.getItem(LS+"_in")==="1";}catch(e){} if(!seen)showIntro();
  $("fileIn").addEventListener("change",function(e){var a=Array.prototype.slice.call(e.target.files||[]);e.target.value="";if(a.length)addFiles(a);});
  $("docIn").addEventListener("change",function(e){var a=Array.prototype.slice.call(e.target.files||[]),poi=e.target.dataset.poi||"";e.target.value="";if(a.length)addDocs(a,poi);});
  countdown();renderGruppo();
  try{setupSW();}catch(e){}
  try{await openDB();await loadBlobs();await loadDocs();}catch(e){}
  loadWx();sync();
  setInterval(function(){countdown();try{notifTick();}catch(e){} if(curTab==="s-viaggio"&&vTab===-1){var a=document.activeElement;if(!a||a.tagName!=="INPUT")renderViaggio();}},60000);
  setInterval(function(){if(document.visibilityState==="visible")sync();},45000);
  window.addEventListener("online",function(){loadWx();sync();});
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")sync();});
}
document.addEventListener("DOMContentLoaded",boot);
