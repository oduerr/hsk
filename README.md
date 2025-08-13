# HSK5 Flashcards (Offline HTML/JS)

Lightweight, offline flashcard app for Chinese HSK vocabulary. Front-first flow: you see English first; on reveal you get Hanzi + Pinyin. No build tools or servers required.

## Quick start

- Open `index.html` in a modern browser.
- If your browser blocks `file://` fetch for CSV, run a tiny server from the `hsk/` folder and open the shown URL:
  - macOS/Linux: `python3 -m http.server`

## Data

- Uses `data/hsk5.csv` with columns: `hanzi,pinyin,english`.
- Parser supports quoted fields and UTF‑8; pinyin spacing is normalized.
- Data comes from [plaktos/hsk_csv](https://github.com/plaktos/hsk_csv/tree/master)

## Current features (as of v4.09)

- Round 0
  - CSV loader + parser and normalization
  - Render English front of the first card; logs parsed cards to console
- Round 1
  - Shuffle + state machine for front/back
  - Reveal, Next, Mistake buttons; keyboard shortcuts
  - Auto‑reveal toggle with seconds and countdown
  - Progress indicator `current / total` and live Mistakes: X counter
- Round 2
  - Session logging with timestamps and events: `start`, `reveal`, `mistake`, `next`, `finish`
  - LocalStorage persistence:
    - `hsk.flash.sessions`: array of session summaries
    - `hsk.flash.session.<id>`: full session JSON
  - Export sessions to `flash_sessions_YYYYMMDD.json`
    - Includes a snapshot of the current in‑progress run (with `mistakeIds`) so you can export mistakes mid‑run
- Round 3
  - Replay… dialog lists past sessions (most recent first)
  - Start a replay run with only the mistaken cards from a selected session (shuffled)
  - UI shows a Replay tag: `Replay of <sessionId>`
  - Replay button is disabled when a session has 0 mistakes
- Round 3.5 (clarifications)
  - Import sessions via button (file picker) or drag & drop anywhere on the page
  - Import supports multiple shapes and merges (de‑duped by `id`):
    - Standard: `{ version?, exportedAt?, summaries: [], sessions: [] }`
    - Keyed: `{ "hsk.flash.session.<id>": {…} }` or `{ "session.<id>": {…} }`
    - Flat array: `[ { full session }, … ]`
- Round 4.x highlights
  - Mobile‑friendly layout (top info line, progress bar, button row)
  - Settings dialog (gear): auto‑reveal, minimal UI, outdoor mode (mobile), audio feedback, info panel
  - Save Progress checkpoint button (top and bottom)
  - Back/Reveal/Next via keys and gestures; single‑tap mistake toggle on mobile
  - Speaker button (Web Speech API, Mandarin) on both card faces
  - Help page with quick guidance


### 4.10 Minimal Make Pinyin larger
- Make the pinyin larger and more readable at least 3 times larger than the English text.
- Update the version to 4.10 — 莉娜老师的版本

## UI and controls

- Top bar: New Run, Replay…, Export, Import, auto‑reveal toggle + seconds, progress, mistakes counter, replay tag
- Bottom: Reveal, Mistake, Next, countdown when auto‑reveal is on
- Keyboard shortcuts:
  - Space / Enter: Reveal (front) / Next (back)
  - M: Mark mistake
  - N: Next
  - R: Open Replay dialog

## Sessions and storage

- Summary (stored in `hsk.flash.sessions`):
  - `{ id, startedAt, finishedAt, mistakeIds: string[], counts: { total, mistakes } }`
- Full session (stored in `hsk.flash.session.<id>`):
  - `{ id, startedAt, finishedAt|null, cards, order, events, mistakeIds, counts }`
  - `events` is an array like `{ type: 'mistake'|'reveal'|'next'|'start'|'finish', at: ISO, index, cardId? }`

## Export / Import

The app supports exporting and importing your recorded learning sessions. This lets you back up your progress or move it between devices/browsers.

- Where to find it:
  - Gear menu (Settings): buttons “Export sessions” and “Import sessions”.
  - Replay dialog: also contains Export/Import.
  - Drag & drop: You can drop a supported JSON file anywhere on the page to import.

- Export behavior:
  - Downloads a file named `flash_sessions_YYYYMMDD.json`.
  - Contains all session summaries and full sessions stored in LocalStorage.
  - If a run is currently in progress, an in‑memory snapshot of that run is included so your current `mistakeIds` are preserved for replay later.

- Import behavior:
  - Pick a JSON file (or drag it in). The app merges its sessions into LocalStorage.
  - Supported shapes:
    - `{ version?, exportedAt?, summaries: [], sessions: [] }` (preferred)
    - keyed object like `{ "hsk.flash.session.<id>": {…} }` or `{ "session.<id>": {…} }`
    - flat array of full sessions `[ {…}, {…} ]`
  - Existing sessions are de‑duplicated by `id` and updated if needed. No existing data is deleted.

Notes:

- Export/import currently covers sessions (summaries + full sessions). Deck caches and settings are not exported.

## Replay mode

- Open Replay…, choose a session with mistakes, click “Replay mistakes”.
- The next run contains only those mistaken cards (shuffled), and the top bar shows `Replay of <sessionId>`.

## File structure

```text
index.html
css/
  style.css
js/
  main.js    // boot, event wiring, flow
  data.js    // CSV fetch + parse, normalization
  state.js   // run state, session logging, finalize
  ui.js      // render, counters, replay tag, countdown
  util.js    // fnv hash, shuffle, helpers
  storage.js // LocalStorage helpers, export/import
data/
  hsk5.csv
```

## Privacy

- All data lives in your browser’s LocalStorage; no servers, no network after loading the CSV.

## Troubleshooting

- Browser blocks CSV on `file://`: run `python3 -m http.server` and open the local URL.
- Nothing in exported file: finish a run or ensure you marked mistakes; in‑progress runs are also exported.
- LocalStorage full: export sessions and clear older ones if needed.

## Notes / limitations

- Replays depend on card `id`s (hash of `hanzi|pinyin|english`). If your CSV changes, some old `mistakeIds` may not match. Future enhancement: add a `csvHash` to sessions.
