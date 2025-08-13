import { fetchCsvText, parseCsv, rowsToCards } from './data.js';
import { state, newRun, reveal, nextCard, markMistake, setAutoReveal, finalizeIfFinished, getFullSessionSnapshot, resumeRun } from './state.js';
import { saveFullSession, saveSessionSummary, exportAllSessionsFile, loadSessionSummaries, loadFullSession, importSessionsFromObject, loadDeck, saveDeck, saveCheckpoint, loadLastCheckpointId } from './storage.js';
import { CONFIG } from './config.js';
import { render, showCountdown, updateCountdown, hideCountdown, flashMistake } from './ui.js';

const PATH = CONFIG.csvRelativePath;

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const btnReveal = /** @type {HTMLButtonElement} */($('btnReveal'));
const btnNext = /** @type {HTMLButtonElement} */($('btnNext'));
const btnMistake = /** @type {HTMLButtonElement} */($('btnMistake'));
const btnNewRun = /** @type {HTMLButtonElement} */($('btnNewRun'));
const btnReplay = /** @type {HTMLButtonElement} */($('btnReplay'));
const btnImport = /** @type {HTMLButtonElement} */($('btnImport'));
const importInput = /** @type {HTMLInputElement} */($('importInput'));
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
    buildInfo.textContent = `HSK Flash v1 • ${new Date().toLocaleString()}${lastId ? ` • last checkpoint: ${lastId}` : ''}`;
  } catch {}
}

function onReveal() {
  reveal();
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

function onNewRun() {
  // Re-bootstrap using same deck we already loaded in state.deck
  if (!state.deck.length) return;
  newRun(state.deck, { replayOf: null });
  render();
  startCountdownIfNeeded();
}

function onAutoToggleChanged() {
  const enabled = autoToggle.checked;
  const secs = parseInt(autoSeconds.value || '5', 10);
  setAutoReveal(enabled, secs);
  if (enabled && state.face === 'front') {
    startCountdownIfNeeded();
  } else {
    resetCountdown();
  }
}

function onSecondsChanged() {
  const secs = parseInt(autoSeconds.value || '5', 10);
  setAutoReveal(autoToggle.checked, secs);
  if (state.autoReveal && state.face === 'front') {
    startCountdownIfNeeded();
  }
}

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  if (key === ' ' || key === 'enter') {
    e.preventDefault();
    if (state.face === 'front') onReveal(); else onNext();
  } else if (key === 'm') {
    e.preventDefault();
    onMistake();
  } else if (key === 'n') {
    e.preventDefault();
    onNext();
  } else if (key === 'r') {
    e.preventDefault();
    openReplayDialog();
  }
}

btnReveal.addEventListener('click', onReveal);
btnNext.addEventListener('click', onNext);
btnMistake.addEventListener('click', onMistake);
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

// Import via file input
if (btnImport && importInput) {
  btnImport.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const res = importSessionsFromObject(obj);
      console.log('Imported sessions:', res);
      alert('Import complete. You can open Replay… to view sessions.');
    } catch (e) {
      console.error('Import failed:', e);
      alert('Import failed. Check console for details.');
    } finally {
      importInput.value = '';
    }
  });
}

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
      left.innerHTML = `<div><strong>${new Date(s.startedAt).toLocaleString()}</strong></div>` +
        `<div class="sid">${s.id}</div>`;
      right.className = 'counts';
      right.textContent = `${s.counts?.mistakes ?? 0} mistakes / ${s.counts?.total ?? 0}`;
      const disabledReplay = (s.mistakeIds?.length ?? 0) === 0;
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';
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

      actions.appendChild(btnReplay);
      actions.appendChild(btnResume);
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

// Initialize default auto reveal settings in state from UI controls
setAutoReveal(autoToggle.checked, parseInt(autoSeconds.value || '5', 10));

// Kick off
bootstrap();


