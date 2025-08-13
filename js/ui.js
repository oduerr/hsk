import { formatSeconds } from './util.js';
import { state, currentCard, isFinished } from './state.js';

const el = {
  message: /** @type {HTMLElement} */ (document.getElementById('message')),
  card: /** @type {HTMLElement} */ (document.getElementById('card')),
  front: /** @type {HTMLElement} */ (document.getElementById('cardFront')),
  back: /** @type {HTMLElement} */ (document.getElementById('cardBack')),
  english: /** @type {HTMLElement} */ (document.getElementById('englishText')),
  hanzi: /** @type {HTMLElement} */ (document.getElementById('hanziText')),
  pinyin: /** @type {HTMLElement} */ (document.getElementById('pinyinText')),
  englishSmall: /** @type {HTMLElement} */ (document.getElementById('englishSmall')),
  countdown: /** @type {HTMLElement} */ (document.getElementById('countdown')),
  progressText: /** @type {HTMLElement} */ (document.getElementById('progressText')),
  mistakesText: /** @type {HTMLElement} */ (document.getElementById('mistakesText')),
  replayTag: /** @type {HTMLElement} */ (document.getElementById('replayTag')),
  btnReveal: /** @type {HTMLButtonElement} */ (document.getElementById('btnReveal')),
  btnNext: /** @type {HTMLButtonElement} */ (document.getElementById('btnNext')),
  btnMistake: /** @type {HTMLButtonElement} */ (document.getElementById('btnMistake')),
};

/**
 * Render the UI based on state.
 */
export function render() {
  const card = currentCard();
  const done = isFinished();

  if (!card && !done) {
    showMessage('No cards loaded.');
    setCardHidden(true);
    setActionsDisabled(true);
    setProgress(0, 0);
    return;
  }

  if (done) {
    setMessage(`Finished! Mistakes: ${state.mistakes.size}`);
    setCardHidden(true);
    setActionsDisabled(true);
    setProgress(state.order.length, state.order.length);
    hideCountdown();
    return;
  }

  clearMessage();
  setActionsDisabled(false);
  setProgress(state.index + 1, state.order.length);
  setMistakes(state.mistakes.size);

  if (state.face === 'front') {
    el.front.hidden = false;
    el.back.hidden = true;
    el.english.textContent = card.english || '—';
  } else {
    el.front.hidden = true;
    el.back.hidden = false;
    el.hanzi.textContent = card.hanzi || '—';
    el.pinyin.textContent = card.pinyin || '—';
    el.englishSmall.textContent = card.english || '—';
  }

  if (state.session.replayOf) {
    el.replayTag.hidden = false;
    el.replayTag.textContent = `Replay of ${state.session.replayOf}`;
  } else {
    el.replayTag.hidden = true;
  }
}

export function showMessage(text) {
  el.message.textContent = text;
  el.message.hidden = false;
}

export function setMessage(text) { showMessage(text); }
export function clearMessage() { el.message.hidden = true; }

function setCardHidden(hidden) {
  el.card.hidden = hidden;
}

function setActionsDisabled(disabled) {
  el.btnReveal.disabled = disabled;
  el.btnNext.disabled = disabled;
  el.btnMistake.disabled = disabled;
}

function setProgress(current, total) {
  el.progressText.textContent = `${current} / ${total}`;
}

function setMistakes(count) {
  el.mistakesText.textContent = `Mistakes: ${count}`;
}

export function showCountdown(seconds) {
  el.countdown.hidden = false;
  el.countdown.textContent = formatSeconds(seconds);
}

export function updateCountdown(seconds) {
  el.countdown.textContent = formatSeconds(seconds);
}

export function hideCountdown() {
  el.countdown.hidden = true;
}

export function flashMistake() {
  el.card.classList.remove('shake');
  // force reflow
  void el.card.offsetWidth;
  el.card.classList.add('shake');
}


