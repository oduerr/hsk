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


⸻


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

