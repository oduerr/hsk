const SESSIONS_KEY = 'hsk.flash.sessions';
const SESSION_PREFIX = 'hsk.flash.session.';
const DECK_KEY_PREFIX = 'hsk.flash.deck.';
const LAST_CHECKPOINT_KEY = 'hsk.flash.lastCheckpointId';
const SETTINGS_KEY = 'hsk.flash.settings';
const LAST_LEVEL_KEY = 'hsk.flash.level';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function saveFullSession(session) {
  const key = SESSION_PREFIX + session.id;
  writeJson(key, session);
}

export function loadFullSession(id) {
  return readJson(SESSION_PREFIX + id, null);
}

export function loadSessionSummaries() {
  return readJson(SESSIONS_KEY, []);
}

export function saveSessionSummary(summary) {
  const list = loadSessionSummaries();
  const idx = list.findIndex((s) => s.id === summary.id);
  if (idx >= 0) list[idx] = summary; else list.push(summary);
  writeJson(SESSIONS_KEY, list);
}

export function renameSession(id, name) {
  const list = loadSessionSummaries();
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], name: name || '' };
    writeJson(SESSIONS_KEY, list);
  }
}

export function deleteSession(id) {
  const list = loadSessionSummaries().filter((s) => s.id !== id);
  writeJson(SESSIONS_KEY, list);
  try { localStorage.removeItem(SESSION_PREFIX + id); } catch {}
}

export function saveDeck(cards, levelLabel = 'hsk5') {
  const key = DECK_KEY_PREFIX + String(levelLabel).toLowerCase();
  writeJson(key, cards);
}

export function loadDeck(levelLabel = 'hsk5') {
  const key = DECK_KEY_PREFIX + String(levelLabel).toLowerCase();
  return readJson(key, null);
}

export function saveLastCheckpointId(id) {
  localStorage.setItem(LAST_CHECKPOINT_KEY, id);
}

export function loadLastCheckpointId() {
  return localStorage.getItem(LAST_CHECKPOINT_KEY);
}

export function clearLastCheckpointId() {
  localStorage.removeItem(LAST_CHECKPOINT_KEY);
}

export async function saveCheckpoint(fullSnapshot) {
  // Save full
  saveFullSession(fullSnapshot);
  
  // Get locale from state (set by vocabulary manager)
  const { state } = await import('./state.js');
  const locale = state.sessionLocale || 'zh-CN';
  
  // Save summary with inProgress flag
  const summary = {
    id: fullSnapshot.id,
    startedAt: fullSnapshot.startedAt,
    finishedAt: fullSnapshot.finishedAt || null,
    mistakeIds: fullSnapshot.mistakeIds || [],
    counts: fullSnapshot.counts || { total: fullSnapshot.order?.length || 0, mistakes: fullSnapshot.mistakeIds?.length || 0 },
    inProgress: !fullSnapshot.finishedAt,
    lastPlayedAt: fullSnapshot.lastPlayedAt || fullSnapshot.startedAt,
    locale: locale,
    name: fullSnapshot.name || null,
    // Note: title field is removed, use name instead
  };
  saveSessionSummary(summary);
  saveLastCheckpointId(fullSnapshot.id);
}

export function loadSettings() {
  const def = { timerEnabled: false, timerSeconds: 5, lastCsvHash: '', minimalUI: true, outdoorMode: false, audioFeedback: null, autosave: true };
  const s = readJson(SETTINGS_KEY, def) || def;
  if (typeof s.minimalUI !== 'boolean') s.minimalUI = true;
  if (typeof s.outdoorMode !== 'boolean') s.outdoorMode = false;
  if (s.audioFeedback === null || typeof s.audioFeedback === 'undefined') {
    // default: ON for mobile, OFF for desktop
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    s.audioFeedback = !!isMobile;
  }
  if (typeof s.autosave !== 'boolean') s.autosave = true;
  return s;
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, settings);
}

export function saveLastLevel(label) {
  try { localStorage.setItem(LAST_LEVEL_KEY, label); } catch {}
}

export function loadLastLevel() {
  try { return localStorage.getItem(LAST_LEVEL_KEY); } catch { return null; }
}

// TTS Settings Effects
const TTS_SETTINGS_KEY = 'hsk.tts.settings';
const TTS_VOICE_KEY = 'hsk.flash.voice';

export function loadTtsSettings() {
  return readJson(TTS_SETTINGS_KEY, { audioCache: true });
}

export function saveTtsSettings(settings) {
  writeJson(TTS_SETTINGS_KEY, settings);
}

export function loadTtsVoice() {
  try { return localStorage.getItem(TTS_VOICE_KEY); } catch { return null; }
}

export function saveTtsVoice(voice) {
  try { localStorage.setItem(TTS_VOICE_KEY, voice); } catch {}
}

// Session Size Computation Effect
export function computeSessionsSizeBytes() {
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

// Version Loading Effect
export async function loadVersionFile() {
  try {
    const response = await fetch('./VERSION.TXT');
    const text = await response.text();
    return text.trim();
  } catch {
    return null;
  }
}

/**
 * Build and download an export JSON. Optionally include the current in-memory session snapshot.
 * @param {null|object} currentFullSession
 */
export async function exportAllSessionsFile(currentFullSession = null) {
  const summaries = loadSessionSummaries().slice();
  const sessions = [];
  for (const s of summaries) {
    const full = loadFullSession(s.id);
    if (full) sessions.push(full);
  }
  if (currentFullSession) {
    const exists = summaries.some((s) => s.id === currentFullSession.id);
    if (!exists) {
      // Get locale from state (set by vocabulary manager)
      const { state } = await import('./state.js');
      const locale = state.sessionLocale || 'zh-CN';
      
      // minimal summary derived from provided full snapshot
      const summary = {
        id: currentFullSession.id,
        startedAt: currentFullSession.startedAt,
        finishedAt: currentFullSession.finishedAt || null,
        mistakeIds: currentFullSession.mistakeIds || [],
        counts: currentFullSession.counts || {
          total: (currentFullSession.order && currentFullSession.order.length) || 0,
          mistakes: (currentFullSession.mistakeIds && currentFullSession.mistakeIds.length) || 0,
        },
        inProgress: !currentFullSession.finishedAt,
        lastPlayedAt: currentFullSession.lastPlayedAt || currentFullSession.startedAt,
        locale: locale,
        name: currentFullSession.name || null,
      };
      summaries.push(summary);
      sessions.push(currentFullSession);
    }
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    summaries,
    sessions,
  };
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const filename = `flash_sessions_${y}${m}${d}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Merge sessions from a JSON object into LocalStorage (dedupe by id).
 * Accepts standard format: { version?, exportedAt?, summaries:[], sessions:[] }
 * or simplified: { summaries:[], sessions:[] }
 */
export function importSessionsFromObject(obj) {
  const summaries = Array.isArray(obj?.summaries) ? obj.summaries : [];
  let sessions = Array.isArray(obj?.sessions) ? obj.sessions.slice() : [];

  if (!summaries.length && !sessions.length) {
    // Try alternate shape: flat array of full sessions
    if (Array.isArray(obj)) {
      for (const full of obj) {
        if (!full?.id) continue;
        saveFullSession(full);
        const summary = {
          id: full.id,
          startedAt: full.startedAt,
          finishedAt: full.finishedAt || null,
          mistakeIds: full.mistakeIds || [],
          counts: full.counts || { total: full.order?.length || 0, mistakes: full.mistakeIds?.length || 0 },
        };
        saveSessionSummary(summary);
      }
      return { added: obj.length };
    }
    return { added: 0 };
  }

  // Save all full sessions first
  let added = 0;
  for (const full of sessions) {
    if (!full?.id) continue;
    saveFullSession(full);
    added += 1;
  }
  
  // Merge summaries; if a summary for a saved full is missing, synthesize it
  const seenSummaryIds = new Set(summaries.map((s) => s?.id).filter(Boolean));
  for (const s of summaries) {
    if (!s?.id) continue;
    
    // Migrate old data: if title exists but name doesn't, set name = title
    if (s.title && !s.name) {
      s.name = s.title;
    }
    
    // Set default locale if missing
    if (!s.locale) {
      s.locale = 'zh-CN';
    }
    
    // Set default lastPlayedAt if missing
    if (!s.lastPlayedAt) {
      s.lastPlayedAt = s.startedAt || new Date().toISOString();
    }
    
    // Remove title field (no longer used)
    delete s.title;
    
    saveSessionSummary(s);
  }
  
  for (const full of sessions) {
    if (!full?.id || seenSummaryIds.has(full.id)) continue;
    const summary = {
      id: full.id,
      startedAt: full.startedAt,
      finishedAt: full.finishedAt || null,
      mistakeIds: full.mistakeIds || [],
      counts: full.counts || { total: full.order?.length || 0, mistakes: full.mistakeIds?.length || 0 },
    };
    saveSessionSummary(summary);
  }
  
  return { added };
}


