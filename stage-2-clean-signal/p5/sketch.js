// Stage 2 — Clean Signal
// Smart Object Foundations — MDes Prototyping, CCA
//
// Builds on Stage 1. Adds:
//   1. Background subtraction — exponential moving average (EMA) removes
//      slow DC drift so the waveform is centered around zero.
//   2. Moving-average smoothing — averages the last N DC-free samples to
//      reduce high-frequency noise.
//
// The canvas shows two stacked traces:
//   Top (blue)   — raw signal as received from the ESP32
//   Bottom (amber) — smoothed, DC-free signal
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

// Background subtraction: EMA time constant ≈ 1 / (BASELINE_ALPHA × sampleRate)
// At 100 Hz and α = 0.002 → ~5 second time constant
// Increase α to track faster (but risks removing the heartbeat signal itself).
const BASELINE_ALPHA = 0.002;

// Smoothing window: average over this many DC-free samples.
// 15 samples × 10 ms = 150 ms window.
// Try 5 (less smooth) or 30 (more smooth) to see the effect.
const SMOOTH_N = 15;

// ── State ─────────────────────────────────────────────────────────────────────
let port, reader;
let rawBuffer      = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE);
let smoothedBuffer = new Array(BUFFER_SIZE).fill(0);

let baseline     = ADC_MID_SCALE; // adapts to the signal's DC offset
let smoothWindow = [];            // holds the last SMOOTH_N DC-free samples

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

// Step 1: background subtraction via exponential moving average.
// Returns the DC-free signal centered near zero.
function removeBackground(raw) {
  baseline += BASELINE_ALPHA * (raw - baseline);
  return raw - baseline;
}

// Step 2: moving average — low-pass smoothing (integration).
function movingAverage(value) {
  smoothWindow.push(value);
  if (smoothWindow.length > SMOOTH_N) smoothWindow.shift();
  let sum = 0;
  for (let v of smoothWindow) sum += v;
  return sum / smoothWindow.length;
}

function onNewSample(timestamp, raw) {
  updateBuffer(rawBuffer, raw);

  let dc = removeBackground(raw);
  let sm = movingAverage(dc);

  updateBuffer(smoothedBuffer, sm);
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

  // Top half: raw signal
  stroke(...RAW_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, halfH - 10, 10);
    vertex(x, y);
  }
  endShape();

  // Bottom half: smoothed DC-free signal (centered around halfH)
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

  // Labels
  noStroke();
  textSize(14);
  fill(...RAW_COLOR);
  text("RAW", 10, 20);
  fill(...SMOOTHED_COLOR);
  text("SMOOTHED (DC-free)", 10, halfH + 20);
}
