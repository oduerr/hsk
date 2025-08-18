import { discoverAvailableCsvFiles } from './data.js';
import { openToneVisualizer, closeToneVisualizer } from './toneVisualizer.js';
import { initSpeech, speak, setSettings as setTtsSettings } from './speech.js';
import { state, newRun, reveal, nextCard, markMistake, setAutoReveal, finalizeIfFinished, getFullSessionSnapshot, resumeRun, prevCard, unmarkMistake, unreveal, markAnnotation, currentCard, removeCard } from './state.js';
import { saveFullSession, saveSessionSummary, exportAllSessionsFile, loadSessionSummaries, loadFullSession, importSessionsFromObject, loadDeck, saveDeck, saveCheckpoint, loadLastCheckpointId, renameSession, deleteSession, loadSettings, saveSettings, saveLastLevel, loadLastLevel } from './storage.js';
import { CONFIG } from './config.js';
import { render, showCountdown, updateCountdown, hideCountdown, flashMistake } from './ui.js';
import { createVocabularyManager } from './vocabularyManager.js';

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
const btnAnnotation = /** @type {HTMLButtonElement} */(document.getElementById('btnAnnotation'));
const mediaRow = /** @type {HTMLElement} */(document.getElementById('mediaRow'));



// HSK Import Dialog elements
const hskImportDialog = /** @type {HTMLElement} */(document.getElementById('hskImportDialog'));
const hskImportClose = /** @type {HTMLButtonElement} */(document.getElementById('hskImportClose'));
const hskImportLevels = /** @type {HTMLElement} */(document.getElementById('hskImportLevels'));
const hskImportCustomRow = /** @type {HTMLElement} */(document.getElementById('hskImportCustomRow'));
const hskImportSessionName = /** @type {HTMLInputElement} */(document.getElementById('hskImportSessionName'));
const hskImportSessionId = /** @type {HTMLInputElement} */(document.getElementById('hskImportSessionId'));
const hskImportStatus = /** @type {HTMLElement} */(document.getElementById('hskImportStatus'));
const hskImportCancel = /** @type {HTMLButtonElement} */(document.getElementById('hskImportCancel'));
const hskImportStart = /** @type {HTMLButtonElement} */(document.getElementById('hskImportStart'));
const btnVocabularyManager = /** @type {HTMLButtonElement} */(document.getElementById('btnVocabularyManager'));

/** @type {number|null} */
let countdownTimer = null;
/** @type {number} */
let countdownRemaining = 0;

// Create vocabulary manager instance
const vocabularyManager = createVocabularyManager({
  onLevelsDiscovered: (files) => {
    console.log('Discovered CSV files:', files);
    updateHskImportLevels(files);
  },
  onLevelsLoaded: (data) => {
    console.log('Loaded vocabulary:', data);
    // Note: levelInfo element was removed in the refactoring
    // Vocabulary loading status is now handled in the UI elsewhere
  },
  onSessionStarted: (sessionInfo) => {
    console.log('Session started:', sessionInfo);
    render();
    startCountdownIfNeeded();
  },
  onError: (message, error) => {
    console.error(message, error);
    alert(message);
  }
});

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

// HSK Import Functions
function updateHskImportLevels(files) {
  if (!hskImportLevels) return;
  
  hskImportLevels.innerHTML = '';
  
  // Add individual file buttons with descriptions
  files.forEach(file => {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = file.displayName;
    btn.title = file.description || file.displayName; // Show description on hover
    btn.dataset.filename = file.filename;
    btn.addEventListener('click', () => selectHskFile(file.filename));
    hskImportLevels.appendChild(btn);
    
    // Add description below button if available
    if (file.description) {
      const desc = document.createElement('div');
      desc.className = 'muted';
      desc.style.fontSize = '12px';
      desc.style.marginTop = '4px';
      desc.style.marginBottom = '8px';
      desc.textContent = file.description;
      hskImportLevels.appendChild(desc);
    }
  });
  
  // Add custom combination option
  if (files.length > 1) {
    const customBtn = document.createElement('button');
    customBtn.className = 'secondary';
    customBtn.textContent = 'Custom Combination';
    customBtn.addEventListener('click', () => showCustomFileSelection(files));
    hskImportLevels.appendChild(customBtn);
  }
}

function selectHskFile(filename) {
  // Clear any previous selection
  hskImportLevels.querySelectorAll('button').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Mark selected button
  const selectedBtn = hskImportLevels.querySelector(`[data-filename="${filename}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
  }
  
  // Hide custom row
  hskImportCustomRow.style.display = 'none';
  
  // Update session info
  updateHskImportSessionInfo([filename]);
  
  // Enable start button
  hskImportStart.disabled = false;
}

function showCustomFileSelection(files) {
  // Clear any previous selection
  hskImportLevels.querySelectorAll('button').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Show custom row
  hskImportCustomRow.style.display = 'block';
  
  // Clear existing checkboxes and add new ones
  const checkboxContainer = hskImportCustomRow.querySelector('.checkbox-container') || hskImportCustomRow;
  checkboxContainer.innerHTML = '<label class="muted">Combine files:</label>';
  
  files.forEach(file => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.marginBottom = '8px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = file.filename;
    checkbox.className = 'hsk-file';
    
    const text = document.createElement('span');
    text.textContent = file.displayName;
    
    label.appendChild(checkbox);
    label.appendChild(text);
    
    // Add description if available
    if (file.description) {
      const desc = document.createElement('div');
      desc.className = 'muted';
      desc.style.fontSize = '11px';
      desc.style.marginLeft = '24px';
      desc.style.marginTop = '2px';
      desc.textContent = file.description;
      label.appendChild(desc);
    }
    
    checkboxContainer.appendChild(label);
  });
  
  // Update session info
  updateHskImportSessionInfo([]);
  
  // Disable start button until files are selected
  hskImportStart.disabled = true;
}

function updateHskImportSessionInfo(filenames) {
  if (filenames.length === 0) {
    // Custom combination - check checkboxes
    const checkboxes = hskImportCustomRow.querySelectorAll('input.hsk-file:checked');
    filenames = Array.from(checkboxes).map(cb => cb.value);
  }
  
  if (filenames.length === 0) {
    hskImportSessionId.value = '';
    hskImportStatus.textContent = 'Select files to continue';
    return;
  }
  
  // Generate session ID
  const sessionId = `vocab_${filenames.join('_').replace(/\.csv/g, '')}_${Date.now()}`;
  hskImportSessionId.value = sessionId;
  
  // Update status
  const levelLabel = filenames.length === 1 
    ? vocabularyManager.getDisplayNameFromFilename(filenames[0])
    : `${filenames.length} Files Combined`;
  hskImportStatus.textContent = `Ready to load: ${levelLabel}`;
}

function openHskImportDialog() {
  // Reset dialog state
  hskImportSessionName.value = '';
  hskImportSessionId.value = '';
  hskImportStatus.textContent = 'Discovering available files...';
  hskImportStart.disabled = true;
  
  // Clear selections
  hskImportLevels.querySelectorAll('button').forEach(btn => {
    btn.classList.remove('selected');
  });
  hskImportCustomRow.style.display = 'none';
  hskImportCustomRow.querySelectorAll('input.hsk-file').forEach(cb => {
    cb.checked = false;
  });
  
  // Show dialog
  hskImportDialog.hidden = false;
  
  // Discover files
  vocabularyManager.discoverAvailableCsvFiles();
}

function closeHskImportDialog() {
  hskImportDialog.hidden = true;
}

async function startHskImportSession() {
  try {
    hskImportStart.disabled = true;
    hskImportStatus.textContent = 'Loading vocabulary...';
    
    // Get selected files
    let filenames = [];
    const selectedBtn = hskImportLevels.querySelector('button.selected');
    if (selectedBtn && selectedBtn.dataset.filename) {
      filenames = [selectedBtn.dataset.filename];
    } else {
      // Custom combination
      const checkboxes = hskImportCustomRow.querySelectorAll('input.hsk-file:checked');
      filenames = Array.from(checkboxes).map(cb => cb.value);
    }
    
    if (filenames.length === 0) {
      hskImportStatus.textContent = 'Please select files to import';
      hskImportStart.disabled = false;
      return;
    }
    
    // Configure vocabulary manager
    vocabularyManager.updateSessionName(hskImportSessionName.value || '');
    vocabularyManager.updateSessionId(hskImportSessionId.value);
    
    // Load and start session
    const result = await vocabularyManager.discoverLoadAndStart(filenames);
    
    hskImportStatus.textContent = `Successfully loaded ${result.cardCount} cards from ${result.levelLabel}`;
    
    // Close dialog after a short delay
    setTimeout(() => {
      closeHskImportDialog();
    }, 1500);
    
  } catch (error) {
    hskImportStatus.textContent = `Error: ${error.message}`;
    hskImportStart.disabled = false;
  }
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
      // No deck available - show empty state and let user use vocabulary manager
      console.log('No deck available. User can use the vocabulary manager button to import HSK files.');
      // Don't show fallback panel - let the main interface handle this
      render();
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
    // Update header controls based on Minimal UI
    updateHeaderForMinimalUI(!!s.minimalUI);
    // Probe available CSV levels and update picker
    // Audio cache setting
    try {
      const saved = JSON.parse(localStorage.getItem('hsk.tts.settings') || '{}');
      if (audioCacheToggle) audioCacheToggle.checked = saved.audioCache !== false;
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

  // Check Trix editor availability
  if (typeof Trix === 'undefined') {
    console.warn('Trix editor not loaded - annotation feature will not work');
  } else {
    console.log('Trix editor loaded successfully');
  }

  // 5.00: Populate session name in gear panel
  if (infoSessionTitle) {
    infoSessionTitle.textContent = state.session.name || '—';
  }
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

function updateHeaderForMinimalUI(enabled) {
  try {
    const newRunBtn = /** @type {HTMLButtonElement} */(document.getElementById('btnNewRun'));
    const replayBtn = /** @type {HTMLButtonElement} */(document.getElementById('btnReplay'));
    const saveBtnTop = /** @type {HTMLButtonElement} */(document.getElementById('btnSaveProgressTop'));
    const mistakeBtnTop = /** @type {HTMLButtonElement} */(document.getElementById('btnMistakeTop'));
    if (enabled) {
      if (newRunBtn) { newRunBtn.textContent = '🆕'; newRunBtn.title = 'New Session'; }
      if (replayBtn) { replayBtn.textContent = '🔄'; replayBtn.title = 'Replay…'; }
      if (saveBtnTop) { saveBtnTop.textContent = '💾'; saveBtnTop.title = 'Save Progress'; }
      if (mistakeBtnTop) mistakeBtnTop.style.display = '';
    } else {
      if (newRunBtn) { newRunBtn.textContent = 'New Session'; newRunBtn.title = 'Start a new learning session'; }
      if (replayBtn) { replayBtn.textContent = 'Replay…'; replayBtn.title = 'Replay a previously saved session'; }
      if (saveBtnTop) { saveBtnTop.textContent = 'Save Progress'; saveBtnTop.title = 'Save your progress in the current session'; }
      // When minimal UI is off, remove the Mistake button per spec
      if (mistakeBtnTop) mistakeBtnTop.style.display = 'none';
    }
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
  // Check if annotation editor is open - if so, don't handle global shortcuts
  const annotationEditor = document.getElementById('annotationEditor');
  if (annotationEditor && !annotationEditor.hidden) {
    // Editor is open, let it handle its own keyboard events
    return;
  }

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
  } else if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    // Only allow delete/backspace for card removal when not in annotation editor
    const annotationEditor = document.getElementById('annotationEditor');
    if (!annotationEditor || annotationEditor.hidden) {
          const remainingCards = state.order.length - 1;
    const confirmMessage = remainingCards > 0 
      ? `Remove this card from the session? ${remainingCards} cards will remain. This cannot be undone.`
      : 'Remove this card? This will remove the last card from the session. This cannot be undone.';
      
    if (confirm(confirmMessage)) {
      const removed = removeCard();
        if (removed) {
          // Autosave after removing card
          try {
            const enabled = !!(settingsAutosave && settingsAutosave.checked);
            if (enabled) {
              const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              const snapshot = getFullSessionSnapshot();
              saveCheckpoint(snapshot);
              const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              const ms = Math.round(t1 - t0);
              console.log(`[autosave] ${ms}ms • card removal checkpoint ${snapshot?.id || ''} at`, new Date().toISOString());
              if (infoLastSave) infoLastSave.textContent = new Date().toLocaleString();
              if (infoSessionId) infoSessionId.textContent = snapshot?.id || '—';
            }
          } catch (e) { console.error('[autosave] failed', e); }
          
          // Update UI
          render();
          
          // Show feedback
          if (state.order.length === 0) {
            showMessage('All cards removed from session.');
          } else {
            showMessage(`Card removed. ${state.order.length} cards remaining.`);
          }
        }
      }
    }
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
btnAnnotation?.addEventListener('click', () => {
  openAnnotationEditor();
});

// Remove card button
const btnRemoveCard = /** @type {HTMLButtonElement} */(document.getElementById('btnRemoveCard'));
btnRemoveCard?.addEventListener('click', () => {
  const remainingCards = state.order.length - 1;
  const confirmMessage = remainingCards > 0 
    ? `Remove this card from the session? ${remainingCards} cards will remain. This cannot be undone.`
    : 'Remove this card? This will remove the last card from the session. This cannot be undone.';
    
  if (confirm(confirmMessage)) {
    const removed = removeCard();
    if (removed) {
      // Autosave after removing card
      try {
        const enabled = !!(settingsAutosave && settingsAutosave.checked);
        if (enabled) {
          const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const snapshot = getFullSessionSnapshot();
          saveCheckpoint(snapshot);
          const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const ms = Math.round(t1 - t0);
          console.log(`[autosave] ${ms}ms • card removal checkpoint ${snapshot?.id || ''} at`, new Date().toISOString());
          if (infoLastSave) infoLastSave.textContent = new Date().toLocaleString();
          if (infoSessionId) infoSessionId.textContent = snapshot?.id || '—';
        }
      } catch (e) { console.error('[autosave] failed', e); }
      
      // Update UI
      render();
      
      // Show feedback
      if (state.order.length === 0) {
        showMessage('All cards removed from session.');
      } else {
        showMessage(`Card removed. ${state.order.length} cards remaining.`);
      }
    }
  }
});
btnBack.addEventListener('click', onBack);
btnCorrect?.addEventListener('click', onUnmistake);
btnNewRun.addEventListener('click', onNewRun);
settingsAutoToggle?.addEventListener('change', onAutoToggleChanged);
settingsAutoSeconds?.addEventListener('change', onSecondsChanged);
settingsMinimalUI?.addEventListener('change', () => { try { updateHeaderForMinimalUI(!!settingsMinimalUI.checked); } catch {} });
btnSettings?.addEventListener('click', () => { settingsDialog.hidden = false; });
settingsClose?.addEventListener('click', () => { settingsDialog.hidden = true; });
// Hide/show media row alongside settings visibility
if (btnSettings) btnSettings.addEventListener('click', () => { if (mediaRow) mediaRow.classList.add('hidden'); });
if (settingsClose) settingsClose.addEventListener('click', () => { if (mediaRow) mediaRow.classList.remove('hidden'); });
settingsExport?.addEventListener('click', () => { try { const snap = state.deck.length ? getFullSessionSnapshot() : null; exportAllSessionsFile(snap); } catch (e) { console.error(e); } });
settingsImportBtn?.addEventListener('click', () => settingsImportInput?.click());
btnVocabularyManager?.addEventListener('click', openHskImportDialog);
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
    openReplayDialog();
  } catch (e) { console.error(e); alert('Import failed'); }
  finally { settingsImportInput.value = ''; }
});
btnSaveProgressTop?.addEventListener('click', () => btnSaveProgress?.click());
btnMistakeTop?.addEventListener('click', onMistake);

// Annotation Editor Event Listeners
document.getElementById('annotationEditorClose')?.addEventListener('click', closeAnnotationEditor);
document.getElementById('annotationEditorSave')?.addEventListener('click', saveAnnotation);
document.getElementById('annotationEditorClear')?.addEventListener('click', clearAnnotation);

// Add keyboard shortcuts for annotation editor
document.addEventListener('keydown', (e) => {
  const annotationEditor = document.getElementById('annotationEditor');
  if (!annotationEditor || annotationEditor.hidden) return;

  // Only handle shortcuts when annotation editor is open
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAnnotationEditor();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    saveAnnotation();
  }
});

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
  // Check if annotation editor is open - if so, don't handle swipe gestures
  const annotationEditor = document.getElementById('annotationEditor');
  if (annotationEditor && !annotationEditor.hidden) {
    return;
  }

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
    openReplayDialog();
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


// Dialog import/export controls
const dlgExport = /** @type {HTMLButtonElement} */(document.getElementById('dlgExport'));
const dlgImportBtn = /** @type {HTMLButtonElement} */(document.getElementById('dlgImportBtn'));
const dlgImportInput = /** @type {HTMLInputElement} */(document.getElementById('dlgImportInput'));
const dlgNewSession = /** @type {HTMLButtonElement} */(document.getElementById('dlgNewSession'));

dlgNewSession?.addEventListener('click', () => {
  try {
    // Start a new session with the current deck
    if (state.deck.length > 0) {
      newRun(state.deck);
      render();
      startCountdownIfNeeded();
      closeReplayDialog();
    } else {
      // If no deck loaded, try to load from storage
      const deck = loadDeck();
      if (Array.isArray(deck) && deck.length > 0) {
        newRun(deck);
        render();
        startCountdownIfNeeded();
        closeReplayDialog();
      } else {
        alert('No vocabulary deck available. Please use the 📚 button to import HSK files first.');
      }
    }
  } catch (e) {
    console.error('Failed to start new session:', e);
    alert('Failed to start new session. Check console.');
  }
});

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
        `<div class="sid">${s.name ? escapeHtml(s.name) : s.id}</div>`;
      right.className = 'counts';
      const removedText = (s.counts?.removed ?? 0) > 0 ? ` • ${s.counts.removed} removed` : '';
      right.textContent = `${progressed}/${finished} • ${(s.counts?.mistakes ?? 0)} mistakes${removedText} • status: ${status}`;
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
  resumeRun(full, { replayOf: full.replayOf || null }).then(() => {
    render();
    startCountdownIfNeeded();
    closeReplayDialog();
  }).catch(err => {
    console.error('Failed to resume session:', err);
    alert('Failed to resume session. Check console.');
  });
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

// Annotation Editor Functions
function openAnnotationEditor() {
  const card = currentCard();
  if (!card) return;

  const editor = document.getElementById('annotationEditor');
  const trixEditor = document.getElementById('annotationTrixEditor');
  const textarea = document.getElementById('annotationTextarea');

  // Determine which editor to use
  const useTrix = typeof Trix !== 'undefined';
  const activeEditor = useTrix ? trixEditor : textarea;
  const inactiveEditor = useTrix ? textarea : trixEditor;

  // Show/hide appropriate editor
  if (useTrix) {
    trixEditor.style.display = 'block';
    textarea.style.display = 'none';
  } else {
    textarea.style.display = 'block';
    trixEditor.style.display = 'none';
  }

  // Load existing annotation if it exists
  const existingAnnotation = state.session.annotation.find(a => a.cardId === card.id);
  if (existingAnnotation) {
    activeEditor.value = existingAnnotation.note || '';
  } else {
    activeEditor.value = '';
  }

  editor.hidden = false;
  
  // Focus the active editor
  setTimeout(() => {
    activeEditor.focus();
    if (useTrix && trixEditor.editor) {
      trixEditor.editor.loadHTML(activeEditor.value || '');
    }
  }, 100);
}

function closeAnnotationEditor() {
  const editor = document.getElementById('annotationEditor');
  editor.hidden = true;
}

function saveAnnotation() {
  const card = currentCard();
  if (!card) return;

  const trixEditor = document.getElementById('annotationTrixEditor');
  const textarea = document.getElementById('annotationTextarea');
  const useTrix = typeof Trix !== 'undefined';
  const activeEditor = useTrix ? trixEditor : textarea;
  
  const note = activeEditor.value.trim();

  if (note) {
    // Add or update annotation
    markAnnotation(note);
  } else {
    // Remove annotation if empty
    removeAnnotation(card.id);
  }

  closeAnnotationEditor();
  render();
  
  // Autosave after annotation change
  try {
    const enabled = !!(settingsAutosave && settingsAutosave.checked);
    if (enabled) {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const snapshot = getFullSessionSnapshot();
      saveCheckpoint(snapshot);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const ms = Math.round(t1 - t0);
      console.log(`[autosave] ${ms}ms • annotation checkpoint ${snapshot?.id || ''} at`, new Date().toISOString());
      if (infoLastSave) infoLastSave.textContent = new Date().toLocaleString();
      if (infoSessionId) infoSessionId.textContent = snapshot?.id || '—';
    }
  } catch (e) { console.error('[autosave] failed', e); }
}

function clearAnnotation() {
  const trixEditor = document.getElementById('annotationTrixEditor');
  const textarea = document.getElementById('annotationTextarea');
  const useTrix = typeof Trix !== 'undefined';
  const activeEditor = useTrix ? trixEditor : textarea;
  
  activeEditor.value = '';
}

function removeAnnotation(cardId) {
  // Remove annotation from state
  state.session.annotation = state.session.annotation.filter(a => a.cardId !== cardId);
  
  // Remove annotation event from events
  state.session.events = state.session.events.filter(e => 
    !(e.type === 'annotation' && e.cardId === cardId)
  );
}

// Initialize handled in bootstrap via saved settings

// HSK Import Dialog Event Listeners
hskImportClose?.addEventListener('click', closeHskImportDialog);
hskImportCancel?.addEventListener('click', closeHskImportDialog);
hskImportStart?.addEventListener('click', startHskImportSession);

// Add change listeners for custom file checkboxes
document.addEventListener('DOMContentLoaded', () => {
  // Listen for dynamically added hsk-file checkboxes
  document.addEventListener('change', (event) => {
    if (event.target.classList.contains('hsk-file')) {
      const customFileCheckboxes = document.querySelectorAll('input.hsk-file');
      const selectedFiles = Array.from(customFileCheckboxes)
        .filter(c => c.checked)
        .map(c => c.value);
      updateHskImportSessionInfo(selectedFiles);
      if (hskImportStart) {
        hskImportStart.disabled = selectedFiles.length === 0;
      }
    }
  });
});

// Kick off
bootstrap();


