// =============================================================================
// File:    tests/stage-3.test.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   3 — Heartbeat Detection with Confidence
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// Tests for the Stage 3 signal module:
//   • updateBuffer / removeBackground / movingAverage (inherited from Stage 2)
//   • differentiate — discrete derivative / slope
//   • detectPeak — zero-crossing + amplitude gate
//   • calculateBPMandConfidence — BPM from mean IBI, confidence from CV
//   • incrementSampleCount / getSampleCount / getPeakSampleCounts — state helpers
//   • End-to-end pipeline — synthetic heartbeat stream

"use strict";

const { createSignalProcessor, DEFAULTS } = require("../../stage-3-heartbeat-detection/signal");

// =============================================================================
// DEFAULTS
// =============================================================================

describe("Stage 3 — DEFAULTS", () => {
  test("baselineN is 500 (5 s at 100 Hz)", () => {
    expect(DEFAULTS.baselineN).toBe(500);
  });

  test("smoothN is 15 (150 ms at 100 Hz)", () => {
    expect(DEFAULTS.smoothN).toBe(15);
  });

  test("adcMidScale is 2047.5 (midpoint of 12-bit ADC range)", () => {
    expect(DEFAULTS.adcMidScale).toBe(2047.5);
  });

  test("amplitudeThreshold is 80", () => {
    expect(DEFAULTS.amplitudeThreshold).toBe(80);
  });

  test("maxPeaksStored is 12", () => {
    expect(DEFAULTS.maxPeaksStored).toBe(12);
  });

  test("sampleIntervalMs is 10 ms", () => {
    expect(DEFAULTS.sampleIntervalMs).toBe(10);
  });
});

// =============================================================================
// updateBuffer (same logic as Stage 1 and 2, tested here for completeness)
// =============================================================================

describe("Stage 3 — updateBuffer()", () => {
  let proc;
  beforeEach(() => { proc = createSignalProcessor(); });

  test("keeps the buffer at its original length", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf.length).toBe(3);
  });

  test("appends the new value at the end", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf[2]).toBe(10);
  });

  test("drops the oldest value from the front", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf[0]).toBe(2);
  });
});

// =============================================================================
// differentiate
// =============================================================================

describe("Stage 3 — differentiate()", () => {
  test("returns 0 on the very first call (prevSmoothed initialised to 0)", () => {
    const proc = createSignalProcessor();
    // First call: slope = 0 - 0 = 0
    expect(proc.differentiate(0)).toBe(0);
  });

  test("returns a positive slope when the signal is rising", () => {
    const proc = createSignalProcessor();
    proc.differentiate(100);  // sets prevSmoothed = 100
    expect(proc.differentiate(200)).toBe(100);
  });

  test("returns a negative slope when the signal is falling", () => {
    const proc = createSignalProcessor();
    proc.differentiate(200);
    expect(proc.differentiate(100)).toBe(-100);
  });

  test("returns 0 for a flat (steady) signal", () => {
    const proc = createSignalProcessor();
    proc.differentiate(50);
    expect(proc.differentiate(50)).toBe(0);
  });

  test("carries previous state across successive calls", () => {
    const proc = createSignalProcessor();
    // Ramp up: 0 → 10 → 20 → 30
    proc.differentiate(10);
    proc.differentiate(20);
    const slope = proc.differentiate(30);
    expect(slope).toBe(10);
  });

  test("each processor instance has independent state", () => {
    const a = createSignalProcessor();
    const b = createSignalProcessor();
    a.differentiate(100);
    // b has never seen any input, so prevSmoothed is still 0
    expect(b.differentiate(50)).toBe(50);
  });
});

// =============================================================================
// detectPeak — state helpers
// =============================================================================

describe("Stage 3 — detectPeak() — state helpers", () => {
  test("sampleCount starts at 0", () => {
    const proc = createSignalProcessor();
    expect(proc.getSampleCount()).toBe(0);
  });

  test("incrementSampleCount increments the counter by 1", () => {
    const proc = createSignalProcessor();
    proc.incrementSampleCount();
    expect(proc.getSampleCount()).toBe(1);
  });

  test("multiple increments accumulate correctly", () => {
    const proc = createSignalProcessor();
    for (let i = 0; i < 5; i++) proc.incrementSampleCount();
    expect(proc.getSampleCount()).toBe(5);
  });

  test("getPeakSampleCounts returns an empty array initially", () => {
    const proc = createSignalProcessor();
    expect(proc.getPeakSampleCounts()).toEqual([]);
  });

  test("getPeakSampleCounts returns a copy (mutation does not affect internal state)", () => {
    const proc = createSignalProcessor();
    const copy = proc.getPeakSampleCounts();
    copy.push(999);
    expect(proc.getPeakSampleCounts()).toEqual([]);
  });
});

// =============================================================================
// detectPeak — peak detection logic
// =============================================================================

describe("Stage 3 — detectPeak() — detection logic", () => {
  // Helper: create a processor with a low amplitude threshold for easy testing.
  function makeLowThreshProc() {
    return createSignalProcessor({ amplitudeThreshold: 10 });
  }

  test("no peak recorded when there is no zero crossing (both slopes positive)", () => {
    const proc = makeLowThreshProc();
    proc.detectPeak(50, 5);   // prevSlope becomes 5
    proc.detectPeak(50, 3);   // slope 3 > 0, still rising — no crossing
    expect(proc.getPeakSampleCounts()).toEqual([]);
  });

  test("no peak recorded when amplitude is below the threshold", () => {
    const proc = makeLowThreshProc(); // threshold = 10
    proc.detectPeak(100, 5);   // prevSlope = 5 (positive)
    // Zero crossing (slope 0) BUT amplitude only 5 < threshold 10 → no peak
    proc.detectPeak(5, 0);
    expect(proc.getPeakSampleCounts()).toEqual([]);
  });

  test("peak is recorded when slope crosses zero AND amplitude is above threshold", () => {
    const proc = makeLowThreshProc();
    proc.incrementSampleCount(); // sampleCount = 1
    proc.detectPeak(100, 5);     // prevSlope set to 5
    proc.incrementSampleCount(); // sampleCount = 2
    proc.detectPeak(50, -1);     // crossing: prevSlope 5 > 0, slope -1 ≤ 0; amplitude 50 > 10
    expect(proc.getPeakSampleCounts()).toEqual([2]);
  });

  test("peak is recorded when slope is exactly 0 (not negative) at the crossing", () => {
    const proc = makeLowThreshProc();
    proc.detectPeak(100, 5);
    proc.incrementSampleCount();
    proc.detectPeak(50, 0);     // slope = 0 satisfies prevSlope > 0 && slope <= 0
    expect(proc.getPeakSampleCounts().length).toBe(1);
  });

  test("peak is not recorded when slope goes from negative to negative", () => {
    const proc = makeLowThreshProc();
    proc.detectPeak(50, -5);   // prevSlope = -5
    proc.detectPeak(50, -1);   // prevSlope -5, not > 0 → no crossing
    expect(proc.getPeakSampleCounts()).toEqual([]);
  });

  test("oldest peak is dropped when maxPeaksStored is exceeded", () => {
    const proc = createSignalProcessor({ amplitudeThreshold: 0, maxPeaksStored: 3 });

    // Trigger 4 peaks — only the 3 most recent should be kept.
    for (let i = 1; i <= 4; i++) {
      proc.incrementSampleCount();
      proc.detectPeak(100, 5);  // set prevSlope
      proc.incrementSampleCount();
      proc.detectPeak(100, -1); // crossing: peak recorded at current sampleCount
    }

    const peaks = proc.getPeakSampleCounts();
    expect(peaks.length).toBe(3);
  });

  test("peaks from separate processor instances are independent", () => {
    const a = createSignalProcessor({ amplitudeThreshold: 0 });
    const b = createSignalProcessor({ amplitudeThreshold: 0 });

    a.incrementSampleCount();
    a.detectPeak(100, 5);
    a.incrementSampleCount();
    a.detectPeak(100, -1);

    expect(a.getPeakSampleCounts().length).toBe(1);
    expect(b.getPeakSampleCounts().length).toBe(0);
  });
});

// =============================================================================
// calculateBPMandConfidence
// =============================================================================

describe("Stage 3 — calculateBPMandConfidence()", () => {
  // Helper: build a processor with the given peak positions already recorded.
  // Uses a very low amplitude threshold and seeds the peak list via detectPeak.
  //
  // Peaks end up at position (pos + 1) for each entry: the setup detectPeak call
  // at pos makes prevSlope positive, then one more increment and a zero-crossing
  // detectPeak at (pos + 1) records the peak. As long as all positions are
  // separated by the same spacing, the inter-beat intervals are exact.
  function procWithPeaks(peakPositions, sampleIntervalMs = 10) {
    const proc = createSignalProcessor({
      amplitudeThreshold: 0,
      sampleIntervalMs,
    });

    for (const pos of peakPositions) {
      // Advance sampleCount to pos.
      while (proc.getSampleCount() < pos) proc.incrementSampleCount();
      // Set prevSlope to positive (no crossing yet because we check prevSlope > 0
      // against the PREVIOUS call's prevSlope, which is 0 or negative here).
      proc.detectPeak(100, 5);
      // Advance one more sample so the crossing fires at pos + 1.
      proc.incrementSampleCount();
      // Zero-crossing: prevSlope 5 > 0 AND slope -1 ≤ 0 AND amplitude 100 > 0.
      proc.detectPeak(100, -1);
    }

    return proc;
  }

  test("returns { bpm: 0, confidence: 0 } when fewer than 3 peaks exist", () => {
    const proc = createSignalProcessor();
    expect(proc.calculateBPMandConfidence()).toEqual({ bpm: 0, confidence: 0 });
  });

  test("returns { bpm: 0, confidence: 0 } with exactly 2 peaks (only 1 interval)", () => {
    const proc = procWithPeaks([10, 90]);
    expect(proc.calculateBPMandConfidence()).toEqual({ bpm: 0, confidence: 0 });
  });

  test("calculates correct BPM for perfectly regular 80-sample intervals at 10 ms", () => {
    // 80 samples × 10 ms = 800 ms → 60 000 / 800 = 75 BPM
    const proc = procWithPeaks([0, 80, 160, 240], 10);
    const { bpm } = proc.calculateBPMandConfidence();
    expect(bpm).toBeCloseTo(75, 1);
  });

  test("calculates correct BPM for 60-sample intervals (100 BPM)", () => {
    // 60 samples × 10 ms = 600 ms → 60 000 / 600 = 100 BPM
    const proc = procWithPeaks([0, 60, 120, 180], 10);
    const { bpm } = proc.calculateBPMandConfidence();
    expect(bpm).toBeCloseTo(100, 1);
  });

  test("confidence is 1.0 when all inter-beat intervals are identical (CV = 0)", () => {
    const proc = procWithPeaks([0, 80, 160, 240, 320], 10);
    const { confidence } = proc.calculateBPMandConfidence();
    expect(confidence).toBeCloseTo(1.0, 5);
  });

  test("confidence decreases as inter-beat interval variability increases", () => {
    // Regular signal: peaks at exact 80-sample spacing
    const regular = procWithPeaks([0, 80, 160, 240, 320], 10);
    // Irregular signal: varying spacing (40, 120, 40, 120)
    const irregular = procWithPeaks([0, 40, 160, 200, 320], 10);

    const { confidence: confReg } = regular.calculateBPMandConfidence();
    const { confidence: confIrr } = irregular.calculateBPMandConfidence();

    expect(confReg).toBeGreaterThan(confIrr);
  });

  test("confidence is 0 when CV >= 0.3 (highly irregular rhythm)", () => {
    // Intervals of 100 ms and 1000 ms alternate — very high CV.
    // Peaks at sample counts that produce alternating 10-sample and 100-sample gaps.
    const proc = procWithPeaks([0, 10, 110, 120, 220, 230], 10);
    const { confidence } = proc.calculateBPMandConfidence();
    expect(confidence).toBe(0);
  });

  test("BPM is calculated from sampleIntervalMs, not hard-coded 10 ms", () => {
    // Using sampleIntervalMs = 5 ms: 80 samples × 5 ms = 400 ms → 150 BPM
    const proc = procWithPeaks([0, 80, 160, 240], 5);
    const { bpm } = proc.calculateBPMandConfidence();
    expect(bpm).toBeCloseTo(150, 1);
  });
});

// =============================================================================
// End-to-end pipeline
// =============================================================================

describe("Stage 3 — end-to-end pipeline", () => {
  // Simulate a synthetic heartbeat: a short burst of samples rises then falls.
  // Uses a tiny baseline and smoothing window for fast warm-up.
  function runSyntheticHeartbeat() {
    const N = 30; // baseline window
    const proc = createSignalProcessor({
      baselineN: N,
      smoothN: 3,
      adcMidScale: 0,
      amplitudeThreshold: 50,
      sampleIntervalMs: 10,
    });

    // Warm up with a flat baseline.
    for (let i = 0; i < N + 3; i++) {
      const dc = proc.removeBackground(0);
      proc.movingAverage(dc);
      proc.differentiate(0);
      proc.detectPeak(0, 0);
      proc.incrementSampleCount();
    }

    // Inject a sharp heartbeat pulse: rise then fall.
    const pulse = [0, 20, 60, 100, 140, 200, 140, 100, 60, 20, 0];
    let prevSlope = 0;
    let peaksDetected = 0;

    for (const raw of pulse) {
      proc.incrementSampleCount();
      const dc       = proc.removeBackground(raw);
      const smoothed = proc.movingAverage(dc);
      const slope    = proc.differentiate(smoothed);
      const before   = proc.getPeakSampleCounts().length;
      proc.detectPeak(smoothed, slope);
      if (proc.getPeakSampleCounts().length > before) peaksDetected++;
      prevSlope = slope;
    }

    return { proc, peaksDetected };
  }

  test("a synthetic heartbeat pulse registers at least one peak", () => {
    const { peaksDetected } = runSyntheticHeartbeat();
    expect(peaksDetected).toBeGreaterThanOrEqual(1);
  });

  test("no peaks are detected during the flat warm-up period", () => {
    const N = 30;
    const proc = createSignalProcessor({
      baselineN: N,
      smoothN: 3,
      adcMidScale: 0,
      amplitudeThreshold: 50,
    });

    for (let i = 0; i < N + 3; i++) {
      proc.incrementSampleCount();
      const dc       = proc.removeBackground(0);
      const smoothed = proc.movingAverage(dc);
      const slope    = proc.differentiate(smoothed);
      proc.detectPeak(smoothed, slope);
    }

    expect(proc.getPeakSampleCounts()).toEqual([]);
  });
});
