# State Structure Documentation

## Core State (Managed by Actions)

The core application state that should only be modified through explicit action functions.

### `state.deck`
- **Type**: `Card[]`
- **Purpose**: Array of vocabulary cards loaded for the current session
- **Actions**: `newRun()`, `resumeRun()`, `removeCard()`
- **UI Access**: Read-only for display purposes

### `state.order`
- **Type**: `number[]`
- **Purpose**: Shuffled indices defining the card presentation order
- **Actions**: `newRun()`, `resumeRun()`, `removeCard()`
- **UI Access**: Read-only for navigation logic

### `state.index`
- **Type**: `number`
- **Purpose**: Current position in the card sequence
- **Actions**: `newRun()`, `nextCard()`, `prevCard()`, `resumeRun()`, `removeCard()`
- **UI Access**: Read-only for progress display

### `state.face`
- **Type**: `'front' | 'back'`
- **Purpose**: Current card face being displayed
- **Actions**: `newRun()`, `reveal()`, `unreveal()`, `nextCard()`, `prevCard()`, `resumeRun()`, `removeCard()`
- **UI Access**: Read-only for rendering decisions

### `state.mistakes`
- **Type**: `Set<string>`
- **Purpose**: Set of card IDs marked as mistakes
- **Actions**: `newRun()`, `markMistake()`, `unmarkMistake()`, `resumeRun()`, `removeCard()`
- **UI Access**: Read-only for mistake display

### `state.autoReveal`
- **Type**: `boolean`
- **Purpose**: Whether cards automatically reveal after a timer
- **Actions**: `setAutoReveal()`
- **UI Access**: Read-only for timer logic

### `state.autoRevealSeconds`
- **Type**: `number`
- **Purpose**: Seconds to wait before auto-revealing cards
- **Actions**: `setAutoReveal()`
- **UI Access**: Read-only for timer logic

### `state.levelLabel`
- **Type**: `string`
- **Purpose**: Human-readable label for the current vocabulary level
- **Actions**: `newRun()`, `resumeRun()`
- **UI Access**: Read-only for display

### `state.session`
- **Type**: `SessionState`
- **Purpose**: Complete session tracking and metadata
- **Actions**: `newRun()`, `resumeRun()`, `finalizeIfFinished()`
- **UI Access**: Read-only for session info display

#### `state.session.id`
- **Type**: `string`
- **Purpose**: Unique identifier for the current session
- **Actions**: `newRun()`, `resumeRun()`

#### `state.session.startedAt`
- **Type**: `string`
- **Purpose**: ISO timestamp when session began
- **Actions**: `newRun()`, `resumeRun()`

#### `state.session.finishedAt`
- **Type**: `string | null`
- **Purpose**: ISO timestamp when session completed (null if ongoing)
- **Actions**: `finalizeIfFinished()`

#### `state.session.events`
- **Type**: `Event[]`
- **Purpose**: Chronological log of all user actions and state changes
- **Actions**: `logEvent()` (internal), various actions add events
- **UI Access**: Read-only for session replay and analysis

#### `state.session.replayOf`
- **Type**: `string | null`
- **Purpose**: ID of session being replayed (null for new sessions)
- **Actions**: `newRun()`, `resumeRun()`

#### `state.session.annotation`
- **Type**: `Annotation[]`
- **Purpose**: User notes attached to specific cards
- **Actions**: `markAnnotation()`, `removeAnnotation()`, `removeCard()`
- **UI Access**: Read-only for annotation display

## UI-Local State (May be mutated directly)

These state elements are transient UI state that can be modified directly without going through actions.

### Dialog visibility states
- Modal `hidden` attributes
- Dropdown open/closed states
- Form input values

### CSS classes and styles
- Element visibility toggles
- Animation states
- Theme-related classes

### Temporary form data
- Input field values before submission
- File selection states
- Validation error messages

## State Mutation Rules

1. **Core state must only be modified through action functions**
2. **UI-local state may be modified directly**
3. **All state changes should be logged via events when appropriate**
4. **State mutations should be atomic and consistent**
5. **External modules should only read state, never write to it directly**

## Action Functions

All core state mutations are funneled through these action functions:

- `newRun(cards, opts)` - Initialize new session
- `resumeRun(full, opts)` - Resume existing session
- `nextCard()` - Advance to next card
- `prevCard()` - Go to previous card
- `reveal()` - Show card back
- `unreveal()` - Show card front
- `markMistake()` - Mark current card as mistake
- `unmarkMistake()` - Remove mistake mark
- `markAnnotation(note)` - Add note to current card
- `removeAnnotation(cardId)` - Remove note from card
- `removeCard()` - Remove current card from session
- `setAutoReveal(enabled, seconds)` - Configure auto-reveal
- `finalizeIfFinished()` - Mark session as complete
- `getFullSessionSnapshot()` - Create session backup
- `currentCard()` - Get current card object
- `isFinished()` - Check if session is complete
