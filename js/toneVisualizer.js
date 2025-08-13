let toneDialog, toneClose, toneCanvas, toneInfo, toneStopBtn, toneReplayBtn, toneStatus;
let audioCtx = null;
let stream = null, source = null, analyser = null, reqId = 0;
let recordedBuffer = null;
let isRecording = false;

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

function estimatePitchHz(analyser, sampleRate) {
  const bufLen = analyser.fftSize;
  const buf = new Float32Array(bufLen);
  analyser.getFloatTimeDomainData(buf);
  let bestOfs = -1, bestCorr = 0;
  for (let ofs = 8; ofs < bufLen / 2; ofs++) {
    let corr = 0;
    for (let i = 0; i < bufLen - ofs; i++) corr += buf[i] * buf[i + ofs];
    if (corr > bestCorr) { bestCorr = corr; bestOfs = ofs; }
  }
  return bestOfs > 0 ? sampleRate / bestOfs : 0;
}

function renderLive() {
  if (!analyser || !toneCanvas) return;
  const ctx = toneCanvas.getContext('2d');
  const w = toneCanvas.width, h = toneCanvas.height;
  if (!ctx) return;
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
  drawIdealCurve(ctx, w, h, getToneNumber(byId('pinyinText')?.textContent || ''));
  // light live trace
  ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.5; ctx.beginPath();
  const sr = audioCtx.sampleRate;
  const duration = 3000, step = 40; // 3s window
  let moved = false;
  for (let t = 0; t <= duration; t += step) {
    const hz = estimatePitchHz(analyser, sr);
    const y = hz > 0 ? h - Math.min(h * 0.9, Math.log10(hz) * (h / 3)) : h * 0.9;
    const x = 20 + (t / duration) * (w - 40);
    if (!moved) { ctx.moveTo(x, y); moved = true; } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
  if (isRecording) reqId = requestAnimationFrame(renderLive);
}

async function startRecording() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      toneStatus.textContent = 'Microphone unavailable.'; return;
    }
    const ctx = ensureAudioContext();
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    source.connect(analyser);
    isRecording = true;
    toneStatus.textContent = 'Recording…';
    // capture to buffer
    const recorder = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    source.connect(recorder); recorder.connect(ctx.destination);
    recorder.onaudioprocess = (e) => {
      if (!isRecording) return;
      chunks.push(e.inputBuffer.getChannelData(0).slice());
    };
    renderLive();
    // auto-stop after 3s
    setTimeout(() => { if (isRecording) stopRecording(chunks, recorder); }, 3000);
    toneStopBtn.onclick = () => stopRecording(chunks, recorder);
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
  const flat = flattenChunks(chunks);
  recordedBuffer = ctx.createBuffer(1, flat.length, ctx.sampleRate);
  recordedBuffer.copyToChannel(flat, 0, 0);
  toneStatus.textContent = 'Recorded.';
  toneReplayBtn.disabled = false;
  // draw final contour
  drawFinalContour(flat, ctx.sampleRate);
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
  const duration = 3000, step = 40;
  for (let t = 0; t <= duration; t += step) {
    const idx = Math.min(samples.length - 2048, Math.floor((t / duration) * (samples.length - 2048)));
    let corr = 0, best = 0, bestLag = 0;
    for (let lag = 8; lag < 1024; lag++) {
      corr = 0;
      for (let i = 0; i < 1024; i++) corr += samples[idx + i] * samples[idx + i + lag];
      if (corr > best) { best = corr; bestLag = lag; }
    }
    const hz = bestLag ? sr / bestLag : 0;
    const y = hz > 0 ? h - Math.min(h * 0.9, Math.log10(hz) * (h / 3)) : h * 0.9;
    const x = 20 + (t / duration) * (w - 40);
    if (t === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
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
  toneInfo = byId('toneInfo'); toneStopBtn = byId('toneStop'); toneReplayBtn = byId('toneReplay'); toneStatus = byId('toneStatus');
  if (!toneDialog) return;
  const p = byId('pinyinText')?.textContent || '';
  if (toneInfo) toneInfo.textContent = p ? `Pinyin: ${p}` : '—';
  toneReplayBtn.disabled = true;
  toneDialog.hidden = false;
  toneClose.onclick = () => closeToneVisualizer();
  startRecording();
  toneReplayBtn.onclick = () => replay();
}

export function closeToneVisualizer() {
  try { stream?.getTracks()?.forEach(t => t.stop()); } catch {}
  if (reqId) cancelAnimationFrame(reqId);
  toneDialog.hidden = true;
}


