import { shuffle, clamp, fnv1a32 } from './util.js';

/**
 * Simple state container for a run (Round 1 scope: in-memory only).
 */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} hanzi
 * @property {string} pinyin
 * @property {string} english
 */

/**
 * @typedef {Object} RunState
 * @property {Card[]} deck
 * @property {number[]} order
 * @property {number} index
 * @property {'front'|'back'} face
 * @property {Set<string>} mistakes
 * @property {boolean} autoReveal
 * @property {number} autoRevealSeconds
 */

/** @type {RunState} */
export let state = {
  deck: [],
  order: [],
  index: 0,
  face: 'front',
  mistakes: new Set(),
  autoReveal: false,
  autoRevealSeconds: 5,
  levelLabel: '',
  session: {
    id: '',
    startedAt: '',
    finishedAt: null,
    events: [],
    replayOf: null,
    annotation: [],
  },
};

/**
 * Initialize a new shuffled run.
 * @param {Card[]} cards
 */
export function newRun(cards, opts = { replayOf: null }) {
  state.deck = cards.slice();
  state.order = shuffle([...Array(state.deck.length).keys()]);
  state.index = 0;
  state.face = 'front';
  state.mistakes = new Set();
  const startedAt = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2);
  state.session = {
    id: fnv1a32(`${startedAt}|${cards.length}|${salt}`),
    startedAt,
    finishedAt: null,
    events: [
      { type: 'start', at: startedAt, index: 0 },
    ],
    replayOf: opts?.replayOf || null,
    annotation: [],
  };
}

/**
 * Current card or null if done.
 * @returns {Card|null}
 */
export function currentCard() {
  if (state.index < 0 || state.index >= state.order.length) return null;
  const deckIdx = state.order[state.index];
  return state.deck[deckIdx] || null;
}

export function reveal() {
  if (state.face === 'back') return;
  state.face = 'back';
  logEvent('reveal');
}

export function unreveal() {
  if (state.face === 'front') return;
  state.face = 'front';
  logEvent('unreveal');
}

export function markMistake() {
  const c = currentCard();
  if (!c) return;
  state.mistakes.add(c.id);
  logEvent('mistake', c.id);
}

export function unmarkMistake() {
  const c = currentCard();
  if (!c) return;
  if (state.mistakes.has(c.id)) {
    state.mistakes.delete(c.id);
    logEvent('unmistake', c.id);
  }
}

export function prevCard() {
  if (state.index > 0) {
    state.index -= 1;
    state.face = 'front';
  }
}

export function nextCard() {
  logEvent('next');
  if (state.index < state.order.length) state.index += 1;
  state.face = 'front';
}

export function isFinished() {
  return state.index >= state.order.length;
}

export function setAutoReveal(enabled, seconds) {
  state.autoReveal = !!enabled;
  state.autoRevealSeconds = clamp(Number(seconds) || 0, 1, 60);
}

function logEvent(type, cardId) {
  const at = new Date().toISOString();
  const evt = { type, at, index: state.index };
  if (cardId) evt.cardId = cardId;
  state.session.events.push(evt);
}

/**
 * Mark current card with annotation and optional note.
 * @param {string} [note]
 */
export function markAnnotation(note = '') {
  const c = currentCard();
  if (!c) return;
  const at = new Date().toISOString();
  // Keep one entry per card id; update note/time if exists
  const arr = Array.isArray(state.session.annotation) ? state.session.annotation : (state.session.annotation = []);
  const idx = arr.findIndex((x) => x && x.cardId === c.id);
  const entry = { cardId: c.id, at, note: String(note || '') };
  if (idx >= 0) arr[idx] = entry; else arr.push(entry);
  // Log event
  state.session.events.push({ type: 'annotation', at, index: state.index, cardId: c.id, note: String(note || '') });
}

/**
 * If finished and not yet finalized, finalize and return { full, summary }.
 * Otherwise returns null.
 */
export function finalizeIfFinished() {
  if (!isFinished()) return null;
  if (state.session.finishedAt) return null;
  const finishedAt = new Date().toISOString();
  state.session.finishedAt = finishedAt;
  state.session.events.push({ type: 'finish', at: finishedAt, index: state.index });

  const mistakeIds = Array.from(state.mistakes);
  const full = {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt,
    cards: state.deck,
    order: state.order,
    events: state.session.events,
    mistakeIds,
    annotation: Array.isArray(state.session.annotation) ? state.session.annotation.slice() : [],
    counts: { total: state.order.length, mistakes: mistakeIds.length },
  };
  const summary = {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt,
    mistakeIds,
    annotationCount: Array.isArray(state.session.annotation) ? state.session.annotation.length : 0,
    counts: { total: state.order.length, mistakes: mistakeIds.length },
  };
  return { full, summary };
}

/**
 * Build a full-session snapshot of the current in-memory run (finished or not).
 */
export function getFullSessionSnapshot() {
  const mistakeIds = Array.from(state.mistakes);
  return {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt: state.session.finishedAt || null,
    cards: state.deck,
    order: state.order,
    events: state.session.events.slice(),
    mistakeIds,
    annotation: Array.isArray(state.session.annotation) ? state.session.annotation.slice() : [],
    counts: { total: state.order.length, mistakes: mistakeIds.length },
  };
}

/**
 * Resume an in-progress run from a saved full-session snapshot.
 * @param {any} full
 * @param {{ replayOf?: string|null }} [opts]
 */
export function resumeRun(full, opts = {}) {
  state.deck = Array.isArray(full?.cards) ? full.cards.slice() : [];
  state.order = Array.isArray(full?.order) ? full.order.slice() : [];
  const progressed = Array.isArray(full?.events)
    ? full.events.filter((e) => e && e.type === 'next').length
    : 0;
  state.index = Math.min(progressed, state.order.length);
  state.face = 'front';
  state.mistakes = new Set(Array.isArray(full?.mistakeIds) ? full.mistakeIds : []);
  state.session.annotation = Array.isArray(full?.annotation) ? full.annotation.slice() : [];
  const startedAt = full?.startedAt || new Date().toISOString();
  state.session = {
    id: full?.id || fnv1a32(`${startedAt}|${state.deck.length}|resume`),
    startedAt,
    finishedAt: null,
    events: Array.isArray(full?.events) ? full.events.slice() : [{ type: 'start', at: startedAt, index: 0 }],
    replayOf: opts?.replayOf || null,
    annotation: Array.isArray(full?.annotation) ? full.annotation.slice() : [],
  };
}




