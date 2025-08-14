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

### Round 4.01 Mobile Friendly (clean)
- Keep Build Date in status (at least for now)
- To mimic same look and feel on mobile and desktop up arrow and down arrow should habe the same functionality as swipe up and down.
- Make Mistake and Mark Correct a toggle button. On the mobile version this should activate by douple tapping on the card.

### Round 4.02 Mobile Friendly (clean)
- Make the app a single full-screen flex column.
- Prevent page scroll (so swipes stay on the card), allow internal panels to scroll if needed.

### Round 4.03 Mobile Friendly (Layout)
- The layout is as shown in the image. Please implement something that all functionalities shown. Maybe have the buttons in different columns. Later on I will move some buttons anyway.

### Round 4.04 Mobile Friendly (Layout)
Round 4.04 – Mobile Friendly (Layout)

Gear Menu
	•	Move Auto-reveal here.
	•	Also include Info panel with:
	•	Version label “莉娜老师的版本”
	•	Build timestamp
	•	Checkpoint hash
	•	Session name
	•	Last save/checkpoint status
	•	Include Export / Import here.
	•	Hide by default; open via gear icon.

⸻

Top Bar (compact)
	•	Keep only: New Run, Replay…
	•	Remove Undo button from top bar (can be moved to gear if needed).
	•	Add Save Progress button to top bar (thumb-friendly on mobile, still accessible on desktop).

⸻

Mark Correct / Mistake Toggle
	•	Merge into a single toggle button.
	•	Label changes between “Mistake” and “Mark Correct” depending on current state.
	•	When card is marked as a mistake, toggle shows Mark Correct.
	•	When card is unmarked, toggle shows Mistake.

⸻

Mobile Card Controls (applies only when mobile layout is active)
	•	Remove Back, Next, Reveal buttons from the main interface.
	•	Keep gestures:
	•	Swipe left/right → previous/next card.
	•	Double tap → toggle Mistake/Correct state (fix so it works reliably on mobile).
	•	If double-tap gesture fails (browser/device), show a small contextual toggle button on revealed card for Mistake/Correct.
	•	Always show minimal status line: current/total mistakes

Desktop
	•	No change to current full control set by default.
	•	Allow hiding of Back/Next/Reveal via settings if user wants mobile-like minimal UI.


### Round 4.05 HSK Levels 1–6 (Deck Picker)
	•	Data files
	•	Expected paths (GitHub Pages or local):
./data/hsk1.csv … ./data/hsk6.csv
Schema: hanzi,pinyin,english[,german] (German optional, not yet implemented).
	•	On load, normalize columns; de-duplicate by (hanzi,pinyin,english).
	•	Level picker (deck select)
	•	Provide a Level picker with options: HSK 1 … HSK 6 and Custom.
	•	Default to the last used level (persist in LocalStorage, key hsk.flash.level).
	•	When Custom is chosen, show a multi-select to combine levels (e.g., 1+2+3).
	•	Placement
	•	Show the Level picker on first app open (no deck loaded yet).
	•	Also expose it in the ⚙ Gear menu (so it’s hidden during normal use).
	•	Loading behavior
	•	Selecting a level immediately fetch()es its CSV (or multiple CSVs for Custom), merges rows, then starts a New Run.
	•	After a successful load, persist the deck in LocalStorage for offline reuse.
	•	If fetch fails: fall back to last deck → else offer file picker / paste.
	•	UI text (compact)
	•	“Level: HSK 1…6 / Custom” in Gear; current selection shown in the Info panel (with deck size).
	•	Replay/session compatibility
	•	Sessions store source.level (e.g., "HSK 4" or "HSK 1+2+3"). Replay uses the session’s own frozen deck, independent of current Level picker.
	•	Acceptance (short)
	•	I can select HSK 1–6 (or a Custom combo), the deck loads, and a run starts.
	•	The chosen level is remembered on reload.
	•	Replay still works even if I later switch levels.
	•	Works on Pages and file:// (with file picker fallback).


### 4.06 Some UI changes

#### Desktop
- Up and down key both should turn the card (currently only down works)
- Shift should toggle mistake state

#### Mobile (see screenshot)
- HSK-Flashcards should be on the top center of the screen.
- Tapping on the card should toggle mistake state. If there is any functionaly of double tapping on the card, please remove it. 
- Add gear menu option: “Outdoor mode (high contrast)” (mobile only).
- When ON:
- Solid light or dark background for max contrast.
- Pure black/white text.
- Slightly larger font size and bolder UI elements.
- Persist setting in localStorage.
- Ignored on desktop. 

#### Both
- HSK-Level should be Displayed in the Progress. The HSK level should be infered from what is before .csv
- Add gear menu option: “Audio feedback on mark/unmark” (default = ON for mobile, OFF for desktop).
- Plays positive tone when changing Mistake → Correct, negative tone for Correct → Mistake.
- Implement via shared AudioContext unlocked on first gesture; silently skip if unsupported.

### 4.06.01 Some UI changes
Functions not implemented but requested in 4.06
- HSK-Flashcards should be on the top center of the screen (in the top bar) not working
- Ourdoor mode (high contrast) massively increase front size of the card.
- No Tone playing on my device (Pixel 6) add console logging for debugging.


In addtion change the information shown to be read from a VERSION.TXT file starting with 
4.06.01 — 莉娜老师的版本

### Round 4.07 – Web Speech “Speak Chinese” Button

Scope:
Add a button to play Mandarin audio for the Chinese term, available in both front (English) and back (Chinese + pinyin) states of the flashcard.

Details:
	•	Placement:
	•	Small speaker icon button in the card UI, aligned top-right of card text area.
	•	Visible in both states of the card.
	•	Functionality:
	•	Uses browser Web Speech API (speechSynthesis) with a zh-CN voice.
	•	Falls back silently if no suitable voice is found.
	•	On click, speaks the Chinese characters currently shown (from CSV).
	•	Persistence:
	•	Remember last used voice ID in localStorage if multiple zh-CN voices are available.
	•	Performance:
	•	Cancel any ongoing speech before starting new playback.
	•	No blocking of other card functions while speaking.
	•	Accessibility:
	•	Add aria-label="Speak Chinese" for screen readers.
	•	Limitations:
	•	Mobile Safari may require a prior user gesture to unlock speech; first tap on the button will initialize audio context.
Update the version to 4.07 — 莉娜老师的版本


### 4.07.01 Sound Button Interaction Safety
	•	The Play Sound button must be in its own tap/click area, visually distinct from the card’s Mistake/Correct toggle zone.
	•	Tapping/clicking the sound button must only play audio and never toggle the mistake state.
	•	Maintain a minimum safe distance (8–12 px) from any toggle area to prevent accidental activation.
	•	Applies to both desktop and mobile layouts.

Update the version to 4.07.01 — 莉娜老师的版本

### 4.08 Layout Tweak
- Change the layout from: image_curreny.png to image.png (handdrawn)
- That is 
1. Remove 4.07.01 from the main card.
2. Have the information displayed in top
3. Have the buttons Replay, Save, MistakToggle, and Gear in the next row
Keep the Rest

Update the version to 4.08 — 莉娜老师的版本

### 4.09 Help Page
Task:
	1.	Add a new static help page (help.html) to the project.
	2.	The page should briefly describe the main controls and the philosophy behind sessions. Use the following text:

Session Controls
	•	New Run – Starts a fresh session using the chosen vocabulary list.
	•	Replay… – Loads and replays a previously saved session.
	•	Save Progress – Saves your current learning progress for later continuation.

Philosophy

This tool is designed for active recall and spaced repetition. You can rename a session, replay it later, and track mistakes over time. The goal is to encourage focused, distraction-free practice while allowing flexibility to pause and resume learning at your own pace.


	3.	Add tooltips to the buttons in the main UI with these texts:
	•	New Run → "Start a new learning session"
	•	Replay… → "Replay a previously saved session"
	•	Save Progress → "Save your progress in the current session"

	4.	Ensure the tooltips match the button functionality.
	5.	Verify the actual button logic matches the descriptions above — if not, update the help page text and tooltips so they reflect the actual behavior.
	6.	Add a “Help” link inside the gear menu that opens help.html in a new tab

7. Minor Tweak Add the loudspeaker symbol to the upper right side of the card. Then it is better accessible for a right handed person.

Update the version to 4.09 — 莉娜老师的版本


4.11 Tone Visualization (Optional, Non-Blocking Feature)

Goal:
Allow the user to record their pronunciation of a Chinese character and visualize the pitch contour, comparing it with the ideal tone contour for that syllable. This feature should be entirely optional and should not interfere with the main flashcard workflow if unavailable or unsupported.

⸻

Functional Requirements
	1.	Activation
	•	Add a small “Tone Visualizer” button/icon near the “Play Sound” button on each card.
	•	Clicking opens a modal dialog (or overlay) with the tone visualizer.
	•	Works on both desktop and mobile; mobile devices must request microphone access.
	2.	Display
	•	Show pinyin with tone mark for the current card at the top of the modal.
	•	Draw an idealized tone curve for that tone number before recording:
	•	Tone 1: flat line (high level)
	•	Tone 2: rising line
	•	Tone 3: falling-then-rising curve
	•	Tone 4: falling line
	•	Tone curves should be normalized to the display (not absolute Hz).
	3.	Recording
	•	On “Record”, request microphone access and capture audio for up to ~2 seconds.
	•	Analyze pitch (fundamental frequency) in real time or after recording using a lightweight pitch detection algorithm (e.g., autocorrelation or YIN).
	4.	Visualization
	•	Plot the user’s detected pitch contour in blue over the existing ideal curve.
	•	Normalize user pitch to match the vertical scaling of the ideal curve for easy visual comparison.
	•	If pitch detection fails, show a message (“No pitch detected, try again”).
	5.	Closure
	•	Close the modal with an “X” or “Close” button without affecting the flashcard state.
	•	All audio and visualizer code should be isolated from main app logic.

⸻

Technical Notes
	•	Use the Web Audio API for pitch detection.
	•	Use Canvas or SVG for drawing curves.
	•	No server calls — must be entirely client-side.
	•	Feature should gracefully skip if navigator.mediaDevices.getUserMedia is unavailable.
	•	Pinyin and tone number come from the CSV dataset; no extra API required.

### 4.11a Tone Visualizer — Refactor & UX Update

Goal:
Move the tone visualizer out of main.js, and change its UX to record immediately on open, with an explicit Stop action, post-record analysis, and replay of the captured audio.

⸻

A) Architecture & Refactor
	•	Create a dedicated module (e.g., js/toneVisualizer.js) with a small public API:
	•	openToneVisualizer(card) — opens modal, starts recording immediately.
	•	closeToneVisualizer() — closes and fully disposes resources.
	•	main.js should only wire events (e.g., clicking the Tone Visualizer button) and call the module API. No visualizer logic inside main.js.
	•	The module must be self-contained (UI, audio, analysis) and failure-tolerant (if unsupported or permission denied, show message and exit without affecting the app).

⸻

B) UI & Flow (Modal)
	1.	Open → immediate recording
	•	On openToneVisualizer(card), the modal appears and instantly starts mic capture (request permission if needed).
	•	Top section: show pinyin (with tone mark); draw ideal tone curve for the current syllable.
	2.	Controls
	•	Buttons (left→right): Stop, Replay, Close.
	•	Stop: ends recording and triggers analysis.
	•	Replay: disabled during live recording; enabled after Stop to play back the captured audio once.
	•	Close: cancels/finishes; releases mic and audio nodes.
	3.	Canvas
	•	Background: idealized tone curve.
	•	During live recording: (optional) show an updating “live” pitch trace (light stroke).
	•	After Stop: render the final user pitch contour (e.g., blue), normalized to the canvas.

⸻

C) Recording & Analysis
	•	Start immediately on open:
	•	Request getUserMedia({ audio: true }).
	•	Create a single shared AudioContext (reuse if already created by the app).
	•	Capture up to a max duration (e.g., 3 s) if user doesn’t press Stop.
	•	Stop behavior
	•	On Stop: stop tracks, finalize buffer, run pitch detection on the buffered audio (no network).
	•	Draw final contour and enable Replay.
	•	Replay
	•	Store the captured audio in memory (a short buffer); play via Web Audio graph.
	•	No persistence beyond the modal; cleared on Close.

⸻

D) Error Handling & Non-Blocking
	•	If mic permission is denied/unavailable:
	•	Show inline message: “Microphone unavailable. Tone visualizer not supported on this device.”
	•	Close button remains; do not impact main flashcard flow.
	•	If pitch cannot be detected (silence/noise):
	•	Show: “No clear pitch detected—try again closer to the mic.”
	•	Keep the modal open; allow the user to Close and retry later.
	•	Always release media tracks and audio nodes on Stop/Close (no background capture).

⸻

E) Visuals & Scaling
	•	Pinyin + tone displayed at the top (e.g., “xué”).
	•	Ideal curves (normalized, not Hz):
	•	T1: high flat; T2: rising; T3: fall–rise; T4: falling.
	•	Map user F0 → normalized 0–1 range using a robust min/max or median-based window to handle loudness variation.
	•	Distinct colors: ideal (gray), live trace (light), final user (blue).

⸻

F) Performance & Limits
	•	Keep CPU usage low; stop analyzers when recording stops.
	•	Hard cap recording length (e.g., 3 s); auto-stop and analyze if exceeded.
	•	No writes to LocalStorage or sessions.

⸻

G) Accessibility & UX Polish
	•	Buttons have labels/aria: “Stop recording”, “Replay recording”, “Close”.
	•	If audio feedback (beeps) is globally enabled, do not play tones in this modal to avoid confusion.

⸻

H) Acceptance Criteria
	1.	Opening the Tone Visualizer immediately starts recording; Stop performs analysis; Replay plays back the just-recorded audio.
	2.	The feature is fully isolated in js/toneVisualizer.js; main.js only calls its API.
	3.	On permission denial or unsupported API, a clear message appears and the app remains usable.
	4.	Final view shows pinyin, ideal tone curve, and the user’s pitch contour overlay.
	5.	Closing the modal releases all audio resources; reopening works reliably.


### 4.11b Tone Visualizer — Refactor & UX Update

1) Capture: get a cleaner mic signal
	•	Do not monitor the mic (no mic → speakers route).
	•	Request mic with analysis-friendly constraints:
echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1.
	•	Aim for 48 kHz input if available (just request; browsers pick the closest).
	•	Keep the mic close and speak one sustained syllable (e.g., “ma”) — short, punchy utterances are harder to track.

2) Remove silence before/after
	•	During capture, run a voice activity check on the incoming samples (simple is fine):
	•	Compute short-window RMS energy (e.g., 20 ms).
	•	Mark frames with RMS below a threshold (e.g., −45 dBFS) as silence.
	•	At Stop, trim leading/trailing silence from the recorded buffer before analysis & drawing.
	•	(Optional) Use zero-crossing rate with RMS to avoid breath noise being misread as voice.

3) Live updates (your main complaint)

Right now you only see the plot after stopping because your loop samples the same frame multiple times. Fix the behavior conceptually like this:
	•	Exactly one pitch estimate per animation frame (60 fps typical):
	•	Each requestAnimationFrame → call analyser.getFloatTimeDomainData(...) once → estimate F0 once → append to a ring buffer of the last ~2–3 s.
	•	Redraw the canvas every frame from the ring buffer (newest on the right).
	•	Result: you’ll see the curve moving live while speaking.

4) Make pitch estimation stable (why you don’t “see the tone”)

Your current autocorrelation is very raw. Tighten it:
	•	Zero-mean + Hann window each frame before correlation (reduces drift & leakage).
	•	Search only plausible lags: speech F0 ~80–350 Hz → lags = sampleRate/350 … sampleRate/80.
	•	Normalize autocorrelation by energy (rho = num / √(E0·Elag)) and apply a voicing threshold (e.g., ρ < 0.35 ⇒ unvoiced).
	•	Smooth F0 over time with a tiny median filter (3–5 frames) or EMA — kills spikes.
	•	If you still see flat lines: try longer frames (e.g., 1024–2048 samples) for more stable autocorrelation.

5) Map pitch to screen so contours are obvious
	•	Don’t map Hz directly to pixels. Convert to semitones relative to the median F0 of the last ~1 s:
st = 12 * log2(f0 / medianF0).
	•	Draw a vertical range of ±12 semitones (octave) around 0.
	•	Result: everyone’s voice centers near 0, and rising/falling tones visibly slope up/down regardless of speaker.

6) Ideal tone overlay (to “see” what you expect)
	•	Keep your idealized lines (T1 flat high, T2 rising, T3 dip, T4 falling).
	•	Draw them first in a neutral color.
	•	Draw the live/user contour on top (thin while recording, thicker once stopped).
	•	Add faint guide lines at top/bottom (e.g., 20% and 80% height) so “falling vs rising” is visually anchored.

7) Spectrogram (optional, but if you keep it)
	•	If you want a real spectrogram, don’t fake it with F0:
	•	Use analyser.getByteFrequencyData() each frame, paint a 1-px column of magnitudes, and scroll or advance x.
	•	Show only 80–4000 Hz log-scaled; this makes voice bands pop.

8) UX flow you wanted
	•	Open visualizer → immediately start recording.
	•	Show live contour updating every frame.
	•	Stop → trim silence, render final smoothed contour, enable Replay.
	•	Replay plays the recorded buffer only (no live mic routing).
	•	Close releases the mic and cancels animation.

9) Quick diagnostics (to confirm it’s fixed)
	•	While speaking a steady “ma”—the live curve should stabilize near 0 semitones.
	•	Speak a Tone 2 (rising) “má” — the curve should tilt upward over ~300–600 ms.
	•	Speak a Tone 4 (falling) “mà” — the curve should tilt downward clearly.
	•	Background noise off, no echo, no live monitoring; replay sounds clean (no doubled audio).

10) Acceptance checklist for you
	•	Live curve visibly updates while I speak (no waiting for Stop).
	•	F0 isn’t jumpy: occasional blips are smoothed; unvoiced parts drop to baseline.
	•	Tone 2 feels rising; Tone 4 feels falling; Tone 3 shows a dip then rise on longer syllables.
	•	Start/Stop/Replay work; Stop trims leading/trailing silence.
	•	No feedback/echo during recording.

Update the version to 4.11b — 莉娜老师的版本


### 4.11c Tone Visualizer — Research‑Inspired Upgrades (Agent Tasks)

A) Live UX & Recording
	1.	Immediate Start + Live Plot
	•	On open: start mic, begin one F0 estimate per animation frame; render live contour (newest at right).
	•	Show Stop (analyze), Replay, Close.
	•	Acceptance: user sees the curve move while speaking (no need to press Stop to see updates).
	2.	Silence Trimming
	•	On Stop: detect leading/trailing silence via RMS threshold (e.g., −45 dBFS) and trim before final analysis.
	•	Acceptance: replay does not include long silent lead‑in/out.

B) Signal Quality
	3.	Mic Constraints
	•	echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1.
	•	Do not route mic to speakers (no monitoring).
	•	Acceptance: no audible feedback/echo; replay is clean.
	4.	Robust Pitch Estimation
	•	Frame size 1024–2048 samples; zero‑mean + Hann window.
	•	Autocorrelation with energy normalization, search lag range for 80–350 Hz.
	•	Voicing threshold (ρ < 0.35 ⇒ unvoiced).
	•	Temporal smoothing of F0 (median(3–5) or EMA).
	•	Acceptance: fewer jumpy spikes; steady vowel yields steady line.

C) Visualization & Comparison
	5.	Normalized Pitch Scale
	•	Convert Hz → semitones relative to the median F0 of the last ~1 s.
	•	Y‑range = ±12 st; unvoiced frames near the bottom baseline.
	•	Acceptance: rising (Tone 2) visibly slopes up; falling (Tone 4) slopes down.
	6.	Ideal Tone Overlay
	•	Draw idealized contour for tone (1 flat high / 2 rise / 3 dip‑rise / 4 fall).
	•	Render live user contour on top; after Stop, render thicker final curve.
	•	Acceptance: both curves visible; color legend in the modal header.
	7.	Optional Spectrogram (toggle)
	•	If enabled: each frame, getByteFrequencyData() → paint 1‑px column; log‑frequency 80–4000 Hz band.
	•	Acceptance: clear vocal band; doesn’t tank FPS on mobile.

D) Simple Feedback Metrics (no grading)
	8.	Slope & Shape Hints (Post‑Stop)
	•	Compute two simple metrics:
	•	Overall slope (first vs. last voiced third).
	•	Valley depth (for Tone 3: min vs. endpoints).
	•	Display short, non‑judgmental hints:
	•	“Looks mostly rising” / “Looks mostly falling” / “Shows a dip then rise.”
	•	Acceptance: hints appear under the canvas after Stop; no pass/fail.

E) UI Details
	9.	Pinyin & Tone Label
	•	Show pinyin with tone mark at top (“xué”, “mà”, etc.).
	•	Acceptance: correct label shown for the current card.
	10.	Controls & States

	•	Stop → ends capture, trims silence, freezes final plot, enables Replay.
	•	Replay → plays captured buffer (no live mic).
	•	Close → releases mic, cancels animation.
	•	Acceptance: resources are freed; reopening works.

F) Error Handling (Non‑blocking)
	11.	Unsupported / Permission Denied

	•	Show: “Tone visualizer not supported / microphone unavailable.”
	•	App continues normally.
	•	Acceptance: no crashes; main app unaffected.

G) Testing & Acceptance
	12.	Manual Test Script

	•	Speak “má” (Tone 2): final line tilts upward.
	•	Speak “mà” (Tone 4): final line tilts downward.
	•	Speak “mǎ” (Tone 3): visible dip then rise when vowel is long enough.
	•	Hold steady “ma”: line stays near 0 st (stable).
	•	Acceptance: all four behaviors visible on a typical laptop mic and Android phone.

H) Optional (later, if easy)
	13.	Model Curve from Audio Sample

	•	Allow loading a short exemplar (native speaker) for the same syllable; draw its precomputed contour as a third curve (thin gray).
	•	Cache per syllable to avoid recomputing.

Update the version to 4.11c — 莉娜老师的版本
⸻

Notes for the Agent
	•	Keep all logic in js/toneVisualizer.js; main.js should only call openToneVisualizer(pinyin).
	•	Use requestAnimationFrame for live updates; maintain a ring buffer of recent F0 values.
	•	Use Canvas (not DOM) for performance.
	•	No network calls; everything client‑side.
	•	Guard everything with feature detection; fail gracefully.

This gives you live feedback, clearer contours, and a tiny bit of “research‑inspired” guidance—without turning it into a heavy grading system.

⸻
### 4.20 Speech Synthesis Module (OpenAI + Browser Fallback)

4.20 Speech Synthesis Module (OpenAI + Browser Fallback)

Goal
Provide high-quality Chinese TTS with OpenAI as primary engine and Browser TTS as fallback. Keep it modular, optional, and safe. The main app only calls speak().

⸻

A) Scope & Outcomes
	•	Users can tap Speak to hear the current card’s hanzi (fallback: pinyin).
	•	If OpenAI TTS fails or is disabled, the app automatically uses the browser’s Web Speech voice.
	•	(Optional) Cache audio per text to avoid repeat synthesis and reduce latency/cost.
	•	All TTS code lives outside main.js.

⸻

B) Files & Structure
	•	js/speech.js — the only place for TTS logic (module).
	•	config/voice.config.json — defaults (engine, rates, etc.).
	•	UI wiring: a small Voice section in the Gear menu.

⸻

C) Public API (used by main app)
	•	initSpeech(configUrl?: string): Promise<void> — loads defaults, merges user settings, detects browser voices.
	•	speak(text: string, lang?: string): Promise<void> — plays audio using selected engine; cancels any ongoing playback.
	•	stop(): void — stops playback immediately.
	•	(Optional) setSettings(partial) — apply/persist user changes from Gear.

Main app rule: do not implement TTS logic in main.js; only import and call speak().

⸻

D) Engines & Behavior
	1.	Primary: OpenAI TTS
	•	Models: tts-1 or tts-1-hd.
	•	Config fields: voice, audioFormat (mp3/opus), rate/pitch (if supported), enabled: true/false.
	•	API Key Handling:
	•	The OpenAI API key is entered by the user in the Gear UI (masked input).
	•	It is stored only in localStorage (or IndexedDB) under a dedicated key (e.g., hsk.tts.openai.key).
	•	It is never included in any export/import JSON and never committed to the repo.
	•	If request fails (no key, network, quota), fallback to Browser TTS (if allowed).
	2.	Fallback: Browser TTS (Web Speech)
	•	Auto-select best zh-CN voice; allow manual pick in settings.
	•	Config: rate, pitch, preferredLangs.
	•	If no zh voice exists, still speak with available voice (warn once).

⸻

E) Gear / Settings (minimal UI)
	•	Engine: OpenAI TTS / Browser TTS.
	•	OpenAI: masked API key field (stored locally only), voice name, audio format, “Test voice” button.
	•	Browser: voice picker (available zh voices), rate (0.75–1.1), pitch (0.8–1.2).
	•	Cache: toggle “Cache synthesized audio” (default ON).
	•	Fallback: toggle “Fallback to Browser if cloud fails” (default ON).
	•	Persist engine/voice/rate/pitch/cache locally; do not export the key.

⸻

F) Caching (optional but recommended)
	•	If engine = OpenAI and Cache = ON:
	•	Key: lang|voice|text (or cardId if stable).
	•	Store small audio blobs in IndexedDB (preferred) or in-memory Map.
	•	On cache hit: play immediately, skip network call.
	•	Provide a “Clear TTS cache” button in Gear (shows size estimate if easy).

⸻

G) Security & Privacy
	•	Never hard-code or ship API keys.
	•	Keys stay only in the browser (localStorage/IndexedDB).
	•	Optionally show a one-line notice: “Your API key is stored locally on this device.”

⸻

H) UX & Error Handling
	•	Debounce: calling speak() stops any current playback first.
	•	If OpenAI fails → toast “Cloud voice unavailable — using browser voice.” (once per session).
	•	If both engines fail → non-blocking toast (“Speech not available”).
	•	Respect global audio feedback setting: TTS is separate; do not suppress TTS when feedback beeps are off.

⸻

I) Integration Points
	•	Gear menu section: “Voice”.
	•	Speak button handler in the card view:
	•	speak(card.hanzi || card.pinyin, 'zh-CN')
	•	No other module should call Web Speech or network TTS directly.

⸻

J) Acceptance Criteria
	•	Selecting OpenAI and entering a local API key produces clear Mandarin audio; rapid replays cancel/restart cleanly.
	•	Removing the key seamlessly uses Browser TTS.
	•	Cache ON avoids repeat network calls for the same text.
	•	Settings persist across reloads; API key is not included in app exports.
	•	No TTS code remains in main.js beyond imports and speak() calls.

Update the version to 4.20 — 莉娜老师的版本

### 4.21 OpenAI TTS Connectivity Test (from Gear Menu)

Goal
Provide a built-in test that confirms OpenAI TTS is configured and reachable, distinct from Browser TTS. The test should be callable from the Gear → Voice section and report clear diagnostics without affecting normal app state.

⸻

A) Entry point (UI)
	•	Add a “Test OpenAI TTS” button in Gear → Voice (visible regardless of current engine).
	•	Under the button, show a compact status line area for results.

⸻

B) What the test does (sequence)
	1.	Pre-checks
	•	Verify an API key is present in local storage.
	•	If missing: show “No API key found. Enter your key and try again.” (link focus to the key field).
	2.	Sample synthesis (OpenAI only)
	•	Disable any TTS cache for the test.
	•	Send a one-line sample (e.g., 学习中文真好！) to OpenAI TTS (tts-1 or tts-1-hd) using current Voice settings.
	•	Measure round-trip latency (request start → audio ready).
	3.	Playback
	•	Play the returned OpenAI audio buffer.
	•	Ensure no fallback to Browser TTS during this test (if request fails, do not speak via browser).
	4.	Optional A/B
	•	Offer a “Compare with Browser TTS” sub-button that immediately speaks the same text using Browser TTS for ear comparison.

⸻

C) Diagnostics to show (in the Gear panel)
	•	Result: ✅ “OpenAI TTS OK” or ❌ “OpenAI TTS failed”
	•	Latency: e.g., “Latency: 480 ms”
	•	Model/Voice: e.g., tts-1-hd • zh-CN-XiaoxiaoNeural (use whatever is configured)
	•	Audio format: mp3 / opus
	•	Key scope: “Key detected locally” (never display the key)
	•	Fallback used: Yes/No (for this test it should be No; if Yes, mark as warning)
	•	Timestamp of last successful test

On failure, show a concise error cause if detectable:
	•	Missing/invalid key
	•	Network/CORS blocked
	•	Quota/auth error (HTTP status)
	•	Non-audio response/parse error

⸻

D) Behavior & Safety
	•	The test never stores the API key in exports; it only reads from local storage.
	•	The test does not change the user’s selected engine or settings.
	•	If playback is already running, the test should stop it before starting.
	•	If the call fails, do not auto-fallback to Browser TTS (to avoid confusion).

⸻

E) Acceptance criteria
	•	From Gear → Voice, clicking Test OpenAI TTS:
	•	Performs a real request to OpenAI and plays the cloud audio (when configured correctly).
	•	Displays diagnostics (success/latency/voice/format/timestamp).
	•	If anything fails, shows a clear reason and does not play Browser TTS.
	•	Clicking Compare with Browser TTS plays the same text with the browser voice so differences are audible.
	•	Running the test does not affect normal speak() calls or cached audio.

  4.22 TTS Model Toggle & Cache Controls

Goal
Let the user choose between Speed (tts-1, default) and Quality (tts-1-hd) from the Gear menu, and add a Clear TTS Cache control for testing.

⸻
### 4.22 TTS Model Toggle & Cache Controls

A) Gear → Voice (UI)
	•	Model selector (radio or dropdown):
	•	Speed (tts-1) — default
	•	Quality (tts-1-hd) — shows a brief note: “higher quality, higher latency”
	•	OpenAI Voice selector (existing).
	•	Cache
	•	Toggle: Cache synthesized audio (ON by default)
	•	Button: Clear TTS cache → confirm dialog → clears cached audio.
	•	(Optional) show a small estimate like “~X files, ~Y MB”.

Persist all settings locally (engine, model, voice, cache ON/OFF). Do not export the API key.

⸻

B) Behavior
	•	The selected model is used on the next synthesis request (no need to reload).
	•	Cache key must include model + voice + lang + text so changing the model won’t reuse the wrong audio.
	•	Clear TTS cache removes all stored synthesized audio (model-agnostic).
	•	If OpenAI call fails or no key: gracefully fallback to Browser TTS (if fallback enabled).

⸻

C) Non-Goals / Safety
	•	No changes to main study flow.
	•	No API key stored in exports or logs.
	•	If cache is OFF, always fetch from OpenAI (no writes to cache).

⸻

D) Acceptance Criteria
	•	Switching Speed ↔ Quality affects new plays immediately and is remembered after reload.
	•	With cache ON: first play fetches from OpenAI; second play of same text+voice+model uses cache (faster).
	•	Clear TTS cache removes all entries; next play re-fetches from OpenAI.
	•	When OpenAI is unavailable, Browser TTS is used (with a small toast), and the app continues normally.

Update the version to 4.21 — 莉娜老师的版本


### 4.23 – TTS Configuration Enhancements

Tasks:
	1.	Refactor TTS Implementation
	•	Move all TTS-related functionality (OpenAI + browser speech synthesis) into a dedicated file, e.g., tts.js.
	•	The main UI should only call high-level functions like ttsSpeak(text) or ttsTest().
	•	The TTS module should:
	•	Handle both OpenAI and browser speech synthesis.
	•	Manage caching logic internally.
	•	Provide utility functions for clearing cache, switching voices/models, and running test phrases.
	2.	Voice Selection
	•	Add a dropdown in the Gear menu to choose the OpenAI TTS voice.
	•	Use a hardcoded list for OpenAI voices to ensure consistent availability:

  const OPENAI_VOICES = [
  "alloy", "verse", "sage", "blush", "bright",
  "copper", "ember", "moss", "pearl", "sand"
];

•	Keep browser TTS voices in a separate list so the user can switch between OpenAI and browser mode.

	2.	Model Toggle
	•	Add a toggle in the Gear menu to switch between gpt-4o-mini-tts (TTS1) and gpt-4o-mini-tts-hd (TTS1-HD).
	3.	Test Phrase Selection
	•	Allow user to choose the phrase used for TTS testing from the Gear menu.
	•	Use current default if the user does not change it.
	4.	Test Script Integration
	•	Add a “Test TTS” entry in the Gear menu to play the selected test phrase using the current TTS settings (voice, model, engine).
	5.	Clear Cache
	•	Add a “Clear TTS Cache” option in the Gear menu that deletes all locally cached audio files.
	6.	Test Vocabulary File
	•	Include hsk0.csv in the project alongside the other HSK files for testing purposes.
	•	Ensure it is selectable in the same way as other HSK lists.

Verification:
	•	Confirm that voices in the dropdown exactly match the hardcoded OPENAI_VOICES list.
	•	Verify that cache clearing works without breaking the app.
	•	Ensure the test phrase plays correctly in both TTS1 and TTS1-HD.

⸻

### 4.30 Card Flip Animation (Vertical Flip)

Task:
Implement an optional vertical flip animation for cards when switching between front and back.

Details:
	1.	Animation behavior:
	•	Flip the card upward (or downward) like a physical flashcard being lifted, using a rotation around the horizontal (X) axis.
	•	Pivot point should be along the top edge of the card (transform-origin: top center).
	•	Duration: 300–500 ms, easing: ease-in-out.
	•	Ensure correct direction depending on whether flipping from front → back or back → front.
	2.	Structure:
	•	Card must have separate front and back faces to enable this flip.
	•	If the current rendering combines both sides in one element, refactor into two face elements stacked in 3D space.
	3.	Toggle control:
	•	Add a setting in the Gear menu:
	•	“Enable Flip Animation” (default: enabled).
	•	Store preference in localStorage.
	•	When disabled, cards switch instantly with no animation.
	4.	Accessibility:
	•	Respect prefers-reduced-motion and disable animation if the user’s system requests reduced motion.
	5.	Performance:
	•	Use GPU-accelerated CSS transforms for smooth animation.
	•	Avoid reflow or layout shift during the flip.
	6.	Testing:
	•	Verify that flip direction matches intended behavior (upward/downward).
	•	Ensure the toggle works instantly without reload.

  ### 4.30.a Card Flip Animation (Vertical Flip)
  - Switch to rotateX
  - Slightly color the card background make the chinese version a bit brighter
  - Update the version to 4.30.a — 莉娜老师的版本

  #### 4.30.b Card Flip Animation (Vertical Flip)
- Larger difference between the front and back of the card
- If i swipe up or press the up arrow the card should flip to the back like a physical card
- If i swipe down or press the down arrow the card should flip to the front like a physical card in the other direction
- The animation should be smooth and not jumpy 


##### 4.30.c Card Flip Animation (Refinement)
4.30.c Card Flip Animation (Gesture-Driven Refinement)

Goal: Flip follows the user’s vertical gesture and works in both directions.

Behavior
	•	Gesture tracking (mobile + desktop drag):
	•	When the user drags vertically on the card, map dy to rotateX in real time (clamp ~±90°).
	•	Transform origin: top center when flipping up; bottom center when flipping down (or keep top and invert sign—consistent either way).
	•	Direction logic:
	•	From front → back: upward drag commits reveal; downward drag cancels/snap-back.
	•	From back → front: downward drag commits hide; upward drag cancels/snap-back.
	•	Release rules:
	•	Commit flip if |angle| ≥ 45° or vertical velocity exceeds threshold; otherwise snap back.
	•	On commit/cancel, finish with a short tween (200–280 ms, ease-in-out).

Coexistence & guards
	•	Disambiguate swipes: Start vertical flip only when |dy| > |dx| + hysteresis (e.g., 12px); otherwise let horizontal swipe handle prev/next.
	•	Block scroll while actively dragging the card vertically.
	•	Safe zones: Taps on Speak/Tone buttons must not start a flip.
	•	Keyboard: ↑/↓ and Space still trigger programmatic flips with the same animation.

Visual polish (optional)
	•	Subtle backface fade near 90° (front fades out/back fades in).
	•	Soft shadow intensity tied to |angle| for depth cue.

Settings
	•	Extend Gear with “Gesture-driven flip” (default ON on mobile, OFF on desktop).
	•	Respect “Enable flip animation” and prefers-reduced-motion: if disabled/reduced, gesture still changes state but without animation.

Performance
	•	Use only transform/opacity; target 60 fps on mid-range phones.
	•	Cancel animation cleanly if a new gesture starts (no half-flips).

Acceptance
	•	While dragging, the card follows the finger smoothly; releasing above threshold commits the flip, else snaps back.
	•	Works up and down (front↔back) with correct direction.
	•	No interference with horizontal swipe navigation or tap targets.
	•	Toggles in Gear take effect immediately and persist.


### 4.40 Bug Fixes and UI Ploshing

#### In the Gear Panel and settings in panel
- Outdoor mode not functional
One can choose the Outdoor mode in the gear settings but it has no effect.
Expected behavior as is if the auto mode is unchecked. A high contrast version if the auto mode is checked, all font are bold and increase the font size by factor of 2 

- Audio feedback does not change when checked or being unchecked.
When unchecked, no sounds must be played during the transition from a wrong card to a correct card. If it's checked, the beeps are played (as it is now)

- Sections in the gear panel after the level, before voice, before info (e.g. with small lines)

- When starting the HsK level is not displayed and set 

- Add a dark / light mode toggle in the gear panel. 

- The default should be dark mode add a light mode in the app

- Also implement the dark / light mode in the app

#### Playback and Recording
- The playback and recording are currently in top of all elements. They should move to one row about the card and displayed not displayed then the "gear" card is shown.

#### In the Audio Recoring 
- Show  recording and playback button top right ()
- Allow for new recoding / rerecord add that right to the Replay button
- Add the Spectrogram Recorded in the line below 

Update the version to 4.40 — 莉娜老师的版本 


### 4.50 Minor Changes

#### Make adding a new level easier
- It should be very easy to add a new level.
- It should check the data directory on the server if there is a new card. If so, it should download it and integrate it. The order should be alphabetic order. This could also be English (but that should no be a problem).

#### Make Playback Speed adjustable
- Add a “Voice speed” slider in the gear menu, range e.g. 0.5–1.5.

#### UI
- Mic and Loudspeaker must be in a row above the card on the rigth side (see image)
- Button in light mode hardly visible (see image)



#### 4.60 External Tone Visualizer (Test Tool)
	•	Create a standalone page/tool (separate from main app).
	•	User can record speech via microphone and visualize tone contour in real-time.
	•	User can load and play an MP3 or WAV file and visualize its tone contour.
	•	No changes to main app; purely for testing.


Got it. Here’s a concise spec that adds download caching on top of your play logic.

⸻

### 4.70 Audio Source Order + Caching

UI (Gear → Voice)
	•	Checkbox: Request sounds from OpenAI (default OFF).
	•	Toggle: Cache downloaded .wav (default ON).
	•	Button: Clear audio cache (shows count, confirm).

Playback decision order (per card)
	1.	If Request OpenAI ON and API key present → synthesize via OpenAI TTS and play.
	    write returned audio to cache as <hanzi>.wav for future reuse.
	2.	Else try pre-recorded .wav:
	•	Look up cache first (Cache Storage or IndexedDB) for key audio/<level>/<hanzi>.wav.
	•	If not cached, fetch from GitHub (/data/<level>/<hanzi>.wav).
		Example: /data/hsk0/中国人.wav or /data/hsk1/你好.wav
	•	On 200 OK and Cache ON → store in cache and play.
	3.	Else fallback to Browser TTS (web.tts) and play immediately (do not cache).

Caching details
	•	Use Cache Storage API (preferred for simple GET caching).
	•	Cache name: hsk-audio-v1. Key: full request URL.
	•	Persist per-level to avoid collisions (/data/hsk0/中国人.wav).
	•	Clear audio cache deletes hsk-audio-v1.
	•	Respect Cache ON/OFF setting: when OFF, always bypass cache (use cache: 'reload') and don’t store.
	•	Add lightweight versioning: if you ever change files, bump cache name to hsk-audio-v2 to invalidate.

Failure handling
	•	If fetch 404/5xx or network error → skip to Browser TTS.
	•	If OpenAI fails → try cached/file .wav → then Browser TTS.

Telemetry (dev-only, console)
	•	Log source: [audio] source=openai|cache|remote|browser.
	•	Log cache result: hit/miss.

Acceptance
	•	With Request OpenAI OFF and cache ON: first play downloads once; subsequent plays are offline from cache.
	•	Clearing cache forces re-download on next play.
	•	With Request OpenAI ON, audio plays from OpenAI; if “cache synthesized” is enabled, later plays can use cached audio even with the toggle OFF.
