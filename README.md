# HSK5 Flashcards (Offline HTML/JS)

Lightweight, offline flashcard app for Chinese HSK vocabulary. Front-first flow: you see English first; on reveal you get Hanzi + Pinyin. No build tools or servers required.

## Quick start

- Open `index.html` in a modern browser.
- If your browser blocks `file://` fetch for CSV, run a tiny server from the `hsk/` folder and open the shown URL:
  - macOS/Linux: `python3 -m http.server`

## Data

- Uses `data/hsk5.csv` with columns: `hanzi,pinyin,english`.
- Parser supports quoted fields and UTF‑8; pinyin spacing is normalized.

## Current features (Rounds 0 → 3.5)

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

- Export: downloads `flash_sessions_YYYYMMDD.json` containing all summaries and full sessions.
  - If a run is in progress, the current snapshot is included so `mistakeIds` are preserved.
- Import: use the Import button (JSON file) or drag a JSON file onto the page.
  - Sessions are merged into LocalStorage; summaries are added/updated; duplicates are ignored by `id`.

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
