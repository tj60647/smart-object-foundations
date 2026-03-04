// Stage 3 — Heartbeat Detection with Confidence
// Smart Object Foundations — MDes Prototyping, CCA
//
// Full signal processing pipeline:
//   raw → background subtraction → moving average → differentiation
//       → peak detection → BPM + confidence value
//
// The canvas shows:
//   Top trace (blue)     — raw signal from the ESP32
//   Bottom trace (amber) — smoothed, DC-free signal
//   Red tick marks       — detected heartbeat peaks
//   Top-right readout    — BPM (large) and confidence % (color-coded)
//
// How to use:
//   OpenProcessing — paste the contents of this file into a new sketch.
//   Locally        — open index.html in Chrome or Edge (WebSerial required).
//
// Arduino sketch: ../../stage-1-raw-waveform/stage_1_send_data/stage_1_send_data.ino
// (No changes to the Arduino sketch are needed for this stage.)

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS = 10;           // must match Arduino sketch (100 Hz)
const YMIN           = 0;
const YMAX           = 4095;            // ESP32 12-bit ADC range
const ADC_MID_SCALE  = (YMIN + YMAX) / 2;
const BUFFER_SIZE    = 500;             // 5 s of history at 100 Hz

const RAW_COLOR      = [100, 200, 255]; // blue
const SMOOTHED_COLOR = [255, 180,  50]; // amber

// Background subtraction
const BASELINE_ALPHA = 0.002; // EMA time constant ≈ 5 s at 100 Hz

// Smoothing
const SMOOTH_N = 15; // 150 ms window at 100 Hz

// Peak detection.
// AMPLITUDE_THRESHOLD applies to the DC-free smoothed signal (not raw ADC).
// After background subtraction the signal is centered near 0.
// Heartbeat peaks typically rise 50–300 units above that centre.
// Lower this value if beats are missed; raise it if noise triggers false peaks.
const AMPLITUDE_THRESHOLD = 80;
const MAX_PEAKS_STORED    = 12;

// Confidence display thresholds (0–1 scale)
const CONFIDENCE_HIGH = 0.7;
const CONFIDENCE_MED  = 0.4;

// ── State ─────────────────────────────────────────────────────────────────────
let port, reader;
let rawBuffer      = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE);
let smoothedBuffer = new Array(BUFFER_SIZE).fill(0);

let baseline     = ADC_MID_SCALE;
let smoothWindow = [];
let prevSmoothed = 0;
let prevSlope    = 0;

// sampleCount is a monotonically increasing counter used to position peaks
// on the canvas without relying on the Arduino's clock.
let sampleCount      = 0;
let peakSampleCounts = []; // sampleCount value at each detected peak

// ── WebSerial ─────────────────────────────────────────────────────────────────
async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);
  reader = decoder.readable.getReader();
  readLoop();
}

async function readLoop() {
  let partial = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    partial += value;
    const lines = partial.split("\n");
    partial = lines.pop();
    for (const line of lines) {
      const parts = line.trim().split(",");
      if (parts.length === 2) {
        const ts  = parseInt(parts[0]);
        const val = parseInt(parts[1]);
        if (!isNaN(val)) onNewSample(ts, val);
      }
    }
  }
}

// ── Signal processing ─────────────────────────────────────────────────────────
function updateBuffer(buf, value) {
  buf.push(value);
  buf.shift();
}

// Step 1: background subtraction via EMA — removes slow DC drift
function removeBackground(raw) {
  baseline += BASELINE_ALPHA * (raw - baseline);
  return raw - baseline;
}

// Step 2: moving average — low-pass smoothing (integration)
function movingAverage(value) {
  smoothWindow.push(value);
  if (smoothWindow.length > SMOOTH_N) smoothWindow.shift();
  let sum = 0;
  for (let v of smoothWindow) sum += v;
  return sum / smoothWindow.length;
}

// Step 3: differentiation — first difference (discrete derivative)
// A positive-to-negative zero crossing marks the top of a heartbeat peak.
function differentiate(smoothed) {
  let slope    = smoothed - prevSmoothed;
  prevSmoothed = smoothed;
  return slope;
}

// Step 4: peak detection — zero crossing gated by amplitude threshold
function detectPeak(smoothedValue, slope) {
  let isPeakZeroCrossing = (prevSlope > 0 && slope <= 0);
  let isAboveThreshold   = (smoothedValue > AMPLITUDE_THRESHOLD);

  if (isPeakZeroCrossing && isAboveThreshold) {
    peakSampleCounts.push(sampleCount);
    if (peakSampleCounts.length > MAX_PEAKS_STORED) peakSampleCounts.shift();
  }

  prevSlope = slope;
}

// Step 5: BPM + confidence from inter-beat intervals (IBIs)
// IBIs are computed from sampleCount differences to avoid any clock mismatch
// between the Arduino and the browser.
function calculateBPMandConfidence() {
  if (peakSampleCounts.length < 3) return { bpm: 0, confidence: 0 };

  let intervals = [];
  for (let i = 1; i < peakSampleCounts.length; i++) {
    let samplesBetween = peakSampleCounts[i] - peakSampleCounts[i - 1];
    intervals.push(samplesBetween * SAMPLE_INTERVAL_MS); // convert to ms
  }

  let n    = intervals.length;
  let mean = intervals.reduce((a, b) => a + b, 0) / n;
  let bpm  = 60000 / mean;

  let variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  let stdDev   = Math.sqrt(variance);

  // Coefficient of variation (CV): 0 = perfectly regular, higher = more variable
  let cv = stdDev / mean;

  // Map CV to a 0–1 confidence score; CV > 0.3 is considered unreliable
  let confidence = Math.max(0, 1 - cv / 0.3);

  return { bpm, confidence };
}

function onNewSample(timestamp, raw) {
  sampleCount++; // increment first so detectPeak gets the right index
  updateBuffer(rawBuffer, raw);

  let dc    = removeBackground(raw);
  let sm    = movingAverage(dc);
  updateBuffer(smoothedBuffer, sm);

  let slope = differentiate(sm);
  detectPeak(sm, slope);
}

// ── p5.js ─────────────────────────────────────────────────────────────────────
function setup() {
  createCanvas(800, 400);
  textFont("monospace");
  let btn = createButton("Connect ESP32");
  btn.mousePressed(connectSerial);
}

function draw() {
  background(20);
  let halfH = height / 2;

  // Top: raw signal
  stroke(...RAW_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, halfH - 10, 10);
    vertex(x, y);
  }
  endShape();

  // Bottom: smoothed DC-free signal
  stroke(...SMOOTHED_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < smoothedBuffer.length; i++) {
    let x = map(i, 0, smoothedBuffer.length - 1, 0, width);
    let y = map(smoothedBuffer[i], -500, 500, height - 10, halfH + 10);
    vertex(x, y);
  }
  endShape();

  // Divider line
  stroke(60);
  line(0, halfH, width, halfH);

  // Peak tick marks on the smoothed trace.
  // x position derived from sampleCount — same coordinate system as the buffer.
  stroke(255, 80, 80);
  for (let ps of peakSampleCounts) {
    let samplesAgo = sampleCount - ps;
    if (samplesAgo >= 0 && samplesAgo < rawBuffer.length) {
      let x = map(rawBuffer.length - samplesAgo, 0, rawBuffer.length - 1, 0, width);
      line(x, halfH + 10, x, height - 10);
    }
  }

  // BPM and confidence readout
  let { bpm, confidence } = calculateBPMandConfidence();
  noStroke();
  textSize(14);
  fill(...RAW_COLOR);
  text("RAW", 10, 20);
  fill(...SMOOTHED_COLOR);
  text("SMOOTHED (DC-free)", 10, halfH + 20);

  fill(255);
  textSize(32);
  text(bpm > 0 ? `${bpm.toFixed(0)} BPM` : "-- BPM", width - 215, 42);

  textSize(14);
  let confPct = (confidence * 100).toFixed(0);
  if      (confidence >= CONFIDENCE_HIGH) fill(80,  255, 80);
  else if (confidence >= CONFIDENCE_MED)  fill(255, 200,  0);
  else                                    fill(255,  80, 80);
  text(`Confidence: ${confPct}%`, width - 215, 62);
}
