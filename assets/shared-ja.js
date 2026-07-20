/* ── stars & petals ── */
const $s = document.getElementById('stars');
for (let i=0;i<180;i++){
  const el=document.createElement('div'); el.className='star';
  const sz=Math.random()*2.5+.5;
  el.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${(Math.random()*3+2).toFixed(1)}s;--delay:${(Math.random()*4).toFixed(1)}s;`;
  $s.appendChild(el);
}
const petEmoji=['✨','⭐','🌟','💫','🌸','🍃'];
const $p=document.getElementById('petals');
for(let i=0;i<16;i++){
  const el=document.createElement('div'); el.className='petal';
  el.textContent=petEmoji[i%petEmoji.length];
  el.style.cssText=`left:${Math.random()*100}%;--fd:${(Math.random()*10+6).toFixed(1)}s;--fdelay:${(Math.random()*10).toFixed(1)}s;`;
  $p.appendChild(el);
}

/* ── reveal ── */
const ro=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in');}),{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=>ro.observe(el));

/* ── analytics helper ── */
function track(eventName, params){
  if(typeof gtag==='function') gtag('event', eventName, params||{});
}

/* ── state ── */
let drawn=[], drawnRv=[];
let shuffledDeck=[], selectedFromSpread=[];
let _pendingLetter='';
let _currentPetName='';

/* ── 78枚 ファンスプレッド ── */
function spreadConfig(){
  const mobile=window.innerWidth<580;
  const W=Math.min(836,window.innerWidth-44);
  return {
    R:       mobile?135:330,
    EXTRA:   mobile?0:70,
    CARD_W:  mobile?28:42,
    CARD_H:  mobile?50:72,
    ARC_HALF:mobile?75:78,
    containerH: mobile?175:320,
    containerW: W,
    cx: W/2,
    get cy(){ return this.containerH+this.EXTRA; }
  };
}

function applyArcPos(el, angle, cfg){
  const rad=angle*Math.PI/180;
  const x=cfg.cx+cfg.R*Math.sin(rad)-cfg.CARD_W/2;
  const y=cfg.cy-cfg.R*Math.cos(rad)-cfg.CARD_H/2;
  el.style.transform=`translate(${x}px,${y}px) rotate(${angle}deg)`;
}

function showSpread(){
  shuffledDeck=[...CARDS].sort(()=>Math.random()-.5);
  selectedFromSpread=[];
  const wrap=document.getElementById('fanWrap');
  wrap.innerHTML='';
  const cfg=spreadConfig();
  const N=78;
  const SIGMA=8, MAX_PUSH=4;
  shuffledDeck.forEach((card,i)=>{
    const angle=-cfg.ARC_HALF+(i/(N-1))*cfg.ARC_HALF*2;
    const el=document.createElement('div');
    el.className='fan-card';
    el.dataset.i=i;
    el.dataset.baseAngle=angle.toFixed(3);
    el.style.width =cfg.CARD_W+'px';
    el.style.height=cfg.CARD_H+'px';
    el.style.zIndex=Math.round(100-Math.abs(angle));
    el.innerHTML=`<div class="sc-border"></div><div class="sc-pattern"></div><div class="sc-glow"></div><div class="sc-symbol">🐾</div>`;
    applyArcPos(el, angle, cfg);
    el.addEventListener('mouseenter',()=>{
      if(el.classList.contains('fan-selected')||el.classList.contains('fan-disabled'))return;
      const rad=angle*Math.PI/180;
      const x=cfg.cx+(cfg.R+16)*Math.sin(rad)-cfg.CARD_W/2;
      const y=cfg.cy-(cfg.R+16)*Math.cos(rad)-cfg.CARD_H/2;
      el.style.transform=`translate(${x}px,${y}px) rotate(${angle}deg)`;
      el.style.zIndex=200;
      wrap.querySelectorAll('.fan-card:not(.fan-selected):not(.fan-disabled)').forEach(other=>{
        if(other===el)return;
        const ob=parseFloat(other.dataset.baseAngle);
        const diff=ob-angle;
        const g=Math.exp(-(diff*diff)/(2*SIGMA*SIGMA));
        const push=MAX_PUSH*g*(diff>=0?1:-1);
        applyArcPos(other,ob+push,cfg);
      });
    });
    el.addEventListener('mouseleave',()=>{
      if(el.classList.contains('fan-selected')||el.classList.contains('fan-disabled'))return;
      wrap.querySelectorAll('.fan-card:not(.fan-selected):not(.fan-disabled)').forEach(other=>{
        const ob=parseFloat(other.dataset.baseAngle);
        applyArcPos(other,ob,cfg);
        other.style.zIndex=Math.round(100-Math.abs(ob));
      });
    });
    el.addEventListener('click',()=>pickCard(i));
    wrap.appendChild(el);
  });
  const countEl=document.getElementById('spreadCount');
  countEl.textContent='カードを選んでください'; countEl.classList.remove('full');
  const sec=document.getElementById('spreadSection');
  sec.classList.remove('fading'); sec.classList.add('show');
  setTimeout(()=>sec.scrollIntoView({behavior:'smooth',block:'start'}),120);
}

function pickCard(i){
  if(selectedFromSpread.length>=1)return;
  selectedFromSpread.push(i);
  const el=document.querySelector(`.fan-card[data-i="${i}"]`);
  el.classList.add('fan-selected');
  const cfg=spreadConfig();
  const base=parseFloat(el.dataset.baseAngle);
  const rad=base*Math.PI/180;
  const x=cfg.cx+(cfg.R+16)*Math.sin(rad)-cfg.CARD_W/2;
  const y=cfg.cy-(cfg.R+16)*Math.cos(rad)-cfg.CARD_H/2;
  el.style.transform=`translate(${x}px,${y}px) rotate(${base}deg)`;
  el.style.zIndex=202;
  track('card_selected', {card_name: shuffledDeck[i]?.en||'', mode: currentMode});
  const countEl=document.getElementById('spreadCount');
  countEl.textContent='✓ 選択済み'; countEl.classList.add('full');
  setTimeout(()=>{
    document.querySelectorAll('.fan-card:not(.fan-selected)').forEach(e=>e.classList.add('fan-disabled'));
  },200);
  setTimeout(transitionToCards,850);
}

function transitionToCards(){
  drawn=[shuffledDeck[selectedFromSpread[0]]];
  drawnRv=[Math.random()<0.3];
  const spreadSec=document.getElementById('spreadSection');
  spreadSec.classList.add('fading');
  setTimeout(()=>{
    spreadSec.classList.remove('show','fading');
    renderCards();
    const cardSec=document.getElementById('cardsSection');
    cardSec.classList.add('show');
    setTimeout(()=>cardSec.scrollIntoView({behavior:'smooth',block:'start'}),100);
  },380);
}

function renderCards(){
  const grid=document.getElementById('cardsGrid');
  grid.innerHTML='';
  const card=drawn[0], rv=drawnRv[0];
  const slot=document.createElement('div');
  slot.className='card-slot';
  slot.innerHTML=`
    <div class="card-wrap">
      <div class="tarot-card" id="tc-0" onclick="flipCard(0)">
        <div class="card-back">
          <div class="cb-border"></div>
          <div class="cb-pattern"></div>
          <div class="cb-symbol">🐾</div>
          <div class="cb-glow"></div>
        </div>
        <div class="card-face ${rv?'is-reversed':'is-upright'}">
          <div class="card-img-box ${rv?'reversed':''}" id="imgbox-0">
            <img src="${card.img}" alt="${card.en}"
              onload="this.parentElement.classList.add('loaded')"
              onerror="onImgErr(this,0)">
            <div class="card-img-fallback" id="fb-0">
              <span class="fb-emoji">${suitEmoji(card.suit)}</span>
              <span class="fb-name">${card.en}</span>
            </div>
          </div>
          <div class="card-label">
            <div class="card-label-name">${card.en}</div>
            <div class="card-label-rv">${rv?'↕ 逆位置':'正位置'}</div>
          </div>
        </div>
      </div>
    </div>`;
  grid.appendChild(slot);
}

function suitEmoji(suit){
  return {major:'✨',wands:'🔥',cups:'💧',swords:'⚔️',pents:'🌿'}[suit]||'✨';
}

function onImgErr(img,i){
  img.style.display='none';
  const fb=document.getElementById('fb-'+i);
  if(fb){fb.style.display='flex';}
  document.getElementById('imgbox-'+i).classList.add('loaded');
}

function flipCard(idx){
  const el=document.getElementById('tc-'+idx);
  if(el.classList.contains('flipped'))return;
  el.classList.add('flipped');
  track('card_flipped', {card_name: drawn[0]?.en||'', reversed: drawnRv[0]});
  setTimeout(fetchReading,700);
}

/* ── AI reading ── */
async function fetchReading(){
  const loadEl=document.getElementById('loadingSection');
  loadEl.classList.add('show');
  document.getElementById('loadingText').innerHTML=
    `${PAGE_LOADING}<br><span style="font-size:.8rem;color:var(--text-dim)">もうしばらくお待ちください</span>`;
  setTimeout(()=>loadEl.scrollIntoView({behavior:'smooth',block:'center'}),80);

  const {petName,system,user}=buildPrompt();

  try{
    const res=await fetch('/.netlify/functions/tarot',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({system,messages:[{role:'user',content:user}]}),
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${res.status}`);}
    const data=await res.json();
    const full=data.content?.[0]?.text||'';
    const parts=full.split('---LETTER---');
    showReading(petName,(parts[0]||'').trim(),(parts[1]||'').trim());
  }catch(err){
    showReading(petName,'メッセージの送信中にエラーが発生しました。\n\nしばらくしてからもう一度お試しください。','');
  }
}

/* ── **太字** 対応タイピング ── */
function typeText(el, rawText, speed, onDone){
  const ops=[];
  rawText.split(/\*\*(.*?)\*\*/gs).forEach((part,idx)=>{
    const bold=idx%2===1;
    for(const ch of part) ops.push({ch,bold});
  });
  el.innerHTML='';
  let i=0, curSpan=null, curBold=null;
  function tick(){
    if(i>=ops.length){ if(onDone) onDone(); return; }
    const {ch,bold}=ops[i++];
    if(ch==='\n'){
      el.appendChild(document.createElement('br'));
      curSpan=null; curBold=null;
    } else {
      if(curSpan===null||bold!==curBold){
        curSpan=document.createElement(bold?'strong':'span');
        el.appendChild(curSpan); curBold=bold;
      }
      curSpan.textContent+=ch;
    }
    setTimeout(tick,speed);
  }
  tick();
}

function showReading(petName,interpretation,letter){
  document.getElementById('loadingSection').classList.remove('show');
  _pendingLetter=letter;
  _currentPetName=petName;
  try{if(petName&&location.pathname.indexOf('rainbow-tarot')===-1)localStorage.setItem('pt_petName',petName);var _ot=document.getElementById('ownerTitle');if(_ot&&_ot.value.trim())localStorage.setItem('pt_ownerTitle',_ot.value.trim());}catch(e){}
  track('reading_complete', { mode: currentMode, card: drawn[0]?.en || '' });

  const rv=drawnRv[0];
  document.getElementById('readingTitle').textContent=`${drawn[0].en} ${rv?'(逆位置)':'(正位置)'}`;

  const chips=document.getElementById('chipRow');
  chips.innerHTML=`<span class="chip${rv?' rv':''}">${drawn[0].en} ${rv?'(逆位置)':'(正位置)'}</span>`;

  const body=document.getElementById('readingBody');
  body.innerHTML='';
  document.getElementById('letterTrigger').style.display='none';
  document.getElementById('letterSection').style.display='none';
  document.getElementById('adInReading').style.display='none';
  document.getElementById('readingFooter').style.display='none';

  const sec=document.getElementById('readingSection');
  sec.classList.add('show');
  setTimeout(()=>sec.scrollIntoView({behavior:'smooth',block:'start'}),100);

  document.querySelector('.btn-open-letter').innerHTML=PAGE_LETTER_BTN;

  typeText(body, interpretation, 16, ()=>{
    setTimeout(()=>{ document.getElementById('letterTrigger').style.display='flex'; },400);
  });
}

function openLetter(){
  track('letter_opened');
  document.getElementById('letterTrigger').style.display='none';
  const petN=_currentPetName||'ペット';
  document.getElementById('letterTitle').textContent=PAGE_LETTER_TITLE(petN);

  const ls=document.getElementById('letterSection');
  ls.style.display='block';
  ls.scrollIntoView({behavior:'smooth',block:'start'});

  const body=document.getElementById('letterBody');
  body.innerHTML='';
  if(!_pendingLetter){
    body.textContent='手紙を受け取れませんでした。';
    showReadingFooter(); return;
  }
  typeText(body, _pendingLetter, 20, showReadingFooter);
}

function showReadingFooter(){
  document.querySelectorAll('.btn-draw').forEach(b=>b.disabled=false);
  document.getElementById('readingFooter').style.display='block';
  var _un=document.querySelector('.upsell-name');
  if(_un&&_currentPetName)_un.textContent=_currentPetName+'ちゃん';
  track('upsell_shown',{mode:(typeof currentMode!=='undefined'?currentMode:'')});
}

/* 日本語版は広告ネットワーク未接続 — 広告枠は非表示のまま */
function initReadingAd(){}

/* ── リセット処理 ── */
function doReset(){
  ['cardsSection','readingSection','loadingSection','spreadSection'].forEach(id=>document.getElementById(id).classList.remove('show'));
  document.querySelectorAll('input,textarea').forEach(el=>el.value='');
  document.querySelectorAll('.btn-draw').forEach(b=>b.disabled=false);
  document.getElementById('letterTrigger').style.display='none';
  document.getElementById('letterSection').style.display='none';
  document.getElementById('adInReading').style.display='none';
  document.getElementById('readingFooter').style.display='none';
  _pendingLetter='';
  _currentPetName='';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── インタースティシャル（全面広告） ── */
let itlTimer=null;

/* 日本語版は広告なしのためインタースティシャルをスキップ */
function onReset(){ track('reset_click'); doReset(); }

function showInterstitial(){
  const overlay=document.getElementById('itlOverlay');
  overlay.classList.add('show');
  const btn=document.getElementById('itlCloseBtn');
  btn.disabled=true;
  btn.innerHTML='<span id="itlCd">5</span>秒後に閉じる';
  let t=5;
  clearInterval(itlTimer);
  itlTimer=setInterval(()=>{
    t--;
    const cdEl=document.getElementById('itlCd');
    if(t>0){ if(cdEl)cdEl.textContent=t; }
    else{
      clearInterval(itlTimer);
      btn.innerHTML='閉じる &nbsp;✓';
      btn.disabled=false;
      btn.style.borderColor='rgba(180,120,255,.5)';
      btn.style.color='var(--text-main)';
    }
  },1000);
}

function closeInterstitial(){
  track('interstitial_closed');
  document.getElementById('itlOverlay').classList.remove('show');
  clearInterval(itlTimer);
  doReset();
}

/* 下部固定バナーは日本語版では未使用（要素なし） */
function closeStickyAd(){
  const el=document.getElementById('adSticky');
  if(el){ el.classList.remove('show'); document.body.classList.remove('has-sticky'); }
}

/* ── プライバシーポリシー モーダル ── */
function openPrivacy(){
  document.getElementById('privacyOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}
function closePrivacy(e){
  if(e && e.target!==document.getElementById('privacyOverlay'))return;
  document.getElementById('privacyOverlay').classList.remove('show');
  document.body.style.overflow='';
}

/* ── シェアカード 共通ビルダー ── */
function buildShareCardEl(){
  const card=drawn[0], rv=drawnRv[0];
  const petN=_currentPetName||'ペット';
  const mdToHtml=s=>s.replace(/\*\*(.*?)\*\*/gs,'<strong style="color:#f0dfff;font-weight:600;">$1</strong>').replace(/\n/g,'<br>');
  const interpretation=mdToHtml((document.getElementById('readingBody').innerText||'').trim());
  const letter=mdToHtml((document.getElementById('letterBody').innerText||'').trim());

  const sc=document.getElementById('shareCard');
  sc.innerHTML=`
    <div style="width:360px;padding:32px 26px 28px;
      background:linear-gradient(150deg,#1a0835 0%,#0c1045 45%,#041520 100%);
      font-family:'Noto Serif KR',serif;color:#f0e6ff;border-radius:22px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;
        background:linear-gradient(90deg,#ff6b6b,#ff9f43,#ffd32a,#0be881,#17c0eb,#7d5fff,#ef5777);"></div>
      <div style="position:absolute;inset:0;
        background:radial-gradient(ellipse at 25% 15%,rgba(110,50,210,.18) 0%,transparent 55%);pointer-events:none;"></div>
      <div style="position:relative;z-index:1;">
        <div style="text-align:center;margin-bottom:22px;">
          <div style="font-size:2.4rem;margin-bottom:6px;">${PAGE_ICON}</div>
          <div style="font-size:.72rem;color:#b090d0;letter-spacing:.08em;">${PAGE_TITLE}</div>
        </div>
        <div style="text-align:center;margin-bottom:20px;padding:13px 16px;border-radius:14px;
          background:rgba(160,80,255,.13);border:1px solid rgba(160,80,255,.28);">
          <div style="font-size:1.05rem;font-weight:600;color:#e8d0ff;">${card.en}</div>
          <div style="font-size:.7rem;color:#b090d0;margin-top:4px;">${rv?'逆位置':'正位置'}</div>
        </div>
        <div style="font-size:.76rem;line-height:1.95;color:#d8c4f0;
          border-left:2px solid rgba(160,80,255,.4);padding-left:13px;margin-bottom:${letter?'20px':'0'};">
          ${interpretation}</div>
        ${letter?`
        <div style="padding-top:16px;border-top:1px solid rgba(160,80,255,.18);">
          <div style="font-size:.68rem;color:#a080c0;margin-bottom:8px;">${PAGE_SHARE_LABEL(petN)}</div>
          <div style="font-size:.75rem;line-height:1.95;color:#e0d0f8;">${letter}</div>
        </div>`:''}
        <div style="text-align:center;margin-top:24px;padding-top:14px;
          border-top:1px solid rgba(255,255,255,.07);">
          <div style="font-size:.68rem;color:rgba(200,160,255,.8);font-weight:600;">🐾 ペットタロット</div>
          <div style="font-size:.6rem;color:rgba(180,140,220,.55);margin-top:5px;letter-spacing:.02em;">わたしもやってみる → rainbow-tarot.netlify.app/ja/</div>
        </div>
      </div>
    </div>`;
  return sc.firstElementChild;
}

async function renderShareCanvas(){
  const el=buildShareCardEl();
  await document.fonts.ready;
  return html2canvas(el,{
    backgroundColor:null, scale:2, useCORS:true, logging:false,
    width:360, height:el.scrollHeight,
  });
}

async function shareResult(){
  track('share_click',{mode:currentMode});
  if(typeof html2canvas==='undefined'){
    navigator.clipboard?.writeText(window.location.href)
      .then(()=>showToast('リンクをコピーしました!')).catch(()=>{});
    return;
  }
  showToast('画像を生成中…');
  try{
    const canvas=await renderShareCanvas();
    const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
    const file=new File([blob],'タロット結果.png',{type:'image/png'});
    const shareData={
      title: PAGE_TITLE,
      text: `${PAGE_TITLE}の結果をシェアします 🐾\nわたしもやってみる → https://rainbow-tarot.netlify.app/ja/`,
      url: 'https://rainbow-tarot.netlify.app/ja/',
    };
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({...shareData, files:[file]});
    } else if(navigator.share){
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showToast('リンクをコピーしました!');
    }
  }catch(e){
    if(e.name!=='AbortError') showToast('シェア中にエラーが発生しました');
  }
}

function shareX(){
  track('share_click',{mode:currentMode+'_x'});
  const text=`${PAGE_TITLE}でうちの子の気持ちを読んでもらいました🐾 #ペットタロット`;
  const url='https://rainbow-tarot.netlify.app/ja/';
  const shareUrl=`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl,'_blank','noopener,noreferrer,width=550,height=420');
}

async function saveImage(){
  track('save_image_click',{mode:currentMode});
  if(typeof html2canvas==='undefined'){ showToast('しばらくしてからもう一度お試しください'); return; }
  showToast('画像を生成中…');
  try{
    const canvas=await renderShareCanvas();
    const card=drawn[0];
    const link=document.createElement('a');
    link.download=`タロット_${card.en.replace(/ /g,'_')}_${Date.now()}.png`;
    link.href=canvas.toDataURL('image/png');
    link.click();
    showToast('画像を保存しました!');
  }catch(e){
    showToast('保存中にエラーが発生しました');
  }
}

/* ── トースト通知 ── */
function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){
    t=document.createElement('div'); t.id='toast';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2600);
}
