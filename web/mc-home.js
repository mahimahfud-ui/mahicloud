(function(){
var d=document,root=d.documentElement,$=function(s){return d.querySelector(s)},$$=function(s){return[].slice.call(d.querySelectorAll(s))};
var RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
function ld(k,df){try{return JSON.parse(localStorage.getItem(k))||df}catch(e){return df}}
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

/* Library data — add new projects here */
var ITEMS=[
{id:'apps',n:'Apps',t:'Collection',c:'apps',h:'/apps/',i:'◧',s:'Phone & desktop apps',b:'live'},
{id:'flix',n:'MahiFlix',t:'Movies',c:'movies',h:'/mahiflix/',i:'▶',s:'Movie & web series directory',b:'live'},
{id:'tools',n:'Win · Linux · iOS',t:'Tools',c:'tools',h:'/linkora/',i:'⌘',s:'Tools for every platform',b:'live'},
{id:'ai',n:'Mahi AI',t:'Assistant',c:'tools',h:'/mahi-ai/',i:'✦',s:'Find the right tool fast',b:'beta'},
{id:'lumr',n:'Lumr',t:'Tool',c:'tools',h:'/lumr/',i:'◐',s:'Lightweight utility',b:'live'},
{id:'igc',n:'Instagram Cleaner',t:'Social',c:'social',h:'/instagram-cleaner.html',i:'◎',s:'Clean up your account',b:'live'},
{id:'unf',n:'Unfollowers',t:'Social',c:'social',h:'/unfollowers/',i:'☍',s:'See who unfollowed you',b:'live'},
{id:'bh',n:'Browser Helper',t:'Guide',c:'privacy',h:'/browser-helper-guide.html',i:'⛨',s:'Setup guide for helper tools',b:'live'},
{id:'pp',n:'Privacy Policy',t:'Privacy',c:'privacy',h:'/privacy',i:'⚖',s:'How MahiCloud treats your data',b:'live'},
{id:'dns',n:'DNS & Network',t:'Privacy',c:'privacy',i:'⌁',s:'Private DNS & network services',b:'soon'},
{id:'next',n:'Next project',t:'Future',c:'apps',i:'✚',s:'Something new is in the works',b:'soon'}];
var CATS=[['all','All'],['pinned','Pinned ☆'],['recent','Recent'],['apps','Apps'],['movies','Movies'],['tools','Tools'],['social','Social'],['privacy','Privacy']];
var st={cat:'all',q:'',view:ld('mc:view','grid')},pins=ld('mc:pins',[]),rec=ld('mc:rec',[]);
var tabs=$('.tabs'),files=$('#files');
tabs.innerHTML=CATS.map(function(c){return'<button role="tab" data-cat="'+c[0]+'">'+c[1]+'</button>'}).join('');
function byId(i){return ITEMS.filter(function(x){return x.id===i})[0]}
function render(){
  var q=st.q.toLowerCase().trim(),list=ITEMS,LB={live:'Live',beta:'Beta',soon:'Coming soon'};
  if(st.cat==='pinned')list=pins.map(byId).filter(Boolean);
  else if(st.cat==='recent')list=rec.map(byId).filter(Boolean);
  else if(st.cat!=='all')list=ITEMS.filter(function(x){return x.c===st.cat});
  if(q)list=list.filter(function(x){return(x.n+' '+x.s+' '+x.t+' '+x.c+' '+(x.b||'')).toLowerCase().indexOf(q)>-1});
  files.className='files'+(st.view==='list'?' list':'');files.setAttribute('aria-busy','false');
  files.innerHTML=list.length?list.map(function(x,k){var p=pins.indexOf(x.id)>-1,s=x.b||'live',
    inn='<span class="ic" aria-hidden="true">'+x.i+'</span><span class="tx"><span class="nm">'+x.n+'</span><span class="ds">'+x.s+'</span></span><span class="ty">'+x.t+'</span>';
    return'<div class="file'+(s==='soon'?' soon':'')+'" role="listitem" style="animation-delay:'+k*45+'ms"><span class="bd '+s+'">'+LB[s]+'</span>'+
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
$('#q').addEventListener('keydown',function(e){if(e.key==='Enter'){var a=files.querySelector('.fl');if(a)a.click()}});
files.addEventListener('click',function(e){var b=e.target.closest('.pin');if(!b)return;e.preventDefault();var i=b.dataset.pin,k=pins.indexOf(i);k>-1?pins.splice(k,1):pins.unshift(i);sv('mc:pins',pins);toast(k>-1?'Unpinned':'Pinned to your library');render()});
function go(id){d.getElementById(id).scrollIntoView({behavior:RM?'auto':'smooth'})}
$('#kbd').addEventListener('click',openCmd);

/* Sheet viewer */
var sheet=$('#sheet'),frame=$('#sheetFrame'),load=$('#sheetLoad'),last=null,cur='';
function openSheet(h,id,title,el){last=el||null;cur=location.origin+h;
  if(id){rec=[id].concat(rec.filter(function(x){return x!==id})).slice(0,6);sv('mc:rec',rec)}
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

/* Reveal + active nav */
var els=$$('.reveal');
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});
  els.forEach(function(el,i){el.style.setProperty('--i',i%3);io.observe(el)});
  var links=$$('.links a,.dock a'),so=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})})},{rootMargin:'-45% 0px -50% 0px'});
  ['home','library','why','privacy'].forEach(function(i){so.observe(d.getElementById(i))});
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
   {n:'Request a tool',t:'Action',i:'✚',f:function(){open('https://www.instagram.com/mahimahfud/','_blank','noopener')}},
   {n:'Copy site link',t:'Action',i:'⎘',f:function(){if(navigator.clipboard)navigator.clipboard.writeText(location.origin).then(function(){toast('Link copied')})}});
  ITEMS.forEach(function(x){var b={live:'Live',beta:'Beta',soon:'Soon'}[x.b||'live'];A.push(x.h?{n:x.n,t:b,i:x.i,s:x.s,f:function(){openSheet(x.h,x.id,x.n)}}:{n:x.n,t:'Coming soon',i:x.i,s:x.s,f:function(){toast(x.n+' is coming soon')}})});return A}
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
  else if(e.key==='Escape'){if(!cmd.hidden)closeCmd();else if(!sheet.hidden)closeSheet()}});

/* Skeleton first paint */
files.setAttribute('aria-busy','true');files.innerHTML=new Array(9).join('<i class="sk"></i>');
setTimeout(render,RM?0:550);
})();
