# HSK Flashcards (Offline HTML/JS)

Lightweight, offline flashcard app for Chinese HSK vocabulary. Front-first flow: you see English first; on Reveal you get Hanzi + Pinyin. No build tools or servers required.

## Quick start

- Open `index.html` in a modern browser.
- If your browser blocks `file://` fetch for CSV, run a tiny server from the `hsk/` folder:
  - macOS/Linux: `python3 -m http.server`

## Data & levels

- CSV format: `hanzi,pinyin,english` (UTF‑8, quoted fields supported; pinyin spacing normalized).
- Levels live in `data/` as `hsk0.csv … hsk6.csv`.
- On startup the app probes which `hsk*.csv` files exist and populates the Level picker automatically. To add a new level, just drop a new CSV in `data/` (e.g. `hsk6.csv`) and reload.

## Features (v4.50)

- Core flashcard flow: Reveal / Next / Mistake, progress indicator, live mistake count
- Sessions: full event log; save checkpoints; export/import to JSON; replay only mistaken cards
- Mobile‑friendly layout; single‑tap mistake toggle on mobile; swipe left/right for next/back
- Settings (gear):
  - Auto‑reveal + seconds and countdown
  - Minimal UI
  - Outdoor mode (high contrast) and Light/Dark theme
  - Audio feedback beeps on mark/unmark
  - Voice section: Browser TTS or OpenAI TTS (model, voice, cache, API key test), Voice speed slider
  - Info panel (version/build/checkpoint/session)
- Mic (🎙️) Tone visualizer: live pitch trace, final contour, recorded spectrogram, re‑record/stop/replay controls
- Speaker (🔊) for pronunciation

## UI and controls

- Top bar: New Run, Replay…, Save Progress, Mistake, Gear
- Above card (right): 🎙️ Tone visualizer, 🔊 Speak
- Bottom bar: Back, Reveal, Mistake, Next, Save Progress
- Keyboard:
  - Space / ↑ / ↓: Reveal / Unreveal
  - Enter / →: Next
  - ←: Back
  - M: Mistake toggle
  - R: Open Replay dialog

## Export / Import

- Found in the Gear menu and also the Replay dialog; drag‑and‑drop supported.
- Exports `flash_sessions_YYYYMMDD.json` of all sessions; includes the current in‑progress run snapshot so mid‑run mistakes are preserved.
- Import merges sessions by `id`; supports multiple JSON shapes.

## File structure

```text
index.html
css/
  style.css
js/
  main.js    // boot, wiring, flow
  data.js    // CSV fetch/parse/normalize, level discovery
  state.js   // run state, session logging, finalize
  ui.js      // render, counters, progress/mistake views
  util.js    // hash, helpers
  storage.js // LocalStorage, export/import, settings
  speech.js  // TTS (browser/OpenAI)
  toneVisualizer.js // mic + pitch visualization
data/
  hsk*.csv
```

## Privacy

- All data lives in your browser’s LocalStorage. OpenAI TTS calls are only made if you choose that engine and provide a key.

## Troubleshooting

- Browser blocks CSV on `file://`: run `python3 -m http.server` and open the local URL.
- No levels showing: ensure CSVs exist in `data/` (e.g., `hsk1.csv`); the picker is populated automatically on reload.
- Exported file seems empty: finish a run or mark some mistakes; in‑progress runs are also exported.
