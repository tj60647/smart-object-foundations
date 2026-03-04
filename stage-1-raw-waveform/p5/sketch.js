// Stage 1 — Raw Waveform Display
// Smart Object Foundations — MDes Prototyping, CCA
//
// Connects to the ESP32 via WebSerial and draws a scrolling raw waveform.
//
// How to use:
//   OpenProcessing — paste the contents of this file into a new sketch.
//   Locally        — open index.html in Chrome or Edge (WebSerial required).
//
// Arduino sketch: ../stage_1_send_data/stage_1_send_data.ino

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS = 10;           // must match Arduino sketch (100 Hz)
const YMIN          = 0;
const YMAX          = 4095;             // ESP32 12-bit ADC range
const ADC_MID_SCALE = (YMIN + YMAX) / 2; // nominal midpoint ≈ 2048
const BUFFER_SIZE   = 500;              // samples displayed (5 s at 100 Hz)
const RAW_COLOR     = [100, 200, 255];  // blue

// ── State ─────────────────────────────────────────────────────────────────────
let port, reader;
let rawBuffer = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE);

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
    partial = lines.pop();             // keep any incomplete line
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

// ── Signal pipeline ───────────────────────────────────────────────────────────
// Helper: push a value into a fixed-length rolling buffer
function updateBuffer(buf, value) {
  buf.push(value);
  buf.shift();
}

function onNewSample(timestamp, raw) {
  updateBuffer(rawBuffer, raw);
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

  // Raw waveform
  stroke(...RAW_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, height - 20, 20);
    vertex(x, y);
  }
  endShape();

  // Label
  noStroke();
  fill(...RAW_COLOR);
  textSize(14);
  text("RAW", 10, 20);
}
