'use strict';

const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

let CURRENT_PLAYER_NAME = '';
let isTutorial = false;

const firebaseConfig = {
  apiKey: "AIzaSyCNXJXQxYjZIXSNkjIlwfy-LHVGCnbEIgg",
  authDomain: "nback-6b98c.firebaseapp.com",
  databaseURL: "https://nback-6b98c-default-rtdb.firebaseio.com",
  projectId: "nback-6b98c",
  storageBucket: "nback-6b98c.firebasestorage.app",
  messagingSenderId: "192232324393",
  appId: "1:192232324393:web:512e2640aa81ffcde24b38",
  measurementId: "G-JWHKE4154D"
};

// Inicialización segura adaptada al formato de scripts CDN globales (Compat) del proyecto
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
}

function enviarResultadosAFirebase(scoreData, modo) {
  console.log("Intentando enviar datos a Firebase...", scoreData);
  try {
    if (typeof firebase !== 'undefined') {
      // Inicializar si no se ha hecho
      if (!firebase.apps.length) {
        const firebaseConfig = {
          apiKey: "AIzaSyCNXJXQxYjZIXSNkjIlwfy-LHVGCnbEIgg",
          authDomain: "nback-6b98c.firebaseapp.com",
          databaseURL: "https://nback-6b98c-default-rtdb.firebaseio.com",
          projectId: "nback-6b98c",
          storageBucket: "nback-6b98c.firebasestorage.app",
          messagingSenderId: "192232324393",
          appId: "1:192232324393:web:512e2640aa81ffcde24b38",
          measurementId: "G-JWHKE4154D"
        };
        firebase.initializeApp(firebaseConfig);
      }

      if (!CURRENT_PLAYER_NAME) {
        const nameInput = $('player-name') ? $('player-name').value.trim() : '';
        CURRENT_PLAYER_NAME = nameInput || ('Anon_' + Math.floor(100 + Math.random() * 900));
      }

      // Estructura de envío idéntica y compatible
      firebase.database().ref('partidas').push({
        nombre: scoreData.nombre || CURRENT_PLAYER_NAME || 'Jugador_Anónimo',
        adaptabilidad: scoreData.accuracy || 0,
        friccion: scoreData.falsePositives || 0,
        agilidad: scoreData.avgResponseTime || 0,
        modo: modo || scoreData.modo || 'nback',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        console.log("¡Datos enviados con éxito a la base de datos!");
      }).catch((error) => {
        console.error("Error al escribir en Firebase:", error);
      });
    } else {
      console.error("Librería Firebase no cargada en index.html");
    }
  } catch (e) {
    console.error("Excepción en la función enviarResultadosAFirebase:", e);
  }
}

/* ══════════════════════════════════════════
   1. SETTINGS
══════════════════════════════════════════ */
const CFG = (() => {
  const K = 'nback_cfg';
  const DEF = { lurePct:20, bgNoise:'silence', binauralOn:true, dualAudioOn:true };
  const load = () => { try { return {...DEF,...JSON.parse(localStorage.getItem(K))}; } catch { return {...DEF}; } };
  const save = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
  return {
    get(key)      { return load()[key]; },
    set(key, val) { const d=load(); d[key]=val; save(d); },
    all()         { return load(); }
  };
})();

/* ══════════════════════════════════════════
   2. AUDIO ENGINE + BACKGROUND NOISE
══════════════════════════════════════════ */
const Snd = (() => {
  let ctx=null, master=null, started=false, on=true;
  let bgNodes={cafe:null,meeting:null}, activeBg='silence';

  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)();
    if (ctx.state==='suspended') ctx.resume();
    return ctx;
  };
  const osc = (freq,type='sine') => { const o=ac().createOscillator(); o.type=type; o.frequency.value=freq; return o; };
  const env = (g,t,vol,att,dur) => {
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+att);
    g.gain.setValueAtTime(vol,t+Math.max(att+.001,dur-dur*.42)); g.gain.linearRampToValueAtTime(0,t+dur);
  };
  const shot = (freq,dur,vol,type='sine',delay=0) => {
    if(!on) return; const a=ac(),o=osc(freq,type),g=a.createGain();
    env(g,a.currentTime+delay,vol,.015,dur); o.connect(g); g.connect(a.destination);
    o.start(a.currentTime+delay); o.stop(a.currentTime+delay+dur+.02);
  };

  const startAmbient = () => {
    if (started||!on) return; started=true;
    const a=ac(); master=a.createGain();
    master.gain.setValueAtTime(0,a.currentTime); master.gain.linearRampToValueAtTime(.38,a.currentTime+2.8);
    master.connect(a.destination);
    const hasPan=!!a.createStereoPanner;
    [[256,-1],[264,1]].forEach(([freq,pan]) => {
      const o=osc(freq),g=a.createGain(); g.gain.value=.045; o.connect(g);
      if(hasPan){const p=a.createStereoPanner(); p.pan.value=pan; g.connect(p); p.connect(master);}
      else g.connect(master); o.start();
    });
    [[110,.055],[165,.040],[220,.052],[261.6,.030],[329.6,.020],[440,.012]].forEach(([f,vol],i) => {
      const o=osc(f); o.detune.value=(i&1?1:-1)*1.6;
      const lfo=osc(.07+i*.022),lg=a.createGain(); lg.gain.value=.35; lfo.connect(lg); lg.connect(o.detune);
      const g=a.createGain(); g.gain.value=vol; o.connect(g); g.connect(master); o.start(); lfo.start();
    });
    const sr=a.sampleRate,buf=a.createBuffer(1,sr*3,sr),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const ns=a.createBufferSource(); ns.buffer=buf; ns.loop=true;
    const flt=a.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=130; flt.Q.value=.3;
    const ng=a.createGain(); ng.gain.value=.016; ns.connect(flt); flt.connect(ng); ng.connect(master); ns.start();
  };

  const fadeMaster = (to,dur) => {
    if(!master) return; const a=ac(),t=a.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value,t);
    master.gain.linearRampToValueAtTime(to,t+dur);
  };

  // ── Background noise creators ──
  const mkNoiseBuf = a => {
    const sr=a.sampleRate,buf=a.createBuffer(1,sr*2,sr),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return buf;
  };

  const createCafe = a => {
    const mg=a.createGain(); mg.gain.value=0; mg.connect(a.destination);
    [[160,3,.18,.3],[220,4,.14,.7],[280,3,.11,.5],[350,5,.09,.4],[450,4,.07,.9]].forEach(([fc,Q,g,lf]) => {
      const src=a.createBufferSource(); src.buffer=mkNoiseBuf(a); src.loop=true;
      const flt=a.createBiquadFilter(); flt.type='bandpass'; flt.frequency.value=fc; flt.Q.value=Q;
      const gg=a.createGain(); gg.gain.value=g;
      const lfo=osc(lf),lg=a.createGain(); lg.gain.value=g*.5; lfo.connect(lg); lg.connect(gg.gain);
      src.connect(flt); flt.connect(gg); gg.connect(mg); src.start(); lfo.start();
    });
    const floorSrc=a.createBufferSource(); floorSrc.buffer=mkNoiseBuf(a); floorSrc.loop=true;
    const ff=a.createBiquadFilter(); ff.type='lowpass'; ff.frequency.value=350;
    const fg=a.createGain(); fg.gain.value=.025;
    floorSrc.connect(ff); ff.connect(fg); fg.connect(mg); floorSrc.start();
    return mg;
  };

  const createMeeting = a => {
    const mg=a.createGain(); mg.gain.value=0; mg.connect(a.destination);
    [[250,6,.14,1.2,0],[350,7,.11,.9,.5],[450,8,.09,1.5,1.2],[600,6,.07,.7,2],[800,5,.05,1.1,.8]].forEach(([fc,Q,g,r1,r2]) => {
      const src=a.createBufferSource(); src.buffer=mkNoiseBuf(a); src.loop=true;
      const flt=a.createBiquadFilter(); flt.type='bandpass'; flt.frequency.value=fc; flt.Q.value=Q;
      const gg=a.createGain(); gg.gain.value=g;
      const l1=osc(r1),g1=a.createGain(); g1.gain.value=g*.6; l1.connect(g1); g1.connect(gg.gain);
      const l2=osc(r2||.3),g2=a.createGain(); g2.gain.value=g*.3; l2.connect(g2); g2.connect(gg.gain);
      src.connect(flt); flt.connect(gg); gg.connect(mg); src.start(); l1.start(); l2.start();
    });
    return mg;
  };

  const getBg = type => {
    if (!bgNodes[type]) { const a=ac(); bgNodes[type]= type==='cafe'?createCafe(a):createMeeting(a); }
    return bgNodes[type];
  };

  return {
    init()      { if (on) { const a = ac(); if (a.state === 'suspended') a.resume(); startAmbient(); } },
    stopAmb()   { fadeMaster(0,1.8); },
    resumeAmb() { if(!on) return; !started ? startAmbient() : fadeMaster(.38,1.6); },
    cell()      { shot(528,.22,.09); },
    hit()       { [[392,0],[523,.06],[659,.12]].forEach(([f,d])=>shot(f,.28,.088,'sine',d)); },
    miss()      { shot(196,.32,.07); },
    chord(freqs,vol=.08) { freqs.forEach((f,i)=>shot(f,.3,vol,'sine',i*.06)); },
    falseAlarm() {
      if(!on) return; const a=ac(),o=osc(300),g=a.createGain(),t=a.currentTime;
      o.frequency.linearRampToValueAtTime(200,t+.18);
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.07,t+.02); g.gain.linearRampToValueAtTime(0,t+.18);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+.22);
    },
    setBg(type) {
      if (activeBg!=='silence') {
        const node=bgNodes[activeBg];
        if(node){ const a=ac(),t=a.currentTime; node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(node.gain.value,t); node.gain.linearRampToValueAtTime(0,t+.8); }
      }
      activeBg=type;
      if(type!=='silence'){ const node=getBg(type),a=ac(),t=a.currentTime; node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(node.gain.value,t); node.gain.linearRampToValueAtTime(.45,t+1.5); }
    },
    stopBg() { this.setBg('silence'); },
    toggle() {
      on=!on; if(!on) fadeMaster(0,.6); else !started?startAmbient():fadeMaster(.38,1.4); return on;
    },
    get on() { return on; }
  };
})();

/* ══════════════════════════════════════════
   3. STORAGE
══════════════════════════════════════════ */
const DB = (() => {
  const K='nback_v1', KM='nback_meta';
  const load    = () => { try{return JSON.parse(localStorage.getItem(K))||[];}catch{return[];} };
  const save    = d  => { try{localStorage.setItem(K,JSON.stringify(d));}catch{} };
  const getMeta = () => { try{return JSON.parse(localStorage.getItem(KM))||{};}catch{return{};} };
  const setMeta = m  => { try{localStorage.setItem(KM,JSON.stringify(m));}catch{} };

  return {
    add(s)          { const d=load(); d.push({...s,ts:Date.now()}); save(d); },
    forN(n)         { return load().filter(s=>s.n===n&&s.mode==='nback'); },
    byMode(m)       { return load().filter(s=>s.mode===m); },
    all()           { return load(); },
    tutorSeen()     { return !!getMeta().tutorSeen; },
    welcomeSeen()   { return !!getMeta().welcomeSeen; },
    modeSeen(m)     { return !!(getMeta().modeSeen||{})[m]; },
    markTutorSeen() { setMeta({...getMeta(),tutorSeen:true}); },
    markWelcome()   { setMeta({...getMeta(),welcomeSeen:true}); },
    markMode(m)     { const meta=getMeta(); meta.modeSeen=meta.modeSeen||{}; meta.modeSeen[m]=true; setMeta(meta); },

    stats(mode='nback') {
      const all=load();
      if(mode==='nback'||mode==='emotion') {
        return [1,2,3].map(n => {
          const lvl=all.filter(s=>s.mode===mode&&s.n===n);
          return { n, count:lvl.length, avg:lvl.length?Math.round(lvl.reduce((a,s)=>a+s.acc,0)/lvl.length):0, best:lvl.length?Math.max(...lvl.map(s=>s.acc)):0, sessions:lvl };
        });
      }
      // dual
      if(mode==='dual'){
        return [1,2,3].map(n=>{
          const lvl=all.filter(s=>s.mode==='dual'&&s.n===n);
          return { n, count:lvl.length,
            avgVis: lvl.length?Math.round(lvl.reduce((a,s)=>a+s.visAcc,0)/lvl.length):0,
            avgAud: lvl.length?Math.round(lvl.reduce((a,s)=>a+s.audAcc,0)/lvl.length):0,
            avgComb:lvl.length?Math.round(lvl.reduce((a,s)=>a+s.combAcc,0)/lvl.length):0,
            sessions:lvl };
        });
      }
      // span
      const lvl=all.filter(s=>s.mode==='span');
      return [{ count:lvl.length, avgMath:lvl.length?Math.round(lvl.reduce((a,s)=>a+s.mathAcc,0)/lvl.length):0, avgRecall:lvl.length?Math.round(lvl.reduce((a,s)=>a+s.recallAcc,0)/lvl.length):0, bestSpan:lvl.length?Math.max(...lvl.map(s=>s.maxSpan)):0, sessions:lvl }];
    },

    consecutiveDays() {
      const all=load(); if(!all.length) return 0;
      const ds=d=>new Date(d).toDateString();
      const uniq=[...new Set(all.map(s=>ds(s.ts)))].sort((a,b)=>new Date(b)-new Date(a));
      const today=new Date().toDateString(), yest=new Date(Date.now()-86400000).toDateString();
      if(uniq[0]!==today&&uniq[0]!==yest) return 0;
      let streak=0, cur=new Date(uniq[0]===today?Date.now():Date.now()-86400000);
      for(const d of uniq){ if(d===cur.toDateString()){streak++;cur=new Date(+cur-86400000);}else break; }
      return streak;
    },
    sessionsPerWeek() { const all=load(); if(!all.length) return 0; return +(all.filter(s=>s.ts>Date.now()-28*86400000).length/4).toFixed(1); },
    recommendations() {
      const all=load(); const recs=[];
      [1,2].forEach(n=>{
        const lvl=all.filter(s=>s.mode==='nback'&&s.n===n);
        if(lvl.length>=3&&lvl.slice(-3).every(s=>s.acc>=75)) recs.push({n,text:`¡Buen rendimiento en ${n}-Back! Considera probar ${n+1}-Back.`});
      });
      return recs;
    },
    getMeta()        { return getMeta(); },
    sessionCount(mode){ return load().filter(s=>s.mode===mode).length; },
    trend(mode='nback'){
      const all=load().filter(s=>s.mode===mode);
      if(all.length<10) return null;
      const acc=s=>s.acc!=null?s.acc:(s.combAcc!=null?s.combAcc:(s.recallAcc!=null?s.recallAcc:0));
      const last5=all.slice(-5).reduce((a,s)=>a+acc(s),0)/5;
      const prev5=all.slice(-10,-5).reduce((a,s)=>a+acc(s),0)/5;
      const d=last5-prev5;
      return d>=3?'En aumento':d<=-3?'En ajuste':'Estable';
    }
  };
})();

/* ══════════════════════════════════════════
   4. MODE DEFINITIONS
══════════════════════════════════════════ */
const MODES = {
  dual:      { name:'Dual N-Back',     badge:'Dual N-Back',   about:'La versión más estudiada del entrenamiento. Tu cerebro debe rastrear dos cosas al mismo tiempo — lo que ve y lo que escucha — sin mezclarlas. Es difícil al inicio. Eso es exactamente el punto.', steps:['Observa qué celda se ilumina y escucha la letra que suena en cada turno.','Presiona POSICIÓN si la celda actual coincide con la de N turnos atrás.','Presiona LETRA si el sonido actual coincide con el de N turnos atrás. Las dos señales son independientes — que una coincida no implica que la otra también.'] },
  nback:     { name:'N-Back',         badge:'N-Back',        about:'Actualiza continuamente qué información está activa en tu memoria de trabajo.', steps:['Observa qué celda se ilumina en cada turno.','Recuerda la posición de N turnos atrás.','Presiona COINCIDE si la posición actual es igual a la de N turnos atrás.'] },
  span:      { name:'Span Complejo',  badge:'Span',          about:'Simula el trabajo cognitivo real: procesar nueva información mientras retienes lo anterior.',steps:['Responde si la operación matemática es verdadera o falsa.','Memoriza la letra que aparece después de cada operación.','Al final de la ronda, recuerda las letras en orden.'] },
  emotion:   { name:'Modo Emocional', badge:'Emocional',     about:'Las emociones de los demás compiten por tu atención. Este modo entrena procesarlas sin que te saquen del hilo.',steps:['Observa la expresión facial que aparece en cada turno.','Recuerda qué expresión apareció N turnos atrás.','Presiona COINCIDE si la expresión actual coincide con la de N turnos atrás.'] }
};

/* ══════════════════════════════════════════
   5. SEQUENCE GENERATION
══════════════════════════════════════════ */
function genSeq(n, items=9, lurePct=0, matchPct=30) {
  const s=[];
  for(let i=0; i<600; i++){
    if(i>=n && Math.random()<matchPct/100){ s.push(s[i-n]); }
    else {
      const matchPos = i>=n ? s[i-n] : -1;
      // Try lure
      if(lurePct>0 && i>=n && Math.random()<lurePct/100){
        const cands=[];
        if(n>=2 && i>=n-1){ const p=s[i-(n-1)]; if(p!==undefined&&p!==matchPos) cands.push(p); }
        if(i>=n+1){ const p=s[i-(n+1)]; if(p!==undefined&&p!==matchPos&&!cands.includes(p)) cands.push(p); }
        if(cands.length){ s.push(cands[Math.floor(Math.random()*cands.length)]); continue; }
      }
      let c; do{ c=Math.floor(Math.random()*items); }while(i>=n && c===matchPos);
      s.push(c);
    }
  }
  return s;
}

function isLure(seq,turn,n){
  const mt=seq[turn-n];
  if(seq[turn]===mt) return false;
  if(n>=2 && turn>=n-1 && seq[turn]===seq[turn-(n-1)]) return true;
  if(turn>=n+1 && seq[turn]===seq[turn-(n+1)]) return true;
  return false;
}

/* ══════════════════════════════════════════
   5b. DUAL SEQUENCE GENERATION + SPEECH
══════════════════════════════════════════ */
const DUAL_LETTERS = 'BDFGHJKLMNPRSTVZ'.split('');

function genDualSeq(n, matchPct=30) {
  const seqVis=[], seqAud=[];
  for(let i=0;i<600;i++){
    if(i>=n && Math.random()<matchPct/100){ seqVis.push(seqVis[i-n]); }
    else { let c; do{c=Math.floor(Math.random()*9);}while(i>=n&&c===seqVis[i-n]); seqVis.push(c); }
    if(i>=n && Math.random()<matchPct/100){ seqAud.push(seqAud[i-n]); }
    else { let c; do{c=DUAL_LETTERS[Math.floor(Math.random()*DUAL_LETTERS.length)];}while(i>=n&&c===seqAud[i-n]); seqAud.push(c); }
  }
  return {seqVis,seqAud};
}

function speakLetter(letter) {
  if(!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(letter);
    utt.rate=1.0; utt.pitch=1.0; utt.volume=0.95;
    speechSynthesis.speak(utt);
  } catch(e){}
}

/* ══════════════════════════════════════════
   6. NBACK / EMOTION / RESILIENCE ENGINE
══════════════════════════════════════════ */
const LIT=1500, LIT_EMOTION=1100, INIT_IV=4500, MIN_IV=3000, MIN_IV_EMOTION=2500, MAX_IV=6000, ROLL=10, ADAPT_EVERY=10;

const EXPR_NAMES=['Neutro','Alegre','Tenso','Sorprendido'];

let G=null;
let currentMode='nback';

function fmtTime(ms){ const s=Math.ceil(Math.max(0,ms)/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

function calcAcc(hits,misses,omissions,total){
  const mt=hits+omissions, nmt=Math.max(0,total-mt);
  if(mt===0&&nmt===0) return 100;
  if(mt===0) return misses===0?100:Math.round(Math.max(0,1-misses/nmt)*100);
  if(nmt===0) return Math.round(hits/mt*100);
  const hr=hits/mt, far=misses/nmt;
  return Math.round(Math.max(0,Math.min(100,((hr+(1-far))/2)*100)));
}

function faceSVG(expr){
  const c=expr===2?'var(--warn)':'var(--prime)';
  const mouths=['<line x1="-14" y1="14" x2="14" y2="14" fill="none"/>',
    '<path d="M-14,10 Q0,24 14,10" fill="none"/>',
    '<path d="M-14,18 Q0,8 14,18" fill="none"/>',
    `<ellipse cx="0" cy="16" rx="7" ry="9" fill="var(--bg)" stroke="${c}" stroke-width="2"/>`];
  const brows=['<line x1="-20" y1="-18" x2="-8" y2="-18"/><line x1="8" y1="-18" x2="20" y2="-18"/>',
    '<line x1="-20" y1="-20" x2="-8" y2="-17"/><line x1="8" y1="-17" x2="20" y2="-20"/>',
    '<line x1="-20" y1="-17" x2="-8" y2="-22"/><line x1="8" y1="-22" x2="20" y2="-17"/>',
    '<line x1="-20" y1="-22" x2="-8" y2="-19"/><line x1="8" y1="-19" x2="20" y2="-22"/>'];
  return `<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" style="width:180px;height:180px;display:block;margin:auto">
    <circle cx="0" cy="0" r="44" fill="var(--card)" stroke="${c}" stroke-width="2"/>
    <g fill="${c}" stroke="${c}" stroke-width="2.5">
      <circle cx="-14" cy="-10" r="4.5"/>
      <circle cx="14" cy="-10" r="4.5"/>
      ${brows[expr]}
      ${mouths[expr]}
    </g>
  </svg>`;
}

function runTurn(){
  if(!G||G.done) return;
  const {n,seq,mode} = G;
  const iv = G.interval;
  const turn = G.turn;
  const cell = seq[turn];
  const warm = turn < n;
  const activeDone = warm ? 0 : turn - n + 1;

  G.responded = false;

  // UI
  const elapsed = Date.now()-G.startTime;
  $('g-time').textContent = fmtTime(G.targetDuration-elapsed);
  $('g-pace').textContent = (iv/1000).toFixed(1);
  uiProg(Math.min(1,elapsed/G.targetDuration));
  $('g-warm').style.display = warm?'inline-flex':'none';
  uiStat('',null);

  // Stimulus
  if(mode==='emotion'){
    const expr = cell % 4;
    $('face-display').innerHTML = faceSVG(expr);
    setTimeout(()=>{ $('face-display').innerHTML=''; }, LIT_EMOTION);
  } else {
    lightCell(cell);
    G.t1 = setTimeout(()=>unlightCell(cell), LIT);
  }
  Snd.cell();
  enableBtn(!warm);

  // Close response window
  G.t2 = setTimeout(()=>{
    enableBtn(false);
    if(!warm){
      const isMatchTurn = seq[turn]===seq[turn-n];
      const lure = isLure(seq,turn,n);

      // Lure tracking
      if(lure){ G.lureTurns++; if(!G.responded) G.lureResisted++; }

      // Omission
      if(isMatchTurn && !G.responded){
        G.omissions++; Snd.miss(); uiStat('omisión','bad'); updateGameScore();
        const mc=$('c'+seq[turn]); if(mc){ mc.classList.remove('lit-miss'); void mc.offsetWidth; mc.classList.add('lit-miss'); setTimeout(()=>mc.classList.remove('lit-miss'),560); }
      }

      // Rolling window
      G.recent.push((G.responded===isMatchTurn)?1:0);
      if(G.recent.length>G.roll) G.recent.shift();
      G.ivHistory.push(iv);

      // Adaptive
      const done=G.ivHistory.length;
      if(G.recent.length===G.roll && done-G.lastAdapt>=G.adaptEvery){
        const avg=G.recent.reduce((a,b)=>a+b,0)/G.roll;
        const minIv=G.mode==='emotion'?MIN_IV_EMOTION:MIN_IV;
        if(avg>=0.90 && G.interval>minIv){ G.interval=Math.max(minIv,G.interval-150); G.lastAdapt=done; flashPace(); }
        else if(avg<=0.75 && G.interval<MAX_IV){ G.interval=Math.min(MAX_IV,G.interval+150); G.lastAdapt=done; flashPace(); }
      }
    }
  }, iv-600);

  // Advance
  G.t3 = setTimeout(()=>{
    G.turn++;
    const ad = G.turn-n;
    const elap2 = Date.now()-G.startTime;
    const expired = elap2>=G.targetDuration && ad>0;
    const safeLimit = G.turn>=seq.length-5;

    if(expired||safeLimit) endGame();
    else runTurn();
  }, iv);
}

function endGame(){
  if(!G||G.done) return;
  G.done=true;
  if(G.clock) clearInterval(G.clock);
  enableBtn(false);
  const {n,hits,misses,omissions,ivHistory,lureTurns,lureResisted,mode,
         postInterruptTotal,postInterruptCorrect} = G;
  const activeDone = Math.max(1,G.turn-n);
  const acc = calcAcc(hits,misses,omissions,activeDone);
  const avgInterval = ivHistory.length ? Math.round(ivHistory.reduce((a,b)=>a+b,0)/ivHistory.length) : INIT_IV;
  const lureRes = lureTurns>0 ? Math.round(lureResisted/lureTurns*100) : null;
  const postAcc  = postInterruptTotal>0 ? Math.round(postInterruptCorrect/postInterruptTotal*100) : null;
  DB.add({mode,n,hits,misses,omissions,acc,avgInterval,lureTurns,lureResisted,lureRes,postAcc});
  try {
    enviarResultadosAFirebase({ accuracy: acc, falsePositives: misses, avgResponseTime: +(avgInterval/1000).toFixed(2) }, mode);
  } catch (e) {
    console.error("Firebase submit error:", e);
  }
  Snd.stopAmb(); Snd.stopBg();
  setTimeout(()=>showPhrase(acc,()=>showResults({mode,n,hits,misses,omissions,acc,avgInterval,lureRes,postAcc})),600);
}

function respond(){
  // Onboarding intercept
  if(OB){
    if(OB.turn<OB.n||OB.responded) return;
    OB.responded=true;
    const i=OB.turn;
    const isMatch=OB.seq[i]===OB.seq[i-OB.n];
    if(isMatch){ Snd.hit(); cellHit(OB.seq[i]); uiStat('¡correcto!','ok'); flashBtn(true); }
    else { uiStat('esa no coincidía',''); }
    return;
  }
  if(!G||G.done||G.turn<G.n||G.responded) return;
  G.responded=true;
  const i=G.turn;
  if(G.seq[i]===G.seq[i-G.n]){ G.hits++; Snd.hit(); uiStat('correcto','ok'); flashBtn(true); cellHit(G.seq[i]); updateGameScore(); }
  else { G.misses++; Snd.falseAlarm(); uiStat('falso positivo','bad'); flashBtn(false); shakeBtn(); }
}

function stopGame(){
  stopOnboarding();
  if(!G) return;
  clearTimeout(G.t1); clearTimeout(G.t2); clearTimeout(G.t3);
  if(G.clock) clearInterval(G.clock);
  G=null;
}

function startGame(mode,n,durationMin){
  stopGame();
  currentMode=mode;
  const params = getSessionParams(mode);
  const items = mode==='emotion' ? 4 : 9;
  const lure  = mode==='nback'||mode==='emotion' ? params.lurePct : 0;
  G={
    mode,n,turn:0, seq:genSeq(n,items,lure,params.matchPct),
    hits:0,misses:0,omissions:0,responded:false,done:false,
    interval:params.initIv, targetDuration:durationMin*60000, startTime:0,
    recent:[],ivHistory:[],lastAdapt:0,
    roll:params.roll, adaptEvery:params.adaptEvery,
    lureTurns:0,lureResisted:0,
    postInterruptTotal:0, postInterruptCorrect:0,
    t1:0,t2:0,t3:0,clock:null
  };

  // Show correct stimulus area
  const isEmotion = mode==='emotion';
  $('grid').style.display = isEmotion ? 'none' : 'grid';
  $('face-display').style.display = isEmotion ? 'block' : 'none';

  setTimeout(()=>{
    G.startTime=Date.now();
    G.clock=setInterval(()=>{
      if(!G||G.done) return;
      const rem=G.targetDuration-(Date.now()-G.startTime);
      $('g-time').textContent=fmtTime(rem);
      uiProg(Math.min(1,(Date.now()-G.startTime)/G.targetDuration));
    },1000);
    runTurn();
  },950);
}

/* ══════════════════════════════════════════
   7. COMPLEX SPAN ENGINE
══════════════════════════════════════════ */
const CONSONANTS='BCDFGHJKLMNPQRSTVWXYZ'.split('');
const SPAN_ROUNDS=8;
let SP=null;

function mkSpanRound(span){
  const used=[]; const trials=[];
  for(let i=0;i<span;i++){
    const a=1+Math.floor(Math.random()*9);
    const b=1+Math.floor(Math.random()*9);
    const correct=a+b;
    const isTrue=Math.random()<.5;
    const shown=isTrue?correct:correct+(Math.random()<.5?1:-1);
    let letter; do{ letter=CONSONANTS[Math.floor(Math.random()*CONSONANTS.length)]; }while(used.includes(letter));
    used.push(letter);
    trials.push({eq:`${a} + ${b} = ${shown}`,correct:isTrue,letter});
  }
  return trials;
}

function spUpdateDots(){
  const dots=$('sp-dots'); if(!dots) return;
  dots.innerHTML='';
  for(let i=0;i<SP.span;i++){
    const d=document.createElement('div'); d.className='sp-dot';
    if(i<SP.trialIdx) d.classList.add('done');
    else if(i===SP.trialIdx) d.classList.add('cur');
    dots.appendChild(d);
  }
}

function spStartTrial(){
  if(!SP||SP.done) return;
  const trial=SP.sequence[SP.trialIdx];
  $('sp-math-area').style.display='block';
  $('sp-letter-area').style.display='none';
  $('sp-true').disabled=false; $('sp-false').disabled=false;
  $('sp-eq').textContent=trial.eq+' ?';
  $('sp-stat').textContent='';
  spUpdateDots();
  $('sp-prog').style.width=(SP.round/SPAN_ROUNDS*100)+'%';
  $('sp-lvl').textContent='Span '+SP.span;
  $('sp-round').textContent='Ronda '+(SP.round+1)+'/'+SPAN_ROUNDS;
  $('sp-timer-bar').textContent='';
  SP.mathTO=setTimeout(()=>spMathAnswer(null),5000); // timeout
}

function spMathAnswer(ans){
  if(!SP) return;
  clearTimeout(SP.mathTO);
  $('sp-true').disabled=true; $('sp-false').disabled=true;
  const trial=SP.sequence[SP.trialIdx];
  const correct = ans===null ? false : (ans===trial.correct);
  SP.mathResults.push(correct);
  if(ans===null) $('sp-stat').textContent='tiempo';
  else $('sp-stat').style.color=correct?'var(--prime)':'var(--warn)', $('sp-stat').textContent=correct?'correcto':'incorrecto';
  $('sp-math-area').style.display='none';
  $('sp-letter-area').style.display='block';
  $('sp-letter').textContent=trial.letter;
  SP.flashTO=setTimeout(()=>{
    $('sp-letter-area').style.display='none';
    SP.trialIdx++;
    if(SP.trialIdx<SP.span){ setTimeout(spStartTrial,300); }
    else { setTimeout(spStartRecall,400); }
  },1500);
}

function spStartRecall(){
  if(!SP) return;
  buildRecallKeyboard();
  SP.recalledLetters=[];
  updateRecallSlots();
  $('overlay-recall').classList.add('on');
}

function handleRecallKey(k){
  if(!SP) return;
  if(k==='BACK'){ SP.recalledLetters.pop(); }
  else if(SP.recalledLetters.length<SP.span){ SP.recalledLetters.push(k); }
  updateRecallSlots();
}

function buildRecallKeyboard(){
  const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
  const container=$('recall-keyboard'); container.innerHTML='';
  rows.forEach((row,ri)=>{
    const rowEl=document.createElement('div');
    rowEl.style.cssText='display:flex;gap:4px;justify-content:center;margin-bottom:4px';
    row.split('').forEach(l=>{ const b=document.createElement('button'); b.className='key-btn'; b.textContent=l; b.addEventListener('touchstart',e=>{e.preventDefault();handleRecallKey(l);},{passive:false}); b.addEventListener('click',()=>handleRecallKey(l)); rowEl.appendChild(b); });
    if(ri===2){ const bk=document.createElement('button'); bk.className='key-btn'; bk.style.minWidth='42px'; bk.textContent='←'; bk.addEventListener('touchstart',e=>{e.preventDefault();handleRecallKey('BACK');},{passive:false}); bk.addEventListener('click',()=>handleRecallKey('BACK')); rowEl.appendChild(bk); }
    container.appendChild(rowEl);
  });
}

function updateRecallSlots(showResult=false){
  const c=$('recall-slots'); if(!c) return;
  const target=SP.sequence.map(t=>t.letter);
  c.innerHTML='';
  for(let i=0;i<SP.span;i++){
    const s=document.createElement('div');
    s.className='recall-slot'+(i===SP.recalledLetters.length?' cur':'');
    if(showResult && SP.recalledLetters[i]){ s.classList.add(SP.recalledLetters[i]===target[i]?'ok':'bad'); }
    s.textContent=SP.recalledLetters[i]||'';
    c.appendChild(s);
  }
}

function spSubmitRecall(){
  if(!SP) return;
  const target=SP.sequence.map(t=>t.letter);
  let correct=0;
  for(let i=0;i<SP.span;i++){ if(SP.recalledLetters[i]===target[i]) correct++; }
  const recallAcc=Math.round(correct/SP.span*100);
  updateRecallSlots(true);
  setTimeout(()=>{
    $('overlay-recall').classList.remove('on');
    // Save round stats
    SP.roundStats.push({span:SP.span,recallAcc});
    SP.totalRecallCorrect+=correct; SP.totalRecallItems+=SP.span;
    SP.totalMathCorrect+=SP.mathResults.filter(Boolean).length; SP.totalMathItems+=SP.span;
    if(SP.span>SP.maxSpan) SP.maxSpan=SP.span;
    // Adapt span
    if(recallAcc>=80 && SP.span<7) SP.span++;
    else if(recallAcc<60 && SP.span>3) SP.span--;
    SP.round++;
    if(SP.round>=SPAN_ROUNDS){ endSpan(); }
    else { SP.trialIdx=0; SP.mathResults=[]; SP.sequence=mkSpanRound(SP.span); setTimeout(spStartTrial,800); }
  },1800);
}

function endSpan(){
  if(!SP) return; SP.done=true;
  const mathAcc=SP.totalMathItems>0?Math.round(SP.totalMathCorrect/SP.totalMathItems*100):0;
  const recallAcc=SP.totalRecallItems>0?Math.round(SP.totalRecallCorrect/SP.totalRecallItems*100):0;
  DB.add({mode:'span',mathAcc,recallAcc,maxSpan:SP.maxSpan});
  try {
    enviarResultadosAFirebase({ accuracy: recallAcc, falsePositives: SP.totalMathItems - SP.totalMathCorrect, avgResponseTime: 0 }, 'span');
  } catch (e) {
    console.error("Firebase submit error:", e);
  }
  Snd.stopBg();
  setTimeout(()=>showPhrase(recallAcc,()=>showResults({mode:'span',mathAcc,recallAcc,maxSpan:SP.maxSpan})),500);
}

function startSpan(){
  SP={span:3,round:0,trialIdx:0,sequence:[],mathResults:[],recalledLetters:[],roundStats:[],totalRecallCorrect:0,totalRecallItems:0,totalMathCorrect:0,totalMathItems:0,maxSpan:3,done:false,mathTO:null,flashTO:null};
  SP.sequence=mkSpanRound(SP.span);
  spStartTrial();
}

function stopSpan(){
  if(!SP) return;
  clearTimeout(SP.mathTO); clearTimeout(SP.flashTO);
  $('overlay-recall').classList.remove('on');
  SP=null;
}

/* ══════════════════════════════════════════
   7b. DUAL N-BACK ENGINE
══════════════════════════════════════════ */
let D=null;
let dFlashTO_vis=0, dFlashTO_aud=0;

function dLightCell(i)  { const c=$('dc'+i); if(c) c.classList.add('lit'); }
function dUnlightCell(i){ const c=$('dc'+i); if(c) c.classList.remove('lit'); }

function dEnableBtn(vis,aud){
  const bp=$('btn-match-pos');
  const bs=$('btn-match-sound');
  if(bp){
    bp.disabled=!vis;
    if(vis) bp.classList.add('ready');
    else bp.classList.remove('ready','hit','miss');
  }
  if(bs){
    bs.disabled=!aud;
    if(aud) bs.classList.add('ready');
    else bs.classList.remove('ready','hit','miss');
  }
}

function dFlashBtn(id,correct){
  const b=$(id); if(!b) return;
  b.classList.remove('hit','miss'); void b.offsetWidth;
  b.classList.add(correct?'hit':'miss');
  const t=id==='btn-match-pos'?'dFlashTO_vis':'dFlashTO_aud';
  clearTimeout(window[t]);
  window[t]=setTimeout(()=>b.classList.remove('hit','miss'),650);
}

function respondDual(channel, tapCell){
  // Dual onboarding intercept
  if(DOB){
    const {n,vis,aud,turn,phase}=DOB;
    if(turn<n) return;
    if(channel==='vis'&&phase==='vis'&&!DOB.respondedVis){
      DOB.respondedVis=true;
      const isMatch=vis[turn]===vis[turn-n];
      if(isMatch){ Snd.hit(); dCellHit(vis[turn]); dFlashBtn('btn-match-pos', true); $('d-stat').textContent='¡correcto!'; $('d-stat').style.color='var(--prime)'; }
      else{ dFlashBtn('btn-match-pos', false); $('d-stat').textContent='esa no coincidía'; $('d-stat').style.color='var(--muted)'; }
    } else if(channel==='aud'&&phase==='aud'&&!DOB.respondedAud){
      DOB.respondedAud=true;
      const isMatch=aud[turn]===aud[turn-n];
      if(isMatch){ Snd.hit(); dFlashBtn('btn-match-sound', true); $('d-stat').textContent='¡correcto!'; $('d-stat').style.color='var(--prime)'; }
      else{ dFlashBtn('btn-match-sound', false); $('d-stat').textContent='esa no coincidía'; $('d-stat').style.color='var(--muted)'; }
    }
    return;
  }
  if(!D||D.done||D.turn<D.n||!D.windowOpen) return;
  const i=D.turn;
  if(channel==='vis'){
    if(D.respondedVis) return;
    D.respondedVis=true;
    $('btn-match-pos').classList.remove('ready');
    const isMatch=D.seqVis[i]===D.seqVis[i-D.n];
    if(isMatch){
      D.visHits++; Snd.hit();
      dCellHit(D.seqVis[i]);
      dFlashBtn('btn-match-pos', true);
    } else {
      D.visMisses++; Snd.falseAlarm();
      dFlashBtn('btn-match-pos', false);
    }
  } else {
    if(D.respondedAud) return;
    D.respondedAud=true;
    $('btn-match-sound').classList.remove('ready');
    const isMatch=D.seqAud[i]===D.seqAud[i-D.n];
    if(isMatch){ D.audHits++; Snd.hit(); dFlashBtn('btn-match-sound', true); }
    else { D.audMisses++; Snd.falseAlarm(); dFlashBtn('btn-match-sound', false); }
  }
}

function runDualTurn(){
  if(!D||D.done) return;
  const {n,seqVis,seqAud,turn}=D;
  const iv=D.interval;
  const warm=turn<n;

  D.respondedVis=false; D.respondedAud=false; D.windowOpen=false;

  // Header UI
  const elapsed=Date.now()-D.startTime;
  $('d-time').textContent=fmtTime(D.targetDuration-elapsed);
  $('d-pace').textContent=(iv/1000).toFixed(1);
  $('d-prog').style.width=(Math.min(1,elapsed/D.targetDuration)*100)+'%';
  $('d-warm').style.display=warm?'inline-flex':'none';
  $('d-stat').textContent=''; $('d-stat').style.color='var(--muted)';

  // Visual stimulus
  const cell=seqVis[turn];
  dLightCell(cell);
  D.t1=setTimeout(()=>dUnlightCell(cell),LIT);
  Snd.cell();

  // Auditory stimulus
  const letter=seqAud[turn];
  if(CFG.get('dualAudioOn')){
    speakLetter(letter);
  } else {
    $('d-letter').textContent=letter;
    $('d-letter').style.display='block';
    setTimeout(()=>{ $('d-letter').style.display='none'; },LIT);
  }

  if(!warm){ D.windowOpen=true; dEnableBtn(true,true); }

  // Close response window
  D.t2=setTimeout(()=>{
    D.windowOpen=false;
    dEnableBtn(false,false);
    if(!warm){
      const visMatch=seqVis[turn]===seqVis[turn-n];
      const audMatch=seqAud[turn]===seqAud[turn-n];
      const msgs=[];
      if(visMatch&&!D.respondedVis){ D.visOmissions++; msgs.push('omisión visual'); }
      if(audMatch&&!D.respondedAud){ D.audOmissions++; msgs.push('omisión auditiva'); }
      if(msgs.length){ $('d-stat').textContent=msgs.join(' · '); $('d-stat').style.color='var(--warn)'; Snd.miss(); }

      // Combined correctness for adaptive (1 = fully correct, 0.5 = one channel ok, 0 = both wrong)
      const vc=(visMatch&&D.respondedVis)||(!visMatch&&!D.respondedVis)?1:0;
      const ac=(audMatch&&D.respondedAud)||(!audMatch&&!D.respondedAud)?1:0;
      D.recent.push((vc+ac)/2);
      if(D.recent.length>D.roll) D.recent.shift();
      D.ivHistory.push(iv);
      const done=D.ivHistory.length;
      if(D.recent.length===D.roll&&done-D.lastAdapt>=D.adaptEvery){
        const avg=D.recent.reduce((a,b)=>a+b,0)/D.roll;
        if(avg>=0.90&&D.interval>MIN_IV){ D.interval=Math.max(MIN_IV,D.interval-150); D.lastAdapt=done; }
        else if(avg<=0.75&&D.interval<MAX_IV){ D.interval=Math.min(MAX_IV,D.interval+150); D.lastAdapt=done; }
      }
    }
  },iv-600);

  // Advance
  D.t3=setTimeout(()=>{
    D.turn++;
    const ad=D.turn-n;
    const elap2=Date.now()-D.startTime;
    const expired=elap2>=D.targetDuration&&ad>0;
    const safeLimit=D.turn>=seqVis.length-5;
    if(expired||safeLimit) endDual();
    else runDualTurn();
  },iv);
}

function endDual(){
  if(!D||D.done) return;
  D.done=true;
  if(D.clock) clearInterval(D.clock);
  dEnableBtn(false,false);
  try{ speechSynthesis.cancel(); }catch(e){}
  const {n,visHits,visMisses,visOmissions,audHits,audMisses,audOmissions,ivHistory}=D;
  const activeDone=Math.max(1,D.turn-n);
  const visAcc=calcAcc(visHits,visMisses,visOmissions,activeDone);
  const audAcc=calcAcc(audHits,audMisses,audOmissions,activeDone);
  const combAcc=Math.round((visAcc+audAcc)/2);
  const avgInterval=ivHistory.length?Math.round(ivHistory.reduce((a,b)=>a+b,0)/ivHistory.length):INIT_IV;
  DB.add({mode:'dual',n,visAcc,audAcc,combAcc,avgInterval,visHits,visMisses,visOmissions,audHits,audMisses,audOmissions});
  try {
    enviarResultadosAFirebase({ accuracy: combAcc, falsePositives: visMisses + audMisses, avgResponseTime: +(avgInterval/1000).toFixed(2) }, 'dual');
  } catch (e) {
    console.error("Firebase submit error:", e);
  }
  Snd.stopAmb(); Snd.stopBg();
  setTimeout(()=>showPhrase(combAcc,()=>showResults({mode:'dual',n,visAcc,audAcc,combAcc,avgInterval})),600);
}

function startDual(n,durationMin){
  stopDual();
  currentMode='dual';
  const params=getSessionParams('dual');
  const {seqVis,seqAud}=genDualSeq(n,params.matchPct);
  D={
    n,turn:0,seqVis,seqAud,
    visHits:0,visMisses:0,visOmissions:0,
    audHits:0,audMisses:0,audOmissions:0,
    respondedVis:false,respondedAud:false,windowOpen:false,done:false,
    interval:params.initIv,targetDuration:durationMin*60000,startTime:0,
    recent:[],ivHistory:[],lastAdapt:0,
    roll:params.roll,adaptEvery:params.adaptEvery,
    t1:0,t2:0,t3:0,clock:null
  };
  $('d-lvl').textContent=n+'-Back';
  $('d-time').textContent=fmtTime(durationMin*60000);
  $('d-warm').style.display='none';
  $('d-pace').textContent=(INIT_IV/1000).toFixed(1);
  $('d-prog').style.width='0%';
  $('d-stat').textContent='';
  $('d-letter').style.display='none';
  dEnableBtn(false,false);
  setTimeout(()=>{
    D.startTime=Date.now();
    D.clock=setInterval(()=>{
      if(!D||D.done) return;
      const rem=D.targetDuration-(Date.now()-D.startTime);
      $('d-time').textContent=fmtTime(rem);
      $('d-prog').style.width=(Math.min(1,(Date.now()-D.startTime)/D.targetDuration)*100)+'%';
    },1000);
    runDualTurn();
  },950);
}

function stopDual(){
  stopDualOnboarding();
  if(!D) return;
  clearTimeout(D.t1); clearTimeout(D.t2); clearTimeout(D.t3);
  if(D.clock) clearInterval(D.clock);
  try{ speechSynthesis.cancel(); }catch(e){}
  D=null;
}

/* ══════════════════════════════════════════
   7c. SESSION DIFFICULTY PARAMS
══════════════════════════════════════════ */
const NEWCOMER_CAP = 3;

function getSessionParams(mode) {
  const c = DB.sessionCount(mode);
  const isEmotion = mode === 'emotion';
  if(c === 0) return { initIv:isEmotion?4500:4500, matchPct:40, roll:15, adaptEvery:15, lurePct:0 };
  if(c < NEWCOMER_CAP) return { initIv:isEmotion?4500:4500, matchPct:35, roll:12, adaptEvery:12, lurePct:Math.min(10,CFG.get('lurePct')) };
  return { initIv:INIT_IV, matchPct:30, roll:ROLL, adaptEvery:ADAPT_EVERY, lurePct:CFG.get('lurePct') };
}

/* ══════════════════════════════════════════
   7d. ONBOARDING ENGINE
══════════════════════════════════════════ */
const OB_ACTIVE = 5;   // guided active turns for standard modes
const DOB_PHASE = 4;   // guided active turns per dual phase

let OB = null;   // standard onboarding state
let DOB = null;  // dual onboarding state

// ── helpers ──────────────────────────────
function obSpeak(txt) {
  if(!txt||!('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(txt); u.rate=0.93; u.lang='es-ES'; speechSynthesis.speak(u); } catch(e){}
}

function setOBHint(txt, col) {
  const el=$('ob-hint-bar');
  if(!el) return;
  if(!txt){ el.style.opacity='0'; return; }
  $('ob-hint-text').textContent=txt;
  el.style.color=col||'var(--text)';
  el.style.opacity='1';
  el.style.display='block';
}

function showOBArrow(type) { // 'center' | 'vis' | 'aud' | null
  $('ob-arrow').style.display    =(type==='center')?'block':'none';
  $('ob-arrow-vis').style.display=(type==='vis')   ?'block':'none';
  $('ob-arrow-aud').style.display=(type==='aud')   ?'block':'none';
}

function genOBSeq(n, items, activeTurns) {
  // warmup turns then activeTurns: first active = guaranteed match, rest 80%
  const s=[];
  for(let i=0;i<n+activeTurns;i++){
    if(i<n){ let c; do{c=Math.floor(Math.random()*items);}while(i>=1&&s[i-1]===c); s.push(c); }
    else {
      const ai=i-n;
      if(ai===0||Math.random()<0.80) s.push(s[i-n]);
      else { let c; do{c=Math.floor(Math.random()*items);}while(c===s[i-n]); s.push(c); }
    }
  }
  return s;
}

// ── standard onboarding (nback / emotion) ──
function startOnboarding(mode, n, onDone) {
  stopOnboarding();
  const items = mode==='emotion'?4:9;
  const seq = genOBSeq(n, items, OB_ACTIVE);
  OB = {mode, n, seq, turn:0, total:n+OB_ACTIVE, onDone, responded:false, t1:0, t2:0, t3:0};

  const isEm = mode==='emotion';
  $('grid').style.display = isEm?'none':'grid';
  $('face-display').style.display = isEm?'block':'none';
  $('g-lvl').textContent = n+'-Back';
  $('g-time').textContent = ''; $('g-warm').style.display='none';
  $('g-prog').style.width='0%'; $('g-pace').textContent='';
  uiStat('',null); enableBtn(false);
  $('ob-hint-bar').style.display='block';
  show('s-game');
  setTimeout(runOBTurn, 700);
}

function runOBTurn() {
  if(!OB) return;
  const {n, seq, turn, mode} = OB;
  const warm = turn < n;
  const ai = turn - n;
  const cell = seq[turn];
  const isMatch = !warm && seq[turn]===seq[turn-n];
  OB.responded = false;

  let hint = '';
  if(turn===0)          hint = 'Mira esta celda.';
  else if(turn===1)     hint = 'Ahora mira esta.';
  else if(turn<n)       hint = '';
  else if(ai===0)       hint = isMatch ? `¿La misma que hace ${n} turnos? ¡Sí! Presiona.` : `Distinta esta vez. Sigue mirando.`;
  else if(isMatch)      hint = '¡Coincide! Presiona el botón.';
  else                  hint = '';

  setOBHint(hint);
  if(hint) obSpeak(hint);

  const IV = 3800;
  if(mode==='emotion'){
    $('face-display').innerHTML = faceSVG(cell%4);
    OB.t1 = setTimeout(()=>{ $('face-display').innerHTML=''; }, LIT_EMOTION);
  } else {
    lightCell(cell);
    OB.t1 = setTimeout(()=>unlightCell(cell), LIT);
  }
  Snd.cell();
  if(!warm){ enableBtn(true); if(isMatch) showOBArrow('center'); }

  OB.t2 = setTimeout(()=>{
    enableBtn(false); showOBArrow(null);
    if(!warm && isMatch && !OB.responded)
      uiStat('aquí coincidía — sigue','ok');
  }, IV-700);

  OB.t3 = setTimeout(()=>{
    uiStat('',null); OB.turn++;
    if(OB.turn >= OB.total) endOnboarding();
    else runOBTurn();
  }, IV);
}

// ── dual onboarding (3 phases) ──
function genDOBSeq(n) {
  const vis = genOBSeq(n, 9, DOB_PHASE);
  const aud = [];
  for(let i=0;i<n+DOB_PHASE;i++){
    if(i<n){ let c; do{c=DUAL_LETTERS[Math.floor(Math.random()*DUAL_LETTERS.length)];}while(i>=1&&aud[i-1]===c); aud.push(c); }
    else {
      const ai=i-n;
      if(ai===0||Math.random()<0.80) aud.push(aud[i-n]);
      else { let c; do{c=DUAL_LETTERS[Math.floor(Math.random()*DUAL_LETTERS.length)];}while(c===aud[i-n]); aud.push(c); }
    }
  }
  return {vis, aud};
}

function startDualOnboarding(n, onDone) {
  stopDualOnboarding();
  const {vis, aud} = genDOBSeq(n);
  DOB = {n, vis, aud, turn:0, phase:'vis', onDone, respondedVis:false, respondedAud:false, t1:0, t2:0, t3:0};

  $('d-lvl').textContent=n+'-Back'; $('d-time').textContent='';
  $('d-warm').style.display='none'; $('d-prog').style.width='0%';
  $('d-pace').textContent=''; $('d-stat').textContent='';
  $('d-letter').style.display='none';
  dEnableBtn(false,false);
  $('ob-hint-bar').style.display='block';
  setOBHint('Vamos por partes. Primero solo la posición visual — presiona UBICACIÓN cuando coincida.');
  obSpeak('Vamos por partes. Primero solo la posición visual.');
  show('s-dual');
  setTimeout(runDOBTurn, 1900);
}

function runDOBTurn() {
  if(!DOB) return;
  const {n, vis, aud, turn, phase} = DOB;
  const warm = turn < n;
  const isVisPhase = phase==='vis', isAudPhase = phase==='aud';
  const cell   = vis[turn];
  const letter = aud[turn];
  const visMatch = !warm && vis[turn]===vis[turn-n];
  const audMatch = !warm && aud[turn]===aud[turn-n];
  DOB.respondedVis = false; DOB.respondedAud = false;

  let hint = '';
  if(warm && turn===0) hint = isVisPhase ? 'Mira qué celda se ilumina. Cuando coincida, presiona UBICACIÓN.' : 'Escucha la letra.';
  else if(isVisPhase && visMatch) hint = '¡La misma posición! Presiona UBICACIÓN.';
  else if(isAudPhase && audMatch) hint = '¡La misma letra! Presiona SONIDO.';

  setOBHint(hint); if(hint) obSpeak(hint);

  const IV = 3800;
  // Stimulus
  if(isVisPhase){
    dLightCell(cell);
    DOB.t1 = setTimeout(()=>dUnlightCell(cell), LIT);
  }
  if(isAudPhase){
    if(CFG.get('dualAudioOn')) speakLetter(letter);
    else { $('d-letter').textContent=letter; $('d-letter').style.display='block'; setTimeout(()=>{$('d-letter').style.display='none';},LIT); }
  }
  Snd.cell();
  if(!warm){
    if(isVisPhase){ dEnableBtn(true,false); if(visMatch) showOBArrow('vis'); }
    if(isAudPhase){ dEnableBtn(false,true); if(audMatch) showOBArrow('aud'); }
  }

  DOB.t2 = setTimeout(()=>{
    dEnableBtn(false,false); showOBArrow(null);
    if(!warm){
      if(isVisPhase && visMatch && !DOB.respondedVis){ $('d-stat').textContent='aquí coincidía — sigue'; $('d-stat').style.color='var(--prime)'; }
      if(isAudPhase && audMatch && !DOB.respondedAud){ $('d-stat').textContent='aquí coincidía — sigue'; $('d-stat').style.color='var(--prime)'; }
    }
  }, IV-700);

  DOB.t3 = setTimeout(()=>{
    $('d-stat').textContent='';
    DOB.turn++;
    if(DOB.turn >= n+DOB_PHASE){
      if(phase==='vis'){
        DOB.phase='aud'; DOB.turn=0;
        $$('#d-grid .cell').forEach(c=>c.classList.add('ob-dim'));
        setOBHint('Ahora solo la letra. Escucha el sonido.');
        obSpeak('Ahora solo la letra. Escucha el sonido.');
        setTimeout(runDOBTurn, 1900);
      } else {
        endDualOnboarding();
      }
    } else {
      runDOBTurn();
    }
  }, IV);
}

function endDualOnboarding() {
  if(!DOB) return;
  isTutorial = false;
  const onDone = DOB.onDone;
  dEnableBtn(false,false); showOBArrow(null);
  $$('#d-grid .cell').forEach(c=>c.classList.remove('ob-dim'));
  setOBHint('Ya lo tienes. Ahora los dos al mismo tiempo.', 'var(--prime)');
  obSpeak('Ya lo tienes. Ahora los dos al mismo tiempo.');
  DOB = null;
  setTimeout(()=>{ $('ob-hint-bar').style.display='none'; if(onDone) onDone(); }, 2400);
}

function stopDualOnboarding() {
  if(!DOB) return;
  isTutorial = false;
  clearTimeout(DOB.t1); clearTimeout(DOB.t2); clearTimeout(DOB.t3);
  $('ob-hint-bar').style.display='none'; showOBArrow(null);
  $$('#d-grid .cell').forEach(c=>c.classList.remove('ob-dim'));
  try{speechSynthesis.cancel();}catch(e){}
  DOB = null;
}

function endOnboarding() {
  if(!OB) return;
  isTutorial = false;
  const onDone = OB.onDone;
  enableBtn(false); showOBArrow(null);
  setOBHint('Ya lo tienes. Ahora juega solo.', 'var(--prime)');
  obSpeak('Ya lo tienes. Ahora juega solo.');
  OB = null;
  setTimeout(()=>{ $('ob-hint-bar').style.display='none'; if(onDone) onDone(); }, 2300);
}

function stopOnboarding() {
  if(!OB) return;
  isTutorial = false;
  clearTimeout(OB.t1); clearTimeout(OB.t2); clearTimeout(OB.t3);
  $('ob-hint-bar').style.display='none'; showOBArrow(null);
  try{speechSynthesis.cancel();}catch(e){}
  OB = null;
}

/* ══════════════════════════════════════════
   8. UI HELPERS
══════════════════════════════════════════ */
// Build game grid
(function(){
  const el=document.getElementById('grid');
  if(!el) return;
  for(let i=0;i<9;i++){ const c=document.createElement('div'); c.className='cell'; c.id='c'+i; el.appendChild(c); }
})();
// Build tutorial grid
(function(){
  const el=$('tgrid');
  if(!el) return;
  for(let i=0;i<9;i++){ const c=document.createElement('div'); c.className='tcell'; c.id='tc'+i; el.appendChild(c); }
})();
// Build dual grid
(function(){
  const el=$('d-grid');
  if(!el) return;
  for(let i=0;i<9;i++){
    const c=document.createElement('div'); c.className='cell'; c.id='dc'+i;
    el.appendChild(c);
  }
})();

const lightCell   = i => { const c=$('c'+i); if(c) c.classList.add('lit'); };
const unlightCell = i => { const c=$('c'+i); if(c) c.classList.remove('lit'); };

function cellHit(i){ const c=$('c'+i); if(!c) return; c.classList.add('lit-ok'); setTimeout(()=>c.classList.remove('lit-ok'),520); }
function dCellHit(i){ const c=$('dc'+i); if(!c) return; c.classList.add('lit-ok'); setTimeout(()=>c.classList.remove('lit-ok'),520); }

function showPhrase(acc, onDone){
  const txt = acc>=80 ? 'Tu cerebro trabajó bien hoy.'
            : acc>=60 ? 'Cada sesión construye algo que no se ve todavía.'
                      : 'Los primeros días son los más difíciles. Esto es normal.';
  $('phrase-text').textContent = txt;
  show('s-phrase');
  setTimeout(()=>{ if(onDone) onDone(); }, 2100);
}

function renderMenuStreak(){
  const card=$('hero-streak-card'); if(!card) return;
  if(DB.consecutiveDays()===0 && DB.all().length===0){
    card.innerHTML=`<div style="width:100%;padding:4px 0">
      <div style="font-size:.88rem;color:var(--muted);line-height:1.7;margin-bottom:14px">Empieza tu primera sesión —<br>toma 8 minutos.</div>
      <button class="btn-primary-full" id="btn-streak-start" style="max-width:220px;margin:0 auto;height:44px;font-size:.9rem">Empezar ahora</button>
    </div>`;
    // Attach listener since we used dynamic HTML
    const b=$('btn-streak-start');
    if(b) b.onclick = () => { selMode='nback'; showModeConfig('nback'); };
    return;
  }
  const days=DB.consecutiveDays();
  card.innerHTML=`<div class="streak-left">
    <svg class="streak-widget-bg" width="80" height="80" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="28" r="4" fill="#6effc8"/><circle cx="20" cy="96" r="4" fill="#6effc8"/><circle cx="100" cy="96" r="4" fill="#6effc8"/><circle cx="60" cy="70" r="4" fill="#6effc8"/>
      <line x1="60" y1="28" x2="20" y2="96" stroke="#6effc8" stroke-width="2"/><line x1="60" y1="28" x2="100" y2="96" stroke="#6effc8" stroke-width="2"/><line x1="20" y1="96" x2="100" y2="96" stroke="#6effc8" stroke-width="2"/>
      <line x1="60" y1="70" x2="60" y2="28" stroke="#6effc8" stroke-width="2"/><line x1="60" y1="70" x2="20" y2="96" stroke="#6effc8" stroke-width="2"/><line x1="60" y1="70" x2="100" y2="96" stroke="#6effc8" stroke-width="2"/>
    </svg>
    <div class="streak-num" id="streak-num">${days}</div>
  </div>
  <div class="streak-right">
    <div class="streak-lbl">DÍAS ACTIVOS SEGUIDOS</div>
    <div class="week-row" id="week-row"><div class="week-dot"></div><div class="week-dot"></div><div class="week-dot"></div><div class="week-dot"></div><div class="week-dot"></div><div class="week-dot"></div><div class="week-dot"></div></div>
  </div>`;
}
function renderWeekDots(){
  const dots=$$('#week-row .week-dot'); if(!dots.length) return;
  const sessions=JSON.parse(localStorage.getItem('nback_v1')||'[]');
  const activeDays=new Set(sessions.map(s=>new Date(s.ts).toDateString()));
  dots.forEach((dot,i)=>{
    const d=new Date(Date.now()-i*86400000).toDateString();
    dot.classList.toggle('active',activeDays.has(d));
  });
}

function uiProg(r){ $('g-prog').style.width=(r*100)+'%'; }
function uiStat(msg,type){
  const el=$('g-stat'); el.textContent=msg;
  el.style.color=type==='ok'?'var(--prime)':type==='bad'?'var(--warn)':'var(--muted)';
}
let flashTO=0;
function enableBtn(active){ const b=$('mbtn'); b.disabled=!active; active?b.classList.add('ready'):b.classList.remove('ready','hit','miss'); }
function flashBtn(correct){ const b=$('mbtn'); b.classList.remove('hit','miss'); void b.offsetWidth; b.classList.add(correct?'hit':'miss'); clearTimeout(flashTO); flashTO=setTimeout(()=>b.classList.remove('hit','miss'),650); }
function shakeBtn(){ const b=$('mbtn'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); setTimeout(()=>b.classList.remove('shake'),200); }
function updateGameScore(){ if(!G) return; const el=$('g-score'); if(!el) return; el.style.display='inline'; el.textContent=G.hits+' ✓ / '+(G.hits+G.omissions); }
function flashPace(){ const el=$('g-pace'); if(!el) return; el.classList.remove('pace-flash'); void el.offsetWidth; el.classList.add('pace-flash'); setTimeout(()=>el.classList.remove('pace-flash'),750); }

function show(id){
  $$('.scr').forEach(s=>{ s.classList.remove('on'); s.scrollTop=0; });
  $(id).classList.add('on');
  const gameScreens=['s-game','s-span','s-dual'];
  const isMenu = id==='s-menu';
  document.body.classList.toggle('on-menu', isMenu);
  $('btn-cfg').style.display = gameScreens.includes(id) ? 'flex' : 'none';
  $('snd').style.display = gameScreens.includes(id) ? 'flex' : 'none';
  if(isMenu){ renderMenuStreak(); renderWeekDots(); }
  // sync bottom nav active state
  $$('.nav-item').forEach(n=>n.classList.remove('on'));
  if(isMenu) $('nav-inicio')?.classList.add('on');
}

/* ══════════════════════════════════════════
   9. RESULTS
══════════════════════════════════════════ */
function getResultMsg(acc){
  if(acc>=90) return 'Impresionante. Estás dominando esto.';
  if(acc>=70) return 'Buen ritmo. Vas por buen camino.';
  if(acc>=50) return 'Normal al principio. Con 3 sesiones más notarás el cambio.';
  return 'Primer intento difícil. Mañana te sale mejor.';
}

function showResults(data){
  const {mode}=data;

  if(mode==='dual'){
    const {n,visAcc,audAcc,combAcc,avgInterval}=data;
    $('r-lvl').textContent='Dual N-Back · '+n+'-Back';
    $('r-pct').textContent=combAcc+'%';
    $('r-bar').style.width='0%';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ $('r-bar').style.width=combAcc+'%'; }));
    $('r-speed-row').style.display='flex';
    $('r-interval').textContent=(avgInterval/1000).toFixed(1)+' s/turno';
    $('r-speed-lbl').textContent='Agilidad en Toma de Decisiones';
    $('r-cards').innerHTML=[
      [visAcc+'%', 'var(--prime)', 'Índice de Adaptabilidad Visual'],
      [audAcc+'%', '#7eb8e8',     'Índice de Adaptabilidad Auditiva'],
      [combAcc+'%','var(--text)', 'Índice de Adaptabilidad Combinada'],
    ].map(([v,c,l])=>`<div class="rcard"><div class="rval" style="color:${c}">${v}</div><div class="rlbl">${l}</div></div>`).join('');
    $('r-rec').style.display='none';
    $('r-msg').textContent=getResultMsg(combAcc);
    show('s-results');
    return;
  }

  if(mode==='span'){
    const {mathAcc,recallAcc,maxSpan}=data;
    $('r-lvl').textContent='Span Complejo · '+SPAN_ROUNDS+' rondas';
    $('r-pct').textContent=recallAcc+'%';
    $('r-bar').style.width='0%';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ $('r-bar').style.width=recallAcc+'%'; }));
    $('r-speed-row').style.display='none';
    $('r-cards').innerHTML=[
      [mathAcc+'%',  'var(--prime)', 'Índice de Adaptabilidad Matemática'],
      [recallAcc+'%','var(--prime)', 'Índice de Adaptabilidad de Memoria'],
      [maxSpan,      'var(--text)',  'Span máx. alcanzado'],
    ].map(([v,c,l])=>`<div class="rcard"><div class="rval" style="color:${c}">${v}</div><div class="rlbl">${l}</div></div>`).join('');
    $('r-rec').style.display='none';
    $('r-msg').textContent=getResultMsg(recallAcc);
    show('s-results');
    return;
  }

  const {n,hits,misses,omissions,acc,avgInterval,lureRes,postAcc}=data;
  $('r-lvl').textContent=(MODES[mode]?.name||'N-Back')+' · '+n+'-Back';
  $('r-interval').textContent=(avgInterval/1000).toFixed(1)+' s/turno';
  $('r-speed-row').style.display='flex';
  $('r-speed-lbl').textContent='Agilidad en Toma de Decisiones';
  $('r-pct').textContent='0%';
  $('r-bar').style.width='0%';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ $('r-bar').style.width=acc+'%'; $('r-pct').textContent=acc+'%'; }));

  const cards=[
    [hits,      'var(--prime)', 'Aciertos'],
    [misses,    'var(--warn)',  'Fricción / Resistencia al Cambio'],
    [omissions, 'var(--muted)', 'Omisiones'],
    [hits+omissions,'var(--text)','Turnos objetivo'],
  ];
  if(lureRes!==null) cards.push([lureRes+'%','var(--prime)','Resistencia señuelos']);
  if(postAcc!==null) cards.push([postAcc+'%',postAcc>=acc?'var(--prime)':'var(--warn)','Recuperación foco']);
  $('r-cards').innerHTML=cards.map(([v,c,l])=>`<div class="rcard"><div class="rval" style="color:${c}">${v}</div><div class="rlbl">${l}</div></div>`).join('');

  const recEl=$('r-rec');
  const rec=DB.recommendations().find(r=>r.n===n);
  if(rec&&mode==='nback'){ recEl.style.display='block'; recEl.innerHTML=`<div class="rec-card">💡 ${rec.text}</div>`; }
  else recEl.style.display='none';

  $('r-msg').textContent=getResultMsg(acc);
  show('s-results');
}

/* ══════════════════════════════════════════
   10. STATS
══════════════════════════════════════════ */
let activeStTab='nback';

const LVL_MIN=[0,5,15,30,50];
const LVL_MAX=[5,15,30,50,Infinity];
function calcLevel(total){
  let lvl=1;
  for(let i=0;i<LVL_MIN.length;i++){ if(total>=LVL_MIN[i]) lvl=i+1; else break; }
  const min=LVL_MIN[lvl-1], max=LVL_MAX[lvl-1];
  const xpPct=max===Infinity?100:Math.round(((total-min)/(max-min))*100);
  return {lvl, xpPct, nextAt:max===Infinity?null:max};
}

function renderStats(){
  const all=DB.all();
  const total=all.length;
  const getAcc=s=>s.acc!=null?s.acc:(s.combAcc!=null?s.combAcc:(s.recallAcc!=null?s.recallAcc:0));

  // 1. Level + XP bar
  const {lvl,xpPct,nextAt}=calcLevel(total);
  $('st-level-label').textContent='NIVEL '+lvl;
  $('st-level-sub').textContent=nextAt?`${total} / ${nextAt} sesiones para el siguiente nivel`:'Nivel máximo alcanzado';
  $('st-total-num').textContent=total;
  setTimeout(()=>{ $('st-xp-fill').style.width=xpPct+'%'; },80);

  // 2. Streak
  const streak=DB.consecutiveDays();
  $('st-streak').textContent=streak;
  $('st-streak-icon').textContent=streak>=7?'🔥':streak>=3?'⚡':'💡';
  $('st-streak-sub').textContent=streak===0?'Empieza tu racha hoy — juega una sesión':
    streak===1?'¡Llevas 1 día! Vuelve mañana para mantener la racha.':
    `${streak} días seguidos. ¡Sigue así!`;

  // 3. Metric cards
  const now=Date.now();
  const week1=all.filter(s=>s.ts>now-7*86400000);
  const week2=all.filter(s=>s.ts>now-14*86400000&&s.ts<=now-7*86400000);
  const avg1=week1.length?Math.round(week1.reduce((a,s)=>a+getAcc(s),0)/week1.length):null;
  const avg2=week2.length?Math.round(week2.reduce((a,s)=>a+getAcc(s),0)/week2.length):null;
  $('st-mc-acc-val').textContent=avg1!=null?avg1+'%':'—';
  if(avg1!=null&&avg2!=null){
    const d=avg1-avg2;
    const el=$('st-mc-acc-delta');
    el.textContent=(d>=0?'↑ +':' ↓ ')+Math.abs(d)+'% vs semana pasada';
    el.style.color=d>=0?'var(--prime)':'var(--warn)';
  } else { $('st-mc-acc-delta').textContent=''; }

  const intervals=all.filter(s=>s.avgInterval).map(s=>s.avgInterval);
  if(intervals.length){
    const fastest=(Math.min(...intervals)/1000).toFixed(1);
    $('st-mc-pace-val').textContent=fastest+'s';
    $('st-mc-pace-delta').style.color='var(--muted)';
    $('st-mc-pace-delta').textContent='intervalo mínimo';
  } else { $('st-mc-pace-val').textContent='—'; $('st-mc-pace-delta').textContent=''; }

  const nSessions=all.filter(s=>(s.mode==='nback'||s.mode==='dual')&&s.n);
  if(nSessions.length){
    const bestN=Math.max(...nSessions.map(s=>s.n));
    $('st-mc-nback-val').textContent=bestN+'-Back';
    $('st-mc-nback-delta').textContent='';
  } else { $('st-mc-nback-val').textContent='—'; $('st-mc-nback-delta').textContent=''; }

  // Tendencia
  const trend=DB.trend(activeStTab);
  const tr=$('st-trend-row'), te=$('st-trend');
  if(tr){ tr.style.display=trend?'flex':'none'; }
  if(te&&trend){ te.textContent=trend; te.style.color=trend==='En aumento'?'var(--prime)':trend==='Estable'?'var(--text)':'var(--warn)'; }

  if(activeStTab==='dual'){
    $('st-table-title').textContent='Por nivel';
    $('st-head').innerHTML='<tr><th>Nivel</th><th>Ses.</th><th>Visual</th><th>Auditivo</th><th>Comb.</th></tr>';
    const rows=DB.stats('dual').filter(s=>s.count>0).map(s=>
      `<tr><td style="color:var(--prime);font-weight:600">${s.n}-Back</td><td>${s.count}</td><td style="color:var(--prime)">${s.avgVis}%</td><td style="color:#7eb8e8">${s.avgAud}%</td><td style="color:var(--text)">${s.avgComb}%</td></tr>`
    ).join('');
    $('st-body').innerHTML=rows||`<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Sin datos aún</td></tr>`;
    $('st-recs').style.display='none';
    $('cbtns').style.display='flex';
    const active=document.querySelector('#cbtns .cbtn.on');
    setTimeout(()=>drawDualChart(active?+active.dataset.cv:2),80);
    renderAchievements();
    return;
  }

  if(activeStTab==='span'){
    $('st-table-title').textContent='Resumen';
    $('st-head').innerHTML='<tr><th>Sesiones</th><th>Matemáticas</th><th>Memoria</th><th>Span máx.</th></tr>';
    const d=DB.stats('span')[0];
    $('st-body').innerHTML=d.count?`<tr><td>${d.count}</td><td style="color:var(--prime)">${d.avgMath}%</td><td style="color:var(--prime)">${d.avgRecall}%</td><td>${d.bestSpan}</td></tr>`:
      `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Sin datos aún</td></tr>`;
    $('st-recs').style.display='none';
    $('cbtns').style.display='none';
    $('chart').style.display='none';
    const hasSpanData=DB.stats('span')[0].count>0;
    $('chart-empty').style.display=hasSpanData?'none':'block';
    renderAchievements();
    return;
  }

  $('cbtns').style.display='flex';
  $('st-head').innerHTML='<tr><th>Nivel</th><th>Sesiones</th><th>Media</th><th>Mejor</th></tr>';
  $('st-table-title').textContent='Por nivel';
  const rows=DB.stats(activeStTab).filter(s=>s.count>0).map(s=>
    `<tr><td style="color:var(--prime);font-weight:600">${s.n}-Back</td><td>${s.count}</td><td style="color:var(--prime)">${s.avg}%</td><td>${s.best}%</td></tr>`
  ).join('');
  $('st-body').innerHTML=rows||`<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Sin datos aún</td></tr>`;

  const recs=DB.recommendations();
  const recSec=$('st-recs');
  if(recs.length&&activeStTab==='nback'){ recSec.style.display='block'; $('st-rec-body').innerHTML=recs.map(r=>`<div class="rec-card" style="margin-bottom:8px">💡 ${r.text}</div>`).join(''); }
  else recSec.style.display='none';

  const active=document.querySelector('#cbtns .cbtn.on');
  setTimeout(()=>drawChart(active?+active.dataset.cv:2),80);
  renderAchievements();
}

function renderAchievements(){
  const all=DB.all();
  const total=all.length;
  const getAcc=s=>s.acc!=null?s.acc:(s.combAcc!=null?s.combAcc:(s.recallAcc!=null?s.recallAcc:0));
  const streak=DB.consecutiveDays();

  const ACHIEVEMENTS=[
    { icon:'🎯', name:'Primera sesión', desc:'Completa tu primera sesión', done: total>=1 },
    { icon:'🔥', name:'3 días seguidos', desc:'Mantén una racha de 3 días', done: streak>=3 },
    { icon:'💪', name:'10 sesiones', desc:'Completa 10 sesiones en total', done: total>=10 },
    { icon:'⭐', name:'Precisión 85%+', desc:'Logra 85% o más en una sesión', done: all.some(s=>getAcc(s)>=85) },
    { icon:'🧠', name:'Dominar 3-Back', desc:'Completa una sesión de 3-Back con 70%+ de precisión', done: all.some(s=>(s.mode==='nback'||s.mode==='dual')&&s.n===3&&getAcc(s)>=70) },
  ];

  $('st-achievements').innerHTML=ACHIEVEMENTS.map(a=>`
    <div class="st-achievement ${a.done?'unlocked':'locked'}">
      <div class="st-ach-icon">${a.done?a.icon:'🔒'}</div>
      <div class="st-ach-body">
        <div class="st-ach-name" style="${a.done?'color:var(--text)':'color:var(--muted)'}">${a.name}</div>
        <div class="st-ach-desc">${a.desc}</div>
      </div>
      ${a.done?'<div style="color:var(--prime);font-size:.7rem;font-weight:600;flex-shrink:0">✓</div>':''}
    </div>`).join('');
}

function drawChart(n){
  const canvas=$('chart'),empty=$('chart-empty');
  const sessions=DB.forN(n).filter(s=>s.n===n);
  canvas.style.display='block';
  if(sessions.length<2){ canvas.style.display='none'; empty.style.display='block'; return; }
  empty.style.display='none';

  const dpr=window.devicePixelRatio||1, W=canvas.offsetWidth||320, H=200;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.height=H+'px';
  const cx=canvas.getContext('2d'); cx.scale(dpr,dpr);
  const p={t:14,r:16,b:30,l:40}, cW=W-p.l-p.r, cH=H-p.t-p.b;
  cx.fillStyle='#1e2035'; cx.fillRect(0,0,W,H);
  cx.strokeStyle='#2c3058'; cx.lineWidth=1; cx.font="10px 'Open Sans',system-ui"; cx.fillStyle='#56607a';
  [0,25,50,75,100].forEach(v=>{ const y=p.t+cH-(v/100)*cH; cx.beginPath(); cx.moveTo(p.l,y); cx.lineTo(p.l+cW,y); cx.stroke(); cx.textAlign='right'; cx.fillText(v+'%',p.l-5,y+3.5); });
  const pts=sessions.map((s,i)=>({ x:p.l+(sessions.length===1?cW/2:(i/(sessions.length-1))*cW), y:p.t+cH-(s.acc/100)*cH }));
  const grd=cx.createLinearGradient(0,p.t,0,p.t+cH); grd.addColorStop(0,'rgba(110,255,200,.2)'); grd.addColorStop(1,'rgba(110,255,200,.02)');
  cx.beginPath(); cx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(q=>cx.lineTo(q.x,q.y)); cx.lineTo(pts[pts.length-1].x,p.t+cH); cx.lineTo(pts[0].x,p.t+cH); cx.closePath(); cx.fillStyle=grd; cx.fill();
  cx.beginPath(); cx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(q=>cx.lineTo(q.x,q.y)); cx.strokeStyle='#6effc8'; cx.lineWidth=2; cx.lineJoin='round'; cx.lineCap='round'; cx.stroke();
  pts.forEach(q=>{ cx.beginPath(); cx.arc(q.x,q.y,4,0,Math.PI*2); cx.fillStyle='#6effc8'; cx.fill(); });
  cx.fillStyle='#56607a'; cx.textAlign='center'; const step=Math.max(1,Math.ceil(pts.length/6));
  pts.forEach((q,i)=>{ if(i%step===0||i===pts.length-1) cx.fillText(i+1,q.x,H-7); });
  // Goal line at 80%
  const goalY=p.t+cH-(0.8*cH);
  cx.save(); cx.setLineDash([5,6]); cx.strokeStyle='rgba(110,255,200,.35)'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(p.l,goalY); cx.lineTo(p.l+cW,goalY); cx.stroke();
  cx.setLineDash([]); cx.restore();
  cx.font="9px 'DM Sans',system-ui"; cx.fillStyle='rgba(110,255,200,.55)'; cx.textAlign='right';
  cx.fillText('meta 80%',p.l-3,goalY+3.5);
}

function drawDualChart(n){
  const canvas=$('chart'),empty=$('chart-empty');
  const sessions=DB.all().filter(s=>s.mode==='dual'&&s.n===n);
  canvas.style.display='block';
  if(sessions.length<2){ canvas.style.display='none'; empty.style.display='block'; return; }
  empty.style.display='none';
  const dpr=window.devicePixelRatio||1, W=canvas.offsetWidth||320, H=200;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.height=H+'px';
  const cx=canvas.getContext('2d'); cx.scale(dpr,dpr);
  const p={t:14,r:16,b:30,l:40}, cW=W-p.l-p.r, cH=H-p.t-p.b;
  cx.fillStyle='#1e2035'; cx.fillRect(0,0,W,H);
  cx.strokeStyle='#2c3058'; cx.lineWidth=1; cx.font="10px 'Open Sans',system-ui"; cx.fillStyle='#56607a';
  [0,25,50,75,100].forEach(v=>{ const y=p.t+cH-(v/100)*cH; cx.beginPath(); cx.moveTo(p.l,y); cx.lineTo(p.l+cW,y); cx.stroke(); cx.textAlign='right'; cx.fillText(v+'%',p.l-5,y+3.5); });
  // Draw three lines: visual (green), auditory (blue), combined (white/muted)
  const drawLine=(vals,color,alpha)=>{
    const pts=sessions.map((s,i)=>({ x:p.l+(sessions.length===1?cW/2:(i/(sessions.length-1))*cW), y:p.t+cH-(s[vals]/100)*cH }));
    cx.beginPath(); cx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(q=>cx.lineTo(q.x,q.y));
    cx.strokeStyle=color; cx.lineWidth=1.5; cx.globalAlpha=alpha; cx.lineJoin='round'; cx.lineCap='round'; cx.stroke();
    cx.globalAlpha=1;
    pts.forEach(q=>{ cx.beginPath(); cx.arc(q.x,q.y,2.5,0,Math.PI*2); cx.fillStyle=color; cx.fill(); });
  };
  drawLine('combAcc','#dde4f0',.5);
  drawLine('audAcc','#7eb8e8',.9);
  drawLine('visAcc','#6effc8',.9);
  const step=Math.max(1,Math.ceil(sessions.length/6));
  cx.fillStyle='#56607a'; cx.textAlign='center';
  sessions.forEach((_,i)=>{ if(i%step===0||i===sessions.length-1){ const x=p.l+(sessions.length===1?cW/2:(i/(sessions.length-1))*cW); cx.fillText(i+1,x,H-7); }});
}/* ══════════════════════════════════════════
   12. INTERACTIVE STEP-BY-STEP TUTORIAL
   Pedagogical walkthrough for N=2
   Turn 1: Pos 0, sound A (Freeze, Next)
   Turn 2: Pos 4, sound F (Freeze, Next)
   Turn 3: Pos 0, sound R (Freeze, force Pos button)
   Turn 4: Pos 8, sound F (Freeze, force Sound button)
   Turn 5: Pos 5, sound X (Freeze, Next)
   Turn 6: Success! (Freeze, Next to start real game)
══════════════════════════════════════════ */
let tutStep = 0;
let tutActive = false;

const TUTORIAL_DATA = [
  { pos: 0, letter: 'A', name: 'Sup-Izq', arrow: '↖' },
  { pos: 4, letter: 'F', name: 'Centro', arrow: '◼' },
  { pos: 0, letter: 'R', name: 'Sup-Izq', arrow: '↖' },
  { pos: 8, letter: 'F', name: 'Inf-Der', arrow: '↘' },
  { pos: 5, letter: 'X', name: 'Der', arrow: '➔' }
];

function renderTutorialMiniGrid(currentStep) {
  let html = `<div class="t-mini-grid-container">`;
  for (let i = 0; i < 5; i++) {
    const stepNum = i + 1;
    const data = TUTORIAL_DATA[i];
    
    let cellClass = 't-mini-card';
    if (stepNum === currentStep) {
      cellClass += ' active-step';
    } else if (stepNum < currentStep) {
      cellClass += ' past-step';
    } else {
      cellClass += ' future-step';
    }
    
    // Highlight comparisons
    if (currentStep === 3 && (stepNum === 1 || stepNum === 3)) {
      cellClass += ' comparison-highlight';
    }
    if (currentStep === 4 && (stepNum === 2 || stepNum === 4)) {
      cellClass += ' comparison-highlight';
    }
    
    let gridCellsHtml = '';
    for (let g = 0; g < 9; g++) {
      const isLit = (g === data.pos);
      const litClass = isLit ? 'lit' : '';
      gridCellsHtml += `<div class="t-mini-cell ${litClass}"></div>`;
    }
    
    html += `
      <div class="${cellClass}">
        <div class="t-mini-step-lbl">T${stepNum}</div>
        <div class="t-mini-matrix">
          ${gridCellsHtml}
        </div>
        <div class="t-mini-desc">T${stepNum}: ${data.arrow} + '${data.letter}'</div>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

function startInteractiveTutorial() {
  tutStep = 1;
  tutActive = true;
  isTutorial = true;
  
  // Show traditional grid and audio display
  $('tgrid').style.display = 'grid';
  $('tuto-letter-display').style.display = 'flex';
  
  // Reset buttons status
  const bp = $('tuto-btn-match-pos');
  const bs = $('tuto-btn-match-sound');
  if (bp) {
    bp.className = 'dbtn';
    bp.disabled = false;
  }
  if (bs) {
    bs.className = 'dbtn';
    bs.disabled = false;
  }
  
  const startBtn = $('tuto-start-btn');
  if (startBtn) startBtn.style.display = 'none';

  runTutorialStep(1);
}

function tResetGrid() {
  for (let i = 0; i < 9; i++) {
    const c = $('tc-' + i);
    if (c) {
      c.classList.remove('lit', 'dim', 'lit-ok');
      c.style.borderColor = '';
      c.style.boxShadow = '';
    }
  }
}

function tLightCell(idx) {
  tResetGrid();
  const c = $('tc-' + idx);
  if (c) c.classList.add('lit');
}

function runTutorialStep(step) {
  tutStep = step;
  tResetGrid();
  
  const disp = $('tuto-letter-display');
  if (disp) disp.textContent = '';
  
  const bp = $('tuto-btn-match-pos');
  const bs = $('tuto-btn-match-sound');
  const startBtn = $('tuto-start-btn');
  const doneArea = $('tuto-done');
  const matchArea = $('tuto-match-area');
  const prevBtn = $('tuto-prev');
  const nextBtn = $('tuto-next');
  
  if (bp) bp.classList.remove('blink-highlight', 'hit', 'miss', 'ready');
  if (bs) bs.classList.remove('blink-highlight', 'hit', 'miss', 'ready');
  if (startBtn) startBtn.style.display = 'none';
  if (doneArea) doneArea.style.display = 'none';
  if (matchArea) matchArea.style.display = 'none';
  if (prevBtn) prevBtn.style.visibility = 'hidden';
  if (nextBtn) nextBtn.style.visibility = 'hidden';
  
  // Render dots for 6 steps
  renderTutoDots(6, step - 1);
  
  if (step === 1) {
    tLightCell(0);
    if (disp) disp.textContent = 'A';
    speakLetter('A');
    Snd.cell();
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Turno 1 / 5: Estímulo Inicial
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        Aparece un cuadrado <strong>arriba a la izquierda</strong> y suena la letra <strong>"A"</strong>.
      </div>
      ${renderTutorialMiniGrid(1)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        Aquí <strong>NO debes presionar nada</strong>. Es el primer paso del juego. Memoriza la posición y la letra, luego presiona [Siguiente].
      </div>
    `;
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'SIGUIENTE';
      startBtn.style.display = 'block';
    }
    
  } else if (step === 2) {
    tLightCell(4);
    if (disp) disp.textContent = 'F';
    speakLetter('F');
    Snd.cell();
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Turno 2 / 5: Memorización
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        El cuadrado se mueve al <strong>centro</strong> y suena la letra <strong>"F"</strong>.
      </div>
      ${renderTutorialMiniGrid(2)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        Tampoco debes presionar nada. Llevamos 2 turnos. Para comparar con "hace 2 turnos" (N=2), necesitamos esperar al Turno 3. Presiona [Siguiente].
      </div>
    `;
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'SIGUIENTE';
      startBtn.style.display = 'block';
    }
    
  } else if (step === 3) {
    tLightCell(0);
    if (disp) disp.textContent = 'R';
    speakLetter('R');
    Snd.cell();
    
    setTimeout(() => {
      if (tutStep === 3 && tutActive) {
        const c = $('tc-0');
        if (c) {
          c.style.borderColor = 'var(--prime)';
          c.style.boxShadow = '0 0 12px var(--prime)';
        }
      }
    }, 400);

    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Turno 3 / 5: Coincidencia de Posición
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        ¡Atención! Compara la posición actual con la del <strong>Turno 1</strong> (hace 2 pasos).<br>
        Ambos están <strong>arriba a la izquierda</strong>. ¡Coinciden!<br>
        (La letra "R" no coincide con "A", ignora el sonido).
      </div>
      ${renderTutorialMiniGrid(3)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        El juego está congelado. Presiona el botón <strong style="color:var(--prime)">UBICACIÓN</strong> ahora para marcar tu acierto y avanzar.
      </div>
    `;
    if (matchArea) matchArea.style.display = 'block';
    if (bp) bp.classList.add('blink-highlight');
    
  } else if (step === 4) {
    tLightCell(8);
    if (disp) disp.textContent = 'F';
    speakLetter('F');
    Snd.cell();
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Turno 4 / 5: Coincidencia de Sonido
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        Compara la letra actual con la del <strong>Turno 2</strong> (hace 2 pasos).<br>
        En el Turno 2 escuchaste <strong>"F"</strong> y ahora también. ¡Coinciden!<br>
        (La posición cambió del centro a abajo-derecha, ignora la vista).
      </div>
      ${renderTutorialMiniGrid(4)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        La pantalla está congelada. Presiona el botón <strong style="color:var(--prime)">SONIDO</strong> ahora para avanzar.
      </div>
    `;
    if (matchArea) matchArea.style.display = 'block';
    if (bs) bs.classList.add('blink-highlight');
    
  } else if (step === 5) {
    tLightCell(5);
    if (disp) disp.textContent = 'X';
    speakLetter('X');
    Snd.cell();
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Turno 5 / 5: Sin Coincidencias
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        Compara con el <strong>Turno 3</strong> (hace 2 pasos).<br>
        Posición previa: arriba-izquierda (ahora: derecha). Letra previa: "R" (ahora: "X"). No hay coincidencias.
      </div>
      ${renderTutorialMiniGrid(5)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        En este caso <strong>NO debes tocar ningún botón</strong>. En el juego real, simplemente dejas pasar el turno sin oprimir nada. Presiona [Siguiente].
      </div>
    `;
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'SIGUIENTE';
      startBtn.style.display = 'block';
    }
    
  } else if (step === 6) {
    tResetGrid();
    if (disp) disp.textContent = '🏁';
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        ¡Tutorial Completado!
      </div>
      <div style="font-size: 0.88rem; color: var(--text); line-height: 1.65; margin-bottom: 12px;">
        ¡Has aprendido a jugar Dual N-Back!<br><br>
        En la partida real, los estímulos cambian de forma fluida y continua cada 4.5 segundos sin detenerse. Mantén tu concentración y responde rápido.
      </div>
    `;
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'IR AL MENÚ PRINCIPAL';
      startBtn.style.display = 'block';
    }
  }
}

function handleTutorialInteraction(type) {
  if (!tutActive) return;
  
  const bp = $('tuto-btn-match-pos');
  const bs = $('tuto-btn-match-sound');
  const startBtn = $('tuto-start-btn');
  const doneArea = $('tuto-done');
  const matchArea = $('tuto-match-area');
  
  if (tutStep === 3 && type === 'pos') {
    Snd.hit();
    if (bp) {
      bp.classList.remove('blink-highlight');
      bp.classList.add('hit');
    }
    
    const c = $('tc-0');
    if (c) {
      c.classList.add('lit-ok');
    }
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        ¡Excelente!
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        Marcaste correctamente la coincidencia de posición (arriba a la izquierda).
      </div>
      ${renderTutorialMiniGrid(3)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        El estímulo visual de hace 2 turnos coincidió con el actual. Presiona [Siguiente] para continuar.
      </div>
    `;
    
    if (matchArea) matchArea.style.display = 'none';
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'SIGUIENTE';
      startBtn.style.display = 'block';
    }
    
  } else if (tutStep === 3 && type === 'sound') {
    Snd.falseAlarm();
    if (bs) {
      bs.classList.add('miss');
      setTimeout(() => bs.classList.remove('miss'), 500);
    }
    
  } else if (tutStep === 4 && type === 'sound') {
    Snd.hit();
    if (bs) {
      bs.classList.remove('blink-highlight');
      bs.classList.add('hit');
    }
    
    $('tuto-content').innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        ¡Excelente!
      </div>
      <div style="font-size: 0.86rem; color: var(--text); line-height: 1.6; margin-bottom: 12px;">
        Marcaste correctamente la coincidencia de sonido (la letra "F").
      </div>
      ${renderTutorialMiniGrid(4)}
      <div style="font-size: 0.86rem; color: var(--muted); line-height: 1.6;">
        El estímulo auditivo de hace 2 turnos coincidió con el actual. Presiona [Siguiente] para continuar.
      </div>
    `;
    
    if (matchArea) matchArea.style.display = 'none';
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'SIGUIENTE';
      startBtn.style.display = 'block';
    }
    
  } else if (tutStep === 4 && type === 'pos') {
    Snd.falseAlarm();
    if (bp) {
      bp.classList.add('miss');
      setTimeout(() => bp.classList.remove('miss'), 500);
    }
  }
}

function closeTutorialAndStart() {
  tutActive = false;
  isTutorial = false;
  
  if (selMode === 'span') {
    showModeConfig('span');
  } else {
    selMode = 'dual';
    selN = 2;
    showModeConfig('dual');
  }
}

/* ══════════════════════════════════════════
   13. MODE OVERLAY helper
══════════════════════════════════════════ */
let pendingModeAction=null;

function maybeModeOverlay(mode, onStart){
  if (!isTutorial) { onStart(); return; }
  if(DB.modeSeen(mode)){ onStart(); return; }
  DB.markMode(mode);
  // span keeps static intro; game modes get live onboarding
  if(mode==='span'){
    const m=MODES[mode];
    $('mi-badge').textContent=m.badge; $('mi-title').textContent=m.name;
    $('mi-about').textContent=m.about;
    $('mi-steps').innerHTML=m.steps.map(s=>`<li>${s}</li>`).join('');
    pendingModeAction=onStart; show('s-mode-intro');
    return;
  }
  if(mode==='dual') startDualOnboarding(selN, onStart);
  else              startOnboarding(mode, selN, onStart);
}

/* ══════════════════════════════════════════
   14. EVENTS
══════════════════════════════════════════ */
let selN=2, selDur=10, selMode='nback';

const MODE_INFO = {
  nback:      { name:'N-Back',         desc:'Cada turno aparece una celda nueva. Presiona COINCIDE si es igual a la de N pasos atrás. El sistema ajusta el ritmo según tu precisión.' },
  dual:       { name:'Dual N-Back',    desc:'Rastrea simultáneamente la posición visual y la letra auditiva. Cada canal tiene su propio botón. La versión con más evidencia científica de transferencia cognitiva.' },
  span:       { name:'Span Complejo',  desc:'Aparecen ecuaciones matemáticas entrelazadas con letras. Al final de cada ronda, recuerda las letras en orden. La dificultad se ajusta automáticamente.' },
  emotion:    { name:'Modo Emocional', desc:'N-Back sobre expresiones faciales en lugar de posiciones. Entrena la regulación atencional bajo carga emocional. El más desafiante psicológicamente.' }
};

function showModeConfig(mode){
  const info=MODE_INFO[mode]||{name:mode,desc:''};
  $('mc-mode-name').textContent=info.name;
  $('mc-mode-desc').textContent=info.desc;
  $('nback-config').style.display=mode==='span'?'none':'block';
  $('span-config').style.display=mode==='span'?'block':'none';
  show('s-mode-config');
}

// Welcome
$('btn-welcome').addEventListener('click',()=>{ DB.markWelcome(); show('s-menu'); });

// Mode intro
$('btn-mi-start').addEventListener('click',()=>{ if(pendingModeAction){ pendingModeAction(); pendingModeAction=null; } });

// Mode cards — navigate to config screen
$$('#mode-cards .mode-card').forEach(c=>c.addEventListener('click',()=>{
  $$('#mode-cards .mode-card').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');
  selMode=c.dataset.mode;
  showModeConfig(selMode);
}));

// Level / Duration (now in s-mode-config)
$$('#mlvl .lb').forEach(b=>b.addEventListener('click',()=>{ $$('#mlvl .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on'); selN=+b.dataset.n; }));
$$('#mdur .lb').forEach(b=>b.addEventListener('click',()=>{ $$('#mdur .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on'); selDur=+b.dataset.dur; }));

// Mode config back + tutorial
$('btn-mode-back').addEventListener('click',()=>show('s-menu'));

// Start
$('btn-start').addEventListener('click',()=>{
  isTutorial = false;
  Snd.init();
  const nameInput = $('player-name') ? $('player-name').value.trim() : '';
  CURRENT_PLAYER_NAME = nameInput || ('Anon_' + Math.floor(100 + Math.random() * 900));
  if(selMode==='dual'){
    maybeModeOverlay('dual',()=>{
      Snd.setBg(CFG.get('bgNoise'));
      show('s-dual');
      startDual(selN,selDur);
    });
    return;
  }
  if(selMode==='span'){
    maybeModeOverlay('span',()=>{
      Snd.setBg(CFG.get('bgNoise'));
      show('s-span');
      startSpan();
    });
    return;
  }
  maybeModeOverlay(selMode,()=>{
    Snd.setBg(CFG.get('bgNoise'));
    $('g-lvl').textContent=selN+'-Back';
    $('g-time').textContent=fmtTime(selDur*60000);
    $('g-warm').style.display='none';
    $('g-pace').textContent=(INIT_IV/1000).toFixed(1);
    $('g-score').style.display='none';
    uiProg(0); uiStat('',null);
    show('s-game');
    startGame(selMode,selN,selDur);
  });
});

// Match button
$('mbtn').addEventListener('touchstart',e=>{ e.preventDefault(); Snd.init(); respond(); },{passive:false});
$('mbtn').addEventListener('click',()=>{ Snd.init(); respond(); });

// Quit game
$('btn-quit').addEventListener('click',()=>{ stopGame(); Snd.stopAmb(); Snd.stopBg(); show('s-menu'); });
$('btn-quit').addEventListener('touchstart',e=>{ e.preventDefault(); stopGame(); Snd.stopAmb(); Snd.stopBg(); show('s-menu'); },{passive:false});

// Quit span
$('sp-quit').addEventListener('click',()=>{ stopSpan(); $('overlay-recall').classList.remove('on'); Snd.stopBg(); show('s-menu'); });
$('sp-quit').addEventListener('touchstart',e=>{ e.preventDefault(); stopSpan(); $('overlay-recall').classList.remove('on'); Snd.stopBg(); show('s-menu'); },{passive:false});

// Dual: Posición / Sonido buttons
const bmp = $('btn-match-pos');
if (bmp) {
  bmp.addEventListener('touchstart',e=>{ e.preventDefault(); respondDual('vis'); },{passive:false});
  bmp.addEventListener('click',()=>respondDual('vis'));
}
const bms = $('btn-match-sound');
if (bms) {
  bms.addEventListener('touchstart',e=>{ e.preventDefault(); respondDual('aud'); },{passive:false});
  bms.addEventListener('click',()=>respondDual('aud'));
}

// Quit dual
$('d-quit').addEventListener('click',()=>{ stopDual(); Snd.stopAmb(); Snd.stopBg(); show('s-menu'); });
$('d-quit').addEventListener('touchstart',e=>{ e.preventDefault(); stopDual(); Snd.stopAmb(); Snd.stopBg(); show('s-menu'); },{passive:false});

// Span math answers
$('sp-true').addEventListener('click',()=>spMathAnswer(true));
$('sp-false').addEventListener('click',()=>spMathAnswer(false));
$('sp-true').addEventListener('touchstart',e=>{ e.preventDefault(); spMathAnswer(true); },{passive:false});
$('sp-false').addEventListener('touchstart',e=>{ e.preventDefault(); spMathAnswer(false); },{passive:false});

// Recall submit
$('btn-recall-submit').addEventListener('click',spSubmitRecall);

// Results
$('btn-again').addEventListener('click',()=>{
  isTutorial = false;
  if(currentMode==='dual'){ Snd.setBg(CFG.get('bgNoise')); show('s-dual'); startDual(selN,selDur); return; }
  if(currentMode==='span'){ Snd.setBg(CFG.get('bgNoise')); show('s-span'); startSpan(); return; }
  Snd.resumeAmb(); Snd.setBg(CFG.get('bgNoise'));
  $('g-lvl').textContent=selN+'-Back'; $('g-time').textContent=fmtTime(selDur*60000);
  $('g-warm').style.display='none'; $('g-pace').textContent=(INIT_IV/1000).toFixed(1);
  $('g-score').style.display='none';
  uiProg(0); $('r-bar').style.width='0%';
  show('s-game'); startGame(selMode,selN,selDur);
});
$('btn-tomenu').addEventListener('click',()=>show('s-menu'));

// Stats
$('btn-back').addEventListener('click',()=>show('s-menu'));
$$('#st-tabs .cbtn').forEach(b=>b.addEventListener('click',()=>{
  $$('#st-tabs .cbtn').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  activeStTab=b.dataset.stab; renderStats();
}));
$$('#cbtns .cbtn').forEach(b=>b.addEventListener('click',()=>{ $$('#cbtns .cbtn').forEach(x=>x.classList.remove('on')); b.classList.add('on'); activeStTab==='dual'?drawDualChart(+b.dataset.cv):drawChart(+b.dataset.cv); }));

// Función definitivo para abrir ajustes deteniendo de manera limpia cualquier estado de juego
function forzarAperturaAjustes(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // 1. Detener de forma segura cualquier bucle o intervalo activo
  if (typeof stopGame === 'function') stopGame();
  if (typeof stopSpan === 'function') stopSpan();
  if (typeof stopDual === 'function') stopDual();
  
  // 2. Sincronizar el estado de los Ajustes en el LocalStorage/UI
  if (typeof renderSettings === 'function') {
    renderSettings();
  }
  
  // 3. Forzar el cambio de pantalla limpiando las clases previas
  show('s-settings');
  
  // 4. Actualizar visualmente los elementos activos de la navegación inferior
  $$('.nav-item').forEach(n => n.classList.remove('on'));
  const navAjustes = $('nav-ajustes');
  if (navAjustes) {
    navAjustes.classList.add('on');
  }
  
  // Garantizar que el body mantenga la clase de interfaz de menús
  document.body.classList.add('on-menu');
}

// Vinculación explícita de listeners tanto para clics de mouse como eventos táctiles (Taps)
document.addEventListener('DOMContentLoaded', () => {
  const btnCfgFlotante = $('btn-cfg');
  const navAjustesInferior = $('nav-ajustes');
  
  if (btnCfgFlotante) {
    btnCfgFlotante.addEventListener('click', forzarAperturaAjustes);
    btnCfgFlotante.addEventListener('touchstart', forzarAperturaAjustes, { passive: false });
  }
  
  if (navAjustesInferior) {
    navAjustesInferior.addEventListener('click', forzarAperturaAjustes);
    navAjustesInferior.addEventListener('touchstart', forzarAperturaAjustes, { passive: false });
  }
});
$('btn-cfg-back').addEventListener('click',()=>show('s-menu'));
$$('#noise-sel .lb').forEach(b=>b.addEventListener('click',()=>{
  $$('#noise-sel .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  CFG.set('bgNoise',b.dataset.noise); $('noise-note').textContent=NOISE_DESCS[b.dataset.noise]||'';
}));
$$('#lure-sel .lb').forEach(b=>b.addEventListener('click',()=>{ $$('#lure-sel .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on'); CFG.set('lurePct',+b.dataset.lure); }));
$$('#binaural-sel .lb').forEach(b=>b.addEventListener('click',()=>{
  $$('#binaural-sel .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  const on=b.dataset.bin==='on'; CFG.set('binauralOn',on);
  if(on!==Snd.on){ Snd.init(); Snd.toggle(); $('snd').textContent=Snd.on?'🔊':'🔇'; }
}));
$$('#dual-audio-sel .lb').forEach(b=>b.addEventListener('click',()=>{
  $$('#dual-audio-sel .lb').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  CFG.set('dualAudioOn',b.dataset.daudio==='on');
}));

// Sound toggle
$('snd').addEventListener('click',()=>{ Snd.init(); const on=Snd.toggle(); $('snd').textContent=on?'🔊':'🔇'; CFG.set('binauralOn',on); $$('#binaural-sel .lb').forEach(b=>b.classList.toggle('on',b.dataset.bin===(on?'on':'off'))); });

// Tutorial
// Tutorial
let tutoIdx = 0;

function renderTutoDots(total, current) {
  const dotsContainer = $('tuto-dots');
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'tuto-dot' + (i === current ? ' on' : '');
    dotsContainer.appendChild(dot);
  }
}

function renderTutoPanel(idx) {
  tutoIdx = idx;
  renderTutoDots(3, idx);
  
  const prevBtn = $('tuto-prev');
  if (prevBtn) {
    prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
  }
  
  const nextBtn = $('tuto-next');
  const doneArea = $('tuto-done');
  const startBtn = $('tuto-start-btn');
  
  if (idx === 2) {
    if (nextBtn) nextBtn.style.visibility = 'hidden';
    if (doneArea) doneArea.style.display = 'block';
    if (startBtn) {
      startBtn.textContent = 'COMENZAR SESIÓN';
      startBtn.style.display = 'block';
    }
  } else {
    if (nextBtn) {
      nextBtn.style.visibility = 'visible';
      nextBtn.textContent = 'Siguiente →';
    }
    if (doneArea) doneArea.style.display = 'none';
  }
  
  const content = $('tuto-content');
  if (!content) return;
  
  if (idx === 0) {
    content.innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 12px; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        ¿Qué es Span Complejo?
      </div>
      <div style="font-size: 0.88rem; color: var(--text); line-height: 1.6;">
        El Span Complejo es una prueba de memoria de trabajo que desafía tu capacidad de procesar información bajo presión.
        <br><br>
        Resolverás una serie de <strong>ecuaciones matemáticas simples</strong> de Verdadero o Falso, alternadas con <strong>letras que debes memorizar</strong> en orden.
      </div>
    `;
  } else if (idx === 1) {
    content.innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 12px; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        El Ciclo de Atención
      </div>
      <div style="font-size: 0.88rem; color: var(--text); line-height: 1.6; text-align: left;">
        Cada turno se divide en dos fases:
        <br><br>
        1. <strong>Operación Matemática</strong>: Resuelve la ecuación (ej: <code>3 + 4 = 7 ?</code>) pulsando [Verdadero] o [Falso] en menos de 5 segundos.
        <br>
        2. <strong>Aparición de Letra</strong>: Inmediatamente se mostrará una letra en pantalla durante 1.5 segundos para que la memorices.
      </div>
    `;
  } else if (idx === 2) {
    content.innerHTML = `
      <div style="font-weight: bold; color: var(--prime); margin-bottom: 12px; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.05em; font-family:'Rajdhani',sans-serif;">
        Fase de Recuerdo
      </div>
      <div style="font-size: 0.88rem; color: var(--text); line-height: 1.6;">
        Al finalizar la ronda, aparecerá un <strong>teclado en pantalla</strong>.
        <br><br>
        Introduce la secuencia completa de letras en el <strong>orden exacto</strong> en el que aparecieron.
        <br><br>
        El nivel de Span se adaptará automáticamente según tu precisión en el recuerdo.
      </div>
    `;
  }
}

function openTutorial(){
  isTutorial = true;
  DB.markTutorSeen();
  show('s-tuto');
  
  if (selMode === 'span') {
    $('tgrid').style.display = 'none';
    $('tuto-grid-sequence').style.display = 'none';
    $('tuto-letter-display').style.display = 'none';
    $('tuto-match-area').style.display = 'none';
    $('tuto-done').style.display = 'none';
    $('tuto-nav-buttons').style.display = 'flex';
    renderTutoPanel(0);
  } else {
    $('tgrid').style.display = 'none';
    $('tuto-grid-sequence').style.display = 'none';
    $('tuto-letter-display').style.display = 'flex';
    $('tuto-match-area').style.display = 'none';
    $('tuto-done').style.display = 'none';
    $('tuto-nav-buttons').style.display = 'flex';
    startInteractiveTutorial();
  }
}

$('btn-tuto').addEventListener('click',openTutorial);
$('hint-banner').addEventListener('click',openTutorial);

$('tuto-back').addEventListener('click',()=>{
  tutActive = false;
  isTutorial = false;
  tResetGrid();
  show('s-menu');
});

$('tuto-prev').addEventListener('click',()=>{
  if (selMode === 'span' && tutoIdx > 0) {
    renderTutoPanel(tutoIdx - 1);
  }
});

$('tuto-next').addEventListener('click',()=>{
  if (selMode === 'span' && tutoIdx < 2) {
    renderTutoPanel(tutoIdx + 1);
  }
});

$('tuto-start-btn').addEventListener('click',()=>{
  if (selMode === 'span') {
    closeTutorialAndStart();
  } else {
    if (tutStep === 1) runTutorialStep(2);
    else if (tutStep === 2) runTutorialStep(3);
    else if (tutStep === 3) runTutorialStep(4);
    else if (tutStep === 4) runTutorialStep(5);
    else if (tutStep === 5) runTutorialStep(6);
    else if (tutStep === 6) closeTutorialAndStart();
  }
});

const tp = $('tuto-btn-match-pos');
if (tp) {
  tp.addEventListener('click', () => handleTutorialInteraction('pos'));
  tp.addEventListener('touchstart', e => { e.preventDefault(); handleTutorialInteraction('pos'); }, {passive:false});
}

const ts = $('tuto-btn-match-sound');
if (ts) {
  ts.addEventListener('click', () => handleTutorialInteraction('sound'));
  ts.addEventListener('touchstart', e => { e.preventDefault(); handleTutorialInteraction('sound'); }, {passive:false});
}

// Export / Import data
$('btn-export-data').addEventListener('click',()=>{
  const sessions=DB.all();
  const status=$('import-status');
  if(sessions.length===0){
    status.style.color='var(--muted)';
    status.textContent='No hay sesiones para exportar.';
    setTimeout(()=>{ status.textContent=''; },3500);
    return;
  }
  const data={sessions,meta:DB.getMeta()};
  const json=JSON.stringify(data,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  a.href=url; a.download=`kortex-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.style.color='var(--prime)';
  status.textContent='Backup descargado: '+sessions.length+' sesiones.';
  setTimeout(()=>{ status.textContent=''; },3500);
});
$('btn-import-data').addEventListener('click',()=>$('import-file-input').click());
$('import-file-input').addEventListener('change',e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const status=$('import-status');
    try{
      const data=JSON.parse(ev.target.result);
      if(!Array.isArray(data.sessions)) throw new Error('formato inválido');
      const replace=confirm('¿Reemplazar todos los datos actuales?\n\nOK = Reemplazar\nCancelar = Fusionar con los datos existentes');
      if(replace){
        localStorage.setItem('nback_v1',JSON.stringify(data.sessions));
        if(data.meta) localStorage.setItem('nback_meta',JSON.stringify(data.meta));
        status.style.color='var(--prime)';
        status.textContent=data.sessions.length+' sesiones restauradas.';
      } else {
        const existing=DB.all(), existTs=new Set(existing.map(s=>s.ts));
        const merged=[...existing,...data.sessions.filter(s=>!existTs.has(s.ts))].sort((a,b)=>a.ts-b.ts);
        localStorage.setItem('nback_v1',JSON.stringify(merged));
        status.style.color='var(--prime)';
        status.textContent=(merged.length-existing.length)+' sesiones nuevas añadidas.';
      }
    } catch(err){
      status.style.color='var(--warn)';
      status.textContent='Error al leer el archivo.';
    }
    e.target.value='';
  };
  reader.readAsText(file);
});

// Bottom nav + hero settings
$('nav-inicio').addEventListener('click',()=>show('s-menu'));
$('nav-progreso').addEventListener('click',()=>{ show('s-stats'); renderStats(); document.body.classList.add('on-menu'); $('nav-progreso').classList.add('on'); $('nav-inicio').classList.remove('on'); });

// Keyboard
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&$('s-game').classList.contains('on')){ e.preventDefault(); respond(); }
  if($('s-dual').classList.contains('on')){
    if(e.code==='ArrowLeft'||e.code==='KeyA'){ e.preventDefault(); respondDual('vis',null); }
    if(e.code==='ArrowRight'||e.code==='KeyL'){ e.preventDefault(); respondDual('aud'); }
  }
  // Keyboard validation for tutorial
  if($('s-tuto').classList.contains('on') && tutActive){
    if(e.code==='ArrowLeft'||e.code==='KeyA'){ e.preventDefault(); handleTutorialInteraction('pos'); }
    if(e.code==='ArrowRight'||e.code==='KeyL'){ e.preventDefault(); handleTutorialInteraction('sound'); }
  }
});

// Resize
window.addEventListener('resize',()=>{ if($('s-stats').classList.contains('on')){ const a=document.querySelector('#cbtns .cbtn.on'); if(a) activeStTab==='dual'?drawDualChart(+a.dataset.cv):drawChart(+a.dataset.cv); } });

/* ══════════════════════════════════════════
   15. BOOTSTRAP
══════════════════════════════════════════ */
// Apply stored binaural setting
if(!CFG.get('binauralOn') && Snd.on){ Snd.toggle(); $('snd').textContent='🔇'; }

// Auto-start binaural on first user gesture (Web Audio API requires user activation)
let _audioReady = false;
const initAudioOnGesture = () => {
  if (!_audioReady) {
    _audioReady = true;
    if (CFG.get('binauralOn')) Snd.init();
    // Clean up
    ['pointerdown', 'touchstart', 'click'].forEach(evt => {
      document.removeEventListener(evt, initAudioOnGesture, true);
    });
  }
};
['pointerdown', 'touchstart', 'click'].forEach(evt => {
  document.addEventListener(evt, initAudioOnGesture, true);
});

// Sync sound icon
$('snd').textContent=Snd.on?'🔊':'🔇';

// Sync settings selectors to stored values
(()=>{
  const cfg=CFG.all();
  $$('#noise-sel .lb').forEach(b=>b.classList.toggle('on',b.dataset.noise===cfg.bgNoise));
  $$('#lure-sel .lb').forEach(b=>b.classList.toggle('on',+b.dataset.lure===cfg.lurePct));
  $$('#binaural-sel .lb').forEach(b=>b.classList.toggle('on',b.dataset.bin===(cfg.binauralOn?'on':'off')));
  $$('#dual-audio-sel .lb').forEach(b=>b.classList.toggle('on',b.dataset.daudio===(cfg.dualAudioOn?'on':'off')));
})();

// Register service worker
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); });
}

// Decide initial screen
if(!DB.welcomeSeen()){
  show('s-welcome');
  setTimeout(()=>{ const b=$('btn-welcome'); if(b) b.disabled=false; }, 500);
} else {
  renderMenuStreak();
  show('s-menu');
  $('hint-banner').style.display='block';
}
