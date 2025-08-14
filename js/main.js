import { fetchCsvText, parseCsv, rowsToCards, discoverAvailableLevels } from './data.js';
import { openToneVisualizer, closeToneVisualizer } from './toneVisualizer.js';
import { initSpeech, speak, setSettings as setTtsSettings } from './speech.js';
import { state, newRun, reveal, nextCard, markMistake, setAutoReveal, finalizeIfFinished, getFullSessionSnapshot, resumeRun, prevCard, unmarkMistake, unreveal } from './state.js';
import { saveFullSession, saveSessionSummary, exportAllSessionsFile, loadSessionSummaries, loadFullSession, importSessionsFromObject, loadDeck, saveDeck, saveCheckpoint, loadLastCheckpointId, renameSession, deleteSession, loadSettings, saveSettings, saveLastLevel, loadLastLevel } from './storage.js';
import { CONFIG } from './config.js';
import { render, showCountdown, updateCountdown, hideCountdown, flashMistake } from './ui.js';

const PATH = CONFIG.csvRelativePath;

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const btnReveal = /** @type {HTMLButtonElement} */($('btnReveal'));
const btnNext = /** @type {HTMLButtonElement} */($('btnNext'));
const btnMistake = /** @type {HTMLButtonElement} */($('btnMistakeToggle') || $('btnMistake'));
const btnNewRun = /** @type {HTMLButtonElement} */($('btnNewRun'));
const btnReplay = /** @type {HTMLButtonElement} */($('btnReplay'));
// Removed top-level import/export buttons; moved to dialog
// legacy header controls (may be absent after 4.04)
const autoToggle = /** @type {HTMLInputElement} */($('autoRevealToggle'));
const autoSeconds = /** @type {HTMLInputElement} */($('autoRevealSeconds'));
const btnExport = /** @type {HTMLButtonElement} */(document.getElementById('btnExport'));
const dropOverlay = /** @type {HTMLElement} */(document.getElementById('dropOverlay'));
const fallbackPanel = /** @type {HTMLElement} */(document.getElementById('fallbackPanel'));
const csvFileInput = /** @type {HTMLInputElement} */(document.getElementById('csvFileInput'));
const csvTextArea = /** @type {HTMLTextAreaElement} */(document.getElementById('csvTextArea'));
const btnUsePastedCsv = /** @type {HTMLButtonElement} */(document.getElementById('usePastedCsv'));
const btnSaveProgress = /** @type {HTMLButtonElement} */(document.getElementById('btnSaveProgress'));
const btnSaveProgressTop = /** @type {HTMLButtonElement} */(document.getElementById('btnSaveProgressTop'));
const btnMistakeTop = /** @type {HTMLButtonElement} */(document.getElementById('btnMistakeTop'));
const buildInfo = /** @type {HTMLElement} */(document.getElementById('buildInfo'));
const infoVersionTxt = /** @type {HTMLElement} */(document.getElementById('infoVersionTxt'));
const infoAudioCacheSize = /** @type {HTMLElement} */(document.getElementById('infoAudioCacheSize'));
const infoSessionsSize = /** @type {HTMLElement} */(document.getElementById('infoSessionsSize'));
const infoCheckpointId = /** @type {HTMLElement} */(document.getElementById('infoCheckpointId'));
const infoSessionId = /** @type {HTMLElement} */(document.getElementById('infoSessionId'));
const infoSessionTitle = /** @type {HTMLElement} */(document.getElementById('infoSessionTitle'));
const infoLastSave = /** @type {HTMLElement} */(document.getElementById('infoLastSave'));
const btnBack = /** @type {HTMLButtonElement} */(document.getElementById('btnBack'));
const btnCorrect = /** @type {HTMLButtonElement} */(document.getElementById('btnCorrect'));
const btnUndo = /** @type {HTMLButtonElement} */(document.getElementById('btnUndo'));
const btnSettings = /** @type {HTMLButtonElement} */(document.getElementById('btnSettings'));
const settingsDialog = /** @type {HTMLElement} */(document.getElementById('settingsDialog'));
const settingsClose = /** @type {HTMLButtonElement} */(document.getElementById('settingsClose'));
const settingsAutoToggle = /** @type {HTMLInputElement} */(document.getElementById('settingsAutoToggle'));
const settingsAutoSeconds = /** @type {HTMLInputElement} */(document.getElementById('settingsAutoSeconds'));
const settingsMinimalUI = /** @type {HTMLInputElement} */(document.getElementById('settingsMinimalUI'));
const settingsAutosave = /** @type {HTMLInputElement} */(document.getElementById('settingsAutosave'));
const settingsExport = /** @type {HTMLButtonElement} */(document.getElementById('settingsExport'));
const settingsImportBtn = /** @type {HTMLButtonElement} */(document.getElementById('settingsImportBtn'));
const settingsImportInput = /** @type {HTMLInputElement} */(document.getElementById('settingsImportInput'));
const settingsUndo = /** @type {HTMLButtonElement} */(document.getElementById('settingsUndo'));
const settingsOutdoor = /** @type {HTMLInputElement} */(document.getElementById('settingsOutdoor'));
const settingsAudio = /** @type {HTMLInputElement} */(document.getElementById('settingsAudio'));
const settingsLightMode = /** @type {HTMLInputElement} */(document.getElementById('settingsLightMode'));
// Audio (4.8)
const audioCacheToggle = /** @type {HTMLInputElement} */(document.getElementById('audioCacheToggle'));
const audioCacheClear = /** @type {HTMLButtonElement} */(document.getElementById('audioCacheClear'));
const audioCacheStatus = /** @type {HTMLElement} */(document.getElementById('audioCacheStatus'));
const btnCardMistakeToggle = /** @type {HTMLButtonElement} */(document.getElementById('btnCardMistakeToggle'));
const btnSpeak = /** @type {HTMLButtonElement} */(document.getElementById('btnSpeak'));
const btnTone = /** @type {HTMLButtonElement} */(document.getElementById('btnTone'));
const mediaRow = /** @type {HTMLElement} */(document.getElementById('mediaRow'));
const levelPicker = /** @type {HTMLSelectElement} */(document.getElementById('levelPicker'));
const customLevelsRow = /** @type {HTMLElement} */(document.getElementById('customLevelsRow'));
const loadCustomLevelsBtn = /** @type {HTMLButtonElement} */(document.getElementById('loadCustomLevels'));
const levelInfo = /** @type {HTMLElement} */(document.getElementById('levelInfo'));

/** @type {number|null} */
let countdownTimer = null;
/** @type {number} */
let countdownRemaining = 0;

function resetCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  hideCountdown();
}

function startCountdownIfNeeded() {
  resetCountdown();
  if (!state.autoReveal || state.face !== 'front') return;
  countdownRemaining = state.autoRevealSeconds;
  showCountdown(countdownRemaining);
  countdownTimer = window.setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      resetCountdown();
      reveal();
      render();
      return;
    }
    updateCountdown(countdownRemaining);
  }, 1000);
}

async function refreshAvailableLevels() {
  try {
    const levels = await discoverAvailableLevels();
    const have = new Set(levels);
    const options = Array.from(levelPicker?.options || []);
    let mutated = false;
    for (const opt of options) {
      const v = opt.value;
      if (/^[0-6]$/.test(v)) {
        if (!have.has(v)) { levelPicker.removeChild(opt); mutated = true; }
      }
    }
    for (const v of levels) {
      if (![...options].some(o => o.value === v)) {
        const o = document.createElement('option'); o.value = v; o.textContent = `HSK ${v}`; levelPicker.insertBefore(o, levelPicker.querySelector('option[value="custom"]')); mutated = true;
      }
    }
    if (mutated) {
      // ensure HSK 0 test remains first if present
      const zero = levelPicker.querySelector('option[value="0"]');
      if (zero) levelPicker.insertBefore(zero, levelPicker.firstChild);
    }
  } catch {}
}

async function bootstrap() {
  try {
    const versionParam = new URLSearchParams(location.search).get('v');
    const url = versionParam ? `${PATH}?v=${encodeURIComponent(versionParam)}` : PATH;
    const csvText = await fetchCsvText(url);
    const rows = parseCsv(csvText);
    const cards = rowsToCards(rows);
    console.log('Parsed cards:', cards.slice(0, 5), `... total=${cards.length}`);
    if (!cards.length) {
      console.error('No cards parsed. Check CSV file.');
    }
    saveDeck(cards);
    newRun(cards);
    render();
    startCountdownIfNeeded();
  } catch (err) {
    console.warn('Remote fetch failed, trying LocalStorage deck. Error:', err);
    const localDeck = loadDeck();
    if (Array.isArray(localDeck) && localDeck.length) {
      newRun(localDeck);
      render();
      startCountdownIfNeeded();
    } else {
      // Show fallback panel for manual selection/paste
      fallbackPanel.hidden = false;
      $('card').hidden = true;
    }
  }
  // Initialize speech (4.20)
  try { await initSpeech(); } catch {}
  // Show version/build info: date + latest session or checkpoint id
  try {
    const lastId = loadLastCheckpointId();
    // Try to read VERSION.TXT for version label
    let versionLabel = 'HSK Flash v1';
    try {
      const v = await fetch('./VERSION.TXT').then(r => r.text()).catch(() => '');
      versionLabel = v ? v.trim() : versionLabel;
      // Do not show version in the main header brand; keep static brand text
    } catch {}
    buildInfo.textContent = `${versionLabel} • ${new Date().toLocaleString()}${lastId ? ` • last checkpoint: ${lastId}` : ''}`;
    if (infoVersionTxt) infoVersionTxt.textContent = versionLabel;
    if (infoCheckpointId) infoCheckpointId.textContent = lastId || '—';
  } catch {}
  // Load settings
  try {
    const s = loadSettings();
    // populate settings dialog
    if (settingsAutoToggle) settingsAutoToggle.checked = !!s.timerEnabled;
    if (settingsAutoSeconds) settingsAutoSeconds.value = String(s.timerSeconds ?? 5);
    if (settingsMinimalUI) settingsMinimalUI.checked = !!s.minimalUI;
    if (settingsAutosave) settingsAutosave.checked = s.autosave !== false;
    // new theme/audio/outdoor
    if (settingsOutdoor) settingsOutdoor.checked = !!s.outdoorMode;
    if (settingsAudio) settingsAudio.checked = !!s.audioFeedback;
    if (settingsLightMode) settingsLightMode.checked = !!s.lightMode;
    document.body.classList.toggle('outdoor', !!s.outdoorMode);
    document.body.classList.toggle('light', !!s.lightMode);
    setAutoReveal(!!s.timerEnabled, Number(s.timerSeconds || 5));
    applyMinimalUI(!!s.minimalUI);
    // Probe available CSV levels and update picker
    await refreshAvailableLevels();
    // Audio cache setting
    try {
      const saved = JSON.parse(localStorage.getItem('hsk.tts.settings') || '{}');
      if (audioCacheToggle) audioCacheToggle.checked = saved.audioCache !== false;
    } catch {}
    // Level picker
    const last = loadLastLevel();
    if (levelPicker && last) {
      if (last === 'custom') levelPicker.value = 'custom';
      else levelPicker.value = String(last.replace('HSK ', ''));
    }
    // If a last level exists and differs from default CSV (5), load it
    try {
      if (last && last !== '5') {
        await loadLevelsAndStart([last]);
      } else {
        state.levelLabel = 'HSK 5';
        render();
      }
    } catch {}
  } catch {}

  // Populate Version (from VERSION.TXT) already set above, now sizes
  try {
    const mod = await import('./speech.js');
    const bytes = await mod.getAudioCacheBytes();
    if (infoAudioCacheSize) infoAudioCacheSize.textContent = formatBytes(bytes);
  } catch {}
  try {
    const total = computeSessionsSizeBytes();
    if (infoSessionsSize) infoSessionsSize.textContent = formatBytes(total);
  } catch {}
}

function applyMinimalUI(enabled) {
  try {
    const root = document.documentElement;
    // Toggle class on body/app if we later want additional styles; for now hide nav-only with CSS on mobile only
    // We store preference in settings
    const s = loadSettings();
    saveSettings({ ...s, minimalUI: !!enabled });
  } catch {}
}

function onReveal() {
  // Space/Reveal toggles front/back without advancing
  if (state.face === 'front') reveal(); else unreveal();
  render();
  resetCountdown();
}

function onNext() {
  nextCard();
  render();
  startCountdownIfNeeded();
  const finalized = finalizeIfFinished();
  if (finalized) {
    try {
      saveFullSession(finalized.full);
      saveSessionSummary(finalized.summary);
    } catch (e) {
      console.error('Failed saving session:', e);
    }
  }
}

function onMistake() {
  // Toggle by space tap or button: if already marked, unmark; else mark
  const card = state.index < state.order.length ? state.deck[state.order[state.index]] : null;
  if (!card) return;
  if (state.mistakes.has(card.id)) {
    unmarkMistake();
    playMarkAudio(true);
  } else {
    markMistake();
    flashMistake();
    playMarkAudio(false);
  }
  render();
  // Autosave on mark/unmark per 4.92
  try {
    const enabled = !!(settingsAutosave && settingsAutosave.checked);
    if (enabled) {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const snapshot = getFullSessionSnapshot();
      saveCheckpoint(snapshot);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const ms = Math.round(t1 - t0);
      console.log(`[autosave] ${ms}ms • checkpoint ${snapshot?.id || ''} at`, new Date().toISOString());
    }
  } catch (e) { console.error('[autosave] failed', e); }
}

function onUnmistake() {
  unmarkMistake();
  render();
}

function onBack() {
  prevCard();
  render();
  startCountdownIfNeeded();
}

function onNewRun() {
  // Re-bootstrap using same deck we already loaded in state.deck
  if (!state.deck.length) return;
  if (!confirm('Start a new run? Current progress will be lost (unless saved).')) return;
  newRun(state.deck, { replayOf: null });
  render();
  startCountdownIfNeeded();
}

function onAutoToggleChanged() {
  const enabled = (settingsAutoToggle && settingsAutoToggle.checked) || false;
  const secs = settingsAutoSeconds ? parseInt(settingsAutoSeconds.value || '5', 10) : 5;
  setAutoReveal(enabled, secs);
  try { const s = loadSettings(); saveSettings({ ...s, timerEnabled: enabled, timerSeconds: secs }); } catch {}
  if (enabled && state.face === 'front') {
    startCountdownIfNeeded();
  } else {
    resetCountdown();
  }
}

function onSecondsChanged() {
  const secs = settingsAutoSeconds ? parseInt(settingsAutoSeconds.value || '5', 10) : 5;
  const enabled = (settingsAutoToggle && settingsAutoToggle.checked) || false;
  setAutoReveal(enabled, secs);
  try { const s = loadSettings(); saveSettings({ ...s, timerEnabled: enabled, timerSeconds: secs }); } catch {}
  if (state.autoReveal && state.face === 'front') {
    startCountdownIfNeeded();
  }
}

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  if (key === ' ') {
    e.preventDefault();
    onReveal();
  } else if (key === 'enter') {
    e.preventDefault();
    onNext();
  } else if (key === 'm' || (e.shiftKey && key === 'shift')) {
    e.preventDefault();
    onMistake();
  } else if (key === 'u') {
    e.preventDefault();
    onUnmistake();
  } else if (key === 'n') {
    e.preventDefault();
    onNext();
  } else if (key === 'r') {
    e.preventDefault();
    openReplayDialog();
  } else if (key === 'arrowright') {
    e.preventDefault();
    onNext();
  } else if (key === 'arrowleft') {
    e.preventDefault();
    onBack();
  } else if (key === 'arrowdown' || key === 'arrowup') {
    e.preventDefault();
    onReveal();
  }
}

btnReveal.addEventListener('click', onReveal);
btnNext.addEventListener('click', onNext);
btnMistake.addEventListener('click', onMistake);
btnCardMistakeToggle?.addEventListener('click', onMistake);
btnSpeak?.addEventListener('click', () => {
  const idx = state.order[state.index];
  const card = state.deck[idx];
  if (!card) return;
  try { const level = state.levelLabel || ''; speak(card.hanzi || card.pinyin || '', 'zh-CN', { level }); } catch {}
});
btnTone?.addEventListener('click', () => { openToneVisualizer(); });
btnBack.addEventListener('click', onBack);
btnCorrect?.addEventListener('click', onUnmistake);
btnNewRun.addEventListener('click', onNewRun);
settingsAutoToggle?.addEventListener('change', onAutoToggleChanged);
settingsAutoSeconds?.addEventListener('change', onSecondsChanged);
btnSettings?.addEventListener('click', () => { settingsDialog.hidden = false; });
settingsClose?.addEventListener('click', () => { settingsDialog.hidden = true; });
// Hide/show media row alongside settings visibility
if (btnSettings) btnSettings.addEventListener('click', () => { if (mediaRow) mediaRow.classList.add('hidden'); });
if (settingsClose) settingsClose.addEventListener('click', () => { if (mediaRow) mediaRow.classList.remove('hidden'); });
settingsExport?.addEventListener('click', () => { try { const snap = state.deck.length ? getFullSessionSnapshot() : null; exportAllSessionsFile(snap); } catch (e) { console.error(e); } });
settingsImportBtn?.addEventListener('click', () => settingsImportInput?.click());
// Outdoor/Audio/Light listeners
settingsOutdoor?.addEventListener('change', () => {
  try { const s = loadSettings(); const enabled = !!settingsOutdoor.checked; saveSettings({ ...s, outdoorMode: enabled }); document.body.classList.toggle('outdoor', enabled); } catch {}
});
settingsAudio?.addEventListener('change', () => {
  try { const s = loadSettings(); const enabled = !!settingsAudio.checked; saveSettings({ ...s, audioFeedback: enabled }); } catch {}
});
settingsLightMode?.addEventListener('change', () => {
  try { const s = loadSettings(); const enabled = !!settingsLightMode.checked; saveSettings({ ...s, lightMode: enabled }); document.body.classList.toggle('light', enabled); } catch {}
});
settingsAutosave?.addEventListener('change', () => {
  try { const s = loadSettings(); const enabled = !!settingsAutosave.checked; saveSettings({ ...s, autosave: enabled }); } catch {}
});
settingsImportInput?.addEventListener('change', async () => {
  const file = settingsImportInput.files && settingsImportInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    importSessionsFromObject(obj);
    alert('Import complete.');
  } catch (e) { console.error(e); alert('Import failed'); }
  finally { settingsImportInput.value = ''; }
});
btnSaveProgressTop?.addEventListener('click', () => btnSaveProgress?.click());
btnMistakeTop?.addEventListener('click', onMistake);

// Audio handlers
audioCacheToggle?.addEventListener('change', () => {
  try { const current = JSON.parse(localStorage.getItem('hsk.tts.settings') || '{}'); const val = !!audioCacheToggle.checked; localStorage.setItem('hsk.tts.settings', JSON.stringify({ ...current, audioCache: val })); try { setTtsSettings({ audioCache: val }); } catch {} } catch {}
});
audioCacheClear?.addEventListener('click', async () => {
  if (!confirm('Clear downloaded audio cache?')) return;
  try { const mod = await import('./speech.js'); await mod.clearAudioCache(); if (audioCacheStatus) { const n = await mod.getAudioCacheCount(); audioCacheStatus.textContent = `Cache entries: ${n}`; } } catch {}
});
window.addEventListener('keydown', onKeyDown, { passive: false });
// Touch swipe gestures for mobile
let touchStartX = 0, touchStartY = 0;
const SWIPE_THRESHOLD = 30;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStartX = t.clientX; touchStartY = t.clientY;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) onNext(); else onBack();
    }
  } else {
    if (Math.abs(dy) > SWIPE_THRESHOLD) {
      onReveal();
    }
  }
}, { passive: true });

// Tap on card toggles mistake on mobile per 4.06
document.getElementById('card')?.addEventListener('click', (ev) => {
  // If the click originated from the speak button, do not toggle mistake
  if (ev.target && ev.target instanceof HTMLElement && ev.target.id === 'btnSpeak') return;
  if (ev.target && ev.target instanceof HTMLElement && ev.target.id === 'btnTone') return;
  // Only on small screens: heuristic via width
  if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) {
    onMistake();
  }
});

// Audio feedback
let audioCtx = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  return audioCtx;
}
function playBeep(freq, ms) {
  const s = loadSettings();
  if (!s.audioFeedback) { console.log('[audio] feedback disabled'); return; }
  const ctx = ensureAudio();
  if (!ctx || typeof ctx.createOscillator !== 'function') { console.log('[audio] no audio context'); return; }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.value = 0.001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  osc.start();
  // quick fade in/out
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  osc.stop(ctx.currentTime + ms / 1000 + 0.01);
}

function playMarkAudio(isUnmark) {
  if (isUnmark) {
    console.log('[audio] mark->correct');
    playBeep(880, 120);
  } else {
    console.log('[audio] correct->mark');
    playBeep(220, 160);
  }
}

function formatBytes(bytes) {
  try {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B','KB','MB','GB'];
    let b = Math.max(0, bytes);
    let u = 0;
    while (b >= 1024 && u < units.length - 1) { b /= 1024; u++; }
    return `${b.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
  } catch { return '—'; }
}

function computeSessionsSizeBytes() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (/^hsk\.flash\.(session\.|sessions$|lastCheckpointId$)/.test(key)) {
        const val = localStorage.getItem(key) || '';
        total += val.length;
      }
    }
    return total;
  } catch { return 0; }
}

// ---------- Level Picker ----------
async function loadLevelsAndStart(levels) {
  // levels: array of '0'..'6'
  const texts = await Promise.all(levels.map(l => fetchCsvText(`./data/hsk${l}.csv`).catch(() => '')));
  const mergedRows = [];
  for (const t of texts) {
    if (!t) continue;
    const rows = parseCsv(t);
    mergedRows.push(...rows);
  }
  const cards = rowsToCards(mergedRows);
  if (cards.length) {
    saveDeck(cards);
    newRun(cards);
    state.levelLabel = levels.length === 1 ? `HSK ${levels[0]}` : `HSK ${levels.join('+')}`;
    render();
    startCountdownIfNeeded();
    saveLastLevel(levels.length === 1 ? levels[0] : 'custom');
    if (levelInfo) levelInfo.textContent = `Loaded ${state.levelLabel} • ${cards.length} cards`;
  } else {
    alert('Failed to load selected level(s).');
  }
}

levelPicker?.addEventListener('change', async () => {
  if (levelPicker.value === 'custom') {
    customLevelsRow.style.display = '';
  } else {
    customLevelsRow.style.display = 'none';
    saveLastLevel(levelPicker.value);
    await loadLevelsAndStart([levelPicker.value]);
  }
});

// Web Speech – Speak Chinese
let cachedVoices = [];
function pickZhVoice() {
  try {
    if (!('speechSynthesis' in window)) return null;
    const saved = localStorage.getItem('hsk.flash.voice');
    if (cachedVoices.length === 0) cachedVoices = window.speechSynthesis.getVoices();
    const list = cachedVoices.filter(v => /zh|chinese/i.test(v.lang) || /zh/i.test(v.name));
    let voice = null;
    if (saved) voice = list.find(v => v.voiceURI === saved || v.name === saved) || null;
    if (!voice) voice = list[0] || null;
    return voice;
  } catch { return null; }
}

function speakChinese() {
  try {
    if (!('speechSynthesis' in window)) { console.log('[speak] unsupported'); return; }
    window.speechSynthesis.cancel();
    const idx = state.order[state.index];
    const card = state.deck[idx];
    if (!card) return;
    const utter = new SpeechSynthesisUtterance(card.hanzi || card.pinyin || '');
    const voice = pickZhVoice();
    if (voice) {
      utter.voice = voice;
      localStorage.setItem('hsk.flash.voice', voice.voiceURI || voice.name);
    }
    utter.rate = 0.9;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch (e) { console.log('[speak] error', e); }
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoices = window.speechSynthesis.getVoices(); };
}

loadCustomLevelsBtn?.addEventListener('click', async () => {
  const checkboxes = Array.from(customLevelsRow.querySelectorAll('input.lvl'));
  const selected = checkboxes.filter(c => c.checked).map(c => c.value);
  if (!selected.length) { alert('Select at least one level.'); return; }
  saveLastLevel('custom');
  await loadLevelsAndStart(selected);
});
window.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.hidden = false; });
window.addEventListener('dragleave', (e) => { if (e.target === document || e.target === document.body) dropOverlay.hidden = true; });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropOverlay.hidden = true;
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const res = importSessionsFromObject(obj);
    console.log('Imported via drop:', res);
    alert('Import complete. Open Replay… to view sessions.');
  } catch (err) {
    console.error('Drop import failed:', err);
    alert('Import failed. Check console.');
  }
});

if (btnExport) {
  btnExport.addEventListener('click', () => {
    try {
      // Include current in-memory session snapshot so mistakes are visible even mid-run
      const snapshot = state.deck.length ? getFullSessionSnapshot() : null;
      exportAllSessionsFile(snapshot);
    } catch (e) { console.error(e); }
  });
}
// Save progress / checkpoint
btnSaveProgress?.addEventListener('click', () => {
  try {
    const snapshot = getFullSessionSnapshot();
    saveCheckpoint(snapshot);
    alert('Progress saved to LocalStorage. You can export or resume later.');
  } catch (e) {
    console.error('Save progress failed:', e);
    alert('Save failed.');
  }
});
// Manual CSV fallbacks
csvFileInput?.addEventListener('change', async () => {
  const file = csvFileInput.files && csvFileInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const cards = rowsToCards(rows);
    if (!cards.length) throw new Error('No rows parsed.');
    saveDeck(cards);
    fallbackPanel.hidden = true;
    $('card').hidden = false;
    newRun(cards);
    render();
    startCountdownIfNeeded();
  } catch (e) {
    alert('Failed to parse selected CSV.');
  } finally {
    csvFileInput.value = '';
  }
});

btnUsePastedCsv?.addEventListener('click', () => {
  const text = (csvTextArea?.value || '').trim();
  if (!text) { alert('Paste CSV text first.'); return; }
  try {
    const rows = parseCsv(text);
    const cards = rowsToCards(rows);
    if (!cards.length) throw new Error('No rows parsed.');
    saveDeck(cards);
    fallbackPanel.hidden = true;
    $('card').hidden = false;
    newRun(cards);
    render();
    startCountdownIfNeeded();
  } catch (e) {
    alert('Failed to parse pasted CSV.');
  }
});

// Dialog import/export controls
const dlgExport = /** @type {HTMLButtonElement} */(document.getElementById('dlgExport'));
const dlgImportBtn = /** @type {HTMLButtonElement} */(document.getElementById('dlgImportBtn'));
const dlgImportInput = /** @type {HTMLInputElement} */(document.getElementById('dlgImportInput'));
dlgExport?.addEventListener('click', () => {
  try { const snapshot = state.deck.length ? getFullSessionSnapshot() : null; exportAllSessionsFile(snapshot); } catch (e) { console.error(e); }
});
dlgImportBtn?.addEventListener('click', () => dlgImportInput?.click());
dlgImportInput?.addEventListener('change', async () => {
  const file = dlgImportInput.files && dlgImportInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const res = importSessionsFromObject(obj);
    console.log('Imported sessions:', res);
    // Refresh list
    openReplayDialog();
  } catch (e) {
    console.error('Import failed:', e);
    alert('Import failed. Check console.');
  } finally { dlgImportInput.value = ''; }
});

// ---------- Replay Dialog ----------
const replayDialog = /** @type {HTMLElement} */(document.getElementById('replayDialog'));
const replayList = /** @type {HTMLUListElement} */(document.getElementById('replayList'));
const replayEmpty = /** @type {HTMLElement} */(document.getElementById('replayEmpty'));
const replayClose = /** @type {HTMLButtonElement} */(document.getElementById('replayClose'));

if (btnReplay) btnReplay.addEventListener('click', openReplayDialog);
if (replayClose) replayClose.addEventListener('click', closeReplayDialog);
replayDialog?.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target instanceof HTMLElement && target.dataset.close) closeReplayDialog();
});

function openReplayDialog() {
  const summaries = loadSessionSummaries().slice().sort((a, b) => {
    return (b.startedAt || '').localeCompare(a.startedAt || '');
  });
  replayList.innerHTML = '';
  if (!summaries.length) {
    replayEmpty.hidden = false;
  } else {
    replayEmpty.hidden = true;
    for (const s of summaries) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const right = document.createElement('div');
      const right2 = document.createElement('div');
      const started = new Date(s.startedAt);
      const ymdhm = `${started.getFullYear()}-${String(started.getMonth()+1).padStart(2,'0')}-${String(started.getDate()).padStart(2,'0')}-${String(started.getHours()).padStart(2,'0')}:${String(started.getMinutes()).padStart(2,'0')}`;
      const finished = s.counts?.total ?? 0;
      const progressed = (s.finishedAt ? finished : Math.min(finished, (loadFullSession(s.id)?.events || []).filter(e => e.type==='next').length));
      const status = s.finishedAt ? 'complete' : 'incomplete';
      const title = s.title ? ` — ${escapeHtml(s.title)}` : '';
      left.innerHTML = `<div><strong>${ymdhm}</strong>${title}</div>` +
        `<div class="sid">${s.id}</div>`;
      right.className = 'counts';
      right.textContent = `${progressed}/${finished} • ${(s.counts?.mistakes ?? 0)} mistakes • status: ${status}`;
      const disabledReplay = (s.mistakeIds?.length ?? 0) === 0;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const btnReplay = document.createElement('button');
      btnReplay.className = 'primary';
      btnReplay.textContent = 'Replay mistakes';
      btnReplay.disabled = disabledReplay;
      if (!disabledReplay) btnReplay.addEventListener('click', () => startReplayFromSummary(s));

      const btnResume = document.createElement('button');
      btnResume.className = 'secondary';
      btnResume.textContent = 'Resume checkpoint';
      const isInProgress = !!s.inProgress || !s.finishedAt;
      btnResume.disabled = !isInProgress;
      if (isInProgress) btnResume.addEventListener('click', () => resumeFromSummary(s));

      const btnRename = document.createElement('button');
      btnRename.className = 'secondary';
      btnRename.textContent = 'Rename';
      btnRename.addEventListener('click', () => renameSummaryInline(li, s));

      const btnDelete = document.createElement('button');
      btnDelete.className = 'danger';
      btnDelete.textContent = 'Delete';
      btnDelete.addEventListener('click', () => deleteSummary(s));

      actions.appendChild(btnReplay);
      actions.appendChild(btnResume);
      actions.appendChild(btnRename);
      actions.appendChild(btnDelete);
      right2.appendChild(actions);
      li.appendChild(left);
      li.appendChild(right);
      li.appendChild(right2);
      replayList.appendChild(li);
    }
  }
  replayDialog.hidden = false;
}

function closeReplayDialog() { replayDialog.hidden = true; }

function startReplayFromSummary(summary) {
  const full = loadFullSession(summary.id);
  const mistakeIds = new Set(summary.mistakeIds || []);
  const deck = state.deck.filter((c) => mistakeIds.has(c.id));
  if (!deck.length) {
    alert('This session has no mistakes to replay.');
    return;
  }
  newRun(deck, { replayOf: summary.id });
  render();
  startCountdownIfNeeded();
  closeReplayDialog();
}

function resumeFromSummary(summary) {
  const full = loadFullSession(summary.id);
  if (!full) { alert('No saved checkpoint found.'); return; }
  resumeRun(full, { replayOf: full.replayOf || null });
  render();
  startCountdownIfNeeded();
  closeReplayDialog();
}

function renameSummaryInline(li, summary) {
  const current = summary.title || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.placeholder = 'Session title';
  input.style.width = '100%';
  const leftDiv = li.firstChild;
  if (leftDiv && leftDiv.firstChild) {
    leftDiv.firstChild.replaceWith(input);
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commit(); }
      if (e.key === 'Escape') { openReplayDialog(); }
    });
    input.addEventListener('blur', commit);
  }
  function commit() {
    const title = input.value.trim();
    renameSession(summary.id, title);
    openReplayDialog();
  }
}

function deleteSummary(summary) {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  deleteSession(summary.id);
  openReplayDialog();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// Initialize handled in bootstrap via saved settings

// Kick off
bootstrap();


