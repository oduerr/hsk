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

// Canvas elements
let spectrogramCanvas = null;
let spectrogramCtx = null;
let pitchCanvas = null;
let pitchCtx = null;

// Audio data
let spectrogramData = [];
let pitchData = [];
const SPECTROGRAM_HISTORY = 200;
const PITCH_HISTORY = 180;

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
  document.getElementById('toneLabClose')?.addEventListener('click', () => {
    window.toneLab.closeToneLab();
  });
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
    const audioUrl = `./data/recordings/${encodeURIComponent(card.hanzi)}.wav`;
    const response = await fetch(audioUrl);
    
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = getAudioContext();
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
async function startRecording() {
  try {
    console.log('Starting recording...');
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
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    // Setup recording
    const recorder = audioCtx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    source.connect(recorder);
    
    // Silent output to prevent feedback
    const silent = audioCtx.createGain();
    silent.gain.value = 0;
    recorder.connect(silent);
    silent.connect(audioCtx.destination);

    recorder.onaudioprocess = (e) => {
      chunks.push(e.inputBuffer.getChannelData(0).slice());
    };

    // Store recorder for cleanup
    source._recorder = recorder;
    source._chunks = chunks;

    isRecording = true;
    currentMode = 'recording';
    updateRecordingUI(true);
    setStatus('Recording... Speak now!');
    console.log('Recording started successfully');
    
    // Start visualization
    spectrogramData = [];
    pitchData = [];
    if (reqId) cancelAnimationFrame(reqId);
    visualizeRecording();

  } catch (error) {
    setStatus('Microphone access denied or unavailable');
    console.error('Recording failed:', error);
  }
}

/**
 * Stop recording and process audio
 */
function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  updateRecordingUI(false);

  try {
    if (reqId) {
      cancelAnimationFrame(reqId);
      reqId = 0;
    }

    // Process recorded audio
    if (source && source._chunks) {
      const chunks = source._chunks;
      console.log('Processing recorded chunks:', chunks.length, 'chunks');
      
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log('Total recorded length:', totalLength, 'samples');
      
      const recordedData = new Float32Array(totalLength);
      
      let offset = 0;
      for (const chunk of chunks) {
        recordedData.set(chunk, offset);
        offset += chunk.length;
      }

      // Create audio buffer
      const audioCtx = getAudioContext();
      recordedBuffer = audioCtx.createBuffer(1, recordedData.length, audioCtx.sampleRate);
      recordedBuffer.copyToChannel(recordedData, 0, 0);

      console.log('Created recorded buffer:', recordedBuffer.length, 'samples, duration:', recordedBuffer.duration, 'seconds');
      
      setStatus('Recording complete');
      document.getElementById('btnPlayRec').disabled = false;
      document.getElementById('btnToggleAB').disabled = !referenceBuffer;
      
      // Set mode to recorded for visualization
      currentMode = 'recorded';
    } else {
      console.error('No chunks found in source');
      setStatus('Recording failed - no audio data');
    }

    // Cleanup after processing
    cleanup();
    
  } catch (error) {
    setStatus('Failed to process recording');
    console.error('Stop recording failed:', error);
  }
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
    const audioCtx = getAudioContext();
    const source = audioCtx.createBufferSource();
    source.buffer = referenceBuffer;
    source.connect(audioCtx.destination);
    
    // Add error handling
    source.onerror = (e) => {
      console.error('Reference audio error:', e);
      setStatus('Reference audio error');
      stopPlaybackLine();
    };
    
    source.onended = () => {
      console.log('Reference audio playback ended');
      setStatus('Reference audio finished');
      stopPlaybackLine();
    };
    
    source.start();
    
    currentMode = 'reference';
    setStatus('Playing reference audio');
    
    // Start playback line animation
    startPlaybackLine(referenceBuffer.duration);
    
    // Visualize reference audio
    visualizeAudioBuffer(referenceBuffer, 'reference');
    
  } catch (error) {
    setStatus('Failed to play reference audio');
    console.error('Play reference failed:', error);
  }
}

/**
 * Play recorded audio
 */
function playRecording() {
  if (!recordedBuffer) {
    setStatus('No recording available');
    console.error('No recorded buffer available');
    return;
  }

  try {
    console.log('Playing recorded buffer:', recordedBuffer.length, 'samples, duration:', recordedBuffer.duration);
    
    const audioCtx = getAudioContext();
    const source = audioCtx.createBufferSource();
    source.buffer = recordedBuffer;
    source.connect(audioCtx.destination);
    
    // Add error handling
    source.onerror = (e) => {
      console.error('Audio source error:', e);
      setStatus('Audio playback error');
    };
    
    source.onended = () => {
      console.log('Recording playback ended');
      setStatus('Recording playback finished');
      stopPlaybackLine();
    };
    
    source.start();
    
    currentMode = 'recorded';
    setStatus('Playing your recording');
    
    // Start playback line animation
    startPlaybackLine(recordedBuffer.duration);
    
    // Visualize recorded audio
    visualizeAudioBuffer(recordedBuffer, 'recorded');
    
  } catch (error) {
    setStatus('Failed to play recording');
    console.error('Play recording failed:', error);
  }
}

/**
 * Start playback line animation
 */
function startPlaybackLine(duration) {
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
  }
  
  playbackStartTime = Date.now();
  playbackDuration = duration * 1000; // Convert to milliseconds
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
  
  const elapsed = Date.now() - playbackStartTime;
  const progress = Math.min(elapsed / playbackDuration, 1);
  
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
  const frameSize = 1024;
  const hopSize = 256;
  
  // Process audio in frames
  for (let i = 0; i < data.length - frameSize; i += hopSize) {
    const frame = data.slice(i, i + frameSize);
    
    // Compute spectrum for spectrogram
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
  if (currentMode === 'reference') {
    playRecording();
  } else {
    playReference();
  }
}

/**
 * Real-time visualization during recording
 */
function visualizeRecording() {
  if (!isRecording || !analyser) return;

  const bufferLength = analyser.fftSize;
  const timeData = new Float32Array(bufferLength);
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  
  analyser.getFloatTimeDomainData(timeData);
  analyser.getByteFrequencyData(freqData);

  // Add to spectrogram data
  spectrogramData.push(Array.from(freqData));
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

  // Update visualizations (no playback progress during live recording)
  drawSpectrogram();
  drawPitchContour();

  reqId = requestAnimationFrame(visualizeRecording);
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
  
  // Draw spectrogram with enhanced contrast
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
        ctx.fillRect(
          t * sliceWidth,
          canvas.height - (f + 1) * binHeight,
          sliceWidth,
          binHeight
        );
      }
    }
  }
  
  // Draw frequency labels
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = canvas.height - (i / 5) * canvas.height;
    ctx.fillText(`${Math.round(8000 * (1 - i / 5))}Hz`, canvas.width - 5, y + 3);
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
      if (source._recorder) {
        source._recorder.disconnect();
      }
      source.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    source = null;
  }
  
  analyser = null;
  isRecording = false;
}

/**
 * Compute spectrum for a frame of audio data
 */
function computeSpectrum(timeData) {
  const fftSize = Math.min(timeData.length, 256);
  const spectrum = new Array(fftSize / 2).fill(0);
  
  // Enhanced energy-based spectrum with better frequency distribution
  for (let i = 0; i < spectrum.length; i++) {
    let energy = 0;
    const binSize = Math.floor(timeData.length / spectrum.length);
    const start = i * binSize;
    const end = Math.min(start + binSize, timeData.length);
    
    // Apply windowing for better frequency resolution
    for (let j = start; j < end; j++) {
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * (j - start) / (end - start));
      energy += (timeData[j] * window) * (timeData[j] * window);
    }
    
    // Normalize and apply frequency weighting for better visibility
    const normalizedEnergy = Math.sqrt(energy / binSize);
    
    // Boost lower frequencies slightly for better visibility
    const freqBoost = 1 + (0.3 * (1 - i / spectrum.length));
    
    spectrum[i] = Math.min(255, normalizedEnergy * 255 * freqBoost);
  }
  
  return spectrum;
}

/**
 * Simple pitch estimation using autocorrelation
 */
function estimatePitch(buffer, sampleRate) {
  const bufferSize = buffer.length;
  if (bufferSize < 1024) return 0;
  
  // Find the best autocorrelation
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 300); // ~300Hz max
  const maxOffset = Math.floor(sampleRate / 80);  // ~80Hz min
  
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
  
  if (bestCorrelation > 0.3 && bestOffset > 0) {
    return sampleRate / bestOffset;
  }
  
  return 0;
}

// Export for global access
window.toneLab = {
  openToneLab,
  closeToneLab
};
