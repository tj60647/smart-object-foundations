// =============================================================================
// File:    signal.js
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
// This module extracts the pure signal-processing logic from sketch.js so that
// it can be imported and tested in a Node.js environment without any dependency
// on p5.js or the WebSerial API.
//
// The functions here are identical in behaviour to those in sketch.js; they are
// split into a separate file only to enable automated testing.
//
// createSignalProcessor() returns a fresh, independent instance of the Stage 2
// processing pipeline. Each instance keeps its own internal state (baseline
// window, smoothing window) so tests can run in complete isolation.

// =============================================================================
// DEFAULTS (mirror the constants in sketch.js)
// =============================================================================

const DEFAULTS = {
  baselineN:    500,
  smoothN:      15,
  adcMidScale:  (0 + 4095) / 2,   // 2047.5 — midpoint of 12-bit ADC range
};

// =============================================================================
// FACTORY
// =============================================================================

// createSignalProcessor(options) — creates a Stage 2 signal processing instance.
//
// options (all optional — defaults mirror sketch.js constants):
//   baselineN   {number} — baseline window size (default 500 samples = 5 s)
//   smoothN     {number} — smoothing window size (default 15 samples = 150 ms)
//   adcMidScale {number} — ADC midpoint used to pre-fill the baseline window
//                          (default 2047.5 for a 12-bit ADC)
//
// Returns an object with:
//   updateBuffer(buf, value)  — append to a fixed-length rolling buffer
//   removeBackground(raw)    — Step 1: subtract slow DC baseline, return DC-free value
//   movingAverage(value)     — Step 2: smooth with a moving average, return smoothed value
function createSignalProcessor(options) {
  const cfg = Object.assign({}, DEFAULTS, options);

  const { baselineN, smoothN, adcMidScale } = cfg;

  // ── Baseline (background) subtraction state ─────────────────────────────────
  // baselineWindow holds the last baselineN raw samples for the rolling mean.
  // Pre-filling with adcMidScale means the baseline starts at the sensor
  // midpoint — the same behaviour as the global-variable sketch.
  let baselineWindow = new Array(baselineN).fill(adcMidScale);

  // Running sum kept in sync with baselineWindow so the mean is one division.
  let baselineSum = baselineN * adcMidScale;

  // ── Smoothing state ──────────────────────────────────────────────────────────
  // Starts empty; grows to smoothN entries, then stays at that size.
  let smoothWindow = [];

  // ── Functions ────────────────────────────────────────────────────────────────

  // updateBuffer() — appends a new value to a fixed-length rolling buffer.
  // The oldest value at the front is discarded so the length never changes.
  function updateBuffer(buf, value) {
    buf.push(value);
    buf.shift();
  }

  // removeBackground() — Step 1: background subtraction (low-pass filter #1).
  // Subtracts the slow DC baseline from the raw signal.
  // Returns the DC-free signal centred around zero.
  function removeBackground(raw) {
    baselineSum -= baselineWindow.shift();
    baselineWindow.push(raw);
    baselineSum += raw;
    return raw - baselineSum / baselineN;
  }

  // movingAverage() — Step 2: smoothing (low-pass filter #2).
  // Averages the last smoothN DC-free samples to reduce high-frequency noise.
  function movingAverage(value) {
    smoothWindow.push(value);
    if (smoothWindow.length > smoothN) smoothWindow.shift();

    let sum = 0;
    for (let v of smoothWindow) sum += v;
    return sum / smoothWindow.length;
  }

  return { updateBuffer, removeBackground, movingAverage };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = { createSignalProcessor, DEFAULTS };
