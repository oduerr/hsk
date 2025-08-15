# HSK Flashcards (Offline HTML/JS)

Lightweight, offline flashcard app for Chinese HSK vocabulary. Front-first flow: you see English first; on Reveal you get Hanzi + Pinyin. No build tools or servers required.

## Quick start

- Open `index.html` in a modern browser.
- If your browser blocks `file://` fetch for CSV, run a tiny server from the `hsk/` folder:
  - macOS/Linux: `python3 -m http.server`

## Data & levels

- CSV format: `hanzi,pinyin,english` (UTF‑8, quoted fields supported; pinyin spacing normalized).
- Vocabulary files live in `data/` directory.
- The app automatically discovers available vocabulary files using a smart discovery system.

## File Loading

### Primary Method: `vocab.csv` Index
The app primarily discovers vocabulary files by reading `data/vocab.csv`, which serves as a central index:

```csv
filename,display_name,description
hsk1.csv,HSK 1,Basic Chinese vocabulary (150 words)
hsk2.csv,HSK 2,Elementary Chinese vocabulary (300 words)
eng_oliver.csv,Oliver's English,Personal English vocabulary collection
```

**To add new vocabulary files:**
1. Place your CSV file in the `data/` folder
2. Add a row to `data/vocab.csv` with:
   - `filename`: The actual CSV filename
   - `display_name`: User-friendly name shown in the interface
   - `description`: Optional description of the content
3. Reload the page - the file will automatically appear in the vocabulary manager

### Fallback Discovery
If `vocab.csv` is not available, the app falls back to pattern-based discovery, automatically detecting common filename patterns like `hsk*.csv`, `vocabulary.csv`, etc.

### Benefits of `vocab.csv` Approach
- **User control**: You decide what files are available
- **Rich metadata**: Display names and descriptions for better UX
- **Easy maintenance**: No code changes needed for new files
- **Flexible naming**: Use any filename you want
- **Future-proof**: Works with any vocabulary format

## Features (v4.50)

- Core flashcard flow: Reveal / Next / Mistake, progress indicator, live mistake count
- Sessions: full event log; save checkpoints; export/import to JSON; replay only mistaken cards
- Vocabulary management: 📚 button for importing HSK files and custom vocabulary sets
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

- Top bar: 📚 Vocabulary Manager, New Run, Replay…, Save Progress, Mistake, Gear
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
  vocab.csv          # Vocabulary file index
  hsk*.csv           # HSK vocabulary files
  *.csv              # Other vocabulary files
```

## Privacy

- All data lives in your browser’s LocalStorage. OpenAI TTS calls are only made if you choose that engine and provide a key.

## Troubleshooting

- Browser blocks CSV on `file://`: run `python3 -m http.server` and open the local URL.
- No vocabulary files showing: ensure `data/vocab.csv` exists and contains valid entries, or check that CSV files exist in `data/` directory; the vocabulary manager will populate automatically on reload.
- Exported file seems empty: finish a run or mark some mistakes; in‑progress runs are also exported.
