/**
 * Tone Lab - Audio Visualizer for Pronunciation Practice
 * Replaces toneVisualizer.js with enhanced spectrogram and tone analysis
 */

let audioCtx = null;
let analyser = null;
let stream = null;
let source = null;
let reqId = 0;
let recordedBuffer = null;
let referenceBuffer = null;
let isRecording = false;
let currentMode = 'reference'; // 'reference' or 'recorded'

// Speech recognition (Web Speech API)
let recognition = null;
let isListening = false;
let asrSessionActive = false;

// Canvas elements
let spectrogramCanvas = null;
let spectrogramCtx = null;
let pitchCanvas = null;
let pitchCtx = null;

let mediaRecorder = null;
let recordedChunks = [];
let recordedObjectURL = null; // for fallback playback if decoding fails
let recordedMime = 'audio/wav';

// Audio data
let spectrogramData = [];
let pitchData = [];
const SPECTROGRAM_HISTORY = 200;
const PITCH_HISTORY = 180;

// Centralized spectrogram configuration and shared metadata to keep
// computation and visualization in sync at all times
const SPECTROGRAM_CONFIG = {
  minFreq: 80,       // Hz - lower bound for speech fundamentals
  maxFreq: 4000,     // Hz - upper bound covering key formants/sibilants
  fftSize: 4096,     // FFT window size for STFT (power of two)
  hopSize: 512       // hop size between frames
};

// This metadata is updated whenever we compute or grab a spectrum slice
// and is used by the renderer to map bins <-> frequencies robustly
let spectrogramMeta = {
  sampleRate: 48000,
  fftSize: SPECTROGRAM_CONFIG.fftSize,
  binStart: 0,      // inclusive DFT bin index corresponding to minFreq
  binEnd: 0,        // inclusive DFT bin index corresponding to maxFreq
  numBins: 0,       // derived: binEnd - binStart + 1
  minFreq: SPECTROGRAM_CONFIG.minFreq,
  maxFreq: SPECTROGRAM_CONFIG.maxFreq
};

// Keep metadata in sync for a given sample rate and fft size
function updateSpectrogramMeta(sampleRate, fftSize) {
  const nyquist = sampleRate / 2;
  const binsHalf = Math.floor(fftSize / 2);
  const binHz = nyquist / binsHalf; // Hz per bin in positive spectrum

  const minBin = Math.max(0, Math.floor(SPECTROGRAM_CONFIG.minFreq / binHz));
  const maxBin = Math.min(binsHalf, Math.floor(SPECTROGRAM_CONFIG.maxFreq / binHz));

  spectrogramMeta.sampleRate = sampleRate;
  spectrogramMeta.fftSize = fftSize;
  spectrogramMeta.binStart = minBin;
  spectrogramMeta.binEnd = maxBin;
  spectrogramMeta.numBins = Math.max(0, maxBin - minBin + 1);
  spectrogramMeta.minFreq = SPECTROGRAM_CONFIG.minFreq;
  spectrogramMeta.maxFreq = SPECTROGRAM_CONFIG.maxFreq;
}

// Tone contour definitions
const TONE_CONTOURS = {
  1: { name: 'High Level', color: '#10b981', points: [0.8, 0.8, 0.8, 0.8, 0.8] },
  2: { name: 'Rising', color: '#3b82f6', points: [0.5, 0.6, 0.7, 0.8, 0.9] },
  3: { name: 'Falling-Rising', color: '#f59e0b', points: [0.6, 0.4, 0.2, 0.4, 0.7] },
  4: { name: 'Falling', color: '#ef4444', points: [0.9, 0.7, 0.5, 0.3, 0.1] },
  0: { name: 'Neutral', color: '#6b7280', points: [0.5, 0.5, 0.5, 0.5, 0.5] }
};

// Current card data
let currentCard = null;

// Playback tracking variables
let playbackStartTime = 0;
let playbackDuration = 0;
let isPlaying = false;
let playbackAnimationId = null;

// Playback node management (for seeking/pausing/resuming)
let playbackSource = null;      // current AudioBufferSourceNode
let playbackBuffer = null;      // current AudioBuffer being played
let playbackOffsetSec = 0;      // offset seconds at playback start

// Track which input feeds the analyser
let analyserSourceType = null;  // 'mic' | 'playback' | null

/**
 * Public API - Open tone lab for a card
 */
export function openToneLab(card) {
  console.log('Opening tone lab for card:', card);
  currentCard = card;
  createToneLabModal();
  loadReferenceAudio(card);
}

/**
 * Close tone lab and cleanup resources
 */
export function closeToneLab() {
  cleanup();
  const modal = document.getElementById('toneLabModal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Create the tone lab modal UI
 */
function createToneLabModal() {
  console.log('Creating tone lab modal...');
  // Remove existing modal if present
  const existing = document.getElementById('toneLabModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'toneLabModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel tone-lab-modal">
      <div class="modal-header">
        <div class="modal-title">Tone Lab</div>
        <button class="modal-close" id="toneLabClose">×</button>
      </div>
      
      <div class="modal-body tone-lab-content">
        <!-- Card Info -->
        <div class="tone-lab-card">
          <div class="tone-lab-hanzi">${currentCard?.hanzi || '—'}</div>
          <div class="tone-lab-pinyin">${currentCard?.pinyin || '—'}</div>
        </div>
        
        <!-- Controls -->
        <div class="tone-lab-controls">
          <button id="btnRecord" class="tone-lab-btn record">🎙️ Record</button>
          <button id="btnStop" class="tone-lab-btn stop" disabled>⏹️ Stop</button>
          <button id="btnPlayRef" class="tone-lab-btn play">🔊 Reference</button>
          <button id="btnPlayRec" class="tone-lab-btn play" disabled>🎧 My Recording</button>
          <button id="btnToggleAB" class="tone-lab-btn toggle" disabled>🔄 A/B Toggle</button>
        </div>
        
        <!-- Status -->
        <div id="toneLabStatus" class="tone-lab-status">Ready</div>
        
        <!-- Speech-to-Text (Web Speech API) -->
        <div class="tone-lab-stt">
          <div class="stt-controls">
            <label for="sttLanguage">STT Language:</label>
            <select id="sttLanguage" class="tone-lab-select">
              <option value="zh-CN">Chinese (zh-CN)</option>
              <option value="it-IT">Italian (it-IT)</option>
              <option value="de-DE">German (de-DE)</option>
              <option value="fr-FR">French (fr-FR)</option>
              <option value="fi-FI">Finnish (fi-FI)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
            <label for="sttAutoStart" class="stt-checkbox-label">
              <input type="checkbox" id="sttAutoStart" checked /> Auto-start STT
            </label>
            <button id="btnSttStart" class="tone-lab-btn">🎤 Start STT</button>
            <button id="btnSttStop" class="tone-lab-btn" disabled>⏹️ Stop STT</button>
          </div>
          <div id="sttResult" class="stt-result">Speech-to-text ready (Chrome only)</div>
          <div id="sttListeningIndicator" class="stt-listening-indicator"></div>
        </div>
        
        <!-- Visualizations -->
        <div class="tone-lab-viz">
          <div class="viz-section">
            <h4>Spectrogram</h4>
            <canvas id="spectrogramCanvas" width="400" height="200"></canvas>
          </div>
          <div class="viz-section">
            <h4>Pitch Contour</h4>
            <canvas id="pitchCanvas" width="400" height="200"></canvas>
          </div>
        </div>
        
        <!-- Hints -->
        <div id="toneLabHints" class="tone-lab-hints"></div>
      </div>
    </div>
  `;

  addToneLabStyles();
  document.body.appendChild(modal);
  console.log('Modal added to DOM');

  // Add backdrop click handler
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      window.toneLab.closeToneLab();
    });
  }

  // Initialize canvases
  spectrogramCanvas = document.getElementById('spectrogramCanvas');
  spectrogramCtx = spectrogramCanvas.getContext('2d');
  pitchCanvas = document.getElementById('pitchCanvas');
  pitchCtx = pitchCanvas.getContext('2d');

  // Bind event handlers
  bindEventHandlers();
  
  // Initialize visualizations (no playback progress initially)
  drawSpectrogram();
  drawPitchContour();
  
  // Add some test data to make visualizations visible
  console.log('ToneLab modal created successfully');
  console.log('Canvas elements:', { spectrogramCanvas, pitchCanvas });
  console.log('Context elements:', { spectrogramCtx, pitchCtx });
  
  // Initialize speech recognition controls
  initStt(true);
  
  console.log('ToneLab modal ready for audio visualization');
}

/**
 * Add CSS styles for tone lab
 */
function addToneLabStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .tone-lab-modal {
      max-width: 800px;
      width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .tone-lab-content {
      padding: 16px;
    }
    
    .tone-lab-card {
      text-align: center;
      margin-bottom: 20px;
      padding: 16px;
      background: #f3f4f6;
      border-radius: 8px;
      border: 1px solid #d1d5db;
    }
    
    .tone-lab-hanzi {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 8px;
      color: #111827;
    }
    
    .tone-lab-pinyin {
      font-size: 24px;
      color: #6b7280;
    }
    
    .tone-lab-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 16px;
    }
    
    .tone-lab-btn {
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #111827;
      cursor: pointer;
      font-size: 14px;
    }
    
    .tone-lab-btn:hover {
      background: #f9fafb;
    }
    
    .tone-lab-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .tone-lab-btn.record {
      background: #dc2626;
      color: white;
    }
    
    .tone-lab-btn.recording {
      background: #ef4444;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .tone-lab-status {
      text-align: center;
      padding: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #6b7280;
    }
    
    /* STT section */
    .tone-lab-stt {
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .stt-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }
    .tone-lab-select {
      padding: 6px 8px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #111827;
      font-size: 14px;
    }
    .stt-result {
      text-align: center;
      font-size: 39px;
      color: #1f2937;
      min-height: 54px;
      word-break: break-word;
      font-weight: 500;
    }
    .stt-success { color: #065f46; }
    .stt-error { color: #991b1b; }
    .stt-checkbox-label { display: inline-flex; align-items: center; gap: 6px; }
    .stt-listening-indicator { text-align: center; font-size: 12px; color: #ef4444; min-height: 16px; margin-top: 4px; }
    .stt-listening-indicator.listening::before { content: '🔴 '; animation: pulse 1s infinite; }
    
    .tone-lab-viz {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    
    .viz-section {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #d1d5db;
    }
    
    .viz-section h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #6b7280;
    }
    
    .viz-section canvas {
      width: 100%;
      background: #0b1220;
      border-radius: 4px;
    }
    
    .tone-lab-hints {
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      min-height: 20px;
    }
    
    @media (max-width: 768px) {
      .tone-lab-viz {
        grid-template-columns: 1fr;
      }
      
      .tone-lab-hanzi {
        font-size: 36px;
      }
      
      .tone-lab-pinyin {
        font-size: 18px;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Bind event handlers for controls
 */
function bindEventHandlers() {
  document.getElementById('btnRecord')?.addEventListener('click', startRecording);
  document.getElementById('btnStop')?.addEventListener('click', stopRecording);
  document.getElementById('btnPlayRef')?.addEventListener('click', playReference);
  document.getElementById('btnPlayRec')?.addEventListener('click', playRecording);
  document.getElementById('btnToggleAB')?.addEventListener('click', toggleAB);
  // STT
  document.getElementById('btnSttStart')?.addEventListener('click', startStt);
  document.getElementById('btnSttStop')?.addEventListener('click', stopStt);
  document.getElementById('sttLanguage')?.addEventListener('change', () => {
    if (!isListening) initStt(false);
  });
  document.getElementById('toneLabClose')?.addEventListener('click', () => {
    window.toneLab.closeToneLab();
  });
}

/**
 * Initialize Web Speech API recognition UI state
 */
function initStt(setDefaultFromSession) {
  const resultEl = document.getElementById('sttResult');
  const btnStart = document.getElementById('btnSttStart');
  const btnStop = document.getElementById('btnSttStop');
  const select = document.getElementById('sttLanguage');

  if (!resultEl || !btnStart || !btnStop || !select) return;

  // Derive default language if requested
  if (setDefaultFromSession) {
    try {
      import('./state.js').then(({ state }) => {
        if (state?.sessionLocale && select) {
          // map session locale to STT language if compatible
          const preferred = state.sessionLocale;
          const options = Array.from(select.options).map(o => o.value);
          if (options.includes(preferred)) select.value = preferred;
        }
      }).catch(() => {});
    } catch {}
  }

  // Feature-detect
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    resultEl.textContent = 'Speech-to-text not supported in this browser (try Chrome).';
    resultEl.className = 'stt-result stt-error';
    btnStart.disabled = true;
    btnStop.disabled = true;
    return;
  }

  // Not actively listening until user starts
  btnStart.disabled = false;
  btnStop.disabled = true;
  resultEl.textContent = 'Speech-to-text ready (Chrome only)';
  resultEl.className = 'stt-result';
}

/**
 * Start STT recognition (manual button wrapper) -> guarded ASR
 */
function startStt() {
  startASR();
}

/**
 * Stop STT recognition (manual button wrapper)
 */
function stopStt() {
  stopASR();
}

/**
 * Guarded ASR start/stop helpers
 */
function stopASR() {
  const btnStart = document.getElementById('btnSttStart');
  const btnStop = document.getElementById('btnSttStop');
  const indicator = document.getElementById('sttListeningIndicator');
  if (recognition && isListening) {
    try { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch {}
  }
  isListening = false;
  asrSessionActive = false;
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
  if (indicator) {
    indicator.textContent = '';
    indicator.className = 'stt-listening-indicator';
  }
}

function startASR() {
  // Ensure single session
  if (asrSessionActive) stopASR();

  const resultEl = document.getElementById('sttResult');
  const btnStart = document.getElementById('btnSttStart');
  const btnStop = document.getElementById('btnSttStop');
  const select = document.getElementById('sttLanguage');
  const indicator = document.getElementById('sttListeningIndicator');

  if (!resultEl || !btnStart || !btnStop || !select) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    resultEl.textContent = 'Speech-to-text not supported in this browser (try Chrome).';
    resultEl.className = 'stt-result stt-error';
    return;
  }

  try {
    // Clear transcript UI on auto-start
    resultEl.textContent = 'Listening...';
    resultEl.className = 'stt-result';
    if (indicator) {
      indicator.textContent = 'Listening...';
      indicator.className = 'stt-listening-indicator listening';
    }

    recognition = new SR();
    recognition.lang = select.value || 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
      }
      const combined = (finalText + (interim ? ` (${interim})` : '')).trim();
      resultEl.textContent = combined || 'Listening...';
      if (indicator) {
        indicator.textContent = 'Listening...';
        indicator.className = 'stt-listening-indicator listening';
      }
    };

    recognition.onerror = (e) => {
      resultEl.textContent = `STT error: ${e.error || 'unknown'}`;
      resultEl.className = 'stt-result stt-error';
      stopASR();
    };

    recognition.onend = () => {
      if (asrSessionActive) stopASR();
    };

    recognition.start();
    isListening = true;
    asrSessionActive = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
  } catch (err) {
    resultEl.textContent = 'Failed to start STT';
    resultEl.className = 'stt-result stt-error';
    stopASR();
  }
}
// Helper function to get audio URL with locale support
function getAudioUrl(hanzi, locale = null) {
  const fname = encodeURIComponent(hanzi) + '.wav';
  
  // Try locale-specific directory first, then fallback to general recordings
  if (locale) {
    return `./data/recordings/${locale}/${fname}`;
  } else {
    return `./data/recordings/${fname}`;
  }
}

/**
 * Load reference audio for the card
 */
async function loadReferenceAudio(card) {
  if (!card?.hanzi) {
    setStatus('No reference audio available');
    return;
  }

  try {
    setStatus('Loading reference audio...');
    // Get locale from state
    const { state } = await import('./state.js');
    const locale = state.sessionLocale;
    const audioUrl = getAudioUrl(card.hanzi, locale);
    const response = await fetch(audioUrl);
    
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = getAudioContext();
      
      // Resume audio context if suspended
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      referenceBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setStatus('Reference audio loaded');
      document.getElementById('btnPlayRef').disabled = false;
    } else {
      setStatus('No reference audio found');
    }
  } catch (error) {
    setStatus('Failed to load reference audio');
    console.warn('Reference audio load failed:', error);
  }
}

/**
 * Start recording user audio
 */
function waitNextTick(ms = 30) {
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, ms)));
}

async function startRecording() {
  try {
    console.log('Starting recording...');
    stopPlayback();
    stopASR();
    await waitNextTick(30);

    const audioCtx = getAudioContext();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    source = audioCtx.createMediaStreamSource(stream);
    if (!analyser) analyser = audioCtx.createAnalyser();
    analyser.fftSize = SPECTROGRAM_CONFIG.fftSize;
    try { source.disconnect(); } catch {}
    source.connect(analyser);
    analyserSourceType = 'mic';
    updateSpectrogramMeta(audioCtx.sampleRate, analyser.fftSize);

    // choose mime
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/wav')) {
      recordedMime = 'audio/wav';
    } else if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      recordedMime = 'audio/webm;codecs=opus';
    } else {
      recordedMime = ''; // let browser pick a default
    }

    recordedChunks = [];
    if (recordedObjectURL) {
      URL.revokeObjectURL(recordedObjectURL);
      recordedObjectURL = null;
    }

    mediaRecorder = new MediaRecorder(stream, recordedMime ? { mimeType: recordedMime } : undefined);
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.start();

    isRecording = true;
    currentMode = 'recording';
    updateRecordingUI(true);
    setStatus('Recording... Speak now!');

    const autoStart = document.getElementById('sttAutoStart');
    if (!autoStart || autoStart.checked) startASR();

    startAnalyserLoop();
  } catch (error) {
    setStatus('Microphone access denied or unavailable');
    console.error('Recording failed to start:', error);
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  updateRecordingUI(false);

  if (reqId) { cancelAnimationFrame(reqId); reqId = 0; }

  // If no recorder, just clean up
  if (!mediaRecorder) {
    cleanup();
    setStatus('No active recorder');
    return;
  }

  const mr = mediaRecorder;
  mediaRecorder = null;

  const stopped = new Promise((resolve) => {
    const finalize = () => { try { mr.ondataavailable = null; } catch {} resolve(); };
    try {
      if (mr.state !== 'inactive') {
        mr.onstop = finalize;
        mr.stop();
      } else {
        finalize();
      }
    } catch {
      finalize();
    }
  });

  stopped.then(async () => {
    try {
      if (!recordedChunks.length) {
        setStatus('Recording failed - no audio data');
        cleanup();
        stopASR();
        return;
      }

      const blob = new Blob(recordedChunks, { type: recordedMime || 'audio/wav' });
      // Try to decode to AudioBuffer (best for analysis)
      try {
        const ab = await blob.arrayBuffer();
        const ac = getAudioContext();
        recordedBuffer = await ac.decodeAudioData(ab.slice(0));
        recordedObjectURL = null; // not needed
        setStatus('Recording complete');
      } catch (decodeErr) {
        console.warn('decodeAudioData failed; using <audio> fallback', decodeErr);
        // Fallback: keep a URL for element-based playback
        if (recordedObjectURL) URL.revokeObjectURL(recordedObjectURL);
        recordedObjectURL = URL.createObjectURL(blob);
        recordedBuffer = null; // no buffer, but we can still play via <audio>
        setStatus('Recording complete (fallback playback)');
      }

      document.getElementById('btnPlayRec').disabled = false;
      document.getElementById('btnToggleAB').disabled = !referenceBuffer;
      currentMode = 'recorded';
    } finally {
      // Only clean up after we have processed chunks
      cleanup();
      stopASR();
    }
  });
}

/**
 * Play reference audio
 */
function playReference() {
  if (!referenceBuffer) {
    setStatus('No reference audio available');
    return;
  }

  try {
    // Lifecycle: stop playback + ASR, then start
    stopPlayback();
    stopASR();
    startPlayback(referenceBuffer, 'reference', 0);
    
  } catch (error) {
    setStatus('Failed to play reference audio');
    console.error('Play reference failed:', error);
  }
}

/**
 * Play recorded audio
 */
function playRecording() {
  // Prefer decoded AudioBuffer path if available
  if (recordedBuffer) {
    try {
      stopPlayback();
      stopASR();
      startPlayback(recordedBuffer, 'recorded', 0);
    } catch (error) {
      setStatus('Failed to play recording');
      console.error('Play recording failed:', error);
    }
    return;
  }

  // Fallback: play the recordedObjectURL via <audio> and still drive the analyser
  if (recordedObjectURL) {
    try {
      stopPlayback();
      stopASR();

      const ac = getAudioContext();
      const el = new Audio(recordedObjectURL);
      el.crossOrigin = 'anonymous';
      const elemSource = ac.createMediaElementSource(el);

      if (!analyser) analyser = ac.createAnalyser();
      analyser.fftSize = SPECTROGRAM_CONFIG.fftSize;
      try { analyser.disconnect(); } catch {}
      try { elemSource.disconnect(); } catch {}
      elemSource.connect(analyser);
      analyser.connect(ac.destination);
      analyserSourceType = 'playback';

      currentMode = 'recorded';
      setStatus('Playing your recording');
      // start line & analyser
      // We don’t know exact duration until metadata loads
      el.onloadedmetadata = () => {
        startPlaybackLine(el.duration || 0);
      };
      el.onended = () => {
        setStatus('Playback finished');
        stopPlaybackLine();
        stopASR();
      };

      el.play();
      startAnalyserLoop();
    } catch (err) {
      setStatus('Failed to play recording (fallback)');
      console.error(err);
    }
    return;
  }

  setStatus('No recording available');
  console.error('No recorded buffer or URL available');
}

/**
 * Stop current playback (audio + animation)
 */
function stopPlayback() {
  if (playbackSource) {
    try { playbackSource.onended = null; playbackSource.stop(0); } catch {}
    try { playbackSource.disconnect(); } catch {}
    playbackSource = null;
  }
  isPlaying = false;
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
  stopPlaybackLine();
}

/**
 * Start playback with optional offset, wire ASR lifecycle and visuals
 */
function startPlayback(buffer, sourceType, offsetSec = 0) {
  const audioCtx = getAudioContext();
  
  // Resume audio context if suspended
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      // Continue with playback after resume
      continueStartPlayback(buffer, sourceType, offsetSec, audioCtx);
    }).catch(err => {
      console.error('Failed to resume audio context:', err);
      setStatus('Audio context error');
    });
    return;
  }
  
  continueStartPlayback(buffer, sourceType, offsetSec, audioCtx);
}

function continueStartPlayback(buffer, sourceType, offsetSec, audioCtx) {
  const node = audioCtx.createBufferSource();
  node.buffer = buffer;
  // Ensure analyser exists and route playback through analyser for live updates
  if (!analyser) analyser = audioCtx.createAnalyser();
  analyser.fftSize = SPECTROGRAM_CONFIG.fftSize;
  try { analyser.disconnect(); } catch {}
  try { node.disconnect(); } catch {}
  node.connect(analyser);
  analyser.connect(audioCtx.destination);
  analyserSourceType = 'playback';
  console.log('Analyser source: playback');

  node.onerror = (e) => {
    console.error('Playback audio error:', e);
    setStatus('Audio playback error');
    stopPlayback();
  };
  node.onended = () => {
    setStatus('Playback finished');
    stopPlaybackLine();
    stopASR();
  };

  // Set state
  playbackSource = node;
  playbackBuffer = buffer;
  currentMode = sourceType === 'reference' ? 'reference' : 'recorded';

  // Start audio immediately for responsive playback
  playbackOffsetSec = Math.max(0, Math.min(offsetSec || 0, buffer.duration));
  try { 
    node.start(0, playbackOffsetSec); 
  } catch (e) { 
    try { node.start(0); } catch {} 
  }

  // Start line animation with offset
  setStatus(sourceType === 'reference' ? 'Playing reference audio' : 'Playing your recording');
  startPlaybackLine(buffer.duration, playbackOffsetSec);
  
  // Start ASR if enabled AFTER audio begins (to avoid conflicts)
  const autoStart = document.getElementById('sttAutoStart');
  if (!autoStart || autoStart.checked) {
    // Small delay to ensure audio is playing
    setTimeout(() => startASR(), 100);
  }

  // Start analyser loop for live updates during playback
  startAnalyserLoop();
}

/**
 * Start playback line animation
 */
function startPlaybackLine(duration, offsetSec = 0) {
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
  }
  
  playbackStartTime = Date.now();
  playbackDuration = duration * 1000; // Convert to milliseconds
  playbackOffsetSec = offsetSec || 0;
  isPlaying = true;
  
  animatePlaybackLine();
}

/**
 * Stop playback line animation
 */
function stopPlaybackLine() {
  isPlaying = false;
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
  
  // Clear the line by redrawing visualizations
  drawSpectrogram();
  drawPitchContour();
}

/**
 * Animate the playback line across visualizations
 */
function animatePlaybackLine() {
  if (!isPlaying) return;
  
  const elapsedMs = Date.now() - playbackStartTime;
  const totalSec = playbackDuration / 1000;
  const progress = Math.min(1, (playbackOffsetSec + (elapsedMs / 1000)) / totalSec);
  
  // Update visualizations with current playback position
  drawSpectrogram(progress);
  drawPitchContour(progress);
  
  if (progress < 1) {
    playbackAnimationId = requestAnimationFrame(animatePlaybackLine);
  } else {
    stopPlaybackLine();
  }
}

/**
 * Visualize audio buffer for playback
 */
function visualizeAudioBuffer(buffer, mode) {
  if (!buffer) return;
  
  console.log(`Visualizing ${mode} audio buffer:`, buffer.length, 'samples, duration:', buffer.duration);
  
  // Clear previous data
  spectrogramData = [];
  pitchData = [];
  
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  updateSpectrogramMeta(sampleRate, SPECTROGRAM_CONFIG.fftSize);
  const frameSize = SPECTROGRAM_CONFIG.fftSize;
  const hopSize = SPECTROGRAM_CONFIG.hopSize;
  
  // Process audio in frames
  for (let i = 0; i < data.length - frameSize; i += hopSize) {
    const frame = data.slice(i, i + frameSize);
    
    // Compute spectrum for spectrogram (positive bins within configured range)
    const spectrum = computeSpectrum(frame);
    spectrogramData.push(spectrum);
    
    // Estimate pitch for contour
    const pitch = estimatePitch(frame, sampleRate);
    pitchData.push(pitch);
  }
  
  // Limit data size for display
  if (spectrogramData.length > SPECTROGRAM_HISTORY) {
    spectrogramData = spectrogramData.slice(-SPECTROGRAM_HISTORY);
  }
  if (pitchData.length > PITCH_HISTORY) {
    pitchData = pitchData.slice(-PITCH_HISTORY);
  }
  
  console.log(`Generated ${spectrogramData.length} spectrogram frames and ${pitchData.length} pitch values for ${mode} audio`);
  
  // Update visualizations (no playback progress for static visualization)
  drawSpectrogram();
  drawPitchContour();
}

/**
 * Toggle between reference and recorded audio
 */
function toggleAB() {
  // stop playback then ASR (guard)
  stopPlayback();
  stopASR();
  if (currentMode === 'reference') playRecording(); else playReference();
}

/**
 * Real-time visualization during recording
 */
function visualizeRecording() {
  if (!analyser) return;

  const bufferLength = analyser.fftSize;
  const timeData = new Float32Array(bufferLength);
  const fullFreqData = new Uint8Array(analyser.frequencyBinCount);
  
  analyser.getFloatTimeDomainData(timeData);
  analyser.getByteFrequencyData(fullFreqData);
  // Slice to our configured min/max frequency range using current metadata
  const start = spectrogramMeta.binStart;
  const end = spectrogramMeta.binEnd;
  const freqData = Array.from(fullFreqData.slice(start, end + 1));

  // Add to spectrogram data
  spectrogramData.push(freqData);
  if (spectrogramData.length > SPECTROGRAM_HISTORY) {
    spectrogramData.shift();
  }

  // Estimate pitch for visualization
  const pitch = estimatePitch(timeData, getAudioContext().sampleRate);
  pitchData.push(pitch);
  if (pitchData.length > PITCH_HISTORY) {
    pitchData.shift();
  }

  // Debug logging
  if (spectrogramData.length % 30 === 0) { // Log every 30 frames
    console.log('Spectrogram data:', spectrogramData.length, 'slices, last slice length:', spectrogramData[spectrogramData.length - 1]?.length);
    console.log('Pitch data:', pitchData.length, 'values, last pitch:', pitch);
  }

  // Update visualizations (progress is driven by playback animation for playback)
  drawSpectrogram();
  drawPitchContour();

  reqId = requestAnimationFrame(visualizeRecording);
}

/**
 * Start a continuous analyser loop for whichever source is connected
 */
function startAnalyserLoop() {
  if (reqId) cancelAnimationFrame(reqId);
  visualizeRecording();
}

/**
 * Draw spectrogram visualization
 */
function drawSpectrogram(playbackProgress = null) {
  if (!spectrogramCtx) return;
  
  const canvas = spectrogramCanvas;
  const ctx = spectrogramCtx;
  
  // Clear canvas
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw background grid for better readability
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 0.5;
  
  // Vertical time lines
  for (let i = 1; i < 10; i++) {
    const x = (canvas.width / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // Horizontal frequency lines
  for (let i = 1; i < 8; i++) {
    const y = (canvas.height / 8) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  if (spectrogramData.length === 0) {
    // Draw placeholder text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const timeSlices = spectrogramData.length;
  const freqBins = spectrogramData[0].length;
  const sliceWidth = Math.max(1, canvas.width / timeSlices);
  const binHeight = Math.max(1, canvas.height / freqBins);
  
  // Find the maximum intensity for normalization
  let maxIntensity = 0;
  for (let t = 0; t < timeSlices; t++) {
    const slice = spectrogramData[t];
    if (!slice) continue;
    for (let f = 0; f < freqBins; f++) {
      maxIntensity = Math.max(maxIntensity, slice[f]);
    }
  }
  
  // Normalize factor - boost weak signals and reduce strong ones
  const normalizeFactor = maxIntensity > 0 ? (255 / maxIntensity) * 2 : 1;
  
  // Draw spectrogram with enhanced contrast and logarithmic frequency mapping
  for (let t = 0; t < timeSlices; t++) {
    const slice = spectrogramData[t];
    if (!slice) continue;
    
    for (let f = 0; f < freqBins; f++) {
      let intensity = slice[f] / 255;
      
      // Apply normalization and contrast enhancement
      intensity = Math.pow(intensity, 0.7); // Gamma correction for better contrast
      intensity = intensity * normalizeFactor;
      intensity = Math.min(1, intensity); // Clamp to 0-1 range
      
      // Only draw if intensity is above a lower threshold for better visibility
      if (intensity > 0.05) {
        // Enhanced color scheme with better contrast
        const r = Math.floor(intensity * 255);
        const g = Math.floor(intensity * 220);
        const b = Math.floor(intensity * 120);
        
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        
        // Map current bin to logarithmic frequency scale (low at bottom, high at top)
        // Use log scale: y = log(freq) / log(maxFreq/minFreq) * canvas.height
        const minFreq = spectrogramMeta.minFreq;
        const maxFreq = spectrogramMeta.maxFreq;
        const logMin = Math.log(minFreq);
        const logMax = Math.log(maxFreq);
        const logRange = logMax - logMin;
        
        // Calculate frequency for this bin
        const freq = minFreq + (f / freqBins) * (maxFreq - minFreq);
        const logFreq = Math.log(freq);
        const normalizedLogFreq = (logFreq - logMin) / logRange;
        
        // Invert so low frequencies are at bottom
        const yTop = canvas.height - normalizedLogFreq * canvas.height;
        
        ctx.fillRect(t * sliceWidth, yTop, sliceWidth, binHeight);
      }
    }
  }
  
  // Draw frequency labels using logarithmic scale to match data orientation
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = (i / 5) * canvas.height;
    
    // Calculate frequency using logarithmic scale
    const minFreq = spectrogramMeta.minFreq;
    const maxFreq = spectrogramMeta.maxFreq;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);
    const logRange = logMax - logMin;
    
    // Map y position to logarithmic frequency
    const normalizedLogFreq = (canvas.height - y) / canvas.height;
    const logFreq = logMin + normalizedLogFreq * logRange;
    const freq = Math.exp(logFreq);
    
    const label = freq >= 1000 ? `${(freq/1000).toFixed(1)}kHz` : `${Math.round(freq)}Hz`;
    ctx.fillText(label, canvas.width - 5, y + 3);
  }
  
  // Draw time markers every 500ms on x-axis
  if (spectrogramData.length > 0) {
    const totalDuration = (spectrogramData.length * SPECTROGRAM_CONFIG.hopSize) / spectrogramMeta.sampleRate;
    const timeStep = 0.5; // 500ms intervals
    const pixelsPerSecond = canvas.width / totalDuration;
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    
    for (let t = 0; t <= totalDuration; t += timeStep) {
      const x = t * pixelsPerSecond;
      if (x <= canvas.width) {
        // Draw vertical line
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        // Draw time label
        ctx.fillText(`${t.toFixed(1)}s`, x, canvas.height - 5);
      }
    }
  }
  
  // Draw mode label
  let modeText = 'Unknown';
  let modeColor = '#ffffff';
  
  if (currentMode === 'reference') {
    modeText = 'Reference';
    modeColor = '#3b82f6';
  } else if (currentMode === 'recorded') {
    modeText = 'Recorded';
    modeColor = '#10b981';
  } else if (currentMode === 'recording') {
    modeText = 'Recording...';
    modeColor = '#ef4444';
  }
  
  ctx.fillStyle = modeColor;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Mode: ${modeText}`, 10, 20);
  
  // Draw intensity legend
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Intensity:', 10, canvas.height - 30);
  
  // Draw color bars
  const legendWidth = 60;
  const legendHeight = 15;
  const legendX = 10;
  const legendY = canvas.height - 25;
  
  for (let i = 0; i < 5; i++) {
    const intensity = i / 4;
    const r = Math.floor(intensity * 255);
    const g = Math.floor(intensity * 220);
    const b = Math.floor(intensity * 120);
    
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(legendX + i * (legendWidth / 4), legendY, legendWidth / 4, legendHeight);
  }
  
  // Draw legend border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
  
  // Draw playback line if provided
  if (playbackProgress !== null && isPlaying) {
    const lineX = playbackProgress * canvas.width;
    
    ctx.strokeStyle = '#ef4444'; // Red color
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
    
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, canvas.height);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset line dash
    
    // Draw time indicator
    const currentTime = playbackProgress * playbackDuration / 1000; // Convert back to seconds
    const totalTime = playbackDuration / 1000;
    
    ctx.fillStyle = '#ef4444';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentTime.toFixed(1)}s / ${totalTime.toFixed(1)}s`, lineX, 25);
  }
}

/**
 * Draw pitch contour with tone overlay
 */
function drawPitchContour(playbackProgress = null) {
  if (!pitchCtx) return;
  
  const canvas = pitchCanvas;
  const ctx = pitchCtx;
  
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (canvas.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Draw mode label
  let modeText = 'Unknown';
  let modeColor = '#ffffff';
  
  if (currentMode === 'reference') {
    modeText = 'Reference';
    modeColor = '#3b82f6';
  } else if (currentMode === 'recorded') {
    modeText = 'Recorded';
    modeColor = '#10b981';
  } else if (currentMode === 'recording') {
    modeText = 'Recording...';
    modeColor = '#ef4444';
  }
  
  ctx.fillStyle = modeColor;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Mode: ${modeText}`, 10, 20);
  
  // Draw tone contour guide if available
  if (currentCard?.pinyin) {
    drawToneGuide();
  }
  
  // Draw pitch data if available
  if (pitchData.length > 1) {
    const validPitches = pitchData.filter(p => p > 0);
    if (validPitches.length > 0) {
      const minPitch = Math.min(...validPitches);
      const maxPitch = Math.max(...validPitches);
      const range = maxPitch - minPitch || 1;
      
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let started = false;
      for (let i = 0; i < pitchData.length; i++) {
        const pitch = pitchData[i];
        if (pitch <= 0) continue;
        
        const x = (i / pitchData.length) * canvas.width;
        const y = canvas.height - ((pitch - minPitch) / range) * (canvas.height * 0.8) - canvas.height * 0.1;
        
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      if (started) {
        ctx.stroke();
      }
      
      // Draw pitch value labels
      ctx.fillStyle = '#10b981';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Min: ${Math.round(minPitch)}Hz`, 10, canvas.height - 30);
      ctx.fillText(`Max: ${Math.round(maxPitch)}Hz`, 10, canvas.height - 15);
      
      // Draw time markers every 500ms on x-axis
      if (pitchData.length > 0) {
        const totalDuration = (pitchData.length * SPECTROGRAM_CONFIG.hopSize) / spectrogramMeta.sampleRate;
        const timeStep = 0.5; // 500ms intervals
        const pixelsPerSecond = canvas.width / totalDuration;
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        
        for (let t = 0; t <= totalDuration; t += timeStep) {
          const x = t * pixelsPerSecond;
          if (x <= canvas.width) {
            // Draw vertical line
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
            
            // Draw time label
            ctx.fillText(`${t.toFixed(1)}s`, x, canvas.height - 5);
          }
        }
      }
    }
  } else {
    // Draw placeholder text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No pitch data yet', canvas.width / 2, canvas.height / 2);
  }
  
  // Draw playback line if provided
  if (playbackProgress !== null && isPlaying) {
    const lineX = playbackProgress * canvas.width;
    
    ctx.strokeStyle = '#ef4444'; // Red color
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
    
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, canvas.height);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset line dash
    
    // Draw time indicator
    const currentTime = playbackProgress * playbackDuration / 1000; // Convert back to seconds
    const totalTime = playbackDuration / 1000;
    
    ctx.fillStyle = '#ef4444';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentTime.toFixed(1)}s / ${totalTime.toFixed(1)}s`, lineX, 25);
  }
}

/**
 * Draw tone contour guide based on pinyin
 */
function drawToneGuide() {
  if (!currentCard?.pinyin || !pitchCtx) return;
  
  const toneMatch = currentCard.pinyin.match(/[1-4]/);
  const toneNumber = toneMatch ? parseInt(toneMatch[0]) : 0;
  
  const toneInfo = TONE_CONTOURS[toneNumber];
  if (!toneInfo) return;
  
  const ctx = pitchCtx;
  const canvas = pitchCanvas;
  
  ctx.strokeStyle = toneInfo.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  
  for (let i = 0; i < toneInfo.points.length; i++) {
    const x = (i / (toneInfo.points.length - 1)) * canvas.width;
    const y = canvas.height - (toneInfo.points[i] * canvas.height * 0.8) - canvas.height * 0.1;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = toneInfo.color;
  ctx.font = '12px sans-serif';
  ctx.fillText(`Tone ${toneNumber}: ${toneInfo.name}`, 10, 20);
}

/**
 * Update recording UI state
 */
function updateRecordingUI(recording) {
  const recordBtn = document.getElementById('btnRecord');
  const stopBtn = document.getElementById('btnStop');
  
  if (recordBtn) {
    recordBtn.disabled = recording;
    recordBtn.className = recording ? 'tone-lab-btn recording' : 'tone-lab-btn record';
  }
  
  if (stopBtn) {
    stopBtn.disabled = !recording;
  }
}

/**
 * Set status message
 */
function setStatus(message) {
  const statusEl = document.getElementById('toneLabStatus');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

/**
 * Get or create audio context
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Cleanup audio resources
 */
function cleanup() {
  if (reqId) {
    cancelAnimationFrame(reqId);
    reqId = 0;
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  if (source) {
       try {
         if (source._mediaRecorder) {
           if (source._mediaRecorder.state !== 'inactive') source._mediaRecorder.stop();
           source._mediaRecorder.ondataavailable = null;
           source._mediaRecorder.onstop = null;
           source._mediaRecorder = null;
         }
       } catch {}
        try {
          if (source._recorder) { source._recorder.disconnect(); source._recorder = null; }
          source.disconnect();
        } catch {}
        source = null;
      }
  
  analyser = null;
  isRecording = false;
}

/**
 * Compute spectrum for a frame of audio data using a discrete Fourier transform
 * limited to the configured [minFreq, maxFreq] band. Returns magnitudes in 0-255.
 */
function computeSpectrum(timeData) {
  const N = Math.min(timeData.length, SPECTROGRAM_CONFIG.fftSize);
  const sampleRate = getAudioContext().sampleRate || spectrogramMeta.sampleRate;
  updateSpectrogramMeta(sampleRate, N);

  const half = Math.floor(N / 2);
  const outBins = new Array(spectrogramMeta.numBins).fill(0);

  // Hann window (precompute once per call)
  const window = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    window[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }

  // DFT for bins within desired range. Use k-index directly for efficiency.
  const kStart = spectrogramMeta.binStart;
  const kEnd = Math.min(half, spectrogramMeta.binEnd);
  const scale = 255 * 2 / N; // visual scaling factor

  for (let k = kStart; k <= kEnd; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n++) {
      const x = timeData[n] * window[n];
      const phi = (2 * Math.PI * k * n) / N;
      real += x * Math.cos(phi);
      imag += x * Math.sin(phi);
    }
    const mag = Math.sqrt(real * real + imag * imag);
    outBins[k - kStart] = Math.max(0, Math.min(255, mag * scale));
  }

  return outBins;
}

/**
 * Simple pitch estimation using autocorrelation in a speech-relevant band
 */
function estimatePitch(buffer, sampleRate) {
  const bufferSize = buffer.length;
  if (bufferSize < 1024) return 0;
  
  // Find the best autocorrelation
  let bestOffset = -1;
  let bestCorrelation = 0;
  const maxPitchHz = 500; // upper voice limit
  const minPitchHz = 70;  // lower voice limit
  const minOffset = Math.floor(sampleRate / maxPitchHz);
  const maxOffset = Math.floor(sampleRate / minPitchHz);
  
  for (let offset = minOffset; offset < Math.min(maxOffset, bufferSize / 2); offset++) {
    let correlation = 0;
    for (let i = 0; i < bufferSize - offset; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - (correlation / (bufferSize - offset));
    
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  
  if (bestCorrelation > 0.45 && bestOffset > 0) {
    return sampleRate / bestOffset;
  }
  
  return 0;
}

// Export for global access
window.toneLab = {
  openToneLab,
  closeToneLab
};
