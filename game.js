(() => {
'use strict';
// ---------- setup ----------
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let CW, CH, DPR, SC;
function resize(){ DPR = Math.min(window.devicePixelRatio||1, 2); CW = innerWidth; CH = innerHeight; cv.width = CW*DPR; cv.height = CH*DPR; SC = Math.min(CW/560, CH/780); }
addEventListener('resize', resize); resize();

const TAU = Math.PI*2;
const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a + (b-a)*t;
const pick = a => a[(Math.random()*a.length)|0];
function hash(n){ const s = Math.sin(n*127.1+311.7)*43758.5453; return s - Math.floor(s); }
function segDist(px,py,ax,ay,bx,by){ const dx=bx-ax, dy=by-ay, l=dx*dx+dy*dy; let t = l ? ((px-ax)*dx+(py-ay)*dy)/l : 0; t = clamp(t,0,1); return Math.hypot(px-(ax+dx*t), py-(ay+dy*t)); }
function logEnds(e){ const c=Math.cos(e.a)*e.len/2, s=Math.sin(e.a)*e.len/2; return [e.x-c,e.y-s,e.x+c,e.y+s]; }

// river shape (forward = negative y)
const rc = y => Math.sin(y*0.0011)*140 + Math.sin(y*0.0029+1.3)*60;
const rh = y => { const d = Math.min(1, -y/45000); return 255 - d*75 + Math.sin(y*0.0007)*45; };

const QUIPS = ["EAT WATER!","YARD SALE!","SPECTACULAR!","10/10 FORM","SPLASHDOWN!","HYDRATED!","THAT'LL LEAVE A MARK","SEND HELP","SKIPPING STONES!","GRAVITY WINS"];
const RCOLS = ['#ff3b6b','#9b5cff','#2ecc71','#ff9f1a','#00c2d1','#f4f4f4'];
const PCOL = {hull:'#ffd400', vest:'#ff5a1f', helmet:'#ffffff'};

// ---------- audio ----------
let AC=null, master, eng, eng2, engFilt, engGain, noiseBuf, muted=false;
function ensureAudio(){
  if (AC){ if (AC.state==='suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext||window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    eng = AC.createOscillator(); eng.type='sawtooth';
    eng2 = AC.createOscillator(); eng2.type='square';
    engFilt = AC.createBiquadFilter(); engFilt.type='lowpass'; engFilt.frequency.value=500;
    engGain = AC.createGain(); engGain.gain.value=0;
    eng.connect(engFilt); eng2.connect(engFilt); engFilt.connect(engGain); engGain.connect(master);
    eng.start(); eng2.start();
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  } catch(e){ AC=null; }
}
function noise(dur,freq,q,vol,type){
  if(!AC||muted) return;
  const t=AC.currentTime, s=AC.createBufferSource(), f=AC.createBiquadFilter(), g=AC.createGain();
  s.buffer=noiseBuf; f.type=type||'bandpass'; f.frequency.value=freq; f.Q.value=q;
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+dur+0.05);
}
function tone(f1,f2,dur,vol,type){
  if(!AC||muted) return;
  const t=AC.currentTime, o=AC.createOscillator(), g=AC.createGain();
  o.type=type||'sine'; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(f2,t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
}
const sfx = {
  splash:()=>noise(0.45,900,0.7,0.45),
  bigSplash:()=>{ noise(1.1,500,0.5,0.8); tone(110,40,0.35,0.4); },
  crash:()=>{ noise(0.7,280,0.8,0.9,'lowpass'); tone(170,35,0.55,0.7,'triangle'); },
  boost:()=>{ tone(180,900,0.45,0.22,'sawtooth'); noise(0.6,2200,0.6,0.25); },
  coin:()=>tone(900,1800,0.1,0.15,'square'),
  bonk:()=>tone(320,110,0.15,0.3,'square'),
  jump:()=>tone(260,720,0.25,0.18,'triangle'),
  trick:()=>{ tone(523,1046,0.14,0.18,'square'); setTimeout(()=>tone(784,1568,0.2,0.18,'square'),110); },
  life:()=>{ tone(523,523,0.1,0.2,'square'); setTimeout(()=>tone(659,659,0.1,0.2,'square'),100); setTimeout(()=>tone(1046,1046,0.2,0.2,'square'),200); },
};

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) onKey(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const touch = {l:false,r:false,brake:false,boost:false};
let touchOn = false;
function enableTouch(){ if(touchOn) return; touchOn=true; document.getElementById('touch').style.display='flex'; }
if (window.matchMedia && matchMedia('(pointer:coarse)').matches) enableTouch();
function bindBtn(id,k){
  const el=document.getElementById(id);
  const on=e=>{ e.preventDefault(); touch[k]=true; el.classList.add('on'); ensureAudio(); if(state==='paused') state='play'; };
  const off=e=>{ e.preventDefault(); touch[k]=false; el.classList.remove('on'); };
  el.addEventListener('pointerdown',on); el.addEventListener('pointerup',off);
  el.addEventListener('pointercancel',off); el.addEventListener('pointerleave',off);
}
bindBtn('leftBtn','l'); bindBtn('rightBtn','r'); bindBtn('brakeBtn','brake'); bindBtn('boostBtn','boost');
function getInput(){
  const L = keys.ArrowLeft||keys.KeyA||touch.l, R = keys.ArrowRight||keys.KeyD||touch.r;
  return { steer:(R?1:0)-(L?1:0), up:!!(keys.ArrowUp||keys.KeyW), brake:!!(keys.ArrowDown||keys.KeyS||touch.brake),
           boost:!!(keys.Space||keys.ShiftLeft||keys.ShiftRight||touch.boost) };
}
cv.addEventListener('pointerdown', e => {
  if (e.pointerType==='touch'||e.pointerType==='pen') enableTouch();
  ensureAudio();
  if (state==='menu') start();
  else if (state==='over' && G.overT>0.8) start();
  else if (state==='paused') state='play';
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state==='play') state='paused'; });
addEventListener('blur', () => { if (state==='play') state='paused'; });
function onKey(c){
  if (c==='KeyM'){ muted=!muted; return; }
  if (state==='menu' && (c==='Enter'||c==='Space')){ ensureAudio(); start(); }
  else if (state==='over' && (c==='Enter'||c==='Space') && G.overT>0.8) start();
  else if (c==='KeyP'||c==='Escape'){ if(state==='play') state='paused'; else if(state==='paused') state='play'; }
}

// ---------- storage ----------
function loadBest(){ try { return +localStorage.getItem('surgeRiderBest')||0; } catch(e){ return 0; } }
function saveBest(v){ try { localStorage.setItem('surgeRiderBest', String(v)); } catch(e){} }

// ---------- game state ----------
let G, state='menu';
function newGame(){
  G = { t:0, score:0, dist:0, lives:3, mult:1, multT:0, nitro:60, best:loadBest(), nextLife:20000, newBest:false,
    stats:{tricks:0,takedowns:0,close:0,wipeouts:0},
    p:{x:rc(0),y:0,z:0,vz:0,vx:0,speed:150,heading:0,spin:0,spinV:0,air:false,hop:false,airT:0,boostT:0,
       invuln:1.5,state:'ride',lean:0,wakeCD:0,boosting:false,wasBoost:false},
    ents:[], parts:[], pops:[], nextY:-600, camX:rc(0), camY:0, look:0, zoom:1, shake:0, ts:1,
    wipe:null, msg:null, rivalT:4, overT:0 };
  for (let i=0;i<3;i++) spawnRival(-260-i*260, rand(250,320));
}
function start(){ newGame(); state='play'; banner('GO!','Land your spins straight!','#7CFFB2',1.4); }
const diff = () => clamp(-G.p.y/40000, 0, 1);

function addScore(n, useMult=true){ const v=Math.round(n*(useMult?G.mult:1)); G.score+=v; return v; }
function bumpMult(a){ G.mult=Math.min(8,G.mult+a); G.multT=3.5; }
function pop(text,x,y,col,size){ G.pops.push({text,x,y,life:1.1,max:1.1,col:col||'#fff',size:size||22}); }
function banner(text,sub,col,life,sub2,wob){ G.msg={text,sub,sub2,col,life,max:life,wob:!!wob}; }

// ---------- spawning ----------
function spawnRival(y, spd){
  const c=rc(y), h=rh(y), col=pick(RCOLS);
  const s = spd || rand(230,330)+diff()*80;
  G.ents.push({t:'rival',x:c+rand(-h*0.6,h*0.6),y,z:0,vz:0,speed:s,target:s,heading:0,col,state:'ride',wt:0,
    spin:0,spinV:0,air:false,bumpCD:0,lean:0,rider:null});
}
function spawnRow(y){
  const d=diff(), c=rc(y), h=rh(y), E=G.ents;
  const xr = () => c + rand(-h+45, h-45);
  const nRiv = E.filter(e=>e.t==='rival').length;
  const table = [['rock',24+d*14],['buoy',10],['ramp',9],['pad',8],['nitro',6],['coins',13],
    ['log',d>0.04?8+d*6:0],['shark',d>0.08?6+d*6:0],['rival',nRiv<5?6:0],['boat',d>0.12?3+d*3:0],
    ['whirl',d>0.18?3+d*3:0],['rockgate',d>0.25?5:0],['rampjump',d>0.1?5:0]];
  let tot=0; for (const [,w] of table) tot+=w;
  let r=Math.random()*tot, type='rock';
  for (const [k,w] of table){ if((r-=w)<=0){ type=k; break; } }
  const rock = (x,yy,rad) => E.push({t:'rock',x,y:yy,r:rad,seed:Math.random(),pts:Array.from({length:9},()=>rand(0.78,1.12))});
  switch(type){
    case 'rock': rock(xr(),y,rand(16,28)); break;
    case 'buoy': E.push({t:'buoy',x:xr(),y,r:10,ph:rand(0,TAU),vx:0,hitCD:0}); break;
    case 'ramp': E.push({t:'ramp',x:xr(),y,w:72,l:44}); break;
    case 'pad': E.push({t:'pad',x:xr(),y,w:54,l:66,used:false}); break;
    case 'nitro': E.push({t:'nitro',x:xr(),y,r:13}); break;
    case 'coins': { const x0=c+rand(-h+70,h-70); for(let i=0;i<6;i++) E.push({t:'coin',x:x0+Math.sin(i*0.7)*30,y:y-i*34,r:10}); break; }
    case 'log': E.push({t:'log',x:xr(),y,len:rand(70,110),a:rand(-0.5,0.5)}); break;
    case 'shark': E.push({t:'shark',bx:c+rand(-h*0.5,h*0.5),x:0,y,amp:rand(40,110),sp:rand(1.2,2.4),ph:rand(0,TAU),r:14,dir:1}); break;
    case 'rival': spawnRival(y); break;
    case 'boat': { const dir=Math.random()<.5?-1:1; E.push({t:'boat',x:c+rand(-h*0.4,h*0.4),y,vx:dir*rand(110,160),len:110,wid:36,wakeT:0}); break; }
    case 'whirl': E.push({t:'whirl',x:c+rand(-h*0.5,h*0.5),y,r:72,rot:0,cw:Math.random()<.5?-1:1}); break;
    case 'rockgate': { const gx=c+rand(-h*0.5,h*0.5); for(let x=c-h+18;x<=c+h-18;x+=44){ if(Math.abs(x-gx)<62) continue; rock(x,y,rand(17,22)); } E.push({t:'coin',x:gx,y,r:10}); break; }
    case 'rampjump': { const x=c+rand(-h*0.5,h*0.5); E.push({t:'ramp',x,y,w:72,l:44}); E.push({t:'log',x,y:y-120,len:110,a:rand(-0.15,0.15)}); for(let i=0;i<3;i++) E.push({t:'coin',x,y:y-90-i*30,r:10,high:true}); break; }
  }
}

// ---------- particles ----------
function foamP(x,y,s){ const l=rand(0.7,1.3); return {k:0,x,y,z:0,vx:rand(-12,12),vy:rand(-8,8),vz:0,life:l,max:l,size:s}; }
function drop(x,y,vx,vy,vz,s){ const l=rand(0.6,1.2); return {k:1,x,y,z:2,vx,vy,vz,life:l,max:l,size:s,col:Math.random()<.55?'#ffffff':'#bfe9ff'}; }
function splash(x,y,n,pow){
  pow=pow||1;
  for (let i=0;i<n;i++){ const a=rand(0,TAU), s=rand(30,170)*pow; G.parts.push(drop(x,y,Math.cos(a)*s,Math.sin(a)*s*0.8,rand(120,380)*pow,rand(2,4.5)*Math.min(1.6,pow))); }
  G.parts.push({k:2,x,y,z:0,vx:0,vy:0,vz:0,life:0.8,max:0.8,size:8*pow,grow:110*pow});
  for (let i=0;i<n/4;i++) G.parts.push(foamP(x+rand(-14,14)*pow,y+rand(-10,10)*pow,rand(5,10)*pow));
}
function updateParts(dt){
  for (const q of G.parts){
    q.life-=dt; q.x+=q.vx*dt; q.y+=q.vy*dt;
    if (q.k===1){ q.vz-=900*dt; q.z+=q.vz*dt; if(q.z<0) q.life=0; }
    else if (q.k===0){ q.vx*=0.97; q.vy*=0.97; q.size+=dt*6; }
    else q.size+=q.grow*dt;
  }
  G.parts = G.parts.filter(q=>q.life>0);
  if (G.parts.length>1300) G.parts.splice(0, G.parts.length-1300);
}

// ---------- player ----------
function nearMiss(e,gap){ if(gap<34 && G.p.speed>240 && G.p.z<5) e.close=true; }
function updatePlayer(dt,d){
  const p=G.p, inp=getInput(), maxS=380+d*120;
  p.invuln=Math.max(0,p.invuln-dt); p.wakeCD-=dt;
  p.boosting=false;
  if (inp.boost && G.nitro>0){ p.boosting=true; G.nitro=Math.max(0,G.nitro-30*dt); if(!p.wasBoost) sfx.boost(); }
  p.wasBoost=p.boosting;
  p.boostT=Math.max(0,p.boostT-dt);
  const boosted=p.boosting||p.boostT>0;
  let cap = inp.brake ? 90 : maxS*(inp.up?1:0.74);
  if (boosted && !inp.brake) cap = maxS*1.5;

  if (!p.air){
    if (p.speed<cap) p.speed=Math.min(cap,p.speed+(boosted?650:240)*dt);
    else p.speed=Math.max(cap,p.speed-(inp.brake?480:130)*dt);
    const tr=2.5*(0.55+0.45*Math.min(1,p.speed/300));
    p.heading+=inp.steer*tr*dt;
    if (!inp.steer) p.heading=lerp(p.heading,0,Math.min(1,dt*1.6));
    p.heading=clamp(p.heading,-1.05,1.05);
    p.lean=lerp(p.lean,inp.steer,Math.min(1,dt*8));
  } else {
    if (!p.hop){
      if (inp.steer){ p.spinV+=inp.steer*22*dt; p.spinV=clamp(p.spinV,-13,13); }
      else { const tgt=Math.round(p.spin/TAU)*TAU; p.spinV=lerp(p.spinV,(tgt-p.spin)*5,Math.min(1,dt*6)); }
      p.spin+=p.spinV*dt;
    }
    p.vz-=850*dt; p.z+=p.vz*dt; p.airT+=dt;
    if (p.z<=0) land();
    if (p.state!=='ride') return;
  }
  const tvx=Math.sin(p.heading)*p.speed;
  p.vx=lerp(p.vx,tvx,Math.min(1,dt*(p.air?0.4:3.0)));
  const vy=-Math.cos(p.heading)*p.speed, y0=p.y;
  p.x+=p.vx*dt; p.y+=vy*dt;
  const dy=y0-p.y; if (dy>0){ G.dist+=dy; G.score+=dy*0.1; }

  // spray & foam
  if (!p.air){
    const sx=p.x-Math.sin(p.heading)*18, sy=p.y+Math.cos(p.heading)*18;
    G.parts.push(foamP(sx+rand(-4,4),sy+rand(-3,3),rand(4,7)+p.speed/120));
    if (Math.random()<p.speed/450) G.parts.push(drop(sx,sy,rand(-30,30)+Math.sin(p.heading)*-80,Math.cos(p.heading)*rand(60,160),rand(60,170)*(boosted?1.6:1),rand(1.5,3)));
    if (inp.steer && p.speed>200 && Math.random()<0.8){ const side=-inp.steer;
      G.parts.push(drop(p.x+Math.cos(p.heading)*side*12,p.y+Math.sin(p.heading)*side*12,Math.cos(p.heading)*side*rand(90,220),rand(-30,40),rand(80,220),rand(1.5,3.5))); }
  }

  // collisions
  const lethal=p.invuln<=0;
  for (const e of G.ents){
    if (e.dead) continue;
    if (e.close && !e.nm && e.y>p.y+40){ e.nm=true; const v=addScore(75); G.stats.close++; pop('CLOSE CALL +'+v,p.x,p.y-40,'#9fffe0',18); bumpMult(0.5); }
    const dx=p.x-e.x, dy2=p.y-e.y;
    if (Math.abs(dy2)>160) continue;
    const dd=Math.hypot(dx,dy2)||0.001;
    switch(e.t){
      case 'rock':
        if (dd<e.r+11 && p.z<e.r*0.9){ if(lethal){ wipeout('ROCKED!'); return; } }
        else nearMiss(e,dd-e.r-11); break;
      case 'shark':
        if (dd<e.r+11 && p.z<10){ if(lethal){ wipeout('SHARK ATTACK!'); return; } }
        else nearMiss(e,dd-e.r-11); break;
      case 'log': { const sd=segDist(p.x,p.y,...logEnds(e));
        if (sd<21 && p.z<14){ if(lethal){ wipeout('LOGGED!'); return; } }
        else nearMiss(e,sd-21); break; }
      case 'boat': { const sd=segDist(p.x,p.y,e.x-e.len/2,e.y,e.x+e.len/2,e.y);
        if (sd<e.wid/2+11 && p.z<26){ if(lethal){ wipeout('T-BONED!'); return; } }
        else nearMiss(e,sd-e.wid/2-11); break; }
      case 'whirl':
        if (p.z<2 && dd<e.r){ const k=1-dd/e.r;
          p.x-=dx/dd*140*k*dt; p.heading+=dt*2.8*k*e.cw; p.speed*=1-0.7*k*dt;
          if (!e.warned){ e.warned=true; pop('WHIRLPOOL!',e.x,e.y-e.r,'#bfe9ff',18); }
          if (dd<15 && lethal){ wipeout('SUCKED UNDER!'); return; } }
        break;
      case 'buoy':
        if (dd<e.r+12 && p.z<12 && e.hitCD<=0){ const s=Math.sign(dx)||1; p.vx+=s*220; p.heading+=s*0.25; p.speed*=0.82; e.vx=-s*120; e.hitCD=0.5; sfx.bonk(); G.shake=Math.max(G.shake,5); pop('BONK',e.x,e.y-20,'#ffb0a8',16); splash(e.x,e.y,8,0.6); }
        break;
      case 'ramp':
        if (!p.air && Math.abs(dx)<e.w/2 && Math.abs(dy2)<e.l/2 && p.speed>110){
          p.air=true; p.hop=false; p.vz=clamp(p.speed*1.0,260,640); p.airT=0; p.spin=0; p.spinV=0; sfx.jump(); splash(p.x,p.y,10,0.8); }
        break;
      case 'pad':
        if (Math.abs(dx)<e.w/2 && Math.abs(dy2)<e.l/2 && p.z<5){ p.boostT=1.5; p.speed=Math.max(p.speed,maxS*1.3);
          if (!e.used){ e.used=true; sfx.boost(); pop('BOOST!',p.x,p.y-40,'#7ffcff',22); G.shake=Math.max(G.shake,4); } }
        break;
      case 'nitro':
        if (dd<e.r+14 && p.z<30){ e.dead=true; G.nitro=Math.min(100,G.nitro+40); sfx.coin(); pop('+NITRO',e.x,e.y-20,'#ffb24d',18); }
        break;
      case 'coin':
        if (dd<e.r+14 && (e.high ? true : p.z<30)){ e.dead=true; const v=addScore(50); sfx.coin(); pop('+'+v,e.x,e.y-14,'#ffe14d',15); }
        break;
      case 'wake':
        if (dd<15 && !p.air && p.wakeCD<=0 && p.speed>170){ p.air=true; p.hop=true; p.vz=140+p.speed*0.15; p.airT=0; p.wakeCD=0.5; splash(p.x,p.y,6,0.5); }
        break;
      case 'rival':
        if (e.state==='ride' && dd<24 && Math.abs(p.z-e.z)<16 && e.bumpCD<=0){
          e.bumpCD=0.4;
          if (boosted || (p.air && p.vz<0)){
            const how = p.air ? 'STOMPED!' : 'TAKEDOWN!';
            rivalWipe(e,true); const v=addScore(400); G.stats.takedowns++; bumpMult(1);
            banner(how,'+'+v,'#ff7ab0',1.1); G.shake=Math.max(G.shake,10); sfx.crash();
          } else {
            const s=Math.sign(dx)||1; p.vx+=s*200; e.x-=s*14; e.heading-=s*0.3; p.speed*=0.86;
            sfx.bonk(); G.shake=Math.max(G.shake,6); pop('BUMP',p.x,p.y-30,'#fff',16);
            if (Math.abs(p.speed-e.speed)>230 && lethal){ wipeout('REAR-ENDED!'); return; }
          }
        }
        break;
    }
  }
  // shore
  const c=rc(p.y), h=rh(p.y);
  if (Math.abs(p.x-c)>h-14 && p.z<5){
    if (p.speed>170 && lethal){ wipeout('BEACHED!'); return; }
    p.x=c+Math.sign(p.x-c)*(h-14); p.vx*=-0.3; p.heading*=0.5; p.speed*=0.97;
  }
}
function land(){
  const p=G.p; p.z=0; p.air=false; p.vz=0;
  if (p.hop){ p.hop=false; splash(p.x,p.y,8,0.6); return; }
  const n=((p.spin%TAU)+TAU)%TAU, off=Math.min(n,TAU-n);
  if (off>0.62){ p.invuln=0; wipeout('BAD LANDING!'); return; }
  const rots=Math.round(Math.abs(p.spin)/TAU);
  splash(p.x,p.y,22,1); sfx.splash(); G.shake=Math.max(G.shake,4);
  if (rots>0){ const v=addScore(350*rots*rots); bumpMult(rots); G.stats.tricks++; banner((rots*360)+'°!','+'+v,'#ffe14d',1.1, off>0.3?'SKETCHY LANDING':'CLEAN!'); sfx.trick(); }
  else if (p.airT>0.75){ const v=addScore(150); pop('BIG AIR +'+v,p.x,p.y-30,'#9ff',20); bumpMult(0.5); }
  p.spin=0; p.spinV=0; p.speed*=0.93;
}

// ---------- wipeouts ----------
function makeRider(x,y,z,vx,vy,vz){ return {x,y,z,vx,vy,vz,rot:rand(0,TAU),vr:rand(-14,14),bounces:0,swim:false}; }
function updRider(r,dt,isPlayer){
  if (!r.swim){
    r.vz-=900*dt; r.z+=r.vz*dt; r.x+=r.vx*dt; r.y+=r.vy*dt; r.rot+=r.vr*dt;
    if (r.z<=0){
      r.z=0;
      splash(r.x,r.y,r.bounces===0?38:16,r.bounces===0?1.5:0.9);
      if (isPlayer){ if(r.bounces===0) sfx.bigSplash(); else sfx.splash(); G.shake=Math.max(G.shake,r.bounces===0?12:5); }
      if (r.bounces<2 && -r.vz>200){ r.vz=-r.vz*0.42; r.vx*=0.6; r.vy*=0.6; r.vr*=0.7; r.bounces++; }
      else { r.vz=0; r.swim=true; }
    }
  } else {
    const k=Math.max(0,1-3*dt); r.vx*=k; r.vy*=k; r.x+=r.vx*dt; r.y+=r.vy*dt;
    if (Math.random()<0.15) G.parts.push(foamP(r.x+rand(-6,6),r.y+rand(-4,4),rand(3,6)));
  }
}
function wipeout(reason){
  const p=G.p; if (p.state!=='ride') return;
  p.state='wipe'; G.stats.wipeouts++;
  const vy=-Math.cos(p.heading)*p.speed, sp=p.speed;
  G.wipe={t:0,reason,
    rider:makeRider(p.x,p.y-6,p.z+12,p.vx*0.9+rand(-80,80),vy*0.95,220+sp*0.55),
    ski:{x:p.x,y:p.y,vx:p.vx*0.6+rand(-60,60),vy:vy*0.55,rot:p.heading+p.spin,vr:rand(-9,9)*(0.5+sp/500)}};
  splash(p.x,p.y,45,1.4); sfx.crash(); G.shake=20; G.ts=0.22;
  banner('WIPEOUT!',reason,'#ff4d2e',2.6,pick(QUIPS),true);
  G.mult=1; G.multT=0; p.air=false; p.z=0; p.boostT=0;
}
function updateWipe(dt){
  const w=G.wipe; w.t+=dt;
  updRider(w.rider,dt,true);
  const s=w.ski, k=Math.max(0,1-1.4*dt);
  s.x+=s.vx*dt; s.y+=s.vy*dt; s.vx*=k; s.vy*=k; s.rot+=s.vr*dt; s.vr*=Math.max(0,1-1.2*dt);
  const sp=Math.hypot(s.vx,s.vy);
  if (sp>50){ G.parts.push(foamP(s.x,s.y,rand(5,9))); if(Math.random()<0.7) G.parts.push(drop(s.x,s.y,rand(-80,80),rand(-80,80),rand(80,240),rand(2,4))); }
  if (w.t>2.9 && G.p.state==='wipe') endWipe();
}
function endWipe(){
  const p=G.p, w=G.wipe;
  G.lives--;
  if (G.lives<=0){ gameOver(); return; }
  const ry=Math.min(w.ski.y,w.rider.y);
  p.y=ry; p.x=rc(ry);
  for (const e of G.ents){
    if (['rock','log','shark','whirl','boat'].includes(e.t) && e.y>ry-380 && e.y<ry+120) e.dead=true;
    if (e.t==='rival' && Math.abs(e.y-ry)<80 && Math.abs(e.x-p.x)<40) e.x+=60;
  }
  G.wipe=null; p.state='ride'; p.invuln=2.5; p.speed=170; p.heading=0; p.vx=0; p.spin=0; p.spinV=0; p.z=0; p.air=false; p.hop=false;
  banner('BACK ON!', G.lives+(G.lives===1?' life left':' lives left'),'#7CFFB2',1.3);
}
function gameOver(){
  G.p.state='dead'; state='over'; G.overT=0;
  const s=Math.floor(G.score);
  if (s>G.best){ G.best=s; G.newBest=true; saveBest(s); }
  G.msg=null;
}
function rivalWipe(r,byPlayer){
  r.state='wipe'; r.wt=0;
  r.rider=makeRider(r.x,r.y,10,rand(-120,120),-r.speed*0.8,200+r.speed*0.4);
  r.skiRot=r.heading; r.vr=rand(-8,8); r.svx=rand(-80,80); r.air=false; r.z=0;
  splash(r.x,r.y,30,1.2);
  if (!byPlayer && Math.abs(r.y-G.p.y)<500){ pop('RIVAL WIPEOUT!',r.x,r.y-30,'#ffc2c2',17); sfx.splash(); }
}

// ---------- entities ----------
function updRival(r,dt){
  r.bumpCD-=dt;
  if (r.state==='wipe'){
    r.wt+=dt; updRider(r.rider,dt,false);
    r.speed*=Math.max(0,1-1.3*dt); r.skiRot+=r.vr*dt; r.vr*=Math.max(0,1-1.5*dt);
    r.x+=r.svx*dt; r.y-=r.speed*dt; r.svx*=Math.max(0,1-1.5*dt);
    if (r.wt>3){ r.state='ride'; r.x=clamp(r.rider.x,rc(r.rider.y)-rh(r.rider.y)+30,rc(r.rider.y)+rh(r.rider.y)-30); r.y=r.rider.y; r.speed=80; r.heading=0; r.rider=null; }
    return;
  }
  let steer=0; const look=150+r.speed*0.35;
  for (const e of G.ents){
    if (e===r || e.dead) continue;
    const dy=r.y-e.y; if (dy<0 || dy>look) continue;
    const dx=e.x-r.x; let w;
    switch(e.t){
      case 'rock': w=e.r+26; break; case 'shark': w=e.amp+30; break; case 'log': w=e.len/2+22; break;
      case 'whirl': w=e.r+10; break; case 'boat': w=e.len/2+40; break;
      case 'rival': if (e.state!=='ride') continue; w=26; break;
      case 'ramp': if (Math.abs(dx)<90) steer+=clamp(dx/40,-1,1)*0.5; continue;
      default: continue;
    }
    if (Math.abs(e.t==='shark'?(e.bx-r.x):dx)<w) steer+=((e.t==='shark'?(e.bx-r.x):dx)>0?-1:1)*(1.6-dy/look);
  }
  const c=rc(r.y-100), h=rh(r.y-100);
  steer+=clamp((c-r.x)/(h*0.8),-1,1)*0.8*Math.abs((r.x-c)/h);
  r.heading=lerp(r.heading,clamp(steer,-1,1)*0.7,Math.min(1,dt*3.5));
  r.lean=lerp(r.lean,clamp(steer,-1,1),Math.min(1,dt*6));
  r.speed=lerp(r.speed,r.target,Math.min(1,dt*0.7));
  r.x+=Math.sin(r.heading)*r.speed*dt; r.y-=Math.cos(r.heading)*r.speed*dt;
  if (r.air){ r.vz-=850*dt; r.z+=r.vz*dt; r.spin+=r.spinV*dt; if(r.z<=0){ r.z=0; r.air=false; r.spin=0; splash(r.x,r.y,10,0.7); } }
  else if (Math.random()<0.7) G.parts.push(foamP(r.x-Math.sin(r.heading)*18,r.y+Math.cos(r.heading)*18,rand(4,7)));
  const c2=rc(r.y), h2=rh(r.y);
  if (Math.abs(r.x-c2)>h2-16) r.x=c2+Math.sign(r.x-c2)*(h2-16);
  if (r.z<5) for (const e of G.ents){
    if (e.dead || e===r || Math.abs(e.y-r.y)>120) continue;
    let hit=false;
    if (e.t==='rock') hit=Math.hypot(e.x-r.x,e.y-r.y)<e.r+10;
    else if (e.t==='shark') hit=Math.hypot(e.x-r.x,e.y-r.y)<e.r+10;
    else if (e.t==='log') hit=segDist(r.x,r.y,...logEnds(e))<20;
    else if (e.t==='boat') hit=segDist(r.x,r.y,e.x-e.len/2,e.y,e.x+e.len/2,e.y)<e.wid/2+10;
    else if (e.t==='ramp' && !r.air && Math.abs(e.x-r.x)<e.w/2 && Math.abs(e.y-r.y)<e.l/2){
      r.air=true; r.vz=clamp(r.speed,260,560); r.spin=0;
      r.spinV=Math.random()<0.6 ? (Math.random()<.5?-1:1)*TAU/(2*r.vz/850) : 0;
    }
    if (hit){ rivalWipe(r,false); break; }
  }
}
function updateEnts(dt){
  const refY = G.p.state==='ride' ? G.p.y : G.camY;
  for (const e of G.ents){
    if (e.dead) continue;
    switch(e.t){
      case 'rival': updRival(e,dt); if (e.y>refY+900 || e.y<refY-2600) e.dead=true; break;
      case 'shark': { const a=G.t*e.sp+e.ph; e.x=e.bx+Math.sin(a)*e.amp; e.dir=Math.cos(a)>=0?1:-1;
        if (Math.random()<0.5) G.parts.push(foamP(e.x-e.dir*8,e.y+rand(-2,4),rand(3,5))); break; }
      case 'buoy': e.x+=e.vx*dt; e.vx*=Math.max(0,1-3*dt); e.hitCD-=dt; break;
      case 'whirl': e.rot+=dt*2.2*e.cw; break;
      case 'boat': {
        e.x+=e.vx*dt; const c=rc(e.y), h=rh(e.y);
        if ((e.vx>0 && e.x+e.len/2>c+h-20) || (e.vx<0 && e.x-e.len/2<c-h+20)){ e.vx=-e.vx; splash(e.x+Math.sign(-e.vx)*e.len/2,e.y,12,0.8); }
        e.wakeT-=dt;
        if (e.wakeT<=0){ e.wakeT=0.08; const sx=e.x-Math.sign(e.vx)*e.len*0.5;
          G.ents.push({t:'wake',x:sx,y:e.y-8,vy:-45,age:0},{t:'wake',x:sx,y:e.y+8,vy:45,age:0});
          G.parts.push(foamP(sx,e.y+rand(-6,6),rand(6,10))); }
        break; }
      case 'wake': e.age+=dt; e.y+=e.vy*dt; e.vy*=Math.max(0,1-0.6*dt); if (e.age>3.5) e.dead=true; break;
    }
    if (e.t!=='rival' && e.y>refY+800) e.dead=true;
  }
  G.ents = G.ents.filter(e=>!e.dead);
}

// ---------- main update ----------
function update(dtr){
  const p=G.p, w=G.wipe;
  if (w && w.t<0.9) G.ts=lerp(G.ts,0.28,Math.min(1,dtr*10));
  else G.ts=lerp(G.ts,1,Math.min(1,dtr*2.5));
  const dt=dtr*G.ts;
  G.t+=dt;
  if (p.state==='ride') updatePlayer(dt,diff());
  if (G.wipe) updateWipe(dt);
  const sy = G.wipe ? Math.min(G.wipe.ski.y,G.wipe.rider.y) : p.y;
  while (G.nextY > sy-1800){ spawnRow(G.nextY); G.nextY -= rand(110,190)*(1-0.45*diff()); }
  if (p.state==='ride'){ G.rivalT-=dt; if (G.rivalT<=0){ G.rivalT=rand(5,10); if (G.ents.filter(e=>e.t==='rival').length<5) spawnRival(p.y+520, rand(330,400)+diff()*80); } }
  updateEnts(dt);
  updateParts(dt);
  if (G.multT>0){ G.multT-=dt; if (G.multT<=0) G.mult=1; }
  for (const q of G.pops) q.life-=dtr;
  G.pops=G.pops.filter(q=>q.life>0);
  if (G.msg){ G.msg.life-=dtr; if (G.msg.life<=0) G.msg=null; }
  G.shake=Math.max(0,G.shake-dtr*30);
  if (G.score>=G.nextLife){ G.nextLife+=20000; if (G.lives<5 && p.state==='ride'){ G.lives++; pop('EXTRA LIFE!',p.x,p.y-50,'#7CFFB2',24); sfx.life(); } }
  // camera
  let fx=p.x, fy=p.y;
  if (G.wipe){ fx=(G.wipe.rider.x+G.wipe.ski.x)/2; fy=(G.wipe.rider.y+G.wipe.ski.y)/2; }
  const spd = p.state==='ride' ? p.speed : 0;
  G.look=lerp(G.look,spd*0.32,Math.min(1,dtr*2));
  G.camX=lerp(G.camX,fx*0.55+rc(fy-150)*0.45,Math.min(1,dtr*3));
  G.camY=lerp(G.camY,fy-G.look,Math.min(1,dtr*(G.wipe?3:12)));
  const zt = (G.wipe && G.wipe.t<1.2) ? 1.18 : 1-Math.min(0.16,spd/3500);
  G.zoom=lerp(G.zoom,zt,Math.min(1,dtr*2.5));
}

// ---------- drawing helpers ----------
function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function txt(s,x,y,size,col,align,stroke){
  ctx.font='900 '+size+'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  ctx.textAlign=align||'left'; ctx.textBaseline='alphabetic'; ctx.lineJoin='round';
  if (stroke!==false){ ctx.lineWidth=Math.max(3,size/6); ctx.strokeStyle='rgba(0,25,50,.85)'; ctx.strokeText(s,x,y); }
  ctx.fillStyle=col; ctx.fillText(s,x,y);
}
function starPath(x,y,r1,r2,n,rot,sx){ ctx.beginPath(); for(let i=0;i<n*2;i++){ const a=rot+i*Math.PI/n, r=i%2?r2:r1; const px=x+Math.cos(a)*r*sx, py=y+Math.sin(a)*r; i?ctx.lineTo(px,py):ctx.moveTo(px,py);} ctx.closePath(); }

function drawSki(x,y,rot,col,o){
  o=o||{};
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot); const s=o.scale||1; ctx.scale(s,s);
  ctx.fillStyle=col; ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,-28); ctx.quadraticCurveTo(13,-16,12,4); ctx.lineTo(11,18); ctx.quadraticCurveTo(0,22,-11,18); ctx.lineTo(-12,4); ctx.quadraticCurveTo(-13,-16,0,-28); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.85)'; ctx.beginPath(); ctx.moveTo(0,-24); ctx.quadraticCurveTo(6,-16,6,-8); ctx.lineTo(-6,-8); ctx.quadraticCurveTo(-6,-16,0,-24); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect(-10,0,4,15); ctx.fillRect(6,0,4,15);
  ctx.fillStyle='#222'; rr(-5,-2,10,18,4); ctx.fill();
  ctx.strokeStyle='#111'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-9,-8); ctx.lineTo(9,-8); ctx.stroke();
  if (o.rider!==false){
    const l=(o.lean||0)*3;
    ctx.strokeStyle='#f1c27d'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-6+l,2); ctx.lineTo(-9,-8); ctx.moveTo(6+l,2); ctx.lineTo(9,-8); ctx.stroke();
    ctx.fillStyle=o.vest||'#ff5a1f'; ctx.beginPath(); ctx.ellipse(l,4,7.5,6,0,0,TAU); ctx.fill();
    ctx.fillStyle=o.helmet||'#fff'; ctx.beginPath(); ctx.arc(l*1.2,1,5.5,0,TAU); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#1d2b3a'; ctx.beginPath(); ctx.arc(l*1.2,0,4,Math.PI*1.15,Math.PI*1.85); ctx.lineTo(l*1.2,-1); ctx.fill();
  }
  ctx.restore();
}
function drawRider(r,vest,helmet){
  const sc=1+r.z/260;
  if (r.z>2){ ctx.fillStyle='rgba(0,30,60,.25)'; ctx.beginPath(); ctx.ellipse(r.x,r.y,9,6,0,0,TAU); ctx.fill(); }
  ctx.save(); ctx.translate(r.x,r.y-r.z*0.8);
  if (r.swim){
    const b=Math.sin(G.t*4)*1.5;
    ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.ellipse(0,3,12+Math.sin(G.t*3)*2,7,0,0,TAU); ctx.stroke();
    ctx.fillStyle=vest; ctx.beginPath(); ctx.ellipse(0,3+b,8,5,0,0,TAU); ctx.fill();
    ctx.strokeStyle='#f1c27d'; ctx.lineWidth=3; ctx.lineCap='round';
    const wv=Math.sin(G.t*9)*0.6; ctx.beginPath(); ctx.moveTo(5,1+b); ctx.lineTo(5+Math.sin(wv)*10,-9+b); ctx.stroke();
    ctx.fillStyle=helmet; ctx.beginPath(); ctx.arc(0,-1+b,5.5,0,TAU); ctx.fill();
  } else {
    ctx.rotate(r.rot); ctx.scale(sc,sc);
    const f=Math.sin(G.t*22)*0.5;
    ctx.lineCap='round';
    ctx.strokeStyle='#f1c27d'; ctx.lineWidth=3.2; ctx.beginPath();
    ctx.moveTo(-5,-2); ctx.lineTo(-15,-10+f*8); ctx.moveTo(5,-2); ctx.lineTo(15,-10-f*8); ctx.stroke();
    ctx.strokeStyle='#2b3e8c'; ctx.lineWidth=3.8; ctx.beginPath();
    ctx.moveTo(-3,6); ctx.lineTo(-9+f*5,17); ctx.moveTo(3,6); ctx.lineTo(9-f*5,17); ctx.stroke();
    ctx.fillStyle=vest; ctx.beginPath(); ctx.ellipse(0,1,7,8,0,0,TAU); ctx.fill();
    ctx.fillStyle=helmet; ctx.beginPath(); ctx.arc(0,-10,5.5,0,TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------- world drawing ----------
function drawWater(L,R,T,B){
  ctx.fillStyle='#1b78ad'; ctx.fillRect(L-10,T-10,R-L+20,B-T+20);
  // darker patches
  const cs2=220; ctx.fillStyle='rgba(5,50,95,.16)';
  for (let cy=Math.floor(T/cs2)-1; cy<=Math.ceil(B/cs2); cy++) for (let cx=Math.floor(L/cs2)-1; cx<=Math.ceil(R/cs2); cx++){
    const h=hash(cx*13.7+cy*71.3); if (h>0.5) continue;
    ctx.beginPath(); ctx.ellipse(cx*cs2+h*cs2, cy*cs2+hash(cx+cy*9.1)*cs2, 60+h*80, 30+h*40, h*3, 0, TAU); ctx.fill();
  }
  const cs=70, t=G.t;
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.beginPath();
  for (let cy=Math.floor(T/cs); cy<=Math.ceil(B/cs); cy++) for (let cx=Math.floor(L/cs); cx<=Math.ceil(R/cs); cx++){
    const h=hash(cx*57.3+cy*13.1); if (h>0.6) continue;
    const x=cx*cs+hash(cx*7+cy*3.7)*cs + Math.sin(t*0.8+h*9)*4, y=cy*cs+h*cs+Math.sin(t*1.5+h*20)*5;
    const w=8+h*16; ctx.moveTo(x-w,y); ctx.quadraticCurveTo(x,y-5,x+w,y);
  }
  ctx.stroke();
}
function drawShores(L,R,T,B){
  const step=20, ys=[];
  for (let y=Math.floor(T/step)*step-step; y<=B+step; y+=step) ys.push(y);
  const wob = y => Math.sin(y*0.05)*4+Math.sin(y*0.013)*8;
  for (const side of [-1,1]){
    const edge = y => rc(y)+side*rh(y);
    const far = side<0 ? L-200 : R+200;
    const band = (off,col,w) => { ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(far,ys[0]); for (const y of ys) ctx.lineTo(edge(y)+side*(off+(w?wob(y):0)),y); ctx.lineTo(far,ys[ys.length-1]); ctx.closePath(); ctx.fill(); };
    band(-34,'rgba(70,200,215,.45)',false);
    band(-14,'rgba(110,220,225,.55)',false);
    band(0,'#efd9a0',false);
    band(28,'#e3c784',true);
    band(78,'#5aa64a',true);
    band(150,'#4c9440',true);
    ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=4; ctx.beginPath();
    ys.forEach((y,i) => { const x=edge(y)-side*(3+Math.sin(G.t*2.2+y*0.04)*3); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();
  }
  // palms & umbrellas
  const seg=130;
  for (let i=Math.floor(T/seg)-1; i<=Math.ceil(B/seg)+1; i++) for (const side of [-1,1]){
    const hs=hash(i*3.1+side*7.7), y=i*seg+hash(i+side*2.3)*100;
    if (hs<0.55){ const x=rc(y)+side*(rh(y)+95+hash(i*1.7+side)*90); drawPalm(x,y,hs); }
    else if (hs<0.72){ const x=rc(y)+side*(rh(y)+40); drawUmbrella(x,y,hs); }
  }
}
function drawPalm(x,y,s){
  ctx.fillStyle='rgba(0,40,0,.25)'; ctx.beginPath(); ctx.ellipse(x+14,y+8,26,12,0,0,TAU); ctx.fill();
  ctx.strokeStyle='#7b5a2e'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+4,y-8,x+8,y-14); ctx.stroke();
  const cx=x+8, cy=y-14;
  for (let k=0;k<6;k++){ const a=k*TAU/6+s*10+Math.sin(G.t*1.3+s*20)*0.05;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
    ctx.fillStyle=k%2?'#2f8a3a':'#3aa047'; ctx.beginPath(); ctx.ellipse(16,0,17,6,0,0,TAU); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(30,0); ctx.stroke();
    ctx.restore(); }
  ctx.fillStyle='#6b4a22'; ctx.beginPath(); ctx.arc(cx,cy,4,0,TAU); ctx.fill();
}
function drawUmbrella(x,y,s){
  ctx.fillStyle='rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x+6,y+5,18,10,0,0,TAU); ctx.fill();
  const cols = s<0.63 ? ['#ff4d6d','#fff'] : ['#3a86ff','#ffd60a'];
  for (let k=0;k<8;k++){ ctx.fillStyle=cols[k%2]; ctx.beginPath(); ctx.moveTo(x,y); ctx.arc(x,y,16,k*TAU/8,(k+1)*TAU/8); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,2,0,TAU); ctx.fill();
  ctx.fillStyle='#ff9f80'; rr(x+12,y+10,10,20,3); ctx.fill(); // towel
}
function drawEnt(e){
  const t=G.t;
  switch(e.t){
    case 'wake': { const a=Math.max(0,1-e.age/3.5)*0.7; ctx.globalAlpha=a; ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(e.x-9,e.y); ctx.quadraticCurveTo(e.x,e.y-(e.vy>0?-3:3),e.x+9,e.y); ctx.stroke(); ctx.globalAlpha=1; break; }
    case 'whirl': {
      const g=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.r); g.addColorStop(0,'rgba(2,25,55,.85)'); g.addColorStop(0.5,'rgba(10,60,110,.4)'); g.addColorStop(1,'rgba(27,120,173,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,TAU); ctx.fill();
      for (let k=0;k<5;k++){ ctx.strokeStyle='rgba(255,255,255,'+(0.18+k*0.08)+')'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1-k*0.18),e.rot+k*1.3,e.rot+k*1.3+Math.PI*1.1); ctx.stroke(); }
      break; }
    case 'ramp': {
      const {x,y,w,l}=e;
      ctx.fillStyle='rgba(0,40,70,.3)'; ctx.fillRect(x-w/2+7,y-l/2+7,w,l);
      ctx.fillStyle='rgba(255,255,255,.6)'; ctx.fillRect(x-w/2-3,y+l/2-2,w+6,5);
      const g=ctx.createLinearGradient(0,y+l/2,0,y-l/2); g.addColorStop(0,'#b8500e'); g.addColorStop(1,'#ffb347');
      ctx.fillStyle=g; ctx.fillRect(x-w/2,y-l/2,w,l);
      ctx.strokeStyle='#7a3608'; ctx.lineWidth=2; ctx.strokeRect(x-w/2,y-l/2,w,l);
      ctx.strokeStyle='#fff'; ctx.lineWidth=3.5; ctx.lineCap='round';
      for (let i=0;i<2;i++){ const y0=y+8-i*16; ctx.beginPath(); ctx.moveTo(x-13,y0+6); ctx.lineTo(x,y0-3); ctx.lineTo(x+13,y0+6); ctx.stroke(); }
      break; }
    case 'pad': {
      const {x,y,w,l}=e;
      ctx.fillStyle=e.used?'rgba(0,255,230,.12)':'rgba(0,255,230,.25)'; rr(x-w/2,y-l/2,w,l,8); ctx.fill();
      ctx.strokeStyle='rgba(120,255,255,.9)'; ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='#ffe14d'; ctx.lineWidth=4; ctx.lineCap='round';
      for (let i=0;i<3;i++){ const off=((t*90)+i*22)%66, yy=y+l/2-off; ctx.globalAlpha=Math.sin(off/66*Math.PI);
        ctx.beginPath(); ctx.moveTo(x-12,yy+6); ctx.lineTo(x,yy-4); ctx.lineTo(x+12,yy+6); ctx.stroke(); }
      ctx.globalAlpha=1; break; }
    case 'nitro': {
      const pl=1+Math.sin(t*6)*0.12;
      ctx.strokeStyle='rgba(255,180,60,.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*1.6*pl,0,TAU); ctx.stroke();
      ctx.fillStyle='#e8312f'; rr(e.x-9,e.y-13,18,26,5); ctx.fill(); ctx.strokeStyle='#7a0f0f'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#ccc'; ctx.fillRect(e.x-4,e.y-17,8,5);
      txt('N',e.x,e.y+6,14,'#fff','center',false); break; }
    case 'coin': {
      const z = e.high ? 40 : 0, cy=e.y-z*0.8;
      if (e.high){ ctx.fillStyle='rgba(0,30,60,.2)'; ctx.beginPath(); ctx.ellipse(e.x,e.y,8,5,0,0,TAU); ctx.fill(); }
      const sx=Math.cos(t*4+e.x*0.1);
      ctx.fillStyle='#ffd23f'; starPath(e.x,cy+Math.sin(t*3+e.y)*2,e.r,e.r*0.5,5,-Math.PI/2,Math.abs(sx)*0.8+0.2); ctx.fill();
      ctx.strokeStyle='#b8860b'; ctx.lineWidth=1.5; ctx.stroke(); break; }
    case 'buoy': {
      ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+5+Math.sin(t*3+e.ph)*2,0,TAU); ctx.stroke();
      ctx.fillStyle='#e8312f'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,TAU); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=3.5; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.6,0,TAU); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(e.x-3,e.y-3,2.5,0,TAU); ctx.fill(); break; }
    case 'rock': {
      ctx.strokeStyle='rgba(255,255,255,'+(0.4+0.2*Math.sin(t*3+e.seed*9))+')'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+5+Math.sin(t*2+e.seed*5)*1.5,0,TAU); ctx.stroke();
      const shape=(ox,oy,sc)=>{ ctx.beginPath(); e.pts.forEach((f,i)=>{ const a=i/e.pts.length*TAU+e.seed*6, r=e.r*f*sc; const px=e.x+ox+Math.cos(a)*r, py=e.y+oy+Math.sin(a)*r; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.closePath(); };
      ctx.fillStyle='#4a4e55'; shape(2,2,1); ctx.fill();
      ctx.fillStyle='#6e737b'; shape(0,0,0.92); ctx.fill();
      ctx.fillStyle='#9399a1'; shape(-e.r*0.2,-e.r*0.22,0.5); ctx.fill();
      break; }
    case 'log': {
      ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(e.a);
      ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=3; rr(-e.len/2-4,-13,e.len+8,26,13); ctx.stroke();
      ctx.fillStyle='#7a4a21'; rr(-e.len/2,-9,e.len,18,9); ctx.fill();
      ctx.strokeStyle='#5a3414'; ctx.lineWidth=1.5; ctx.beginPath();
      for (let i=-1;i<=1;i++){ ctx.moveTo(-e.len/2+8,i*4); ctx.lineTo(e.len/2-8,i*4+1); } ctx.stroke();
      ctx.fillStyle='#c49a6c'; ctx.beginPath(); ctx.ellipse(e.len/2-2,0,4,8,0,0,TAU); ctx.fill();
      ctx.restore(); break; }
    case 'shark': {
      const d=e.dir;
      ctx.fillStyle='rgba(10,35,60,.35)'; ctx.beginPath(); ctx.ellipse(e.x-d*6,e.y+2,30,9,0,0,TAU); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(e.x+d*12,e.y+3); ctx.lineTo(e.x-d*8,e.y-5); ctx.moveTo(e.x+d*12,e.y+3); ctx.lineTo(e.x-d*8,e.y+10); ctx.stroke();
      ctx.fillStyle='#55626f'; ctx.beginPath(); ctx.moveTo(e.x-d*10,e.y+3); ctx.lineTo(e.x+d*10,e.y+3); ctx.quadraticCurveTo(e.x+d*2,e.y-6,e.x-d*6,e.y-17); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#2f3a44'; ctx.lineWidth=1.2; ctx.stroke(); break; }
    case 'boat': {
      ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(e.vx>0?Math.PI/2:-Math.PI/2);
      const L=e.len, W=e.wid;
      ctx.fillStyle='rgba(0,30,60,.3)'; ctx.beginPath(); ctx.ellipse(5,4,W/2+2,L/2,0,0,TAU); ctx.fill();
      ctx.fillStyle='#f5f5f5'; ctx.strokeStyle='#333'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,-L/2); ctx.quadraticCurveTo(W/2,-L/4,W/2,0); ctx.lineTo(W/2,L/2); ctx.lineTo(-W/2,L/2); ctx.lineTo(-W/2,0); ctx.quadraticCurveTo(-W/2,-L/4,0,-L/2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#e63946'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(W/2-3,-10); ctx.lineTo(W/2-3,L/2-4); ctx.moveTo(-W/2+3,-10); ctx.lineTo(-W/2+3,L/2-4); ctx.stroke();
      ctx.fillStyle='#9ad7ff'; rr(-W/2+6,-14,W-12,10,3); ctx.fill();
      ctx.fillStyle='#d8d8d8'; rr(-W/2+6,-3,W-12,30,4); ctx.fill();
      ctx.fillStyle='#1d3557'; ctx.beginPath(); ctx.arc(0,6,5,0,TAU); ctx.fill();
      ctx.fillStyle='#333'; ctx.fillRect(-6,L/2-2,12,6);
      ctx.restore(); break; }
    case 'rival': {
      if (e.state==='wipe'){ drawSki(e.x,e.y,e.skiRot,e.col,{rider:false}); drawRider(e.rider,'#222',e.col); }
      else {
        if (e.z>1){ ctx.fillStyle='rgba(0,30,60,.3)'; ctx.beginPath(); ctx.ellipse(e.x,e.y,13,22,e.heading,0,TAU); ctx.fill(); }
        drawSki(e.x,e.y-e.z*0.8,e.heading+e.spin,e.col,{lean:e.lean,vest:'#222',helmet:e.col,scale:1+e.z/240});
      }
      break; }
  }
}
function drawParts(ground){
  ctx.fillStyle='#fff';
  for (const q of G.parts){
    if (ground){
      if (q.k===0){ ctx.globalAlpha=(q.life/q.max)*0.55; ctx.beginPath(); ctx.arc(q.x,q.y,q.size,0,TAU); ctx.fill(); }
      else if (q.k===2){ ctx.globalAlpha=(q.life/q.max)*0.8; ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(q.x,q.y,q.size,q.size*0.7,0,0,TAU); ctx.stroke(); }
    } else if (q.k===1){
      ctx.globalAlpha=Math.min(1,q.life/q.max*1.5); ctx.fillStyle=q.col; ctx.beginPath(); ctx.arc(q.x,q.y-q.z*0.8,q.size,0,TAU); ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}
function drawPlayer(){
  const p=G.p;
  if (G.wipe){
    const s=G.wipe.ski;
    drawSki(s.x,s.y,s.rot,PCOL.hull,{rider:false});
    drawRider(G.wipe.rider,PCOL.vest,PCOL.helmet);
    return;
  }
  if (p.state!=='ride') return;
  if (p.invuln>0 && ((G.t*12)|0)%2) ctx.globalAlpha=0.4;
  if (p.z>1){ ctx.fillStyle='rgba(0,30,60,.3)'; const sh=Math.max(0.5,1-p.z/300); ctx.beginPath(); ctx.ellipse(p.x,p.y,13*sh,22*sh,p.heading+p.spin,0,TAU); ctx.fill(); }
  const boosted=p.boosting||p.boostT>0;
  if (boosted && !p.air){
    ctx.fillStyle='rgba(255,220,90,.45)'; ctx.beginPath();
    const bx=p.x-Math.sin(p.heading)*22, by=p.y+Math.cos(p.heading)*22;
    ctx.ellipse(bx,by,7+Math.random()*3,14+Math.random()*8,p.heading,0,TAU); ctx.fill();
  }
  drawSki(p.x,p.y-p.z*0.8,p.heading+p.spin,PCOL.hull,{lean:p.lean,vest:PCOL.vest,helmet:PCOL.helmet,scale:1+p.z/220});
  ctx.globalAlpha=1;
}

// ---------- screen drawing ----------
function drawMiniSki(x,y){ drawSki(x,y,0,PCOL.hull,{rider:false,scale:0.55}); }
function drawHUD(){
  const p=G.p, pad=14, top=pad;
  txt(Math.floor(G.score).toLocaleString(),pad,top+28,30,'#fff');
  txt(Math.floor(G.dist/10)+' m',pad,top+48,14,'#bfe9ff');
  if (G.mult>1){
    txt('x'+(Math.round(G.mult*10)/10),pad,top+78,24,'#ffe14d');
    ctx.fillStyle='rgba(255,225,77,.85)'; ctx.fillRect(pad,top+85,64*(G.multT/3.5),4);
  }
  for (let i=0;i<G.lives;i++) drawMiniSki(CW-pad-10-i*20,top+16);
  txt(Math.round((p.state==='ride'?p.speed:0)*0.2)+' km/h',CW-pad,top+56,18,'#fff','right');
  const bw=110, bx=CW-pad-bw, by=top+66;
  ctx.fillStyle='rgba(0,0,0,.35)'; rr(bx,by,bw,12,6); ctx.fill();
  if (G.nitro>1){ const g=ctx.createLinearGradient(bx,0,bx+bw,0); g.addColorStop(0,'#ffcf3a'); g.addColorStop(1,'#ff4d2e'); ctx.fillStyle=g; rr(bx,by,Math.max(12,bw*G.nitro/100),12,6); ctx.fill(); }
  txt('NITRO',bx-6,by+11,11,'#ffd27a','right');
  if (muted) txt('MUTED',CW/2,top+20,12,'#ccc','center');
}
function drawScreenFX(){
  const p=G.p;
  if (p.state==='ride' && (p.boosting||p.boostT>0)){
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=2; ctx.beginPath();
    for (let i=0;i<16;i++){ const x=Math.random()*CW, y=Math.random()*CH, l=rand(40,130); ctx.moveTo(x,y); ctx.lineTo(x,y+l); }
    ctx.stroke();
  }
  if (G.ts<0.95){
    const g=ctx.createRadialGradient(CW/2,CH/2,Math.min(CW,CH)*0.3,CW/2,CH/2,Math.max(CW,CH)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(110,0,0,'+((1-G.ts)*0.55)+')');
    ctx.fillStyle=g; ctx.fillRect(0,0,CW,CH);
  }
  if (p.air && !p.hop && p.state==='ride'){
    const n=((p.spin%TAU)+TAU)%TAU, off=Math.min(n,TAU-n);
    txt(off<0.62?'STRAIGHT — LAND IT!':'SPINNING…',CW/2,CH*0.82,16,off<0.62?'#7CFFB2':'#ffb24d','center');
  }
}
function drawBanner(){
  const m=G.msg; if (!m) return;
  const age=m.max-m.life;
  const sc = age<0.15 ? 0.4+age/0.15*0.85 : age<0.3 ? 1.25-(age-0.15)*1.66 : 1;
  ctx.save(); ctx.globalAlpha=Math.min(1,m.life/0.3);
  ctx.translate(CW/2,CH*0.3);
  if (m.wob) ctx.rotate(Math.sin(age*20)*0.08*Math.max(0,1-age));
  ctx.scale(sc,sc);
  const size=Math.min(86,CW/6.5);
  txt(m.text,0,0,size,m.col,'center');
  if (m.sub) txt(m.sub,0,size*0.6,size*0.32,'#fff','center');
  if (m.sub2) txt(m.sub2,0,size*1.0,size*0.27,'#ffe14d','center');
  ctx.restore();
}
function drawPops(z){
  for (const q of G.pops){
    const a=q.life/q.max, sx=(q.x-G.camX)*z+CW/2, sy=(q.y-G.camY)*z+CH*0.68-(1-a)*45;
    ctx.globalAlpha=Math.min(1,a*2); txt(q.text,sx,sy,q.size,q.col,'center');
  }
  ctx.globalAlpha=1;
}
function overlay(alpha){ ctx.fillStyle='rgba(4,24,44,'+alpha+')'; ctx.fillRect(0,0,CW,CH); }
function drawMenu(){
  overlay(0.55);
  const s=Math.min(1,CW/520);
  txt('SURGE',CW/2,CH*0.24,76*s,'#ffd400','center');
  txt('RIDER',CW/2,CH*0.24+70*s,76*s,'#fff','center');
  txt('Jetski chaos. Big air. Bigger wipeouts.',CW/2,CH*0.24+108*s,17*s,'#bfe9ff','center');
  const lines = touchOn
    ? ['◀ ▶  steer  ·  in the air: spin','NITRO to boost  ·  BRAKE to slow down','Release to straighten out before you land!']
    : ['←/→ or A/D  steer  ·  in the air: spin','↑ full throttle  ·  ↓ brake','SPACE / SHIFT  nitro  ·  P pause  ·  M mute','Release to straighten out before you land!'];
  lines.forEach((l,i)=>txt(l,CW/2,CH*0.52+i*26*s,15*s,'#fff','center'));
  txt('Ramps = air · Cyan pads = boost · Red cans = nitro',CW/2,CH*0.52+lines.length*26*s+10,13*s,'#9fffe0','center');
  txt('Boost into rivals or land on them for takedowns',CW/2,CH*0.52+lines.length*26*s+30,13*s,'#ff9ccb','center');
  const pulse=0.85+Math.sin(performance.now()/250)*0.15;
  txt(touchOn?'TAP TO RIDE':'PRESS SPACE TO RIDE',CW/2,CH*0.86,26*s*pulse,'#ffd400','center');
  if (G.best) txt('BEST '+G.best.toLocaleString(),CW/2,CH*0.86+32,15,'#bfe9ff','center');
}
function drawOver(){
  overlay(Math.min(0.6,G.overT));
  const s=Math.min(1,CW/520);
  txt('GAME OVER',CW/2,CH*0.27,64*s,'#ff4d2e','center');
  txt(Math.floor(G.score).toLocaleString(),CW/2,CH*0.27+70*s,52*s,'#fff','center');
  if (G.newBest) txt('NEW BEST!',CW/2,CH*0.27+104*s,22*s,'#ffd400','center');
  else txt('BEST '+G.best.toLocaleString(),CW/2,CH*0.27+104*s,18*s,'#bfe9ff','center');
  const st=G.stats;
  [`Distance  ${Math.floor(G.dist/10)} m`,`Spin tricks  ${st.tricks}`,`Takedowns  ${st.takedowns}`,`Close calls  ${st.close}`,`Wipeouts  ${st.wipeouts}`]
    .forEach((l,i)=>txt(l,CW/2,CH*0.5+i*26*s,17*s,'#fff','center'));
  if (G.overT>0.8){ const pulse=0.85+Math.sin(performance.now()/250)*0.15; txt(touchOn?'TAP TO RIDE AGAIN':'PRESS SPACE TO RIDE AGAIN',CW/2,CH*0.86,24*s*pulse,'#ffd400','center'); }
}

function render(){
  const z=G.zoom*SC;
  const sx=(Math.random()-0.5)*G.shake, sy=(Math.random()-0.5)*G.shake;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle='#1b78ad'; ctx.fillRect(0,0,CW,CH);
  ctx.setTransform(DPR*z,0,0,DPR*z,DPR*(CW/2+sx),DPR*(CH*0.68+sy));
  ctx.translate(-G.camX,-G.camY);
  const L=G.camX-CW/2/z-30, R=G.camX+CW/2/z+30, T=G.camY-CH*0.68/z-60, B=G.camY+CH*0.32/z+60;
  drawWater(L,R,T,B);
  const vis = e => e.y>T-80 && e.y<B+80;
  for (const e of G.ents) if (e.t==='wake' && vis(e)) drawEnt(e);
  for (const e of G.ents) if (e.t==='whirl' && vis(e)) drawEnt(e);
  drawShores(L,R,T,B);
  drawParts(true);
  const order=['ramp','pad','buoy','rock','log','shark','nitro','coin','boat'];
  for (const k of order) for (const e of G.ents) if (e.t===k && vis(e)) drawEnt(e);
  for (const e of G.ents) if (e.t==='rival' && vis(e)) drawEnt(e);
  drawPlayer();
  drawParts(false);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  drawScreenFX();
  drawPops(z);
  if (state==='play'||state==='paused') { drawHUD(); drawBanner(); }
  if (state==='paused'){ overlay(0.5); txt('PAUSED',CW/2,CH*0.45,56,'#fff','center'); txt(touchOn?'Tap to continue':'Press P to continue',CW/2,CH*0.45+36,16,'#bfe9ff','center'); }
  if (state==='menu') drawMenu();
  if (state==='over') drawOver();
}

function engineAudio(){
  if (!AC || !engGain) return;
  const p=G.p, on = state==='play' && p.state==='ride' && !muted;
  const f = 45 + p.speed*0.2*(p.air?1.35:1) + ((p.boosting||p.boostT>0)?25:0);
  const t=AC.currentTime;
  eng.frequency.setTargetAtTime(f,t,0.05); eng2.frequency.setTargetAtTime(f*1.01,t,0.05);
  engFilt.frequency.setTargetAtTime(300+p.speed*3,t,0.1);
  engGain.gain.setTargetAtTime(on?0.07:0,t,0.08);
}

// ---------- loop ----------
newGame();
let last=performance.now();
function frame(now){
  const dtr=Math.min(0.05,(now-last)/1000); last=now;
  if (state==='play') update(dtr);
  else if (state==='over'){ G.overT+=dtr; update(dtr); }
  else if (state==='menu'){ G.t+=dtr; G.camY=lerp(G.camY,G.p.y-120,0.05); }
  engineAudio();
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
