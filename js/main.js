import { fetchCsvText, parseCsv, rowsToCards } from './data.js';
import { state, newRun, reveal, nextCard, markMistake, setAutoReveal, finalizeIfFinished, getFullSessionSnapshot, resumeRun, prevCard, unmarkMistake, unreveal, undoLast } from './state.js';
import { saveFullSession, saveSessionSummary, exportAllSessionsFile, loadSessionSummaries, loadFullSession, importSessionsFromObject, loadDeck, saveDeck, saveCheckpoint, loadLastCheckpointId, renameSession, deleteSession, loadSettings, saveSettings } from './storage.js';
import { CONFIG } from './config.js';
import { render, showCountdown, updateCountdown, hideCountdown, flashMistake } from './ui.js';

const PATH = CONFIG.csvRelativePath;

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const btnReveal = /** @type {HTMLButtonElement} */($('btnReveal'));
const btnNext = /** @type {HTMLButtonElement} */($('btnNext'));
const btnMistake = /** @type {HTMLButtonElement} */($('btnMistake'));
const btnNewRun = /** @type {HTMLButtonElement} */($('btnNewRun'));
const btnReplay = /** @type {HTMLButtonElement} */($('btnReplay'));
// Removed top-level import/export buttons; moved to dialog
const autoToggle = /** @type {HTMLInputElement} */($('autoRevealToggle'));
const autoSeconds = /** @type {HTMLInputElement} */($('autoRevealSeconds'));
const btnExport = /** @type {HTMLButtonElement} */(document.getElementById('btnExport'));
const dropOverlay = /** @type {HTMLElement} */(document.getElementById('dropOverlay'));
const fallbackPanel = /** @type {HTMLElement} */(document.getElementById('fallbackPanel'));
const csvFileInput = /** @type {HTMLInputElement} */(document.getElementById('csvFileInput'));
const csvTextArea = /** @type {HTMLTextAreaElement} */(document.getElementById('csvTextArea'));
const btnUsePastedCsv = /** @type {HTMLButtonElement} */(document.getElementById('usePastedCsv'));
const btnSaveProgress = /** @type {HTMLButtonElement} */(document.getElementById('btnSaveProgress'));
const buildInfo = /** @type {HTMLElement} */(document.getElementById('buildInfo'));
const btnBack = /** @type {HTMLButtonElement} */(document.getElementById('btnBack'));
const btnCorrect = /** @type {HTMLButtonElement} */(document.getElementById('btnCorrect'));
const btnUndo = /** @type {HTMLButtonElement} */(document.getElementById('btnUndo'));

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
  // Show version/build info: date + latest session or checkpoint id
  try {
    const lastId = loadLastCheckpointId();
    buildInfo.textContent = `HSK Flash v1 • 莉娜老师的版本 • ${new Date().toLocaleString()}${lastId ? ` • last checkpoint: ${lastId}` : ''}`;
  } catch {}
  // Load settings
  try {
    const s = loadSettings();
    autoToggle.checked = !!s.timerEnabled;
    autoSeconds.value = String(s.timerSeconds ?? 5);
    setAutoReveal(autoToggle.checked, parseInt(autoSeconds.value || '5', 10));
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
  markMistake();
  flashMistake();
  // Re-render to update mistakes counter live
  render();
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
  const enabled = autoToggle.checked;
  const secs = parseInt(autoSeconds.value || '5', 10);
  setAutoReveal(enabled, secs);
  try { saveSettings({ timerEnabled: enabled, timerSeconds: secs, lastCsvHash: '' }); } catch {}
  if (enabled && state.face === 'front') {
    startCountdownIfNeeded();
  } else {
    resetCountdown();
  }
}

function onSecondsChanged() {
  const secs = parseInt(autoSeconds.value || '5', 10);
  setAutoReveal(autoToggle.checked, secs);
  try { saveSettings({ timerEnabled: autoToggle.checked, timerSeconds: secs, lastCsvHash: '' }); } catch {}
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
  } else if (key === 'm') {
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
  }
}

btnReveal.addEventListener('click', onReveal);
btnNext.addEventListener('click', onNext);
btnMistake.addEventListener('click', onMistake);
btnBack.addEventListener('click', onBack);
btnCorrect.addEventListener('click', onUnmistake);
btnUndo?.addEventListener('click', () => { if (undoLast()) { render(); startCountdownIfNeeded(); } });
btnNewRun.addEventListener('click', onNewRun);
autoToggle.addEventListener('change', onAutoToggleChanged);
autoSeconds.addEventListener('change', onSecondsChanged);
window.addEventListener('keydown', onKeyDown, { passive: false });
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

// Initialize default auto reveal settings in state from UI controls
setAutoReveal(autoToggle.checked, parseInt(autoSeconds.value || '5', 10));

// Kick off
bootstrap();


