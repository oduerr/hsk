import { shuffle, clamp } from './util.js';

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
};

/**
 * Initialize a new shuffled run.
 * @param {Card[]} cards
 */
export function newRun(cards) {
  state.deck = cards.slice();
  state.order = shuffle([...Array(state.deck.length).keys()]);
  state.index = 0;
  state.face = 'front';
  state.mistakes = new Set();
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
}

export function markMistake() {
  const c = currentCard();
  if (!c) return;
  state.mistakes.add(c.id);
}

export function nextCard() {
  if (state.index < state.order.length) {
    state.index += 1;
  }
  state.face = 'front';
}

export function isFinished() {
  return state.index >= state.order.length;
}

export function setAutoReveal(enabled, seconds) {
  state.autoReveal = !!enabled;
  state.autoRevealSeconds = clamp(Number(seconds) || 0, 1, 60);
}


