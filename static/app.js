// ─────────────────────────────────────────────
//  Vision Search Studio — app.js
//  Canvas-based frame player + YOLOE detection
// ─────────────────────────────────────────────

// ── Backend config ────────────────────────────
// Paste your ngrok URL here each Colab restart.
// e.g. "https://abc123.ngrok-free.app"
const API_BASE = "http://127.0.0.1:5000";

// ── COCO Labels (used as YOLOE text prompts) ──
const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
  "truck", "boat", "traffic light", "fire hydrant", "stop sign",
  "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep",
  "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
  "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
  "sports ball", "kite", "baseball bat", "baseball glove", "skateboard",
  "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
  "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
  "couch", "potted plant", "bed", "dining table", "toilet", "tv",
  "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave",
  "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
  "scissors", "teddy bear", "hair drier", "toothbrush"
];

// ── App State ─────────────────────────────────
let activePrompt = null;
let confidence = 0.50;
let videoLoaded = false;
let fpsInterval = null;

let lastDetectedFrame = -1;
let detectionLoop = null;
let lastTime = 0;
let detecting = false;

// ── DOM References ────────────────────────────
const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const fpsVal = document.getElementById('fpsVal');
const labelsGrid = document.getElementById('labelsGrid');
const confSlider = document.getElementById('confSlider');
const confVal = document.getElementById('confVal');
const mainVideo = document.getElementById('mainVideo');
const placeholder = document.getElementById('placeholder');
const bboxOverlay = document.getElementById('bboxOverlay');
const videoLabel = document.getElementById('videoLabel');
const trackingStatus = document.getElementById('trackingStatus');
const logArea = document.getElementById('logArea');

// Stats panel
const sDom = {
  prompt: document.getElementById('s-prompt'),
  objects: document.getElementById('s-objects'),
  tracks: document.getElementById('s-tracks'),
  conf: document.getElementById('s-conf'),
  frame: document.getElementById('s-frame'),
  total: document.getElementById('s-total'),
  fps: document.getElementById('s-fps'),
};

// ── Build Label Buttons ───────────────────────
function buildLabels() {
  COCO_LABELS.forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'label-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => selectPrompt(label, btn));
    labelsGrid.appendChild(btn);
  });
}

// ── Prompt Selection ──────────────────────────
function selectPrompt(label, btn) {
  // Toggle off if already active
  if (activePrompt === label) {
    activePrompt = null;
    btn.classList.remove('active');
    sDom.prompt.textContent = '—';
    clearBoxes();
    addLog('prompt', 'Prompt cleared');
    setStatus('idle');
    return;
  }

  // Deselect previous
  document.querySelectorAll('.label-btn').forEach(b => b.classList.remove('active'));

  // Select new
  btn.classList.add('active');
  activePrompt = label;
  sDom.prompt.textContent = label;
  addLog('prompt', `Prompt set → "${label}"`);

  if (videoLoaded) {
    setStatus('running');
    runDetection(); // kick off immediately on prompt select
  }
}

// ── Confidence Slider ─────────────────────────
function updateConf(value) {
  confidence = parseFloat(value);
  confVal.textContent = confidence.toFixed(2);
}

function resizeOverlay() {
  const rect = mainVideo.getBoundingClientRect();

  bboxOverlay.setAttribute("width", rect.width);
  bboxOverlay.setAttribute("height", rect.height);
}

// ── Video Loading ─────────────────────────────
function loadVideo(event) {
  const file = event.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  mainVideo.src = url;
  mainVideo.style.display = 'block';
  placeholder.style.display = 'none';

  videoLabel.textContent = file.name;
  videoLoaded = true;

  addLog('event', `Video loaded: ${file.name}`);

  mainVideo.onloadedmetadata = () => {
    resizeOverlay();

    const totalFrames = Math.round(mainVideo.duration * 30);
    sDom.total.textContent = totalFrames;
    sDom.frame.textContent = '0';

    addLog('event', `Duration: ${mainVideo.duration.toFixed(1)}s`);
  };

  window.addEventListener("resize", resizeOverlay);
  mainVideo.addEventListener("loadeddata", resizeOverlay);

  if (activePrompt) {
    setStatus('running');
    runDetection();
  }
}

// ── Video Playback Events ─────────────────────
function onVideoPlay() {
  setStatus(activePrompt ? 'running' : 'processing');
  trackingStatus.textContent = activePrompt ? '● Tracking active' : '';
  addLog('event', 'Playback started');
  startFpsSim();

  startDetectionLoop();
}

function startDetectionLoop() {
  stopDetectionLoop();
  detectionLoop = setInterval(() => {
    runDetection(); // skipped automatically if previous call still pending
  }, 10); // tries every 100ms, but won't overlap
}

function onVideoPause() {
  setStatus('idle');
  trackingStatus.textContent = '';
  addLog('event', 'Playback paused');
  stopFpsSim();
  stopDetectionLoop();
}

function stopDetectionLoop() {
  if (detectionLoop) {
    clearInterval(detectionLoop);
    detectionLoop = null;
  }
}


// ── FPS Simulation ────────────────────────────
// Replace with real FPS from your Flask backend (WebSocket / SSE)
function startFpsSim() {
  fpsInterval = setInterval(() => {
    const fps = (24 + Math.random() * 10).toFixed(1);
    fpsVal.textContent = `${fps} FPS`;
    sDom.fps.textContent = fps;
  }, 500);
}

function stopFpsSim() {
  clearInterval(fpsInterval);
  fpsVal.textContent = '-- FPS';
  sDom.fps.textContent = '—';
}

// ── Detection Simulation ──────────────────────
async function runDetection() {
  if (!videoLoaded || !activePrompt || detecting) return;
  detecting = true;

  const canvas = document.createElement("canvas");
  // ↓ Downscale for speed — server still gets enough detail
  canvas.width = 640;
  canvas.height = Math.round(mainVideo.videoHeight * (640 / mainVideo.videoWidth));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);
  const frame_b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1]; // lower quality = faster

  try {
    const res = await fetch(`${API_BASE}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_b64, prompt: activePrompt, confidence }),
    });

    const data = await res.json();
    if (!data.error) {
      sDom.objects.textContent = data.count;
      sDom.tracks.textContent = data.track_ids?.length ? data.track_ids.join(", ") : "—";
      sDom.conf.textContent = data.avg_conf || "—";
      drawBoxes(data.boxes);
    }
  } catch (err) {
    addLog("warn", err.message);
  } finally {
    detecting = false; // ← always unlock, even on error
  }
}


// ── Bounding Box Drawing ──────────────────────
function drawBoxes(boxes) {
  clearBoxes();

  const rect = mainVideo.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  boxes.forEach(b => {
    const x = b.x * w;
    const y = b.y * h;
    const bw = b.width * w;
    const bh = b.height * h;

    // BOX RECT
    const box = makeSVG("rect", {
      x,
      y,
      width: bw,
      height: bh,
      fill: "none",
      stroke: "#58a6ff",
      "stroke-width": "2"
    });

    // LABEL BACKGROUND
    const label = `${b.label} ${(b.conf * 100).toFixed(0)}%`;

    const text = makeSVG("text", {
      x: x + 4,
      y: y - 5,
      fill: "#fff",
      "font-size": "12",
      "font-family": "monospace"
    });

    text.textContent = label;

    bboxOverlay.appendChild(box);
    bboxOverlay.appendChild(text);
  });
}


function clearBoxes() {
  bboxOverlay.innerHTML = '';
}

// SVG element factory
function makeSVG(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

// ── Status Badge ──────────────────────────────
function setStatus(state) {
  statusBadge.className = 'status-badge';
  statusDot.className = 'dot';

  const states = {
    idle: { badge: 'status-idle', dot: 'dot-idle', label: 'Idle' },
    running: { badge: 'status-running', dot: 'dot-running', label: 'Running' },
    processing: { badge: 'status-processing', dot: 'dot-processing', label: 'Processing' },
  };

  const s = states[state] || states.idle;
  statusBadge.classList.add(s.badge);
  statusDot.classList.add(s.dot);
  statusText.textContent = s.label;
}

// ── Event Log ─────────────────────────────────
/**
 * @param {'event'|'prompt'|'warn'} type
 * @param {string} message
 */
function addLog(type, message) {
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);

  const prefixMap = { event: '[EVT]', prompt: '[PRM]', warn: '[WRN]' };
  const classMap = { event: 'log-event', prompt: 'log-prompt', warn: 'log-warn' };

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">${ts}</span>
    <span class="${classMap[type] || 'log-info'}">${prefixMap[type] || '[LOG]'}</span>
    <span class="log-info">${message}</span>
  `;

  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function clearLog() {
  logArea.innerHTML = '';
}

// ── Export ────────────────────────────────────
async function exportVideo() {
  if (!videoLoaded) {
    addLog("warn", "No video loaded to export");
    return;
  }
  if (!activePrompt) {
    addLog("warn", "Select a prompt before exporting");
    return;
  }

  addLog("event", `Exporting video with prompt "${activePrompt}"...`);
  setStatus("processing");

  // Re-upload original file for server-side processing
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("video", file);
  formData.append("prompt", activePrompt);
  formData.append("confidence", confidence);

  try {
    const res = await fetch(`${API_BASE}/api/export`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    // Trigger download in browser
    const link = document.createElement("a");
    link.href = `data:video/mp4;base64,${data.video_b64}`;
    link.download = `export_${activePrompt}.mp4`;
    link.click();

    addLog("event", "Export complete — download started");
    setStatus("idle");

  } catch (err) {
    addLog("warn", `Export failed: ${err.message}`);
    setStatus("idle");
  }
}

// ── Init ──────────────────────────────────────
buildLabels();
addLog('event', 'Vision Search Studio initialized');
addLog('event', 'YOLOE model ready — awaiting prompt and video');
