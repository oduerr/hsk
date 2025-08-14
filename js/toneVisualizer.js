let toneDialog, toneClose, toneCanvas, toneInfo, toneStopBtn, toneReplayBtn, toneStatus, toneHint, toneSpectro;
let audioCtx = null;
let stream = null, source = null, analyser = null, reqId = 0;
let recordedBuffer = null;
let isRecording = false;
let liveSemitoneBuffer = [];
const LIVE_MAX_FRAMES = 180; // ~3s at 60fps
let spectrogramEnabled = false;
let toneRerecordTop, toneStopTop, toneReplayTop, toneSpectroRecorded;

function byId(id) { return /** @type {any} */(document.getElementById(id)); }

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  return audioCtx;
}

function getToneNumber(pinyin) {
  const m = /([1-5])\b/.exec(pinyin);
  return m ? Number(m[1]) : 5;
}

function drawIdealCurve(ctx, w, h, tone) {
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const x0 = 20, x1 = w - 20, yMid = h / 2, yHigh = h * 0.3, yLow = h * 0.75;
  if (tone === 1) { ctx.moveTo(x0, yHigh); ctx.lineTo(x1, yHigh); }
  else if (tone === 2) { ctx.moveTo(x0, yMid); ctx.lineTo(x1, yHigh); }
  else if (tone === 3) { ctx.moveTo(x0, yHigh); ctx.lineTo((x0+x1)/2, yLow); ctx.lineTo(x1, yHigh); }
  else if (tone === 4) { ctx.moveTo(x0, yHigh); ctx.lineTo(x1, yLow); }
  else { ctx.moveTo(x0, yMid); ctx.lineTo(x1, yMid); }
  ctx.stroke();
}

function hannWindow(len) {
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
  return w;
}

const cachedHann = {};
function getHann(len) { if (!cachedHann[len]) cachedHann[len] = hannWindow(len); return cachedHann[len]; }

function estimatePitchHzFromBuffer(buf, sampleRate) {
  const n = buf.length;
  if (n < 256) return 0;
  // zero-mean and window
  let mean = 0; for (let i = 0; i < n; i++) mean += buf[i]; mean /= n;
  const w = getHann(n);
  let e0 = 0; const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = (buf[i] - mean) * w[i]; x[i] = v; e0 += v * v; }
  if (e0 <= 1e-7) return 0;
  const minLag = Math.floor(sampleRate / 350);
  const maxLag = Math.floor(sampleRate / 80);
  let bestLag = -1; let bestRho = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, eLag = 0;
    for (let i = 0; i < n - lag; i++) { const a = x[i]; const b = x[i + lag]; num += a * b; eLag += b * b; }
    const rho = num / Math.sqrt(e0 * (eLag || 1e-7));
    if (rho > bestRho) { bestRho = rho; bestLag = lag; }
  }
  if (bestLag < 0 || bestRho < 0.35) return 0; // unvoiced
  return sampleRate / bestLag;
}

function estimatePitchHz(analyser, sampleRate) {
  const bufLen = analyser.fftSize;
  const buf = new Float32Array(bufLen);
  analyser.getFloatTimeDomainData(buf);
  return estimatePitchHzFromBuffer(buf, sampleRate);
}

function median(arr) {
  const v = arr.slice().sort((a,b)=>a-b);
  const n = v.length; if (!n) return 0; const mid = Math.floor(n/2);
  return n % 2 ? v[mid] : (v[mid-1]+v[mid])/2;
}

function renderLive() {
  if (!analyser || !toneCanvas) return;
  const ctx = toneCanvas.getContext('2d');
  const w = toneCanvas.width, h = toneCanvas.height;
  if (!ctx) return;
  // 1 sample per frame
  const sr = audioCtx.sampleRate;
  const hz = estimatePitchHz(analyser, sr);
  let st = 0;
  if (hz > 0) {
    // convert to semitones relative to median of recent voiced frames
    const voiced = liveSemitoneBuffer.filter((x)=>Number.isFinite(x));
    const medHz = 200; // default center
    const med = voiced.length ? median(voiced.map(x=>x.hz)) : medHz;
    st = 12 * Math.log2(hz / med);
    // simple smoothing
    if (voiced.length) {
      const last = voiced[voiced.length-1].st;
      st = 0.7 * last + 0.3 * st;
    }
    liveSemitoneBuffer.push({ st, hz });
  } else {
    liveSemitoneBuffer.push({ st: null, hz: 0 });
  }
  if (liveSemitoneBuffer.length > LIVE_MAX_FRAMES) liveSemitoneBuffer.shift();

  // spectrogram or clean background
  if (spectrogramEnabled) {
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    const img = ctx.getImageData(1, 0, w-1, h);
    ctx.putImageData(img, 0, 0);
    for (let y = 0; y < h; y++) {
      const i = Math.floor((y / h) * freq.length);
      const v = freq[i];
      ctx.fillStyle = `hsl(220,80%,${20 + (v/255)*50}%)`;
      ctx.fillRect(w-1, y, 1, 1);
    }
    drawIdealCurve(ctx, w, h, getToneNumber(byId('pinyinText')?.textContent || ''));
  } else {
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
    drawIdealCurve(ctx, w, h, getToneNumber(byId('pinyinText')?.textContent || ''));
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(20, h*0.2); ctx.lineTo(w-20, h*0.2); ctx.moveTo(20, h*0.8); ctx.lineTo(w-20, h*0.8); ctx.stroke();
  }

  // draw live semitone contour
  const range = 24; // +/- 12 st
  const yFromSt = (v) => {
    const clamped = Math.max(-range/2, Math.min(range/2, v));
    return h/2 - (clamped / (range/2)) * (h*0.3);
  };
  ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.5; ctx.beginPath();
  let moved = false;
  for (let i = 0; i < liveSemitoneBuffer.length; i++) {
    const x = 20 + (i / (LIVE_MAX_FRAMES-1)) * (w - 40);
    const entry = liveSemitoneBuffer[i];
    if (!entry || entry.st === null) continue;
    const y = yFromSt(entry.st);
    if (!moved) { ctx.moveTo(x, y); moved = true; } else { ctx.lineTo(x, y); }
  }
  if (moved) ctx.stroke();

  if (isRecording) reqId = requestAnimationFrame(renderLive);
}

async function startRecording() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) { toneStatus.textContent = 'Microphone unavailable.'; return; }
    const ctx = ensureAudioContext();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 } });
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    source.connect(analyser);
    isRecording = true;
    liveSemitoneBuffer = [];
    if (toneHint) toneHint.textContent = '';
    toneStatus.textContent = 'Recording…';
    // capture to buffer
    const recorder = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    source.connect(recorder);
    // do not monitor mic: connect through silent gain
    const silentGain = ctx.createGain(); silentGain.gain.value = 0; recorder.connect(silentGain); silentGain.connect(ctx.destination);
    recorder.onaudioprocess = (e) => { if (isRecording) chunks.push(e.inputBuffer.getChannelData(0).slice()); };
    renderLive();
    // auto-stop after 3s
    setTimeout(() => { if (isRecording) stopRecording(chunks, recorder); }, 3000);
    toneStopBtn.onclick = () => stopRecording(chunks, recorder);
    if (toneStopTop) toneStopTop.onclick = () => stopRecording(chunks, recorder);
  } catch (e) {
    console.error('tone start failed', e);
    toneStatus.textContent = 'Cannot access microphone.';
  }
}

function stopRecording(chunks, recorder) {
  isRecording = false;
  try { if (recorder) recorder.disconnect(); } catch {}
  try { stream?.getTracks()?.forEach(t => t.stop()); } catch {}
  try { if (source) source.disconnect(); } catch {}
  stream = null; source = null; analyser = null;
  if (reqId) cancelAnimationFrame(reqId);
  // build buffer
  const ctx = ensureAudioContext();
  let flat = flattenChunks(chunks);
  // trim silence (RMS window 20ms, threshold ~ -45 dBFS)
  flat = trimSilence(flat, ctx.sampleRate, 0.02, -45);
  recordedBuffer = ctx.createBuffer(1, flat.length, ctx.sampleRate);
  recordedBuffer.copyToChannel(flat, 0, 0);
  toneStatus.textContent = 'Recorded.';
  toneReplayBtn.disabled = false; if (toneReplayTop) toneReplayTop.disabled = false;
  // draw final contour
  drawFinalContour(flat, ctx.sampleRate);
  if (toneHint) toneHint.textContent = computeHint(flat, ctx.sampleRate);
  // draw recorded spectrogram
  if (toneSpectroRecorded) drawRecordedSpectrogram(flat, ctx.sampleRate, toneSpectroRecorded);
}

function flattenChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let ofs = 0;
  for (const c of chunks) { out.set(c, ofs); ofs += c.length; }
  return out;
}

function drawFinalContour(samples, sr) {
  const ctx2d = toneCanvas.getContext('2d');
  const w = toneCanvas.width, h = toneCanvas.height;
  if (!ctx2d) return;
  ctx2d.fillStyle = '#0b1220'; ctx2d.fillRect(0, 0, w, h);
  drawIdealCurve(ctx2d, w, h, getToneNumber(byId('pinyinText')?.textContent || ''));
  ctx2d.strokeStyle = '#3b82f6'; ctx2d.lineWidth = 2; ctx2d.beginPath();
  const frame = 1024; const hop = 512; const nFrames = Math.max(1, Math.floor((samples.length - frame) / hop));
  const stVals = [];
  for (let f = 0; f < nFrames; f++) {
    const start = f * hop;
    const seg = samples.slice(start, start + frame);
    const hz = estimatePitchHzFromBuffer(seg, sr);
    if (hz > 0) stVals.push(hz);
  }
  const med = stVals.length ? median(stVals) : 200;
  const toY = (st) => {
    const v = 12 * Math.log2(st / med);
    const clamped = Math.max(-12, Math.min(12, v));
    return h/2 - (clamped / 12) * (h*0.3);
  };
  let moved = false;
  for (let f = 0; f < nFrames; f++) {
    const start = f * hop;
    const seg = samples.slice(start, start + frame);
    const hz = estimatePitchHzFromBuffer(seg, sr);
    if (hz <= 0) continue;
    const x = 20 + (f / Math.max(1, nFrames-1)) * (w - 40);
    const y = toY(hz);
    if (!moved) { ctx2d.moveTo(x, y); moved = true; } else { ctx2d.lineTo(x, y); }
  }
  if (moved) ctx2d.stroke();
}

function computeHint(samples, sr) {
  const frame = 1024, hop = 512; const vals = [];
  for (let p = 0; p + frame <= samples.length; p += hop) {
    const hz = estimatePitchHzFromBuffer(samples.slice(p, p + frame), sr);
    if (hz > 0) vals.push(hz);
  }
  if (vals.length < 3) return 'No clear pitch detected—try again closer to the mic.';
  const med = median(vals);
  const st = vals.map(hz => 12 * Math.log2(hz / med));
  const n = st.length;
  const firstThird = st.slice(0, Math.floor(n/3)).filter(Number.isFinite);
  const lastThird = st.slice(Math.floor(2*n/3)).filter(Number.isFinite);
  const overallSlope = (median(lastThird) - median(firstThird));
  const dip = Math.min(...st) - (median([st[0], st[n-1]]));
  if (overallSlope > 2) return 'Looks mostly rising.';
  if (overallSlope < -2) return 'Looks mostly falling.';
  if (dip < -2) return 'Shows a dip then rise.';
  return 'Stable pitch.';
}

function replay() {
  if (!recordedBuffer || !audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = recordedBuffer;
  src.connect(audioCtx.destination);
  src.start();
}

export function openToneVisualizer() {
  toneDialog = byId('toneDialog'); toneClose = byId('toneClose'); toneCanvas = byId('toneCanvas');
  toneInfo = byId('toneInfo'); toneStopBtn = byId('toneStop'); toneReplayBtn = byId('toneReplay'); toneStatus = byId('toneStatus'); toneHint = byId('toneHint'); toneSpectro = byId('toneSpectro');
  toneRerecordTop = byId('toneRerecordTop'); toneStopTop = byId('toneStopTop'); toneReplayTop = byId('toneReplayTop'); toneSpectroRecorded = byId('toneSpectroRecorded');
  if (!toneDialog) return;
  const p = byId('pinyinText')?.textContent || '';
  if (toneInfo) toneInfo.textContent = p ? `Pinyin: ${p}` : '—';
  toneReplayBtn.disabled = true; if (toneReplayTop) toneReplayTop.disabled = true;
  toneDialog.hidden = false;
  toneClose.onclick = () => closeToneVisualizer();
  spectrogramEnabled = !!(toneSpectro && toneSpectro.checked);
  if (toneSpectro) toneSpectro.onchange = () => { spectrogramEnabled = !!toneSpectro.checked; };
  startRecording();
  toneReplayBtn.onclick = () => replay();
  if (toneReplayTop) toneReplayTop.onclick = () => replay();
  if (toneStopTop) toneStopTop.onclick = () => { /* will be bound in startRecording too */ };
  if (toneRerecordTop) toneRerecordTop.onclick = () => { try { closeToneVisualizer(); } finally { openToneVisualizer(); } };
}

export function closeToneVisualizer() {
  try { stream?.getTracks()?.forEach(t => t.stop()); } catch {}
  if (reqId) cancelAnimationFrame(reqId);
  toneDialog.hidden = true;
}

function rmsDbfs(samples) {
  let sum = 0; for (let i = 0; i < samples.length; i++) { const v = samples[i]; sum += v * v; }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(rms + 1e-12);
}

function trimSilence(samples, sr, windowSec, thresholdDb) {
  const w = Math.max(1, Math.floor(sr * windowSec));
  let start = 0, end = samples.length;
  // leading
  for (let i = 0; i < samples.length - w; i += w) {
    if (rmsDbfs(samples.slice(i, i + w)) > thresholdDb) { start = i; break; }
  }
  // trailing
  for (let i = samples.length - w; i > start; i -= w) {
    if (rmsDbfs(samples.slice(i - w, i)) > thresholdDb) { end = i; break; }
  }
  return samples.slice(start, end);
}

function drawRecordedSpectrogram(samples, sr, canvas) {
  const ctx2d = canvas.getContext('2d'); if (!ctx2d) return;
  const w = canvas.width, h = canvas.height;
  const frame = 1024, hop = 256;
  ctx2d.fillStyle = '#0b1220'; ctx2d.fillRect(0, 0, w, h);
  let x = 0;
  for (let i = 0; i + frame <= samples.length; i += hop) {
    const seg = samples.slice(i, i + frame);
    const spec = magnitudeSpectrum(seg);
    for (let y = 0; y < h; y++) {
      const idx = Math.floor((y / h) * spec.length);
      const v = spec[idx];
      const lum = Math.max(0, Math.min(1, v));
      ctx2d.fillStyle = `hsl(220,80%,${15 + lum*55}%)`;
      ctx2d.fillRect(x, h - 1 - y, 1, 1);
    }
    x = Math.min(w - 1, x + 1);
    if (x >= w - 1) break;
  }
}
function magnitudeSpectrum(seg) {
  // simple DFT magnitude (slow but ok for small)
  const n = seg.length; const out = new Float32Array(n/2);
  for (let k = 0; k < out.length; k++) {
    let re = 0, im = 0;
    for (let t = 0; t < n; t++) {
      const phi = -2 * Math.PI * k * t / n; const v = seg[t];
      re += v * Math.cos(phi); im += v * Math.sin(phi);
    }
    out[k] = Math.sqrt(re*re + im*im) / n;
  }
  return out;
}


