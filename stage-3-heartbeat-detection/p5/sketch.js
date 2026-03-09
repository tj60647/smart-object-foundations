// =============================================================================
// File:    sketch.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   3 — Heartbeat Detection with Confidence
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// This sketch is the complete signal processing pipeline. It takes the raw
// sensor data and transforms it step by step into:
//   • A cleaned, DC-free, smoothed waveform (same as Stage 2)
//   • Detected heartbeat peaks, shown as red tick marks
//   • A real-time BPM (beats per minute) readout
//   • A confidence percentage that tells you how regular the beats are
//
// THE FULL PIPELINE
// -----------------
//   raw signal
//     → Step 1: background subtraction   (removes slow DC drift)
//     → Step 2: moving-average smoothing (removes fast noise)
//     → Step 3: differentiation          (finds the moment of each peak)
//     → Step 4: peak detection           (records when each beat occurs)
//     → Step 5: BPM + confidence         (calculates heart rate)
//
// WHAT IS DIFFERENTIATION?
// -------------------------
// Differentiation means measuring the *rate of change* of a signal. In
// discrete (sampled) signals, we approximate this by taking the difference
// between consecutive samples:
//
//   slope = signal[now] - signal[one step ago]
//
// When the signal is rising, slope is positive.
// When the signal is falling, slope is negative.
// When the signal is at its peak — transitioning from rising to falling —
// the slope crosses through zero. This zero-crossing is exactly where the
// heartbeat peak is.
//
// WHAT IS PEAK DETECTION?
// -----------------------
// We want to identify the highest point of each heartbeat. Two conditions
// must both be true to call a peak:
//   1. Zero crossing: the slope just changed from positive to negative
//      (we went from rising to falling — the peak is between those samples).
//   2. Amplitude threshold: the signal value is above AMPLITUDE_THRESHOLD.
//      This prevents noise from triggering false "peaks" near the baseline.
//
// WHAT IS BPM?
// ------------
// BPM stands for "beats per minute" — how many heartbeats occur in one minute.
// Normal resting heart rate is roughly 60–100 BPM.
//
// We calculate BPM from the *inter-beat intervals* (IBIs) — the time gap
// between each pair of consecutive peaks. If the average gap between beats
// is 750 ms, then:
//   BPM = 60 000 ms per minute ÷ 750 ms per beat = 80 BPM
//
// WHAT IS CONFIDENCE?
// -------------------
// Even with a good algorithm, BPM is only trustworthy if the beats are
// arriving at regular intervals. If the IBIs are all similar (e.g., 740 ms,
// 750 ms, 755 ms), we can be confident. If they vary wildly (500 ms, 900 ms,
// 600 ms), something is wrong — perhaps the sensor is moving, or a peak was
// missed.
//
// We measure this regularity using the *coefficient of variation* (CV):
//   CV = standard deviation of IBIs ÷ mean of IBIs
// CV near 0 means very regular; CV near 1 means very irregular.
// We convert CV to a 0–100% confidence score and colour-code it:
//   green  = high confidence (≥ 70%)
//   yellow = medium confidence (40–70%)
//   red    = low confidence (< 40%)
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

// Time between Arduino samples (must match the Arduino sketch): 10 ms = 100 Hz.
const SAMPLE_INTERVAL_MS = 10;

// ADC range for the ESP32's 12-bit converter.
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

// Number of samples to keep for the display waveform (5 s × 100 Hz = 500).
const BUFFER_SIZE = 500;

// Drawing colours as [R, G, B] each 0–255.
const RAW_COLOR      = [100, 200, 255]; // light blue — raw trace
const SMOOTHED_COLOR = [255, 180,  50]; // amber — cleaned trace

// ── Background subtraction ───────────────────────────────────────────────────

// Window size for the baseline moving average.
// 500 samples × 10 ms = 5 s — slow enough to follow only the DC drift,
// not the heartbeat itself.
const BASELINE_N = 500;

// ── Smoothing ────────────────────────────────────────────────────────────────

// Window size for the smoothing moving average.
// 15 samples × 10 ms = 150 ms window.
const SMOOTH_N = 15;

// ── Peak detection ───────────────────────────────────────────────────────────

// Minimum signal amplitude for a peak to be counted as a heartbeat.
// The cleaned signal is centred around 0. Heartbeat peaks typically rise
// 50–300 units above zero depending on sensor placement and pressure.
// If AMPLITUDE_THRESHOLD is too low, noise will trigger false peaks.
// If too high, real beats may be missed.
const AMPLITUDE_THRESHOLD = 80;

// Maximum number of recent peak timestamps to remember.
// Storing ~12 peaks gives about 10 inter-beat intervals — enough to
// compute a stable average BPM and confidence.
const MAX_PEAKS_STORED = 12;

// ── Confidence display thresholds ────────────────────────────────────────────

// Confidence is expressed as a fraction from 0.0 (no confidence) to 1.0
// (perfect confidence). These thresholds determine the colour of the readout.
const CONFIDENCE_HIGH = 0.7; // ≥ 70% → green
const CONFIDENCE_MED  = 0.4; // ≥ 40% → yellow; below this → red

// =============================================================================
// STATE — variables that change as new data arrives
// =============================================================================

// WebSerial connection objects.
let port, reader;

// Display buffers for the two waveform traces.
//
// rawBuffer is filled with ADC_MID_SCALE (~2048) because the raw signal lives
// in the 0–4095 ADC range. The midpoint is the best neutral value to start
// with — it places the flat line in the centre of the raw waveform panel.
//
// smoothedBuffer is filled with 0 because the cleaned signal has its DC
// (baseline) component removed. After subtraction the signal is centred
// around zero, so 0 is the correct neutral value there.
// The two different fill values are intentional.
let rawBuffer      = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE); // raw values
let smoothedBuffer = new Array(BUFFER_SIZE).fill(0);             // cleaned values

// ── Baseline subtraction state ───────────────────────────────────────────────

// Rolling buffer of raw samples for estimating the baseline.
let baselineWindow = new Array(BASELINE_N).fill(ADC_MID_SCALE);
// Running sum of baselineWindow — updated cheaply on each new sample.
let baselineSum    = BASELINE_N * ADC_MID_SCALE;

// ── Smoothing state ──────────────────────────────────────────────────────────

// Rolling buffer of DC-free samples for the moving-average smoother.
let smoothWindow = [];

// ── Differentiation state ────────────────────────────────────────────────────

// The smoothed value from the previous sample — needed to compute slope.
//
// Initialised to 0. On the very first sample, differentiate() computes
// slope = smoothed - 0. Then detectPeak() checks prevSlope (also 0) > 0,
// which is false — so no spurious peak fires on startup. Safe by design,
// but not obvious from the code alone.
let prevSmoothed = 0;

// The slope (derivative) from the previous sample — needed to detect when
// slope crosses from positive to negative (zero crossing = peak).
// Also initialised to 0 for the same safe-startup reason described above.
let prevSlope = 0;

// ── Peak detection state ─────────────────────────────────────────────────────

// A counter that goes up by 1 every time a new sample arrives and never resets.
// We use this instead of the Arduino's timestamp to position detected peaks
// on the canvas, avoiding any mismatch between the two clocks.
let sampleCount = 0;

// List of sampleCount values at which peaks were detected (most recent first).
// As new peaks are found, old ones fall off the end.
let peakSampleCounts = [];

// =============================================================================
// WEBSERIAL — connecting to the ESP32 and reading lines
// =============================================================================

// connectSerial() — opens the browser's port picker and starts reading.
async function connectSerial() {
  port = await navigator.serial.requestPort();   // user picks the ESP32 port
  await port.open({ baudRate: 115200 });          // open at 115200 baud

  // Decode the incoming byte stream into readable text.
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);
  reader = decoder.readable.getReader();

  readLoop(); // start the background reading loop
}

// readLoop() — reads "timestamp,value" lines as they arrive from the ESP32.
async function readLoop() {
  let partial = ""; // holds incomplete line fragments between read() calls

  while (true) {
    const { value, done } = await reader.read(); // wait for the next chunk of text
    if (done) break;                              // port closed — exit

    partial += value;

    // Split the accumulated text on newlines to get complete lines.
    const lines = partial.split("\n");
    partial = lines.pop(); // the last element may be an incomplete line — keep it

    for (const line of lines) {
      const parts = line.trim().split(","); // e.g. "12345,2048" → ["12345","2048"]
      if (parts.length === 2) {
        const ts  = parseInt(parts[0]); // Arduino timestamp in milliseconds
        const val = parseInt(parts[1]); // raw ADC reading 0–4095
        // parseInt() returns NaN (Not a Number) if the text can't be parsed
        // as an integer (e.g. a blank line or corrupted data). isNaN() catches
        // that and skips the bad value rather than passing garbage downstream.
        if (!isNaN(val)) onNewSample(ts, val);
      }
    }
  }
}

// =============================================================================
// SIGNAL PROCESSING
// =============================================================================

// updateBuffer() — appends a new value to a rolling fixed-length buffer.
// The oldest value at the front is discarded so the length never grows.
function updateBuffer(buf, value) {
  buf.push(value);  // add new value to the end
  buf.shift();      // remove the oldest value from the front
}

// ── Step 1: removeBackground() ───────────────────────────────────────────────
// Subtracts the estimated DC baseline from the raw signal.
// Returns the "DC-free" signal centred around zero.
//
// The baseline estimate = mean of the last BASELINE_N raw samples.
// Maintaining a running sum (baselineSum) lets us compute that mean by a
// single division, rather than re-summing 500 numbers every time.
//
// push/shift moves every item in the array one position — on a 500-item
// array at 100 samples per second that is 50 000 small steps per second,
// which a modern browser handles without trouble.
function removeBackground(raw) {
  // Remove the oldest sample's contribution from the running sum.
  baselineSum -= baselineWindow.shift();

  // Add the new sample to the window and the sum.
  baselineWindow.push(raw);
  baselineSum += raw;

  // Baseline = mean of the window. Subtract it from raw to centre around 0.
  return raw - baselineSum / BASELINE_N;
}

// ── Step 2: movingAverage() ──────────────────────────────────────────────────
// Smooths the DC-free signal by averaging the last SMOOTH_N samples.
// This is a low-pass filter: fast noise cancels out, slow heartbeat shape survives.
function movingAverage(value) {
  smoothWindow.push(value);                          // add new sample

  if (smoothWindow.length > SMOOTH_N) smoothWindow.shift(); // drop oldest if full

  // Sum all values in the window and divide by the window's current length.
  // During the first SMOOTH_N samples the window grows; after that it is constant.
  let sum = 0;
  for (let v of smoothWindow) sum += v;
  return sum / smoothWindow.length;
}

// ── Step 3: differentiate() ──────────────────────────────────────────────────
// Computes the discrete derivative — how much the smoothed signal changed
// from the previous sample to this one.
//
//   slope > 0  → signal is rising
//   slope = 0  → signal is flat (or at a peak/trough)
//   slope < 0  → signal is falling
//
// A transition from positive slope to zero-or-negative slope marks the exact
// top of a heartbeat peak.
function differentiate(smoothed) {
  // Difference between the current smoothed value and the previous one.
  let slope    = smoothed - prevSmoothed;

  // Save the current value for the next call.
  prevSmoothed = smoothed;

  return slope;
}

// ── Step 4: detectPeak() ─────────────────────────────────────────────────────
// Decides whether the current sample marks a heartbeat peak.
// Two conditions must both be true:
//   1. Zero crossing: slope just flipped from positive to zero-or-negative.
//      This means we just passed the top of a rise.
//   2. Amplitude gate: the smoothed signal is above AMPLITUDE_THRESHOLD.
//      This ensures we only count large, real heartbeat peaks and ignore
//      small noise bumps near the baseline.
//
// smoothedValue — the cleaned signal at the current sample
// slope         — the derivative of the cleaned signal at the current sample
function detectPeak(smoothedValue, slope) {
  // Was the slope positive last sample and zero-or-negative now?
  let isPeakZeroCrossing = (prevSlope > 0 && slope <= 0);

  // Is the signal significantly above the baseline (not just noise)?
  let isAboveThreshold = (smoothedValue > AMPLITUDE_THRESHOLD);

  if (isPeakZeroCrossing && isAboveThreshold) {
    // Record the current sample count as the time of this peak.
    peakSampleCounts.push(sampleCount);

    // Limit the list to the most recent MAX_PEAKS_STORED peaks.
    if (peakSampleCounts.length > MAX_PEAKS_STORED) peakSampleCounts.shift();
  }

  // Save the current slope for the next call's zero-crossing check.
  prevSlope = slope;
}

// ── Step 5: calculateBPMandConfidence() ──────────────────────────────────────
// Uses the list of recent peak timestamps (in sample counts) to compute:
//   • BPM  — average beats per minute
//   • confidence — 0.0–1.0 score expressing how regular the beat intervals are
//
// HOW BPM IS COMPUTED:
//   Each pair of consecutive peak sample counts gives an inter-beat interval
//   in samples. Multiply by SAMPLE_INTERVAL_MS to convert to milliseconds.
//   BPM = 60 000 ms ÷ mean IBI in ms.
//
// HOW CONFIDENCE IS COMPUTED:
//   We measure the *coefficient of variation* (CV) of the IBIs:
//     CV = standard deviation ÷ mean
//   CV near 0 → very regular → high confidence.
//   CV > 0.3  → highly irregular → near-zero confidence.
//   We linearly map CV from [0, 0.3] to confidence [1.0, 0.0].
function calculateBPMandConfidence() {
  // We need at least 3 peaks (= 2 inter-beat intervals) for a meaningful BPM.
  // Return zeros if we don't have enough data yet.
  if (peakSampleCounts.length < 3) return { bpm: 0, confidence: 0 };

  // Compute inter-beat intervals (IBIs) in milliseconds.
  let intervals = [];
  for (let i = 1; i < peakSampleCounts.length; i++) {
    // How many samples between this peak and the one before it?
    let samplesBetween = peakSampleCounts[i] - peakSampleCounts[i - 1];

    // Convert from samples to milliseconds.
    intervals.push(samplesBetween * SAMPLE_INTERVAL_MS);
  }

  let n = intervals.length;

  // Mean IBI: add all intervals together, then divide by how many there are.
  let sum = 0;
  for (let i = 0; i < intervals.length; i++) {
    sum += intervals[i];
  }
  let mean = sum / n;

  // BPM: one minute (60 000 ms) divided by the average beat-to-beat gap.
  let bpm = 60000 / mean;

  // Variance: for each interval, find how far it is from the mean, square
  // that distance (so that positive and negative differences both count),
  // then take the average of all those squared distances.
  let squaredDiffSum = 0;
  for (let i = 0; i < intervals.length; i++) {
    let diff = intervals[i] - mean;  // how far this interval is from the mean
    squaredDiffSum += diff * diff;   // square it and add to the running total
  }
  let variance = squaredDiffSum / n;

  // Standard deviation: the square root of variance. Same units as the IBIs (ms).
  // A small stdDev means the intervals are all similar (regular heartbeat).
  let stdDev = Math.sqrt(variance);

  // Coefficient of variation (CV): stdDev relative to the mean.
  // Dividing by the mean makes it unitless and comparable across different BPMs.
  let cv = stdDev / mean;

  // Map CV to confidence: if CV = 0 → confidence 1.0; if CV ≥ 0.3 → confidence 0.
  // Math.max(0, ...) clamps the result so it never goes below zero.
  //
  // The 0.3 here is a tunable design choice, not a universal constant.
  // It says: "if beat spacing varies by more than 30% of the mean, I call that
  // unreliable." If you find confidence too low for a real heartbeat signal,
  // try raising it to 0.4 or 0.5. If noise keeps scoring too high, lower it.
  // Think of it the same way as AMPLITUDE_THRESHOLD — a dial you can turn.
  let confidence = Math.max(0, 1 - cv / 0.3);

  return { bpm, confidence };
}

// onNewSample() — the main pipeline called once per incoming data point.
function onNewSample(timestamp, raw) {
  // Increment the sample counter before doing anything else so that
  // peakSampleCounts stores the index of the sample that triggered the peak.
  sampleCount++;

  // Store the raw value for the top-half waveform.
  updateBuffer(rawBuffer, raw);

  // Step 1: remove the slow DC drift.
  let dc = removeBackground(raw);

  // Step 2: smooth out the fast noise.
  let sm = movingAverage(dc);

  // Store the cleaned value for the bottom-half waveform.
  updateBuffer(smoothedBuffer, sm);

  // Step 3: compute how much the signal changed since last sample.
  let slope = differentiate(sm);

  // Step 4: check whether a heartbeat peak just occurred.
  detectPeak(sm, slope);
}

// =============================================================================
// p5.js — setup and drawing
// =============================================================================

// setup() runs once when the page loads.
function setup() {
  createCanvas(800, 400);
  textFont("monospace");

  let btn = createButton("Connect ESP32");
  btn.mousePressed(connectSerial);
}

// draw() runs ~60 times per second, redrawing the canvas with the latest data.
function draw() {
  background(20); // dark background to clear the previous frame

  // halfH is the y-coordinate of the horizontal dividing line (200 px).
  let halfH = height / 2;

  // ── Top half: raw signal ──────────────────────────────────────────────────

  stroke(RAW_COLOR[0], RAW_COLOR[1], RAW_COLOR[2]);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
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

    // Map the cleaned signal (centred around 0, range roughly -500 to +500)
    // to the bottom half of the canvas. Swap output range to keep upward = up.
    let y = map(smoothedBuffer[i], -500, 500, height - 10, halfH + 10);

    vertex(x, y);
  }
  endShape();

  // ── Horizontal divider ────────────────────────────────────────────────────

  stroke(60);
  line(0, halfH, width, halfH);

  // ── Peak tick marks on the bottom half ───────────────────────────────────
  // For each recorded peak, draw a short vertical red line on the bottom trace
  // at the x position corresponding to when that peak occurred.
  //
  // HOW X IS CALCULATED:
  // sampleCount is the total number of samples received.
  // samplesAgo is how long ago (in samples) the peak occurred.
  // (rawBuffer.length - samplesAgo) maps the peak into the buffer's index space,
  // which then maps to an x pixel coordinate the same way the waveform does.

  stroke(255, 80, 80); // red

  for (let ps of peakSampleCounts) {
    // How many samples ago was this peak?
    let samplesAgo = sampleCount - ps;

    // Only draw tick marks that are within the visible buffer window.
    if (samplesAgo >= 0 && samplesAgo < rawBuffer.length) {
      let x = map(rawBuffer.length - samplesAgo, 0, rawBuffer.length - 1, 0, width);
      line(x, halfH + 10, x, height - 10); // vertical tick mark in the bottom half
    }
  }

  // ── BPM and confidence readout ────────────────────────────────────────────

  // Call calculateBPMandConfidence() and unpack its two return values at once.
  //
  // The function returns an object like: { bpm: 72, confidence: 0.85 }
  // The curly-brace syntax on the left — called "destructuring" — is a
  // shorthand that pulls named properties out of that object and creates
  // two separate variables in one line. It is equivalent to writing:
  //   let result     = calculateBPMandConfidence();
  //   let bpm        = result.bpm;
  //   let confidence = result.confidence;
  let { bpm, confidence } = calculateBPMandConfidence();

  noStroke();

  // Labels in the left margin.
  textSize(14);
  fill(RAW_COLOR[0], RAW_COLOR[1], RAW_COLOR[2]);
  text("RAW", 10, 20);
  fill(SMOOTHED_COLOR[0], SMOOTHED_COLOR[1], SMOOTHED_COLOR[2]);
  text("SMOOTHED (DC-free)", 10, halfH + 20);

  // Large BPM number in the top-right corner.
  // toFixed(0) is a JavaScript number method that rounds a decimal to a
  // given number of decimal places and returns it as a string.
  // toFixed(0) means "zero decimal places" — so 72.6 becomes "73".
  // If we don't have enough peaks yet, show "--" instead.
  fill(255);
  textSize(32);
  text(bpm > 0 ? `${bpm.toFixed(0)} BPM` : "-- BPM", width - 215, 42);

  // Confidence percentage below the BPM, colour-coded by threshold.
  textSize(14);
  // confidence is a 0.0–1.0 fraction. Multiply by 100 to get a percentage,
  // then toFixed(0) rounds it to a whole number string (e.g. 0.847 → "85").
  let confPct = (confidence * 100).toFixed(0);

  if      (confidence >= CONFIDENCE_HIGH) fill(80,  255, 80);  // green
  else if (confidence >= CONFIDENCE_MED)  fill(255, 200,  0);  // yellow
  else                                    fill(255,  80, 80);  // red

  text(`Confidence: ${confPct}%`, width - 215, 62);
}

