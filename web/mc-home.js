(function(){
var d=document,root=d.documentElement,$=function(s){return d.querySelector(s)},$$=function(s){return[].slice.call(d.querySelectorAll(s))};
var RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
function ld(k,df){try{return JSON.parse(localStorage.getItem(k))||df}catch(e){return df}}
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

/* Library data — add new projects here */
var ITEMS=[{id:'apps',n:'Apps',t:'Collection',k:'apps',h:'/apps/',s:'Phone & desktop apps',b:'live',p:['Android','Windows','Web'],d:'A growing collection of apps built by Mahi for phone and desktop.',g:'<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',c:['#3b82f6','#1e40af']},
{id:'flix',n:'MahiFlix',t:'Movies',k:'movies',h:'/mahiflix/',s:'Movie & web series directory',b:'live',p:['Web'],d:'A directory of movie and web-series apps and websites in one place.',g:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',c:['#e50914','#7a0309']},
{id:'tools',n:'Win · Linux · iOS',t:'Tools',k:'tools',h:'/linkora/',s:'Tools for every platform',b:'live',p:['Windows','Linux','iOS','Web'],d:'Handy tools and utilities for Windows, Linux and iOS.',g:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',c:['#22d3ee','#0e7490']},
{id:'lumr',n:'Lumr',t:'Tool',k:'tools',h:'/lumr/',s:'Lightweight utility',b:'live',p:['Web'],d:'A lightweight utility that opens instantly in your browser.',g:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="#fff"/>',c:['#fbbf24','#b45309']},
{id:'igc',n:'Instagram Cleaner',t:'Social',k:'social',h:'/instagram-cleaner.html',s:'Clean up your account',b:'live',p:['Web'],d:'Helps you tidy up your Instagram account activity.',g:'<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/>',c:['#f43f8e','#9d174d']},
{id:'unf',n:'Unfollowers',t:'Social',k:'social',h:'/unfollowers/',s:'See who unfollowed you',b:'live',p:['Web'],d:'Check who stopped following you.',g:'<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-4 3-6 7-6s7 2 7 6M17 9l4 4M21 9l-4 4"/>',c:['#fb923c','#c2410c']},
{id:'bh',n:'Browser Helper',t:'Guide',k:'privacy',h:'/browser-helper-guide.html',s:'Setup guide for helper tools',b:'live',p:['Web'],d:'Step-by-step guide for setting up the browser helper tools.',g:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',c:['#22c55e','#166534']},
{id:'pp',n:'Privacy Policy',t:'Privacy',k:'privacy',h:'/privacy',s:'How MahiCloud treats your data',b:'live',p:['Web'],d:'How MahiCloud handles your data and privacy.',g:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',c:['#14b8a6','#115e59']},
{id:'dns',n:'DNS & Network',t:'Privacy',k:'privacy',s:'Private DNS & network services',b:'soon',p:['Web'],d:'Private DNS and network services are on the way.',g:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',c:['#6366f1','#3730a3']},
{id:'next',n:'Next project',t:'Future',k:'apps',s:'Something new is in the works',b:'soon',p:['Web'],d:'A new project is being built.',g:'<path d="M12 5v14M5 12h14"/>',c:['#64748b','#334155']}];
var CATS=[['all','All'],['pinned','Pinned ☆'],['recent','Recent'],['apps','Apps'],['movies','Movies'],['tools','Tools'],['social','Social'],['privacy','Privacy']];
var st={cat:'all',q:'',view:ld('mc:view','grid')},pins=ld('mc:pins',[]),rec=ld('mc:rec',[]);
var tabs=$('.tabs'),files=$('#files');
tabs.innerHTML=CATS.map(function(c){return'<button role="tab" data-cat="'+c[0]+'">'+c[1]+'</button>'}).join('');
function byId(i){return ITEMS.filter(function(x){return x.id===i})[0]}
function render(){
  var q=st.q.toLowerCase().trim(),list=ITEMS,LB={live:'Live',beta:'Beta',soon:'Coming soon'};
  if(st.cat==='pinned')list=pins.map(byId).filter(Boolean);
  else if(st.cat==='recent')list=rec.map(byId).filter(Boolean);
  else if(st.cat!=='all')list=ITEMS.filter(function(x){return x.k===st.cat});
  if(q)list=list.filter(function(x){return(x.n+' '+x.s+' '+x.t+' '+x.k+' '+(x.b||'')).toLowerCase().indexOf(q)>-1});
  files.className='files'+(st.view==='list'?' list':'');files.setAttribute('aria-busy','false');
  files.innerHTML=list.length?list.map(function(x,k){var p=pins.indexOf(x.id)>-1,s=x.b||'live',
    var category={apps:'Apps',movies:'Movies',tools:'Tools',social:'Social',privacy:'Privacy'}[x.k]||x.t;\n     inn='<span class="ic" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'" aria-hidden="true">'+ico(x)+'</span><span class="tx"><span class="nm">'+x.n+'</span><span class="ds">'+x.s+'</span></span><span class="ty">'+category+'</span>'+(x.b==='soon'?'<span class="status-badge soon">Coming soon</span>':x.b==='beta'?'<span class="status-badge">Beta</span>':'');
    return'<div class="file'+(s==='soon'?' soon':'')+'" role="listitem" style="animation-delay:'+k*45+'ms">'+
    (x.h?'<a class="fl" href="'+x.h+'" data-sheet data-id="'+x.id+'" data-title="'+x.n+'">'+inn+'</a><button class="pin" data-pin="'+x.id+'" aria-pressed="'+p+'" aria-label="'+(p?'Unpin ':'Pin ')+x.n+'">'+(p?'★':'☆')+'</button>':'<div class="fl" aria-disabled="true">'+inn+'</div>')+'</div>'}).join('')
   :'<div class="empty"><b>'+(st.cat==='pinned'?'☆':st.cat==='recent'?'◷':'⌕')+'</b>'+(st.cat==='pinned'?'Nothing pinned yet — tap ☆ on any project.':st.cat==='recent'?'Projects you open will show up here.':'No matches. Try another word.')+'</div>';
  $('#count').textContent=list.length+' item'+(list.length===1?'':'s')+' · '+pins.length+' pinned';
  $('#pathCat').textContent=(CATS.filter(function(c){return c[0]===st.cat})[0]||[0,'Library'])[1].replace(' ☆','');
  $$('.tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.cat===st.cat);b.setAttribute('aria-selected',b.dataset.cat===st.cat)});
  $$('[data-view]').forEach(function(b){b.classList.toggle('on',b.dataset.view===st.view)});
}
tabs.addEventListener('click',function(e){var b=e.target.closest('button');if(b){st.cat=b.dataset.cat;render()}});
$$('[data-view]').forEach(function(b){b.addEventListener('click',function(){st.view=b.dataset.view;sv('mc:view',st.view);render()})});
$('#q').addEventListener('input',function(e){st.q=e.target.value;if(st.q&&st.cat!=='all')st.cat='all';render()});

files.addEventListener('click',function(e){var b=e.target.closest('.pin');if(!b)return;e.preventDefault();var i=b.dataset.pin,k=pins.indexOf(i);k>-1?pins.splice(k,1):pins.unshift(i);sv('mc:pins',pins);toast(k>-1?'Unpinned':'Pinned to your library');render()});
function go(id){if(id==='why'){openWhy();return}var n=d.getElementById(id);if(n)n.scrollIntoView({behavior:RM?'auto':'smooth'})}
$('#kbd').addEventListener('click',openCmd);

/* Sheet viewer */
var sheet=$('#sheet'),frame=$('#sheetFrame'),load=$('#sheetLoad'),last=null,cur='';
function openSheet(h,id,title,el){last=el||null;cur=id?location.origin+'/?open='+id:location.origin+h;
  if(id){log(id);rec=[id].concat(rec.filter(function(x){return x!==id})).slice(0,6);sv('mc:rec',rec)}
  $('#sheetTitle').textContent=title||'MahiCloud';$('#sheetPath').textContent=h;$('#sheetOpen').href=h;
  load.classList.remove('off');frame.src=h+(h.indexOf('?')>-1?'&':'?')+'mc-embed=1';
  sheet.hidden=false;root.style.overflow='hidden';$('#sheetClose').focus()}
frame.addEventListener('load',function(){if(frame.getAttribute('src')!=='about:blank')load.classList.add('off')});
function closeSheet(){sheet.hidden=true;frame.src='about:blank';root.style.overflow='';if(last&&last.focus)last.focus();if(st.cat==='recent')render()}
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-sheet]');if(!a||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();openSheet(a.getAttribute('href'),a.dataset.id,a.dataset.title,a)});
$('#sheetClose').addEventListener('click',closeSheet);
$('#sheetReload').addEventListener('click',function(){load.classList.remove('off');frame.src=frame.src});
$('#sheetShare').addEventListener('click',function(){if(navigator.share){navigator.share({title:$('#sheetTitle').textContent,url:cur}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(cur).then(function(){toast('Link copied')})}});
var tt;function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},1800)}

/* Scroll: background (--p), progress bar, smart sticky nav */
var bar=$('.prog'),nav=$('.topnav'),tk=0,ly=0;
function onScroll(){if(tk)return;tk=1;requestAnimationFrame(function(){tk=0;var y=scrollY,m=root.scrollHeight-innerHeight,p=m>0?Math.min(1,Math.max(0,y/m)):0;root.style.setProperty('--p',p.toFixed(4));bar.style.transform='scaleX('+p+')';nav.classList.toggle('sc',y>24);var dy=y-ly;if(Math.abs(dy)>6){nav.classList.toggle('hide',dy>0&&y>160);ly=y}})}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);onScroll();
nav.addEventListener('focusin',function(){nav.classList.remove('hide')});

/* Why MahiCloud + activity */
var FE=[["Smart Universal Search","Search every project at once and launch from the results.",1],["What's New badges","NEW, UPDATED and BETA labels on projects.",1],["Install as App","Add MahiCloud to your home screen. Works offline.",1],["Live Status Monitor","Real health checks: Operational, Degraded, Unavailable.",1],["App Details","Platforms, requirements, privacy and Open Project.",1],["Request & Voting","Suggest tools and vote. Needs a backend.",0],["Personal Workspace","Pins and layout, saved on your device.",0],["Bangla + English","One-tap language switch.",0],["Command Palette","Search plus actions: pin, share, zen, install.",1],["Private Analytics","See which projects you open most.",1],["Quick Actions","Right-click or long-press a card.",1],["Collection Playlists","Build your own tool collections.",0],["Smart Suggestions","“Because you opened…” shelf in the Store.",1],["Changelog per Project","What changed, shown in each project’s details.",1],["Zen Mode","Hide distractions, keep only the library.",1],["Split View","Two projects side by side.",0],["Activity Timeline","Your last 7 days of activity.",1],["Deep Links","Share a link that opens a project directly.",1],["Offline Favorites","Pinned projects stay visible offline.",1],["Night Mood","A softer look late at night.",1]];
$('#perks').innerHTML=FE.map(function(f,k){return'<div class="perk card reveal"><b>'+(k+1)+'</b><h3>'+f[0]+'</h3><p>'+f[1]+'</p><span class="tg'+(f[2]?' on':'')+'">'+(f[2]?'Live':'Soon')+'</span></div>'}).join('');
function log(id){var L=ld('mc:log',[]);L.push([Date.now(),id]);sv('mc:log',L.slice(-300));act()}
function act(){var L=ld('mc:log',[]),day=864e5,t0=new Date().setHours(0,0,0,0),bars=[0,0,0,0,0,0,0],td=0,tc={};
  L.forEach(function(e){var a=Math.round((t0-new Date(e[0]).setHours(0,0,0,0))/day);if(a===0)td++;if(a>=0&&a<7){bars[6-a]++;tc[e[1]]=(tc[e[1]]||0)+1}});
  var top=Object.keys(tc).sort(function(a,b){return tc[b]-tc[a]}).slice(0,3),mx=Math.max.apply(null,bars.concat(1));
  $('#act').innerHTML='<div class="act-h"><b>'+(td?'You opened '+td+' project'+(td>1?'s':'')+' today':'No projects opened today yet')+'</b><small>Private · stored only on this device</small></div><div class="bars">'+bars.map(function(n,k){return'<i style="--h:'+Math.max(8,n/mx*100)+'%" title="'+n+' opens"><u>'+'SMTWTFS'.charAt(new Date(t0-(6-k)*day).getDay())+'</u></i>'}).join('')+'</div><div class="top">'+(top.length?top.map(function(i){var x=byId(i);return'<span class="chip glass">'+(x?x.n:i)+' · '+tc[i]+'</span>'}).join(''):'<span class="muted">Your most-used tools will appear here.</span>')+'</div>'}
act();

/* Reveal + active nav */
var els=$$('.reveal');
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});
  els.forEach(function(el,i){el.style.setProperty('--i',i%3);io.observe(el)});
  var links=$$('.links a,.dock a'),so=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})})},{rootMargin:'-45% 0px -50% 0px'});
  ['home','library','privacy'].forEach(function(i){var n=d.getElementById(i);if(n)so.observe(n)});
}else els.forEach(function(el){el.classList.add('in')});
/* ---------- Premium layer ---------- */
var spot=$('.spot'),mag=null,til=null,raf=0,ev;
function rs(el){if(el)['--tx','--ty','--rx','--ry'].forEach(function(p){el.style.removeProperty(p)})}
if(!RM)d.addEventListener('pointermove',function(e){if(e.pointerType!=='mouse')return;ev=e;if(raf)return;raf=requestAnimationFrame(function(){raf=0;var x=ev.clientX,y=ev.clientY,t=ev.target;
  spot.style.transform='translate3d('+(x-320)+'px,'+(y-320)+'px,0)';
  var m=t.closest&&t.closest('.pill,.circle'),c=t.closest&&t.closest('.file:not(.soon),.perk');
  if(mag&&mag!==m)rs(mag);if(til&&til!==c)rs(til);mag=m;til=c;
  if(m){var r=m.getBoundingClientRect();m.style.setProperty('--tx',((x-r.left-r.width/2)*.22).toFixed(1)+'px');m.style.setProperty('--ty',((y-r.top-r.height/2)*.3).toFixed(1)+'px')}
  if(c){var q=c.getBoundingClientRect(),px=(x-q.left)/q.width,py=(y-q.top)/q.height;c.style.setProperty('--rx',((.5-py)*9).toFixed(2)+'deg');c.style.setProperty('--ry',((px-.5)*11).toFixed(2)+'deg');c.style.setProperty('--px',(px*100).toFixed(0)+'%');c.style.setProperty('--py',(py*100).toFixed(0)+'%')}})},{passive:true});
root.addEventListener('pointerleave',function(){rs(mag);rs(til);mag=til=null});
d.addEventListener('pointerdown',function(e){var t=e.target.closest&&e.target.closest('.pill,.circle,.tabs button');if(!t||RM)return;var r=t.getBoundingClientRect(),s=d.createElement('span');s.className='rip';s.style.cssText='left:'+(e.clientX-r.left)+'px;top:'+(e.clientY-r.top)+'px';t.appendChild(s);setTimeout(function(){s.remove()},650)});

/* Command palette */
var cmd=$('#cmd'),cq=$('#cmdq'),cl=$('#cmdl'),ci=0,cr=[],cprev=null;
function acts(){var A=[['home','Home','⌂'],['library','Library','▦'],['why','Why MahiCloud','★'],['privacy','DNS, Network & Privacy','⛨']].map(function(s){return{n:s[1],t:'Go to',i:s[2],f:function(){go(s[0])}}});
  A.push({n:st.view==='grid'?'Switch to list view':'Switch to grid view',t:'Action',i:'☰',f:function(){st.view=st.view==='grid'?'list':'grid';sv('mc:view',st.view);render()}},
   {n:'Show pinned projects',t:'Action',i:'☆',f:function(){st.cat='pinned';render();go('library')}},
   {n:'Show recently opened',t:'Action',i:'◷',f:function(){st.cat='recent';render();go('library')}},
   {n:'Open Store',t:'Action',i:'▦',f:openStore},{n:'Toggle Zen mode',t:'Action',i:'◌',f:zen},{n:'Install MahiCloud',t:'Action',i:'⇩',f:install},{n:'Change theme',t:'Action',i:'◐',f:openTheme},{n:'Request a tool',t:'Action',i:'✚',f:function(){open('https://wa.me/8801819856148','_blank','noopener')}},
   {n:'Copy site link',t:'Action',i:'⎘',f:function(){if(navigator.clipboard)navigator.clipboard.writeText(location.origin).then(function(){toast('Link copied')})}});
  ITEMS.forEach(function(x){var b={live:'Live',beta:'Beta',soon:'Soon'}[x.b||'live'];A.push(x.h?{n:x.n,t:b,i:ico(x),s:x.s,f:function(){openSheet(x.h,x.id,x.n)}}:{n:x.n,t:'Coming soon',i:ico(x),s:x.s,f:function(){toast(x.n+' is coming soon')}})});return A}
function cdraw(){var q=cq.value.toLowerCase().trim();cr=acts().filter(function(a){return!q||(a.n+' '+(a.s||'')+' '+a.t).toLowerCase().indexOf(q)>-1});ci=Math.min(ci,Math.max(0,cr.length-1));
  cl.innerHTML=cr.length?cr.map(function(a,k){return'<li class="cmd-i'+(k===ci?' on':'')+'" role="option" data-k="'+k+'"><b>'+a.i+'</b><span>'+a.n+(a.s?'<small>'+a.s+'</small>':'')+'</span><em>'+a.t+'</em></li>'}).join(''):'<li class="cmd-e">No results</li>';
  var o=cl.querySelector('.on');if(o)o.scrollIntoView({block:'nearest'})}
function openCmd(){cprev=d.activeElement;cmd.hidden=false;root.style.overflow='hidden';cq.value='';ci=0;cdraw();cq.focus()}
function closeCmd(){cmd.hidden=true;if(sheet.hidden)root.style.overflow='';if(cprev&&cprev.focus)cprev.focus()}
function runCmd(k){var a=cr[k];if(!a)return;closeCmd();setTimeout(a.f,60)}
cq.addEventListener('input',function(){ci=0;cdraw()});
cq.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){e.preventDefault();ci=(ci+1)%Math.max(1,cr.length);cdraw()}else if(e.key==='ArrowUp'){e.preventDefault();ci=(ci-1+cr.length)%Math.max(1,cr.length);cdraw()}else if(e.key==='Enter'){e.preventDefault();runCmd(ci)}});
cl.addEventListener('click',function(e){var li=e.target.closest('.cmd-i');if(li)runCmd(+li.dataset.k)});
cl.addEventListener('pointermove',function(e){var li=e.target.closest('.cmd-i');if(li&&+li.dataset.k!==ci){ci=+li.dataset.k;[].forEach.call(cl.children,function(c,k){c.classList.toggle('on',k===ci)})}});
cmd.addEventListener('click',function(e){if(e.target===cmd)closeCmd()});
d.addEventListener('keydown',function(e){var t=e.target.tagName,typing=t==='INPUT'||t==='TEXTAREA';
  if(((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')||(e.key==='/'&&!typing)){e.preventDefault();cmd.hidden?openCmd():closeCmd()}
  else if(e.key==='Escape'){if(!cmd.hidden)closeCmd();else if(!sheet.hidden)closeSheet();else if(!det.hidden)closeDet();else if(!store.hidden)closeStore();else if(!whyp.hidden)closeWhy();else{ctx.hidden=true;tm.hidden=true}}});

/* ---------- Store, details, status, PWA ---------- */
var LB2={live:'Live',beta:'Beta',soon:'Soon'},HL={up:'Operational',slow:'Degraded',down:'Unavailable'};
function ico(x){return'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+x.g+'</svg>'}
function ic(x){return'<span class="ic" style="--c1:'+x.c[0]+';--c2:'+x.c[1]+'">'+ico(x)+'</span>'}
function hd(x){return'<i class="hd '+(x.hs||'')+'" data-id="'+x.id+'" title="'+(HL[x.hs]||'Checking…')+'"></i>'}
function health(){var live=ITEMS.filter(function(x){return x.h}),n=0;
  if(!navigator.onLine){$('#hsum').textContent='Offline · saved shell';return}
  live.forEach(function(x){var t=Date.now();fetch(x.h,{method:'HEAD',cache:'no-store'}).then(function(r){x.hs=r.status>=500?'down':Date.now()-t>2500?'slow':'up'},function(){x.hs='down'}).then(function(){
    $$('.hd[data-id="'+x.id+'"]').forEach(function(e){e.className='hd '+x.hs;e.title=HL[x.hs]});
    if(++n===live.length){var bad=live.filter(function(y){return y.hs!=='up'}).length;$('#hsum').innerHTML='<span class="hs'+(bad?' warn':'')+'"></span>'+(bad?bad+' of '+n+' need attention':'All systems operational')}})})}
var STC=[['apps','Apps'],['movies','Movies & Series'],['tools','Tools'],['social','Social'],['privacy','Privacy & Network']],sc='all',store=$('#store'),sbody=$('#storeBody'),det=$('#det'),ctx=$('#ctx'),cid='';
function scard(x){return'<button class="sc" data-id="'+x.id+'">'+ic(x)+'<b>'+x.n+'</b><small>'+(x.b==='soon'?'Coming soon':x.t)+'</small></button>'}
function shelf(t,l){return'<section class="shelf"><h3>'+t+'</h3><div class="row">'+l.map(scard).join('')+'</div></section>'}
function drawStore(){var f=byId('flix'),h='<div class="lt">Store</div><div class="chips2">'+[['all','All']].concat(STC).map(function(c){return'<button class="chp'+(sc===c[0]?' on':'')+'" data-sc="'+c[0]+'">'+c[1]+'</button>'}).join('')+'</div>';
  if(sc==='all'){h+='<button class="hero2" data-id="'+f.id+'" style="--c1:'+f.c[0]+';--c2:'+f.c[1]+'"><span><small>Featured</small><b>'+f.n+'</b><em>'+f.s+'</em></span>'+ic(f)+'</button>';
    var r=rec[0]&&byId(rec[0]);if(r){var rel=ITEMS.filter(function(x){return x.k===r.k&&x.id!==r.id});if(rel.length)h+=shelf('Because you opened '+r.n,rel)}}
  STC.forEach(function(c){if(sc==='all'||sc===c[0]){var l=ITEMS.filter(function(x){return x.k===c[0]});if(l.length)h+=shelf(c[1],l)}});sbody.innerHTML=h}
function openStore(){drawStore();store.hidden=false;root.style.overflow='hidden'}
function closeStore(){store.hidden=true;root.style.overflow=''}
function openDet(id){var x=byId(id);if(!x)return;var s=x.b||'live',L=x.l||[];
  det.innerHTML='<div class="det-box glass"><button class="glass circle dx" data-x aria-label="Close">✕</button><div class="dh">'+ic(x)+'<div><h3>'+x.n+'</h3><p>'+x.t+' · <span class="bd2 '+s+'">'+LB2[s]+'</span>'+(x.nb?' <span class="bd2 nw">'+(x.nb==='new'?'NEW':'UPDATED')+'</span>':'')+'</p></div></div>'+
  (x.h?'<div class="dact"><button class="glass pill red" data-go="'+id+'">Open Project</button><button class="glass pill" data-pin2="'+id+'">'+(pins.indexOf(id)>-1?'★ Pinned':'☆ Pin')+'</button><button class="glass pill" data-sh="'+id+'">Share</button></div>':'<p class="muted">Coming soon — not available yet.</p>')+
  '<p class="dd">'+x.d+'</p><dl><div><dt>Platforms</dt><dd>'+x.p.join(' · ')+'</dd></div><div><dt>Status</dt><dd>'+(x.h?hd(x)+' '+(HL[x.hs]||'Checking…'):'—')+'</dd></div><div><dt>Version</dt><dd>'+(x.v||'—')+'</dd></div><div><dt>Requirements</dt><dd>'+(x.r||'A modern browser')+'</dd></div><div><dt>Privacy</dt><dd><a href="/privacy" data-sheet data-title="Privacy Policy">Read the policy</a></dd></div></dl><h4>What’s new</h4>'+
  (L.length?'<ul class="cl">'+L.map(function(e){return'<li><b>'+e[0]+'</b> '+e[1]+'</li>'}).join('')+'</ul>':'<p class="muted">No updates posted yet.</p>')+'</div>';det.hidden=false}
function closeDet(){det.hidden=true}
function share(id){var x=byId(id),u=location.origin+'/?open='+id;if(navigator.share)navigator.share({title:x.n,url:u}).catch(function(){});else if(navigator.clipboard)navigator.clipboard.writeText(u).then(function(){toast('Link copied')})}
function pin(id){var k=pins.indexOf(id);k>-1?pins.splice(k,1):pins.unshift(id);sv('mc:pins',pins);toast(k>-1?'Unpinned':'Pinned');render()}
function zen(){var z=d.body.classList.toggle('zen');$('#zenx').hidden=!z;if(z)go('library')}
$('#zenx').addEventListener('click',zen);$('#storeClose').addEventListener('click',closeStore);$('#storeSearch').addEventListener('click',function(){closeStore();openCmd()});
function showCtx(x,y,id){cid=id;var p=pins.indexOf(id)>-1;ctx.innerHTML=[['pin',p?'Unpin':'Pin'],['share','Share'],['copy','Copy link'],['tab','Open in new tab'],['req','Add to request list']].map(function(a){return'<button data-ca="'+a[0]+'">'+a[1]+'</button>'}).join('');ctx.style.left=Math.max(8,Math.min(x,innerWidth-200))+'px';ctx.style.top=Math.max(8,Math.min(y,innerHeight-230))+'px';ctx.hidden=false}
function cardId(t){var c=t.closest&&t.closest('.file:not(.soon),.sc');if(!c)return'';return c.dataset.id||(c.querySelector('[data-id]')||{dataset:{}}).dataset.id||''}
d.addEventListener('contextmenu',function(e){var id=cardId(e.target);if(id){e.preventDefault();showCtx(e.clientX,e.clientY,id)}});
var lt,lp=0;d.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;var id=cardId(e.target);if(id)lt=setTimeout(function(){lp=1;showCtx(e.clientX,e.clientY,id)},550)});
['pointerup','pointermove','pointercancel'].forEach(function(n){d.addEventListener(n,function(){clearTimeout(lt)},{passive:true})});
d.addEventListener('click',function(e){if(lp){lp=0;e.preventDefault();e.stopPropagation()}},true);
d.addEventListener('click',function(e){var t=e.target,b;
  if(!t.closest('#ctx'))ctx.hidden=true;
  if(b=t.closest('[data-why]')){e.preventDefault();openWhy();return}
  if(b=t.closest('[data-store]')){e.preventDefault();openStore();return}
  if(b=t.closest('[data-sc]')){sc=b.dataset.sc;drawStore();return}
  if(b=t.closest('.sc,.hero2')){openDet(b.dataset.id);return}
  if(t===det||t.closest('[data-x]')){closeDet();return}
  if(b=t.closest('[data-go]')){var x=byId(b.dataset.go);closeDet();openSheet(x.h,x.id,x.n);return}
  if(b=t.closest('[data-pin2]')){pin(b.dataset.pin2);openDet(b.dataset.pin2);return}
  if(b=t.closest('[data-sh]')){share(b.dataset.sh);return}
  if(b=t.closest('[data-ca]')){var a=b.dataset.ca,x2=byId(cid);ctx.hidden=true;
    if(a==='pin')pin(cid);else if(a==='share')share(cid);else if(a==='copy'&&navigator.clipboard)navigator.clipboard.writeText(location.origin+'/?open='+cid).then(function(){toast('Link copied')});
    else if(a==='tab')open(x2.h,'_blank','noopener');else if(a==='req'){var rq=ld('mc:req',[]);if(rq.indexOf(cid)<0)rq.push(cid);sv('mc:req',rq);toast('Added to your request list')}}
});

/* Search suggestions */
var sug=$('#sug'),si=0,sres=[];
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function hl(n,q){var i=n.toLowerCase().indexOf(q);return i<0?esc(n):esc(n.slice(0,i))+'<mark>'+esc(n.slice(i,i+q.length))+'</mark>'+esc(n.slice(i+q.length))}
function score(x,q){var n=x.n.toLowerCase();if(n.indexOf(q)===0)return 100;if(n.split(/[\s·&-]+/).some(function(w){return w.indexOf(q)===0}))return 70;if(n.indexOf(q)>-1)return 50;return(x.s+' '+x.t+' '+x.k+' '+x.p.join(' ')).toLowerCase().indexOf(q)>-1?20:0}
function drawSug(){var q=$('#q').value.toLowerCase().trim();if(!q){sug.hidden=true;return}
  sres=ITEMS.map(function(x){return[x,score(x,q)]}).filter(function(a){return a[1]}).sort(function(a,b){return b[1]-a[1]}).slice(0,6).map(function(a){return a[0]});si=0;
  sug.innerHTML=sres.length?sres.map(function(x,k){return'<div class="sg'+(k?'':' on')+'" role="option" data-k="'+k+'">'+ic(x)+'<span>'+hl(x.n,q)+'<small>'+esc(x.s)+'</small></span><em>'+(x.h?'Launch ↵':'Soon')+'</em></div>'}).join(''):'<div class="sg none">No matches for “'+esc(q)+'”</div>';sug.hidden=false}
function pick(k){var x=sres[k];if(!x)return;sug.hidden=true;x.h?openSheet(x.h,x.id,x.n):toast(x.n+' is coming soon')}
$('#q').addEventListener('input',drawSug);$('#q').addEventListener('focus',drawSug);
$('#q').addEventListener('keydown',function(e){if(sug.hidden)return;var n=sres.length;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();si=(si+(e.key==='ArrowDown'?1:n-1))%Math.max(1,n);[].forEach.call(sug.children,function(c,k){c.classList.toggle('on',k===si)})}else if(e.key==='Enter'){e.preventDefault();pick(si)}else if(e.key==='Escape'){sug.hidden=true}});
sug.addEventListener('mousedown',function(e){e.preventDefault()});
sug.addEventListener('click',function(e){var s=e.target.closest('.sg');if(s&&s.dataset.k)pick(+s.dataset.k)});
d.addEventListener('click',function(e){if(!e.target.closest('.search'))sug.hidden=true});

/* Why panel, iOS-style collapsing titles, shared live theme */
var whyp=$('#whyp'),whyb=$('#whyBody');
function openWhy(){whyp.hidden=false;root.style.overflow='hidden'}
function closeWhy(){whyp.hidden=true;root.style.overflow=''}
$('#whyClose').addEventListener('click',closeWhy);
[sbody,whyb].forEach(function(el){var p=el.parentNode,q=0;el.addEventListener('scroll',function(){if(q)return;q=1;requestAnimationFrame(function(){q=0;var k=Math.min(1,el.scrollTop/56);p.style.setProperty('--k',k.toFixed(3));p.classList.toggle('sd',el.scrollTop>4)})},{passive:true})});
var THEMES=[['crimson','Crimson','#e50914'],['midnight','Midnight','#3b82f6'],['emerald','Emerald','#10b981'],['violet','Violet','#8b5cf6'],['amber','Amber','#f59e0b'],['mono','Mono','#a1a1a6']],tm=$('#themeMenu'),tb=$('#themeBtn'),lastSet=0;
if(!root.dataset.theme)root.dataset.theme='crimson';
$('#sw').innerHTML=THEMES.map(function(t){return'<button data-th="'+t[0]+'" style="--sc:'+t[2]+'" aria-label="'+t[1]+'"><i></i>'+t[1]+'</button>'}).join('');
function markTheme(){[].forEach.call($('#sw').children,function(b){b.classList.toggle('on',b.dataset.th===root.dataset.theme)})}
function applyTheme(t){if(!THEMES.some(function(x){return x[0]===t}))return;root.dataset.theme=t;try{localStorage.setItem('mc:theme',t)}catch(e){}markTheme()}
function setTheme(t){applyTheme(t);lastSet=Date.now();fetch('/api/theme',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})}).then(function(r){toast(r.status===429?'Too many changes — try again in a minute':r.ok?'Theme changed for everyone':'Saved on this device only')}).catch(function(){toast('Offline — saved on this device only')})}
function pullTheme(){if(Date.now()-lastSet<6000)return;fetch('/api/theme',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(s){if(s&&s.theme&&s.theme!==root.dataset.theme)applyTheme(s.theme)}).catch(function(){})}
function openTheme(){tm.hidden=false;tb.setAttribute('aria-expanded','true');markTheme()}
tb.addEventListener('click',function(e){e.stopPropagation();if(tm.hidden)openTheme();else{tm.hidden=true;tb.setAttribute('aria-expanded','false')}});
$('#sw').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setTheme(b.dataset.th)});
d.addEventListener('click',function(e){if(!e.target.closest('#themeMenu,#themeBtn')){tm.hidden=true;tb.setAttribute('aria-expanded','false')}});
markTheme();pullTheme();setInterval(pullTheme,10000);d.addEventListener('visibilitychange',function(){if(!d.hidden)pullTheme()});

/* PWA, status, deep link, mood */
var dp=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;$('#inst').hidden=false});
function install(){if(dp){dp.prompt();dp.userChoice.then(function(){dp=null;$('#inst').hidden=true})}else toast('Browser menu → Install app / Add to Home Screen')}
$('#inst').addEventListener('click',install);
if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});
addEventListener('online',health);addEventListener('offline',health);health();setInterval(health,3e5);
var hr=new Date().getHours();if(hr>=22||hr<5)root.dataset.mood='night';
var dl=new URLSearchParams(location.search).get('open'),dx=dl&&byId(dl);if(dx)setTimeout(function(){dx.h?openSheet(dx.h,dx.id,dx.n):openDet(dl)},900);
$$('.soc a').forEach(function(a){a.addEventListener('click',function(){toast(a.classList.contains('ig')?'Opening Instagram…':'Opening WhatsApp…')})});

/* Skeleton first paint */
files.setAttribute('aria-busy','true');files.innerHTML=new Array(9).join('<i class="sk"></i>');
setTimeout(render,RM?0:550);
})();
