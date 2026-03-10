// =============================================================================
// File:    signal-stage-3.js
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
// This module extracts the pure signal-processing logic from sketch.js so that
// it can be imported and tested in a Node.js environment without any dependency
// on p5.js or the WebSerial API.
//
// The functions here are identical in behaviour to those in sketch.js; they are
// split into a separate file only to enable automated testing.
//
// createSignalProcessor() returns a fresh, independent instance of the full
// Stage 3 pipeline (background subtraction → smoothing → differentiation →
// peak detection → BPM + confidence). Each instance keeps its own internal
// state so tests can run in complete isolation.

// =============================================================================
// DEFAULTS (mirror the constants in sketch.js)
// =============================================================================

const DEFAULTS = {
  baselineN:          500,
  smoothN:            15,
  adcMidScale:        (0 + 4095) / 2,  // 2047.5 — midpoint of 12-bit ADC range
  amplitudeThreshold: 80,
  maxPeaksStored:     12,
  sampleIntervalMs:   10,
};

// =============================================================================
// FACTORY
// =============================================================================

// createSignalProcessor(options) — creates a Stage 3 signal processing instance.
//
// options (all optional — defaults mirror sketch.js constants):
//   baselineN          {number} — baseline window size (default 500 = 5 s)
//   smoothN            {number} — smoothing window size (default 15 = 150 ms)
//   adcMidScale        {number} — ADC midpoint for pre-filling baseline window
//   amplitudeThreshold {number} — minimum smoothed amplitude to count as a peak
//   maxPeaksStored     {number} — maximum recent peak timestamps to keep
//   sampleIntervalMs   {number} — ms between samples (used to convert to BPM)
//
// Returns an object with the following methods:
//   updateBuffer(buf, value)        — append to a fixed-length rolling buffer
//   removeBackground(raw)           — Step 1: DC baseline subtraction
//   movingAverage(value)            — Step 2: moving-average smoothing
//   differentiate(smoothed)         — Step 3: discrete derivative (slope)
//   detectPeak(smoothedValue, slope) — Step 4: zero-crossing + amplitude gate
//   calculateBPMandConfidence()     — Step 5: BPM and CV-based confidence
//   incrementSampleCount()          — advance the internal sample counter
//   getSampleCount()                — read the current sample counter
//   getPeakSampleCounts()           — read a snapshot of detected peak positions
function createSignalProcessor(options) {
  const cfg = Object.assign({}, DEFAULTS, options);

  const {
    baselineN,
    smoothN,
    adcMidScale,
    amplitudeThreshold,
    maxPeaksStored,
    sampleIntervalMs,
  } = cfg;

  // ── Baseline subtraction state ───────────────────────────────────────────────
  let baselineWindow = new Array(baselineN).fill(adcMidScale);
  let baselineSum    = baselineN * adcMidScale;

  // ── Smoothing state ──────────────────────────────────────────────────────────
  let smoothWindow = [];

  // ── Differentiation state ────────────────────────────────────────────────────
  // Holds the smoothed value and slope from the previous sample so that
  // differentiate() and detectPeak() can look for zero crossings.
  let prevSmoothed = 0;
  let prevSlope    = 0;

  // ── Peak detection state ─────────────────────────────────────────────────────
  // sampleCount increments on every incoming sample, used to timestamp peaks.
  let sampleCount      = 0;
  let peakSampleCounts = [];

  // ── Functions ────────────────────────────────────────────────────────────────

  // updateBuffer() — appends a new value to a fixed-length rolling buffer.
  function updateBuffer(buf, value) {
    buf.push(value);
    buf.shift();
  }

  // removeBackground() — Step 1: subtract the slow DC baseline.
  // Returns the DC-free signal centred around zero.
  function removeBackground(raw) {
    baselineSum -= baselineWindow.shift();
    baselineWindow.push(raw);
    baselineSum += raw;
    return raw - baselineSum / baselineN;
  }

  // movingAverage() — Step 2: smooth with a rolling mean.
  function movingAverage(value) {
    smoothWindow.push(value);
    if (smoothWindow.length > smoothN) smoothWindow.shift();

    let sum = 0;
    for (let v of smoothWindow) sum += v;
    return sum / smoothWindow.length;
  }

  // differentiate() — Step 3: discrete derivative.
  // Returns the slope (change since the previous sample) and updates prevSmoothed.
  function differentiate(smoothed) {
    const slope  = smoothed - prevSmoothed;
    prevSmoothed = smoothed;
    return slope;
  }

  // detectPeak() — Step 4: zero-crossing + amplitude gate.
  // Records sampleCount in peakSampleCounts when both conditions are true:
  //   1. slope just crossed from positive to zero-or-negative (peak zero crossing)
  //   2. smoothedValue is above amplitudeThreshold (not noise)
  function detectPeak(smoothedValue, slope) {
    const isPeakZeroCrossing = (prevSlope > 0 && slope <= 0);
    const isAboveThreshold   = (smoothedValue > amplitudeThreshold);

    if (isPeakZeroCrossing && isAboveThreshold) {
      peakSampleCounts.push(sampleCount);
      if (peakSampleCounts.length > maxPeaksStored) peakSampleCounts.shift();
    }

    prevSlope = slope;
  }

  // calculateBPMandConfidence() — Step 5: BPM and coefficient-of-variation confidence.
  //
  // Requires at least 3 stored peaks (= 2 intervals). Returns { bpm: 0, confidence: 0 }
  // when there is insufficient data.
  //
  // BPM  = 60 000 ms ÷ mean inter-beat interval (ms)
  // CV   = stdDev(IBIs) ÷ mean(IBIs)  — 0 is perfectly regular, > 0.3 is unreliable
  // confidence = clamp(1 − CV / 0.3, 0, 1)
  function calculateBPMandConfidence() {
    if (peakSampleCounts.length < 3) return { bpm: 0, confidence: 0 };

    // Build the list of inter-beat intervals in milliseconds.
    const intervals = [];
    for (let i = 1; i < peakSampleCounts.length; i++) {
      const samplesBetween = peakSampleCounts[i] - peakSampleCounts[i - 1];
      intervals.push(samplesBetween * sampleIntervalMs);
    }

    const n = intervals.length;

    // Mean IBI.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += intervals[i];
    const mean = sum / n;

    // BPM from mean IBI.
    const bpm = 60000 / mean;

    // Variance → standard deviation → coefficient of variation.
    let squaredDiffSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = intervals[i] - mean;
      squaredDiffSum += diff * diff;
    }
    const variance = squaredDiffSum / n;
    const stdDev   = Math.sqrt(variance);
    const cv       = stdDev / mean;

    // Map CV to confidence: 0 CV → 1.0 confidence; 0.3+ CV → 0 confidence.
    const confidence = Math.max(0, 1 - cv / 0.3);

    return { bpm, confidence };
  }

  // incrementSampleCount() — advance the sample counter by one.
  // Call this at the start of each new sample, matching the sketch's
  // sampleCount++ at the top of onNewSample().
  function incrementSampleCount() {
    sampleCount++;
  }

  // getSampleCount() — read the current sample counter value.
  function getSampleCount() {
    return sampleCount;
  }

  // getPeakSampleCounts() — return a copy of the current peak positions array.
  function getPeakSampleCounts() {
    return [...peakSampleCounts];
  }

  return {
    updateBuffer,
    removeBackground,
    movingAverage,
    differentiate,
    detectPeak,
    calculateBPMandConfidence,
    incrementSampleCount,
    getSampleCount,
    getPeakSampleCounts,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = { createSignalProcessor, DEFAULTS };
