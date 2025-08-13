// Speech synthesis module (4.20)
// Provides: initSpeech, speak, stop, setSettings

const KEY_SETTINGS = 'hsk.tts.settings';
const KEY_OPENAI = 'hsk.tts.openai.key';

/** @type {{ engine: 'openai'|'browser', model?: 'tts-1'|'tts-1-hd', rate: number, pitch: number, voice?: string, cache: boolean, fallback: boolean, preferredLangs: string[] }} */
let settings = { engine: 'browser', model: 'tts-1', rate: 0.95, pitch: 1.0, voice: '', cache: true, fallback: true, preferredLangs: ['zh-CN','zh','cmn-Hans-CN'] };

/** @type {Map<string, ArrayBuffer>} */
const ttsCache = new Map();

let voices = [];
let openaiWarned = false;

export async function initSpeech() {
  try {
    const saved = localStorage.getItem(KEY_SETTINGS);
    if (saved) settings = { ...settings, ...JSON.parse(saved) };
    if ('speechSynthesis' in window) {
      voices = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => { voices = window.speechSynthesis.getVoices(); };
    }
    if (!settings.model) settings.model = 'tts-1';
    console.info('[tts] init', { engine: settings.engine, model: settings.model, cache: settings.cache, fallback: settings.fallback });
    console.info('[tts] browser voices', { count: voices?.length || 0 });
  } catch {}
}

export function setSettings(partial) {
  settings = { ...settings, ...partial };
  try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch {}
  console.info('[tts] setSettings', partial);
}

export function stop() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); console.info('[tts] stop'); } catch {}
}

function pickBrowserVoice() {
  if (!('speechSynthesis' in window)) return null;
  if (!voices || voices.length === 0) voices = window.speechSynthesis.getVoices();
  const match = voices.filter(v => settings.preferredLangs.some(l => (v.lang||'').toLowerCase().startsWith(l.toLowerCase())) || /zh|chinese/i.test(v.name));
  let voice = null;
  if (settings.voice) voice = voices.find(v => v.voiceURI === settings.voice || v.name === settings.voice) || null;
  if (!voice) voice = match[0] || voices[0] || null;
  return voice;
}

async function speakWithBrowser(text, lang='zh-CN') {
  if (!('speechSynthesis' in window)) throw new Error('Browser TTS unavailable');
  stop();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickBrowserVoice();
  if (v) u.voice = v;
  u.lang = lang;
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  console.info('[tts] browser speak', { voice: v?.name, lang: u.lang, rate: u.rate, pitch: u.pitch, textPreview: (text||'').slice(0,24) });
  return new Promise((resolve) => {
    u.onend = () => { console.info('[tts] browser finished'); resolve(); };
    u.onerror = (e) => { console.warn('[tts] browser error', e); resolve(); };
    window.speechSynthesis.speak(u);
  });
}

async function speakWithOpenAI(text, lang='zh-CN') {
  const key = localStorage.getItem(KEY_OPENAI) || '';
  if (!key) throw new Error('No OpenAI key');
  // Cache key
  const model = settings.model || 'tts-1';
  const cacheKey = `${model}|${lang}|${settings.voice||'alloy'}|${text}`;
  try {
    if (settings.cache && ttsCache.has(cacheKey)) {
      const buf = ttsCache.get(cacheKey);
      console.info('[tts] openai cache hit', { bytes: buf.byteLength });
      return playArrayBuffer(buf);
    }
    const masked = key.length > 8 ? key.slice(0,3) + '...' + key.slice(-4) : '***';
    console.info('[tts] openai request', { model, voice: settings.voice||'alloy', format: 'mp3', key: masked, textPreview: (text||'').slice(0,24) });
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, voice: settings.voice || 'alloy', input: text, format: 'mp3' })
    });
    if (!resp.ok) {
      let errText = '';
      try { errText = await resp.text(); } catch {}
      console.warn('[tts] openai http error', { status: resp.status, body: errText?.slice(0,120) });
      throw new Error('OpenAI TTS failed');
    }
    const buf = await resp.arrayBuffer();
    if (settings.cache) ttsCache.set(cacheKey, buf);
    console.info('[tts] openai ok', { bytes: buf.byteLength, model });
    return playArrayBuffer(buf);
  } catch (e) {
    if (!openaiWarned) { console.warn('OpenAI TTS unavailable, falling back.', e); openaiWarned = true; }
    throw e;
  }
}

async function playArrayBuffer(buf) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await ctx.decodeAudioData(buf.slice(0));
  const src = ctx.createBufferSource(); src.buffer = audioBuf; src.connect(ctx.destination); src.start();
  console.info('[tts] playing buffer', { durationSec: audioBuf.duration?.toFixed?.(2) || undefined });
  return new Promise((resolve) => { src.onended = () => { try { ctx.close(); } catch {} console.info('[tts] finished buffer'); resolve(); }; });
}

export async function speak(text, lang='zh-CN') {
  if (!text) return;
  stop();
  try {
    console.info('[tts] speak', { engine: settings.engine, fallback: settings.fallback });
    if (settings.engine === 'openai') {
      try { await speakWithOpenAI(text, lang); return; } catch (e) { console.warn('[tts] openai failed; fallback?', settings.fallback, e); if (!settings.fallback) throw e; }
    }
    await speakWithBrowser(text, lang);
  } catch (e) {
    console.warn('Speech not available:', e);
  }
}

// Explicit OpenAI connectivity test (4.21)
export async function testOpenAITts(sampleText = '学习中文真好！', lang = 'zh-CN') {
  const started = performance.now();
  const key = localStorage.getItem(KEY_OPENAI) || '';
  if (!key) {
    return { ok: false, reason: 'No API key found. Enter your key and try again.', latencyMs: 0, fallbackUsed: false, keyDetected: false, missingKey: true };
  }
  try {
    // Temporarily bypass cache and fallback
    const prevCache = settings.cache; const prevEngine = settings.engine; const prevFallback = settings.fallback;
    settings.cache = false; settings.engine = 'openai'; settings.fallback = false;
    const model = settings.model || 'tts-1';
    // Do raw fetch to ensure OpenAI path works
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, voice: settings.voice || 'alloy', input: sampleText, format: 'mp3' })
    });
    if (!resp.ok) {
      let body = ''; try { body = await resp.text(); } catch {}
      settings.cache = prevCache; settings.engine = prevEngine; settings.fallback = prevFallback;
      return { ok: false, reason: `HTTP ${resp.status}` , detail: body?.slice(0,200), latencyMs: 0, fallbackUsed: false, keyDetected: true };
    }
    const buf = await resp.arrayBuffer();
    const latency = Math.round(performance.now() - started);
    await playArrayBuffer(buf);
    settings.cache = prevCache; settings.engine = prevEngine; settings.fallback = prevFallback;
    return { ok: true, latencyMs: latency, model, voice: settings.voice || 'alloy', format: 'mp3', fallbackUsed: false, keyDetected: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e), latencyMs: 0, fallbackUsed: false, keyDetected: true };
  }
}

// Cache helpers (4.22)
export function getTtsCacheStats() {
  let bytes = 0; let count = 0;
  for (const [, buf] of ttsCache) { bytes += buf?.byteLength || 0; count += 1; }
  return { count, bytes };
}

export function clearTtsCache() {
  const { count, bytes } = getTtsCacheStats();
  ttsCache.clear();
  console.info('[tts] cache cleared', { previousEntries: count, previousBytes: bytes });
}

export const SpeechSettings = { KEY_SETTINGS, KEY_OPENAI };


