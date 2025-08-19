# Actions Documentation

## Overview

All core state mutations are funneled through explicit action functions. This ensures consistent state management, proper event logging, and maintainable code.

## Action Functions

### Session Management

#### `newRun(cards, opts)`
- **Purpose**: Initialize a new study session
- **State Changes**:
  - `state.deck` ← `cards.slice()`
  - `state.order` ← shuffled indices
  - `state.index` ← 0
  - `state.face` ← 'front'
  - `state.mistakes` ← new Set()
  - `state.session` ← new session object
  - `state.session.events` ← ['start'] event
- **Event Logging**: 'start' event
- **Usage**: Starting new sessions, resetting current session

#### `resumeRun(full, opts)`
- **Purpose**: Resume an existing session from saved state
- **State Changes**:
  - `state.deck` ← `full.cards`
  - `state.order` ← `full.order`
  - `state.index` ← calculated progress
  - `state.face` ← 'front'
  - `state.mistakes` ← `full.mistakeIds`
  - `state.session` ← restored session data
- **Event Logging**: None (events already exist)
- **Usage**: Loading saved sessions, resuming checkpoints

#### `finalizeIfFinished()`
- **Purpose**: Mark session as complete when all cards are done
- **State Changes**:
  - `state.session.finishedAt` ← current timestamp
  - `state.session.events` ← 'finish' event
- **Event Logging**: 'finish' event
- **Returns**: `{ full, summary }` objects or `null`
- **Usage**: Session completion, export preparation

### Card Navigation

#### `nextCard()`
- **Purpose**: Advance to the next card in sequence
- **State Changes**:
  - `state.index` ← `state.index + 1`
  - `state.face` ← 'front'
- **Event Logging**: 'next' event
- **Usage**: Progress through session, card advancement

#### `prevCard()`
- **Purpose**: Go back to the previous card
- **State Changes**:
  - `state.index` ← `state.index - 1` (if > 0)
  - `state.face` ← 'front'
- **Event Logging**: None (no event for going back)
- **Usage**: Review previous cards, navigation

### Card Display

#### `reveal()`
- **Purpose**: Show the back face of the current card
- **State Changes**:
  - `state.face` ← 'back'
- **Event Logging**: 'reveal' event
- **Usage**: Show answer, card flipping

#### `unreveal()`
- **Purpose**: Hide the back face, return to front
- **State Changes**:
  - `state.face` ← 'front'
- **Event Logging**: 'unreveal' event
- **Usage**: Hide answer, return to question

### Mistake Management

#### `markMistake()`
- **Purpose**: Mark the current card as a mistake
- **State Changes**:
  - `state.mistakes.add(card.id)`
- **Event Logging**: 'mistake' event with card ID
- **Usage**: Learning feedback, session tracking

#### `unmarkMistake()`
- **Purpose**: Remove mistake mark from current card
- **State Changes**:
  - `state.mistakes.delete(card.id)`
- **Event Logging**: 'unmistake' event with card ID
- **Usage**: Correcting mistakes, learning progress

### Annotation System

#### `markAnnotation(note)`
- **Purpose**: Add or update a note for the current card
- **State Changes**:
  - `state.session.annotation` ← add/update entry
  - `state.session.events` ← 'annotation' event
- **Event Logging**: 'annotation' event with note
- **Usage**: Study notes, personal reminders

#### `removeAnnotation(cardId)`
- **Purpose**: Remove annotation from a specific card
- **State Changes**:
  - `state.session.annotation` ← filter out entry
  - `state.session.events` ← filter out annotation events
- **Event Logging**: None (removes existing events)
- **Usage**: Clean up notes, annotation management

### Card Management

#### `removeCard()`
- **Purpose**: Remove the current card from the session
- **State Changes**:
  - `state.deck` ← remove card
  - `state.order` ← remove and adjust indices
  - `state.index` ← adjust if needed
  - `state.face` ← 'front'
  - `state.mistakes` ← remove card ID
  - `state.session.annotation` ← remove annotations
  - `state.session.events` ← 'remove' event
- **Event Logging**: 'remove' event
- **Returns**: `boolean` (success/failure)
- **Usage**: Session customization, card filtering

### Configuration

#### `setAutoReveal(enabled, seconds)`
- **Purpose**: Configure automatic card revelation
- **State Changes**:
  - `state.autoReveal` ← `!!enabled`
  - `state.autoRevealSeconds` ← clamped seconds
- **Event Logging**: None (configuration change)
- **Usage**: Timer settings, study preferences

### Utility Functions

#### `currentCard()`
- **Purpose**: Get the current card object
- **State Changes**: None (read-only)
- **Returns**: `Card | null`
- **Usage**: UI rendering, card information

#### `isFinished()`
- **Purpose**: Check if session is complete
- **State Changes**: None (read-only)
- **Returns**: `boolean`
- **Usage**: Session state checks, UI updates

#### `getFullSessionSnapshot()`
- **Purpose**: Create complete session backup
- **State Changes**: None (read-only)
- **Returns**: Session snapshot object
- **Usage**: Export, backup, session analysis

## Event Logging

All actions that represent user interactions or significant state changes log events:

- **User Actions**: `start`, `next`, `reveal`, `unreveal`, `mistake`, `unmistake`, `annotation`, `remove`
- **System Events**: `finish`
- **Event Properties**: `type`, `at` (timestamp), `index`, `cardId` (when applicable), `note` (for annotations)

## State Mutation Rules

1. **No direct state writes outside actions**
2. **All state changes go through named action functions**
3. **Actions are atomic and consistent**
4. **Events are logged for replay and analysis**
5. **UI handlers call actions only, never mutate state directly**

## Benefits

- **Consistency**: All state changes follow the same pattern
- **Maintainability**: State logic is centralized in actions
- **Debuggability**: Actions provide clear entry points for state changes
- **Replay**: Event logging enables session replay and analysis
- **Testing**: Actions can be tested independently with mock state
