# HSK5 Flashcard Game – Specification v1

A standalone, offline-capable **HTML + JavaScript** flashcard app for Chinese–English HSK5 (and later also other HSK levels) vocabulary. 
No build tools or servers required; open `index.html` locally.

---

## 1) Goals & Scope
- **Front-first flow**: Show **English definition**; on reveal, show **Han characters + Pinyin**.
- **Mistake capture**: User can mark a card as **mistake** within a run; mistakes logged to a **session record**.
- **Replay**: User can replay **only mistaken cards** from a selected past session and record a new session.
- **Local only**: Data stays in browser (**LocalStorage**), with optional **export/import** JSON for portability.
- **Lightweight**: Pure HTML/CSS/JS (ES modules ok). No frameworks required.

**Out of scope (v1)**: audio TTS, spaced repetition scheduling, accounts, syncing across devices.

---

## 2) Data Source
- Primary source: CSV in repo (e.g., `data/hsk5.csv` choosable), with columns:
  - `hanzi` (Chinese characters)
  - `pinyin` (tone-marked pinyin with spaces; optional raw syllables)
  - `english` (gloss/definition; if multiple senses, semicolon separated)

**Example rows** (normalized from the provided file):
```
hanzi,pinyin,english
唉,āi,interjection or grunt of agreement
爱护,ài hù,to cherish
爱惜,ài xī,to cherish
爱心,ài xīn,compassion
安慰,ān wèi,to comfort
安装,ān zhuāng,to install
岸,àn,bank
把握,bǎ wò,to grasp (also fig.)
摆,bǎi,to arrange
班主任,bān zhǔ rèn,teacher in charge of a class
```

**Parsing**: Use a lightweight CSV parser (small embedded function or adapted parser) that supports quoted fields and UTF‑8.

**Normalization**: Trim whitespace; collapse multiple spaces in `pinyin` to single spaces; keep tone marks.

---

## 3) Definitions
- **Card**: `{ id, hanzi, pinyin, english }` where `id` is a stable hash of `hanzi|pinyin|english`.
- **Run**: A traversal of a card set (default: all cards) in shuffled order.
- **Session**: Persistent record of a run: order, timestamps, user actions, mistakes.
- **Replay**: A run constructed from the subset of cards marked mistaken in a past session.

---

## 4) User Stories
1. As a learner, I see an **English prompt** and can **reveal** the Chinese answer.
2. I can **mark** a card as **mistake** (e.g., if I guessed wrong) and continue.
3. I can **restart** with a fresh shuffle or **replay mistakes** from a past session.

---

## 5) UI/UX
**Layout (desktop & mobile):**
- Top bar: dataset picker (if multiple), buttons: *New Run*, *Replay…*, *Export*, *Import*, *Help*.
- Center card panel:
  - **Front** (default): large English text.
  - **Back** (after reveal): large Hanzi; below it, pinyin; small English (for reference) optional.
- Bottom controls:
  - Buttons: **Reveal**, **Mistake**, **Next**, **Undo** (v1.1); a small **timer** indicator; progress `current / total`.
- Minimal CSS for readability; large fonts; high contrast.

**Keyboard shortcuts:**
- `Space` or `Enter` → Reveal (if hidden) / Next (if revealed)
- `M` → Mark mistake
- `N` → Next
- `R` → New run (confirm dialogue)
- `L` → Open Replay dialog


**Persistence (LocalStorage):**
- `hsk.flash.sessions` → array of Session summaries (id, startedAt, counts, mistakeIds)
- `hsk.flash.session.<id>` → full Session JSON
- `hsk.flash.settings` → `{ timerEnabled, timerSeconds, lastCsvHash }`

**Replay construction:**
- Given a Session ID, compute the set of `mistakeIds` in that session; construct a new `deck` by filtering `cards` to those IDs, shuffle, then start a new run.

---

## 7) Core Flows (Pseudo)
**New Run**
```
loadCSV → parse cards → deck
order ← shuffle(range(deck.length))
idx ← 0; face ← 'front'; create Session(); start timer if enabled
render()
```
**Reveal**
```
face ← 'back'; log({type:'reveal', cardId})
render()
```
**Mistake**
```
log({type:'mistake', cardId})
flash UI feedback (e.g., shake)
```
**Next**
```
log({type:'next', cardId}); idx++;
if idx >= order.length → finish Session(); offer replay
else face ← 'front'; (re)start timer if enabled; render()
```
**Replay**
```
select sessionId → load session → mistakeIds
if empty → notify; else deck ← session.cards.filter(in mistakeIds)
start New Run with note {replayOf: sessionId}
```

---

## 8) Error Handling & Edge Cases
- CSV fails to load → show inline error with instruction to place `data/hsk5.csv`.
- Duplicate rows → de-dupe by `id` (first occurrence wins).
- Empty deck or empty mistakes on replay → disable run/replay buttons accordingly.
- LocalStorage full → prompt user to **Export & Clear** old sessions.
- Back/forward browser navigation → prevent unload during active run (`beforeunload`).

---

## 9) Files & Structure
```
/ (repo root)
  index.html
  /js
    main.js           // boot, event wiring
    data.js           // csv fetch & parse, hash, normalize
    state.js          // state machine, session logging, storage
    ui.js             // render card, toolbar, controls, countdown
    util.js           // shuffle, id/hash (e.g., FNV-1a), formatters
  /css
    style.css
  /data
    hsk5.csv
```


## 12) Rounds of Implementation

### Round 0 – Setup
- Use sample `data/hsk5.csv`.
- Implement CSV loader + basic parser.
- Render a single card (English only).

**Exit criteria:** English shows from first row; console logs parsed array.

### Round 1 – MVP Run
- Shuffle order; state machine for `front/back`.
- Buttons + keyboard: Reveal, Next, Mistake.
- Auto-reveal toggle + seconds input (basic setInterval + visual countdown).
- Progress indicator `n / N`.

**Exit criteria:** Can complete a full run; reveal works; mistakes counted in memory.

### Round 2 – Session Recording
- Session object with events/timestamps.
- Persist full session + summary in LocalStorage.
- Export all sessions as `flash_sessions_YYYYMMDD.json`.

**Exit criteria:** After a run, data visible in LocalStorage; export file contains events and mistakes.

### Round 3 – Replay Mode
- Dialog listing past sessions (most recent first: id, date, mistakes count).
- If mistakes > 0 → construct deck from mistaken cards and start replay-run.
- Tag UI with `Replay of <sessionId>`.

**Exit criteria:** Can select a session, replay only its mistakes, finish a replay-run.

### Round 3.5 Replay Mode Clarification
A) “Built-in” replay from LocalStorage (default)
	•	Every run writes a session summary + full session JSON to LocalStorage.
	•	UI: a Replay… button opens a dialog listing past sessions (date, size, mistakes).
	•	You pick a session → app computes mistakeIds → builds a deck from those cards → starts a replay run (shuffled).
	•	No files needed; works fully offline once the first run is recorded.

Agent tasks
	•	Render a session list from localStorage['hsk.flash.sessions'].
	•	Disable “Replay” when mistakeIds.length === 0.

B) Import & replay from a JSON file (drag & drop or file picker)
	•	If you exported on another machine—or wiped LocalStorage—you can drag-and-drop a flash_sessions_*.json file into the app (or use an Import button).
	•	The app merges sessions from that file into LocalStorage (dedupe by session.id).
	•	After import, use the same Replay… dialog as in A.

UI hooks
	•	Drop zone over the page: “Drop session JSON to import.”
	•	Hidden <input type="file" accept="application/json"> for the Import button.

Agent tasks
	•	Validate JSON shape ({ sessions:[summary...], session.<id>: {...} } or a flat array—support both).
	•	On import:
	•	Add any missing full sessions to localStorage['hsk.flash.session.<id>'].
	•	Add/update summaries in localStorage['hsk.flash.sessions'] (no duplicates).


### Round 3.6 Remote data loading via GitHub
	•	Primary deck source should be loaded from a CSV hosted in the GitHub Pages root of https://oduerr.github.io/<repo>/data/hsk5.csv.
	•	Use relative paths (fetch('./data/hsk5.csv')) so that the same code works locally when running under file:// and when hosted on GitHub Pages.
	•	After loading, parse the CSV and persist it to LocalStorage for offline use.
	•	If the fetch fails (e.g., offline), fall back to:
	1.	Last deck stored in LocalStorage.
	2.	File picker for local CSV.
	3.	Paste area for manual CSV input.
	•	Support an optional ?v=<version> query parameter to bypass browser caching when the CSV is updated.
	•	No hardcoded repo name—read from a config constant so repo renaming doesn’t break loading.

## 3.7 Debugging build indicator + manual session save
### Version indicator
	  -	Display a very small, subtle version/build info element at the bottom of the app.
	  -	The content should be 
	  -	The last modified timestamp of the main code file(s).
	  -	Purpose: to verify that the browser is serving the latest build from GitHub Pages (avoid confusion with cached or delayed updates).
### Manual session save button
	- Add a button (label: “Save session to LocalStorage” or similar) in debug mode.
	  - 	Clicking the button immediately serializes the current run state (deck, order, mistakes so far, timestamps) into LocalStorage, overwriting the active session entry.
	  - This allows testing persistence and replay logic without finishing a run.
  •	Add a Save Progress button available during a run (both in debug and normal mode).
	•	Clicking it serializes the current run state — including:
    •	Deck and current order
    •	Cards already seen, cards remaining
    •	Mistake list so far
    •	Timestamps and any session metadata
    •	Stored in LocalStorage as a “checkpoint” session.
	On restart, user can choose to:
    1.	Resume from last checkpoint (unfinished cards + mistakes intact)
    2.	Replay only mistakes from the checkpoint
    3.	Start a fresh run
	•	This supports:
	•	Debug/testing persistence without finishing a run.
	•	Practical early save for large decks (e.g., HSK5’s ~1,300 cards).
	•	Continuation after closing the browser or pausing for long periods.
	JSON export/import compatibility
	•	The checkpoint must be saved in the same JSON structure as a finished session, with the only difference being a status flag:


### Round 3.8
- In the discreet version indicator at the bottom add The Chinese label “莉娜老师的版本” 
- Past Sessions / Replay UI changes
	•	When listing sessions, show for each 
  YYYY-MM-DD-hh:mm • <finished>/<total> • <mistakes> mistakes • status: complete|incomplete
  * Allow inline renaming of session titles, persist changes in session summaries.
  * Move Export all sessions and Import sessions buttons into the Past Sessions / Replay dialog.
  * For each session in the list, provide buttons:
	•	Replay mistakes
	•	Resume (if status = incomplete)
	•	Rename
	•	Delete


### Round 3.9 
- Include a Back button to navigate to the previous card.
- Support keyboard arrow keys: ← (previous), → (next).
- When navigating back to a card previously marked as a mistake, clearly flag it as such (e.g., red border, icon).
- Allow changing the status of a previously marked mistake to correct; update the session log, mistake count, and replay list accordingly.

### Round 3.95 Minor Bug fixes.


### Round 4.0 Mobile Friendly
- Add a Mobile friendly version of the app.
- Adopt the layout for mobile devices.
- swipe left and right to navigate to the previous and next card.
- swipe up or down to switch from back to front of the card.


### Round 5 – QoL & Safety
- Undo last action (pop last event; recompute state if feasible) – optional if complex.
- Confirm on New Run if a run is in progress.
- Import JSON to merge sessions (dedupe by id).
- Settings persistence (auto-reveal on/off, seconds).

**Exit criteria:** Settings persist; import/export roundtrips; basic undo works or is hidden.


## Testing Plan
- **Unit-ish** (manual):
  - CSV with commas and semicolons in definitions parses correctly.
  - Tone marks preserved in pinyin; no mojibake.
  - Keyboard shortcuts function and do not scroll page.
  - Auto-reveal countdown pauses on reveal/back state change.
  - Session export → import on fresh browser restores sessions.
- **Edge**:
  - Empty CSV → disable run buttons with message.
  - All-correct session → replay button disabled for that session.
  - LocalStorage quota: simulate by filling; app shows export/clear prompt.

---

## Nonfunctional Requirements
- Load and first paint < 1s on modern laptop with 2,500 cards.
- No network after initial CSV fetch; works via `file://`.
- No external dependencies required; optional tiny helpers allowed if vendored.

---

## 15) Agent Task Checklist
- [ ] Create skeleton files and minimal CSS.
- [ ] Implement CSV parser and card normalization.
- [ ] Implement state machine and controls.
- [ ] Implement session logging and persistence.
- [ ] Build replay dialog + flow.
- [ ] Add export/import of sessions.
- [ ] Add auto-reveal timer + countdown UI.
- [ ] Write inline JSDoc for public functions.
- [ ] Provide `README.md` with usage and privacy note.

