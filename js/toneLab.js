const canvas = /** @type {HTMLCanvasElement} */(document.getElementById('labCanvas'));
const ctx = canvas.getContext('2d');
const btnMicStart = document.getElementById('btnMicStart');
const btnMicStop = document.getElementById('btnMicStop');
const audioFile = /** @type {HTMLInputElement} */(document.getElementById('audioFile'));
const btnPlay = /** @type {HTMLButtonElement} */(document.getElementById('btnPlay'));
const btnMicReplay = /** @type {HTMLButtonElement} */(document.getElementById('btnMicReplay'));
const statusEl = document.getElementById('labStatus');

let audioCtx = null;
let analyser = null;
let stream = null;
let source = null;
let reqId = 0;
let loadedBuffer = null;
let micBuffer = null;

function setStatus(t) { if (statusEl) statusEl.textContent = t || ''; }

function ensureAudio() { if (audioCtx) return audioCtx; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }

function hann(len) { const w = new Float32Array(len); for (let i=0;i<len;i++) w[i]=0.5*(1-Math.cos((2*Math.PI*i)/(len-1))); return w; }
const hannCache = {}; function getHann(n){ return hannCache[n] || (hannCache[n]=hann(n)); }

function estimatePitchHzFromBuffer(buf, sr){
  const n = buf.length; if (n < 256) return 0;
  let mean=0; for(let i=0;i<n;i++) mean+=buf[i]; mean/=n;
  const w=getHann(n); let e0=0; const x=new Float32Array(n);
  for(let i=0;i<n;i++){ const v=(buf[i]-mean)*w[i]; x[i]=v; e0+=v*v; }
  if (e0<=1e-7) return 0;
  const minLag=Math.floor(sr/350), maxLag=Math.floor(sr/80);
  let bestLag=-1, bestRho=0;
  for(let lag=minLag; lag<=maxLag; lag++){
    let num=0, eLag=0;
    for(let i=0;i<n-lag;i++){ const a=x[i]; const b=x[i+lag]; num+=a*b; eLag+=b*b; }
    const rho=num/Math.sqrt(e0*(eLag||1e-7));
    if (rho>bestRho){ bestRho=rho; bestLag=lag; }
  }
  if (bestLag<0 || bestRho<0.35) return 0; return sr/bestLag;
}

function drawBackground(){ if(!ctx) return; ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.strokeStyle='#1f2937'; ctx.beginPath(); ctx.moveTo(20, canvas.height*0.2); ctx.lineTo(canvas.width-20, canvas.height*0.2); ctx.moveTo(20, canvas.height*0.8); ctx.lineTo(canvas.width-20, canvas.height*0.8); ctx.stroke(); }

function hzToY(hz, center){ const h=canvas.height; if (hz<=0) return h/2; const st=12*Math.log2(hz/center); const clamped=Math.max(-12, Math.min(12, st)); return h/2 - (clamped/12)*(h*0.3); }

// Live mic rendering
const live = [];
const LIVE_MAX = 180;
function renderLive(){
  if (!analyser) return;
  const sr = audioCtx.sampleRate; const n = analyser.fftSize; const buf = new Float32Array(n); analyser.getFloatTimeDomainData(buf);
  const hz = estimatePitchHzFromBuffer(buf, sr);
  if (hz>0) live.push(hz); else live.push(null);
  if (live.length>LIVE_MAX) live.shift();
  drawBackground();
  const voiced = live.filter(v=>v>0); const center = voiced.length ? median(voiced) : 200;
  ctx.strokeStyle='#93c5fd'; ctx.beginPath(); let moved=false;
  for (let i=0;i<live.length;i++){
    const x = 20 + (i/(LIVE_MAX-1))*(canvas.width-40);
    const hzv = live[i]; if (!hzv) continue; const y = hzToY(hzv, center);
    if (!moved){ ctx.moveTo(x,y); moved=true; } else { ctx.lineTo(x,y); }
  }
  if (moved) ctx.stroke();
  reqId = requestAnimationFrame(renderLive);
}

function median(arr){ const v=arr.slice().sort((a,b)=>a-b); const n=v.length; if(!n) return 0; const m=Math.floor(n/2); return n%2?v[m]:(v[m-1]+v[m])/2; }

async function startMic(){
  try{
    const ctxA = ensureAudio();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    source = ctxA.createMediaStreamSource(stream);
    analyser = ctxA.createAnalyser(); analyser.fftSize = 2048; source.connect(analyser);
    // capture raw for replay
    const recorder = ctxA.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    source.connect(recorder);
    const silent = ctxA.createGain(); silent.gain.value = 0; recorder.connect(silent); silent.connect(ctxA.destination);
    recorder.onaudioprocess = (e) => { chunks.push(e.inputBuffer.getChannelData(0).slice()); };
    // stop hook stores buffer
    const finalize = () => {
      try { recorder.disconnect(); } catch {}
      const total = chunks.reduce((n,c)=>n+c.length, 0);
      const flat = new Float32Array(total); let ofs=0; for(const c of chunks){ flat.set(c, ofs); ofs += c.length; }
      micBuffer = ctxA.createBuffer(1, flat.length, ctxA.sampleRate); micBuffer.copyToChannel(flat, 0, 0);
      if (btnMicReplay) btnMicReplay.disabled = !micBuffer;
    };
    // attach stop to global stop
    stopMic._finalize = finalize;
    live.length = 0; setStatus('Recording…');
    if (reqId) cancelAnimationFrame(reqId); renderLive();
  } catch(e){ setStatus('Mic unavailable'); }
}

function stopMic(){ try{ if (reqId) cancelAnimationFrame(reqId); }catch{}; try{ stream?.getTracks()?.forEach(t=>t.stop()); }catch{}; analyser=null; source=null; stream=null; try { stopMic._finalize && stopMic._finalize(); } catch {} ; setStatus(''); }

// File loading and playback
audioFile?.addEventListener('change', async () => {
  const f = audioFile.files && audioFile.files[0]; if (!f) return;
  try{
    const arr = await f.arrayBuffer(); const ctxA = ensureAudio();
    loadedBuffer = await ctxA.decodeAudioData(arr.slice(0));
    drawFromBuffer(loadedBuffer);
    btnPlay.disabled = false; setStatus('Loaded audio');
  }catch(e){ setStatus('Failed to load audio'); }
});

function drawFromBuffer(buffer){
  const sr = buffer.sampleRate; const data = buffer.getChannelData(0);
  drawBackground();
  const frame=1024, hop=512; const points=[];
  for (let p=0; p+frame<=data.length; p+=hop){ const hz=estimatePitchHzFromBuffer(data.slice(p,p+frame), sr); if (hz>0) points.push({idx:p, hz}); }
  const center = points.length ? median(points.map(p=>p.hz)) : 200;
  ctx.strokeStyle='#3b82f6'; ctx.beginPath(); let moved=false; const nFrames = Math.max(1, Math.floor(data.length/hop));
  for (let p=0; p+frame<=data.length; p+=hop){ const hz=estimatePitchHzFromBuffer(data.slice(p,p+frame), sr); if(hz<=0) continue; const x = 20 + (p/(data.length-frame))*(canvas.width-40); const y = hzToY(hz, center); if(!moved){ ctx.moveTo(x,y); moved=true; } else { ctx.lineTo(x,y); } }
  if (moved) ctx.stroke();
}

btnMicStart?.addEventListener('click', startMic);
btnMicStop?.addEventListener('click', stopMic);
btnMicReplay?.addEventListener('click', () => {
  try{ if(!micBuffer) return; const ctxA = ensureAudio(); const src = ctxA.createBufferSource(); src.buffer = micBuffer; src.connect(ctxA.destination); src.start(); }catch{}
});
btnPlay?.addEventListener('click', () => {
  try{ if(!loadedBuffer) return; const ctxA = ensureAudio(); const src = ctxA.createBufferSource(); src.buffer = loadedBuffer; src.connect(ctxA.destination); src.start(); }catch{}
});

drawBackground();


