// =============================================================================
// File:    sketch.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   2 — Clean Signal
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// Stage 1 showed us the raw waveform — which clearly has a heartbeat shape
// but is also noisy and rides on a slowly-drifting baseline. This sketch adds
// two signal-processing steps to produce a clean, centred waveform:
//
//   Step 1 — Background subtraction
//     The "background" is the slow DC drift in the raw signal — the sensor's
//     ambient reading that shifts gradually as you press harder, move your
//     finger, or as the sensor warms up. We estimate this drift by computing
//     the mean (average) of the last 5 seconds of raw samples. Subtracting
//     the mean from each new sample centres the waveform around zero so that
//     the heartbeat peaks stand up above a flat baseline.
//
//   Step 2 — Moving-average smoothing
//     Even after background subtraction, the signal still has rapid
//     sample-to-sample jitter (high-frequency noise). Averaging the last
//     N samples together blurs out the fast noise while preserving the
//     slower heartbeat peaks — this is called a low-pass filter.
//
// WHAT IS DC DRIFT?
// -----------------
// "DC" stands for "Direct Current" — in signal processing it means any
// constant or very slowly changing offset in a signal. When you look at the
// raw waveform and the whole trace is sitting at 2100 instead of 2048, or it
// is slowly climbing over many seconds, that offset is called DC drift.
// Subtracting a long-window moving average removes it, leaving only the
// fast, interesting changes (the heartbeat).
//
// WHAT IS A LOW-PASS FILTER?
// --------------------------
// A filter passes some frequencies (rates of change) and blocks others.
// A low-pass filter keeps slow changes and removes fast ones:
//   • The 5-second baseline average keeps only very slow drift.
//     Subtracting it removes that drift (background subtraction).
//   • The 150 ms smoothing average keeps changes that are slower than ~7 Hz.
//     This removes the sample-to-sample jitter while keeping heartbeats (~1 Hz).
//
// WHAT IS DISPLAYED?
// ------------------
// The canvas is split into two halves:
//   Top half (blue)   — the raw signal, exactly as received from the ESP32
//   Bottom half (amber) — the cleaned signal: DC-free and smoothed
//
// HOW TO USE
// ----------
//   OpenProcessing — paste the contents of this file into a new sketch.
//   Locally        — open index.html in Chrome or Edge (WebSerial required).
//
// Arduino sketch: ../../stage-1-raw-waveform/stage_1_send_data/stage_1_send_data.ino
// (No changes to the Arduino sketch are needed for this stage.)

// =============================================================================
// CONSTANTS
// =============================================================================

// Time between Arduino samples. Must match the Arduino sketch (10 ms = 100 Hz).
const SAMPLE_INTERVAL_MS = 10;

// The ESP32 ADC produces integers from 0 (0 V) to 4095 (3.3 V).
const YMIN = 0;
const YMAX = 4095;

// The midpoint of the ADC range, used to pre-fill buffers so the waveform
// starts as a flat line in the centre of the canvas.
//
// The ADC produces only whole numbers (integers) from 0 to 4095 — a 12-bit
// binary range (2^12 = 4096 possible values). The true midpoint is
// (0 + 4095) / 2 = 2047.5, which is a decimal, not a whole number. That is
// fine here: JavaScript stores decimals without complaint, and 0.5 off-centre
// is invisible on screen.
const ADC_MID_SCALE = (YMIN + YMAX) / 2;

// Number of samples to keep in the display buffer = 5 seconds of history.
// 500 samples × 10 ms = 5000 ms = 5 s.
const BUFFER_SIZE = 500;

// Colours as [Red, Green, Blue] each 0–255.
const RAW_COLOR      = [100, 200, 255]; // light blue for the raw trace
const SMOOTHED_COLOR = [255, 180,  50]; // amber for the cleaned trace

// ── Background subtraction settings ─────────────────────────────────────────

// How many raw samples to average to estimate the baseline.
// 500 samples × 10 ms = 5 000 ms = 5 s window.
//
// WHY 5 SECONDS?
// A heartbeat lasts about 1 second, so a 5-second average smooths over many
// beats and tracks only the very slow drift — not the beats themselves.
// If BASELINE_N were too small (e.g., 10 samples = 0.1 s), the baseline would
// follow the heartbeat and subtract it away, which we don't want.
const BASELINE_N = 500;

// ── Smoothing settings ───────────────────────────────────────────────────────

// How many DC-free samples to average together for the smoothed trace.
// 15 samples × 10 ms = 150 ms window.
//
// WHY 15?
// It removes sample-to-sample jitter without making the heartbeat peaks too
// wide or delayed. Try changing this to 5 (noisier) or 30 (smoother) to
// see the effect.
const SMOOTH_N = 15;

// =============================================================================
// STATE — variables that change as new data arrives
// =============================================================================

// WebSerial connection objects (assigned when the user clicks "Connect ESP32").
let port, reader;

// Display buffers — pre-filled so the waveform starts as a flat line.
//
// rawBuffer is filled with ADC_MID_SCALE (~2048) because the raw signal lives
// in the 0–4095 ADC range. The midpoint is the best neutral value to start
// with — it places the flat line in the centre of the raw waveform panel.
//
// smoothedBuffer is filled with 0 because the cleaned signal has its DC
// (baseline) component removed. After subtraction the signal is centred
// around zero, so 0 is the correct neutral value there.
// The two different fill values are intentional.
let rawBuffer      = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE); // raw ADC values
let smoothedBuffer = new Array(BUFFER_SIZE).fill(0);             // cleaned values

// ── Baseline (background) buffer ─────────────────────────────────────────────
// This buffer holds the last BASELINE_N raw samples, from which we compute
// the rolling mean that forms the baseline estimate.
//
// baselineWindow — the array storing the raw samples in the window.
//   Pre-filled with ADC_MID_SCALE so the baseline starts at the midpoint.
// baselineSum    — the sum of all values currently in baselineWindow.
//   Keeping a running sum means we never have to loop over 500 items just to
//   compute the mean — we just do: mean = baselineSum / BASELINE_N.
let baselineWindow = new Array(BASELINE_N).fill(ADC_MID_SCALE);
let baselineSum    = BASELINE_N * ADC_MID_SCALE;

// ── Smoothing window ─────────────────────────────────────────────────────────
// Holds the last SMOOTH_N DC-free samples for the moving-average smoother.
// Starts empty; grows to SMOOTH_N elements and stays there.
let smoothWindow = [];

// =============================================================================
// WEBSERIAL — connecting to the ESP32 and reading incoming data
// =============================================================================

// connectSerial() — called when the user clicks "Connect ESP32"
async function connectSerial() {
  // Show the browser's port-picker popup so the user can select the ESP32.
  port = await navigator.serial.requestPort();

  // Open the port at 115200 baud (matching the Arduino sketch).
  await port.open({ baudRate: 115200 });

  // Attach a text decoder so we get readable characters instead of raw bytes.
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);

  // Create a reader we can call .read() on to pull text out of the stream.
  reader = decoder.readable.getReader();

  // Start reading in the background.
  readLoop();
}

// readLoop() — continuously reads lines of "timestamp,value" from the port
async function readLoop() {
  let partial = ""; // accumulates text that hasn't yet ended with a newline

  while (true) {
    // Wait for the next chunk of text from the serial port.
    const { value, done } = await reader.read();
    if (done) break; // port was closed; stop reading

    // Append the new chunk to any leftover text from the last iteration.
    partial += value;

    // Split into lines. The last element may be an incomplete line, so we
    // save it back into 'partial' with lines.pop() and loop over the rest.
    const lines = partial.split("\n");
    partial = lines.pop();

    for (const line of lines) {
      // Each complete line looks like "12345,2048" — split on the comma.
      const parts = line.trim().split(",");
      if (parts.length === 2) {
        const ts  = parseInt(parts[0]); // Arduino timestamp (ms since power-on)
        const val = parseInt(parts[1]); // raw ADC reading 0–4095
        // Skip any line where parseInt couldn't parse a valid number.
        if (!isNaN(val)) onNewSample(ts, val);
      }
    }
  }
}

// =============================================================================
// SIGNAL PROCESSING — the core maths that cleans the signal
// =============================================================================

// updateBuffer() — pushes a new value into a fixed-length rolling buffer.
// The buffer is like a queue: new items join at the back, old ones leave
// from the front, and the total length stays constant.
//
// buf   — the array to update
// value — the new value to add
function updateBuffer(buf, value) {
  buf.push(value);  // add to the end
  buf.shift();      // remove from the front (oldest value is discarded)
}

// removeBackground() — Step 1: background subtraction (low-pass filter #1)
//
// This function estimates the slow DC drift in the raw signal and returns
// the "DC-free" version that is centred near zero.
//
// HOW IT WORKS:
// 1. The oldest sample leaves the baseline window. Subtract it from the sum.
// 2. The new sample enters the window. Add it to the sum.
// 3. The baseline (the slow background level) = sum ÷ number of samples.
// 4. DC-free signal = raw − baseline.
//    If the baseline is 2100 and raw is 2250, the DC-free value is 150.
//    Now all heartbeat peaks are measured relative to zero instead of 2100.
//
// push/shift moves every item in the array one position — on a 500-item
// array that is 500 small operations per sample. At 100 samples per second
// that is 50 000 tiny steps per second, which a modern browser handles
// without any trouble.
function removeBackground(raw) {
  // Remove the oldest sample from the running sum, then drop it from the window.
  baselineSum -= baselineWindow.shift();

  // Add the new sample to the window and to the running sum.
  baselineWindow.push(raw);
  baselineSum += raw;

  // Compute the mean of all samples in the window.
  // Subtract it from the raw value to remove the slow baseline.
  return raw - baselineSum / BASELINE_N;
}

// movingAverage() — Step 2: smoothing (low-pass filter #2)
//
// Averages the last SMOOTH_N DC-free samples together. This blurs out fast
// noise (high-frequency jitter) while preserving the slower heartbeat shape.
//
// WHY DOES AVERAGING REMOVE NOISE?
// Noise is random — sometimes above zero, sometimes below. When you average
// many noisy samples, the random ups and downs cancel each other out, and
// you're left with the underlying signal. Heartbeat peaks are not random —
// they go up, then come back down, so they survive the averaging.
function movingAverage(value) {
  // Add the new DC-free sample to the smoothing window.
  smoothWindow.push(value);

  // If the window is larger than SMOOTH_N, drop the oldest sample.
  if (smoothWindow.length > SMOOTH_N) smoothWindow.shift();

  // Compute the mean by summing all values and dividing by how many there are.
  // (During startup, the window has fewer than SMOOTH_N items, so we divide
  // by smoothWindow.length rather than the constant SMOOTH_N to avoid
  // artificially scaling the average down.)
  let sum = 0;
  for (let v of smoothWindow) sum += v;
  return sum / smoothWindow.length;
}

// onNewSample() — called once for every incoming "timestamp,value" pair
//
// This is the main signal pipeline: raw → remove background → smooth → store.
function onNewSample(timestamp, raw) {
  // Store the raw value in the display buffer (for the top half of the canvas).
  updateBuffer(rawBuffer, raw);

  // Step 1: subtract the slowly-changing background to get a DC-free signal.
  let dc = removeBackground(raw);

  // Step 2: smooth the DC-free signal to reduce sample-to-sample jitter.
  let sm = movingAverage(dc);

  // Store the cleaned value in the smoothed display buffer (for the bottom half).
  updateBuffer(smoothedBuffer, sm);
}

// =============================================================================
// p5.js — setup and drawing
// =============================================================================

// setup() runs once when the page loads.
function setup() {
  createCanvas(800, 400);   // 800 px wide, 400 px tall
  textFont("monospace");

  // Create the "Connect ESP32" button and attach it to connectSerial().
  let btn = createButton("Connect ESP32");
  btn.mousePressed(connectSerial);
}

// draw() runs ~60 times per second. Each call redraws everything from scratch.
function draw() {
  // Dark background to erase the previous frame.
  background(20);

  // halfH is the y-coordinate of the horizontal dividing line between the two
  // halves of the canvas (200 px from the top in an 800×400 canvas).
  let halfH = height / 2;

  // ── Top half: raw signal ──────────────────────────────────────────────────

  stroke(RAW_COLOR[0], RAW_COLOR[1], RAW_COLOR[2]);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    // x: spread the buffer across the full canvas width.
    let x = map(i, 0, rawBuffer.length - 1, 0, width);

    // y: map ADC range (0–4095) to the top half of the canvas (10 to halfH-10).
    // Swapping the output range (halfH-10 first, then 10) flips the axis so
    // larger ADC values appear higher on screen (more natural to read).
    let y = map(rawBuffer[i], YMIN, YMAX, halfH - 10, 10);

    vertex(x, y);
  }
  endShape();

  // ── Bottom half: smoothed DC-free signal ─────────────────────────────────

  stroke(SMOOTHED_COLOR[0], SMOOTHED_COLOR[1], SMOOTHED_COLOR[2]);
  noFill();
  beginShape();
  for (let i = 0; i < smoothedBuffer.length; i++) {
    let x = map(i, 0, smoothedBuffer.length - 1, 0, width);

    // The cleaned signal is centred near 0. We map the range -500 to +500
    // (a reasonable span for the heartbeat signal after DC removal) to the
    // bottom half of the canvas (halfH+10 to height-10).
    // Swapping the output range again so positive values go upward.
    let y = map(smoothedBuffer[i], -500, 500, height - 10, halfH + 10);

    vertex(x, y);
  }
  endShape();

  // ── Divider line between top and bottom halves ────────────────────────────

  stroke(60);                    // dim grey
  line(0, halfH, width, halfH);  // horizontal line across the full canvas width

  // ── Labels ────────────────────────────────────────────────────────────────

  noStroke();
  textSize(14);

  // "RAW" label near the top-left, in blue.
  fill(RAW_COLOR[0], RAW_COLOR[1], RAW_COLOR[2]);
  text("RAW", 10, 20);

  // "SMOOTHED (DC-free)" label just below the dividing line, in amber.
  fill(SMOOTHED_COLOR[0], SMOOTHED_COLOR[1], SMOOTHED_COLOR[2]);
  text("SMOOTHED (DC-free)", 10, halfH + 20);
}

