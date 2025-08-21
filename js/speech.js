// Speech synthesis module (4.20) + Audio source order & caching (4.70)
// Provides: initSpeech, speak, stop, setSettings, getTtsCacheStats, clearTtsCache, clearAudioCache, getAudioCacheCount

const KEY_SETTINGS = 'hsk.tts.settings';
const KEY_OPENAI = 'hsk.tts.openai.key';

/** @type {{ engine: 'openai'|'browser', model?: 'tts-1'|'tts-1-hd', rate: number, pitch: number, openaiVoice?: string, browserVoice?: string, cache: boolean, fallback: boolean, preferredLangs: string[], requestOpenAI?: boolean, audioCache?: boolean }} */
let settings = { engine: 'browser', model: 'tts-1', rate: 0.95, pitch: 1.0, openaiVoice: 'alloy', browserVoice: '', cache: true, fallback: true, preferredLangs: ['zh-CN','zh','cmn-Hans-CN'], requestOpenAI: false, audioCache: true };

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
    if (!settings.openaiVoice) settings.openaiVoice = 'alloy';
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

// 4.70 audio cache helpers (Cache Storage)
const AUDIO_CACHE_NAME = 'hsk-audio-v1';
async function getAudioCache() { try { return await caches.open(AUDIO_CACHE_NAME); } catch { return null; } }
export async function clearAudioCache() { try { await caches.delete(AUDIO_CACHE_NAME); console.info('[audio] cache cleared'); } catch {} }
export async function getAudioCacheCount() { try { const c = await getAudioCache(); if (!c) return 0; const ks = await c.keys(); return ks.length; } catch { return 0; } }
export async function getAudioCacheBytes() { try { const c = await getAudioCache(); if (!c) return 0; const ks = await c.keys(); let total = 0; for (const req of ks) { const resp = await c.match(req); if (resp) { const buf = await resp.arrayBuffer(); total += buf.byteLength || 0; } } return total; } catch { return 0; } }

function pickBrowserVoice() {
  if (!('speechSynthesis' in window)) return null;
  if (!voices || voices.length === 0) voices = window.speechSynthesis.getVoices();
  const match = voices.filter(v => settings.preferredLangs.some(l => (v.lang||'').toLowerCase().startsWith(l.toLowerCase())) || /zh|chinese/i.test(v.name));
  let voice = null;
  if (settings.browserVoice) voice = voices.find(v => v.voiceURI === settings.browserVoice || v.name === settings.browserVoice) || null;
  if (!voice) voice = match[0] || voices[0] || null;
  return voice;
}

async function speakWithBrowser(text, lang='zh-CN') { // TODO set locale here
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


async function playArrayBuffer(buf) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await ctx.decodeAudioData(buf.slice(0));
  const src = ctx.createBufferSource(); src.buffer = audioBuf; src.connect(ctx.destination); src.start();
  console.info('[tts] playing buffer', { durationSec: audioBuf.duration?.toFixed?.(2) || undefined });
  return new Promise((resolve) => { src.onended = () => { try { ctx.close(); } catch {} console.info('[tts] finished buffer'); resolve(); }; });
}

export async function speak(text, lang='zh-CN', opts = {}) {
  if (!text) return { source: 'none' };
  stop();
  try {
    const preferredLevel = typeof opts?.level === 'string' ? opts.level : null;
    console.info('[tts] speak', { text, preferredLevel, lang });
    
    // Try WAV first
    const played = await tryPlayCachedOrRemoteWav(text, lang, preferredLevel);
    if (played !== 'none') {
      return { source: played }; // Pre-recorded WAV file
    }
    
    // Fallback to browser TTS
    await speakWithBrowser(text, lang);
    console.warn('[audio] no wav available, using browser TTS');
    return { source: 'browser' }; // Browser TTS
  } catch (e) {
    console.warn('Audio not available:', e);
    return { source: 'error', error: e };
  }
}

function extractLevelDigit(label) {
  if (!label) return null;
  const m = String(label).match(/(\d+)/);
  return m ? m[1] : null;
}

// Helper function to get audio URL with locale support
export function getAudioUrl(hanzi, locale = null) {
  const fname = encodeURIComponent(hanzi) + '.wav';
  const base = location.origin + location.pathname.replace(/\/?[^/]*$/, '/');
  
  // Try locale-specific directory first, then fallback to general recordings
  if (locale) {
    return new URL(`./data/recordings/${locale}/${fname}`, base).toString();
  } else {
    return new URL(`./data/recordings/${fname}`, base).toString();
  }
}

// NEW: Simple, direct audio lookup with locale support
async function tryPlayCachedOrRemoteWav(hanzi, locale = null, preferredLevelLabel = null) {
  try {
    const url = getAudioUrl(hanzi, locale);
    console.info('[tts] getAudioUrl', { url });
    const cache = await getAudioCache();
    if (cache) {
      const hit = await cache.match(url);
      if (hit) {
        console.info('[audio] source=cache', { url });
        const buf = await hit.arrayBuffer();
        await playArrayBuffer(buf);
        return 'cache';
      }
    }
    
    const resp = await fetch(url, { cache: settings.audioCache ? 'default' : 'reload' });
    if (resp.ok && (resp.headers.get('content-type')||'').includes('audio')) {
      const buf = await resp.arrayBuffer();
      console.info('[audio] source=remote', { url });
      if (settings.audioCache && cache) {
        try { await cache.put(url, new Response(buf)); console.info('[audio] cache store ok'); } catch {}
      }
      await playArrayBuffer(buf);
      return 'remote';
    }
  } catch (e) { console.warn('[audio] wav failed', e); }
  return 'none';
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


