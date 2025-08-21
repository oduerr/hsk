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
  deck: [], // Called cards in JSON file
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
    lastPlayedAt: '',
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
    lastPlayedAt: startedAt,
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
  // Update lastPlayedAt for any user action
  state.session.lastPlayedAt = at;
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
  // Update lastPlayedAt for annotation action
  state.session.lastPlayedAt = at;
}

/**
 * Update session metadata (name, ID) - used by external modules
 * @param {string} name - Session name
 * @param {string} id - Session ID
 */
export function updateSessionMetadata(name, id) {
  if (name !== undefined) {
    state.session.name = name;
  }
  if (id !== undefined) {
    state.session.id = id;
  }
}

/**
 * Update level label - used by vocabulary manager
 * @param {string} label - New level label
 */
export function setLevelLabel(label) {
  state.levelLabel = label;
}

/**
 * Set session locale - used by vocabulary manager
 * @param {string} locale - BCP-47 locale identifier
 */
export function setSessionLocale(locale) {
  state.sessionLocale = locale;
}

/**
 * Remove annotation from a specific card by ID
 * @param {string} cardId - ID of card to remove annotation from
 */
export function removeAnnotation(cardId) {
  // Remove annotation from state
  if (Array.isArray(state.session.annotation)) {
    state.session.annotation = state.session.annotation.filter(a => a.cardId !== cardId);
  }
  
  // Remove annotation events from events array
  state.session.events = state.session.events.filter(e => 
    !(e.type === 'annotation' && e.cardId === cardId)
  );
}

/**
 * Remove the current card from the session.
 * This will clean up all references to the card and adjust the session state.
 * @returns {boolean} true if card was removed, false if no card to remove
 */
export function removeCard() {
  const c = currentCard();
  if (!c) return false;
  
  const at = new Date().toISOString();
  const cardId = c.id;
  
  // Log the removal event
  state.session.events.push({ 
    type: 'remove', 
    at, 
    index: state.index, 
    cardId: cardId 
  });
  
  // Remove from mistakes set
  state.mistakes.delete(cardId);
  
  // Remove annotations
  if (Array.isArray(state.session.annotation)) {
    state.session.annotation = state.session.annotation.filter(a => a.cardId !== cardId);
  }
  
  // Find the card's position in the deck
  const deckIndex = state.deck.findIndex(card => card.id === cardId);
  if (deckIndex !== -1) {
    // Remove the card from the deck
    state.deck.splice(deckIndex, 1);
    
    // Find and remove the corresponding entry from the order array
    // The order array contains indices that reference deck positions
    const orderIndex = state.order.findIndex(orderIndex => orderIndex === deckIndex);
    if (orderIndex !== -1) {
      state.order.splice(orderIndex, 1);
      
      // Adjust all remaining order indices to account for the deck shift
      // Since we removed an element from the deck, all indices after deckIndex need to be decremented
      state.order.forEach((orderIndex, i) => {
        if (orderIndex > deckIndex) {
          state.order[i] = orderIndex - 1;
        }
      });
      
      // Adjust all events that reference indices after the removed card
      state.session.events.forEach(event => {
        if (event.index > orderIndex) {
          event.index--;
        }
      });
      
      // Adjust current index if needed
      if (state.index >= orderIndex) {
        if (state.index > 0) {
          state.index--;
        } else if (state.order.length > 0) {
          state.index = 0;
        } else {
          state.index = -1; // No more cards
        }
      }
    }
  }
  
  // Reset face to front if we're now at a new card
  state.face = 'front';
  
  // Ensure index is valid
  if (state.order.length === 0) {
    state.index = -1; // No more cards
  } else if (state.index >= state.order.length) {
    state.index = state.order.length - 1; // Adjust to last card
  }
  
  return true;
}

/**
 * If finished and not yet finalized, finalize and return { full, summary }.
 * Otherwise returns null.
 */
export function createFullSessionSnapshot() {
  console.log('createFullSessionSnapshot', state.session.id);
  // Allow snapshot anytime; if truly finished and not yet marked, finalize timestamps
  if (!state.session.finishedAt && isFinished()) {
    const finishedAt = new Date().toISOString();
    state.session.finishedAt = finishedAt;
    state.session.events.push({ type: 'finish', at: finishedAt, index: state.index });
  }

  const mistakeIds = Array.from(state.mistakes);
  const removedCount = state.session.events.filter(e => e.type === 'remove').length;
  const full = {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt: state.session.finishedAt || null,
    cards: state.deck,
    order: state.order,
    events: state.session.events,
    mistakeIds,
    annotation: Array.isArray(state.session.annotation) ? state.session.annotation.slice() : [],
    lastPlayedAt: state.session.lastPlayedAt,
    counts: { 
      total: state.order.length, 
      mistakes: mistakeIds.length,
      removed: removedCount
    },
  };
  const summary = {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt: state.session.finishedAt || null,
    mistakeIds,
    annotationCount: Array.isArray(state.session.annotation) ? state.session.annotation.length : 0,
    lastPlayedAt: state.session.lastPlayedAt,
    locale: state.sessionLocale,
    name: state.session.name || null,
    counts: { 
      total: state.order.length, 
      mistakes: mistakeIds.length,
      removed: removedCount
    },
  };
  return { full, summary };
}

/**
 * Build a full-session snapshot of the current in-memory run (finished or not).
 */
export function getFullSessionSnapshot() {
  const mistakeIds = Array.from(state.mistakes);
  const removedCount = state.session.events.filter(e => e.type === 'remove').length;
  return {
    id: state.session.id,
    startedAt: state.session.startedAt,
    finishedAt: state.session.finishedAt || null,
    cards: state.deck,
    order: state.order,
    events: state.session.events.slice(),
    mistakeIds,
    annotation: Array.isArray(state.session.annotation) ? state.session.annotation.slice() : [],
    lastPlayedAt: state.session.lastPlayedAt,
    name: state.session.name || null,
    counts: { 
      total: state.order.length, 
      mistakes: mistakeIds.length,
      removed: removedCount
    },
  };
}

/**
 * Resume an in-progress run from a saved full-session snapshot.
 * @param {any} full
 * @param {{ replayOf?: string|null }} [opts]
 */
export async function resumeRun(full, opts = {}) {
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
    lastPlayedAt: full?.lastPlayedAt || startedAt,
  };
  // Restore metadata held outside full sessions
  state.sessionLocale = state.sessionLocale;
  if (typeof full?.name === 'string') {
    state.session.name = full.name;
  }
  
  // Auto-save the loaded session so it appears in the replay list
  // This ensures imported/loaded sessions are automatically available for replay
  try {
    const { saveSessionSummary } = await import('./storage.js');
    const summary = {
      id: state.session.id,
      startedAt: state.session.startedAt,
      finishedAt: null,
      mistakeIds: Array.from(state.mistakes),
      counts: { 
        total: state.order.length, 
        mistakes: state.mistakes.size,
        removed: state.session.events.filter(e => e.type === 'remove').length
      },
      inProgress: true,
      lastPlayedAt: state.session.lastPlayedAt,
      locale: state.sessionLocale,
      name: full?.name || null
    };
    saveSessionSummary(summary);
  } catch (err) {
    console.warn('Failed to auto-save loaded session:', err);
  }
}




