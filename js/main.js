import { fetchCsvText, parseCsv, rowsToCards } from './data.js';
import { state, newRun, reveal, nextCard, markMistake, setAutoReveal } from './state.js';
import { render, showCountdown, updateCountdown, hideCountdown, flashMistake } from './ui.js';

const PATH = './data/hsk5.csv';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const btnReveal = /** @type {HTMLButtonElement} */($('btnReveal'));
const btnNext = /** @type {HTMLButtonElement} */($('btnNext'));
const btnMistake = /** @type {HTMLButtonElement} */($('btnMistake'));
const btnNewRun = /** @type {HTMLButtonElement} */($('btnNewRun'));
const autoToggle = /** @type {HTMLInputElement} */($('autoRevealToggle'));
const autoSeconds = /** @type {HTMLInputElement} */($('autoRevealSeconds'));

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
    const csvText = await fetchCsvText(PATH);
    const rows = parseCsv(csvText);
    const cards = rowsToCards(rows);
    console.log('Parsed cards:', cards.slice(0, 5), `... total=${cards.length}`);
    if (!cards.length) {
      console.error('No cards parsed. Check CSV file.');
    }
    newRun(cards);
    render();
    startCountdownIfNeeded();
  } catch (err) {
    console.error(err);
    const msg = $('message');
    msg.textContent = `Error: ${(err && err.message) || String(err)}`;
    msg.hidden = false;
  }
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
}

function onMistake() {
  markMistake();
  flashMistake();
}

function onNewRun() {
  // Re-bootstrap using same deck we already loaded in state.deck
  if (!state.deck.length) return;
  newRun(state.deck);
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
    onNewRun();
  }
}

btnReveal.addEventListener('click', onReveal);
btnNext.addEventListener('click', onNext);
btnMistake.addEventListener('click', onMistake);
btnNewRun.addEventListener('click', onNewRun);
autoToggle.addEventListener('change', onAutoToggleChanged);
autoSeconds.addEventListener('change', onSecondsChanged);
window.addEventListener('keydown', onKeyDown, { passive: false });

// Initialize default auto reveal settings in state from UI controls
setAutoReveal(autoToggle.checked, parseInt(autoSeconds.value || '5', 10));

// Kick off
bootstrap();


