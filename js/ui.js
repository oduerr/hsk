import { formatSeconds } from './util.js';
import { state, currentCard, isFinished } from './state.js';

const el = {
  message: /** @type {HTMLElement} */ (document.getElementById('message')),
  card: /** @type {HTMLElement} */ (document.getElementById('card')),
  mistakeBadge: /** @type {HTMLElement} */ (document.getElementById('mistakeBadge')),
  front: /** @type {HTMLElement} */ (document.getElementById('cardFront')),
  back: /** @type {HTMLElement} */ (document.getElementById('cardBack')),
  english: /** @type {HTMLElement} */ (document.getElementById('englishText')),
  hanzi: /** @type {HTMLElement} */ (document.getElementById('hanziText')),
  pinyin: /** @type {HTMLElement} */ (document.getElementById('pinyinText')),
  englishSmall: /** @type {HTMLElement} */ (document.getElementById('englishSmall')),
  countdown: /** @type {HTMLElement} */ (document.getElementById('countdown')),
  progressText: /** @type {HTMLElement} */ (document.getElementById('progressText')),
  topInfo: /** @type {HTMLElement} */ (document.getElementById('topInfo')),
  progressFill: /** @type {HTMLElement} */ (document.getElementById('progressFill')),
  mistakesText: /** @type {HTMLElement} */ (document.getElementById('mistakesText')),
  replayTag: /** @type {HTMLElement} */ (document.getElementById('replayTag')),
  btnReveal: /** @type {HTMLButtonElement} */ (document.getElementById('btnReveal')),
  btnNext: /** @type {HTMLButtonElement} */ (document.getElementById('btnNext')),
  btnMistake: /** @type {HTMLButtonElement} */ (document.getElementById('btnMistakeToggle') || document.getElementById('btnMistake')),
  btnCardMistakeToggle: /** @type {HTMLButtonElement} */ (document.getElementById('btnCardMistakeToggle')),
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
  setCardHidden(false);
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

  // Mistake highlighting for current card
  const isMistake = !!(card && state.mistakes.has(card.id));
  if (isMistake) {
    el.card.setAttribute('data-mistake', '1');
    el.mistakeBadge.hidden = false;
    if (el.btnMistake) el.btnMistake.textContent = 'Mark Correct';
    if (el.btnCardMistakeToggle) { el.btnCardMistakeToggle.textContent = 'Mark Correct'; el.btnCardMistakeToggle.hidden = false; }
  } else {
    el.card.removeAttribute('data-mistake');
    el.mistakeBadge.hidden = true;
    if (el.btnMistake) el.btnMistake.textContent = 'Mistake';
    if (el.btnCardMistakeToggle) { el.btnCardMistakeToggle.textContent = 'Mistake'; el.btnCardMistakeToggle.hidden = state.face !== 'back'; }
  }

  if (state.session.replayOf) {
    el.replayTag.hidden = false;
    el.replayTag.textContent = `Replay of ${state.session.replayOf}`;
  } else {
    el.replayTag.hidden = true;
  }

  // Card small toggle only visible on back face (mobile helper)
  if (el.btnCardMistakeToggle) {
    el.btnCardMistakeToggle.hidden = state.face !== 'back';
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
  // Get session name from summary instead of state
  let sessionDisplay = '';
  
  // Try to get name from session summary first
  try {
    const summaries = loadSessionSummaries();
    const currentSummary = summaries.find(s => s.id === state.session.id);
    if (currentSummary && currentSummary.name) {
      sessionDisplay = currentSummary.name;
    } else if (state.session.id) {
      sessionDisplay = state.session.id;
    } else if (state.levelLabel) {
      sessionDisplay = state.levelLabel;
    }
  } catch (e) {
    // Fallback to session ID or level label
    if (state.session.id) {
      sessionDisplay = state.session.id;
    } else if (state.levelLabel) {
      sessionDisplay = state.levelLabel;
    }
  }
  
  const prefix = sessionDisplay ? `${sessionDisplay} · ` : '';
  el.progressText.textContent = `${prefix}${current} / ${total}`;
  if (el.topInfo) {
    el.topInfo.textContent = `${sessionDisplay || ''}  |  ${current} / ${total}  |  Mistakes: ${state.mistakes.size}`.trim();
  }
  if (el.progressFill && total > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
    el.progressFill.style.width = pct + '%';
  }
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


