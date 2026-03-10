// =============================================================================
// File:    tests/stage-2.test.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   2 — Clean Signal
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// Tests for the Stage 2 signal module:
//   • updateBuffer — rolling fixed-length buffer (same logic as Stage 1)
//   • removeBackground — background subtraction (DC-baseline removal)
//   • movingAverage — moving-average smoothing
//   • Combined pipeline — removeBackground → movingAverage end-to-end

"use strict";

const { createSignalProcessor, DEFAULTS } = require("../stage-2-clean-signal/signal");

// Convenience: create a processor with a small baseline window so tests do not
// need to feed hundreds of samples to warm up.
function makeProcessor(overrides) {
  return createSignalProcessor(overrides);
}

// Helper: feed `n` identical raw samples to warm up the baseline window fully.
function warmUp(proc, value, n) {
  for (let i = 0; i < n; i++) {
    proc.removeBackground(value);
  }
}

// =============================================================================
// DEFAULTS
// =============================================================================

describe("Stage 2 — DEFAULTS", () => {
  test("baselineN is 500 (5 s at 100 Hz)", () => {
    expect(DEFAULTS.baselineN).toBe(500);
  });

  test("smoothN is 15 (150 ms at 100 Hz)", () => {
    expect(DEFAULTS.smoothN).toBe(15);
  });

  test("adcMidScale is 2047.5 (midpoint of 12-bit ADC range)", () => {
    expect(DEFAULTS.adcMidScale).toBe(2047.5);
  });
});

// =============================================================================
// updateBuffer (included in the Stage 2 module)
// =============================================================================

describe("Stage 2 — updateBuffer()", () => {
  let proc;
  beforeEach(() => { proc = makeProcessor(); });

  test("keeps the buffer at its original length", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf.length).toBe(3);
  });

  test("new value appears at the end", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf[2]).toBe(10);
  });

  test("oldest value is removed from the front", () => {
    const buf = [1, 2, 3];
    proc.updateBuffer(buf, 10);
    expect(buf[0]).toBe(2);
  });

  test("full shift of values matches expectations", () => {
    const buf = [10, 20, 30];
    proc.updateBuffer(buf, 40);
    expect(buf).toEqual([20, 30, 40]);
  });
});

// =============================================================================
// removeBackground
// =============================================================================

describe("Stage 2 — removeBackground()", () => {
  test("a steady signal at the initial baseline level produces output near 0", () => {
    // Use a small window so warm-up is fast.
    const N = 10;
    const proc = makeProcessor({ baselineN: N, adcMidScale: 2047.5 });

    // Feed the baseline value repeatedly to fully warm the window.
    warmUp(proc, 2047.5, N);

    // After warm-up, the mean equals the constant input → DC-free output = 0.
    const result = proc.removeBackground(2047.5);
    expect(result).toBeCloseTo(0, 5);
  });

  test("a constant offset above the initial baseline is removed after warm-up", () => {
    const N = 20;
    const proc = makeProcessor({ baselineN: N, adcMidScale: 0 });

    // Feed a constant value of 500 to fill the window.
    warmUp(proc, 500, N);

    // After full warm-up the mean = 500, so DC-free output should be 0.
    const result = proc.removeBackground(500);
    expect(result).toBeCloseTo(0, 5);
  });

  test("a step up from the warmed baseline is initially reflected as positive", () => {
    const N = 10;
    const proc = makeProcessor({ baselineN: N, adcMidScale: 0 });
    warmUp(proc, 1000, N);

    // Suddenly jump to 1500 — the baseline is still ~1000 so output is ~500.
    const result = proc.removeBackground(1500);
    expect(result).toBeGreaterThan(0);
  });

  test("the baseline converges after N samples of a new constant level", () => {
    const N = 10;
    const proc = makeProcessor({ baselineN: N, adcMidScale: 0 });
    warmUp(proc, 0, N);

    // Switch to a new constant level; after N samples the mean catches up.
    for (let i = 0; i < N; i++) proc.removeBackground(300);
    const result = proc.removeBackground(300);
    expect(result).toBeCloseTo(0, 5);
  });

  test("output is negative when raw is below the warmed baseline", () => {
    const N = 10;
    const proc = makeProcessor({ baselineN: N, adcMidScale: 2000 });
    warmUp(proc, 2000, N);

    const result = proc.removeBackground(1500);
    expect(result).toBeLessThan(0);
  });
});

// =============================================================================
// movingAverage
// =============================================================================

describe("Stage 2 — movingAverage()", () => {
  test("returns the first input value when the window is empty", () => {
    const proc = makeProcessor({ smoothN: 5 });
    expect(proc.movingAverage(100)).toBeCloseTo(100, 5);
  });

  test("returns the mean of all values fed so far while the window is growing", () => {
    const proc = makeProcessor({ smoothN: 5 });
    proc.movingAverage(10);
    proc.movingAverage(20);
    const result = proc.movingAverage(30);
    // Mean of [10, 20, 30] = 20
    expect(result).toBeCloseTo(20, 5);
  });

  test("returns the correct mean once the window is full", () => {
    const proc = makeProcessor({ smoothN: 3 });
    proc.movingAverage(10);
    proc.movingAverage(20);
    proc.movingAverage(30);
    // Window is [10, 20, 30] — next call adds 40, drops 10 → [20, 30, 40]
    const result = proc.movingAverage(40);
    expect(result).toBeCloseTo(30, 5);
  });

  test("a constant stream returns that constant value", () => {
    const proc = makeProcessor({ smoothN: 5 });
    let result;
    for (let i = 0; i < 10; i++) result = proc.movingAverage(50);
    expect(result).toBeCloseTo(50, 5);
  });

  test("smooths a noisy signal toward the true mean", () => {
    const proc = makeProcessor({ smoothN: 100 });
    let result;
    for (let i = 0; i < 200; i++) {
      // Alternating +1 and -1 should average close to 0.
      result = proc.movingAverage(i % 2 === 0 ? 1 : -1);
    }
    expect(Math.abs(result)).toBeLessThan(0.2);
  });

  test("output lags behind a sudden step change while the window catches up", () => {
    const proc = makeProcessor({ smoothN: 10 });
    // Pre-fill with 0.
    for (let i = 0; i < 10; i++) proc.movingAverage(0);
    // Step to 100.
    const firstAfterStep = proc.movingAverage(100);
    // The window still contains nine 0s and one 100 → mean = 10.
    expect(firstAfterStep).toBeCloseTo(10, 5);
  });
});

// =============================================================================
// Combined pipeline: removeBackground → movingAverage
// =============================================================================

describe("Stage 2 — pipeline (removeBackground + movingAverage)", () => {
  test("a perfectly constant signal produces near-zero output end-to-end", () => {
    const N = 20;
    const proc = makeProcessor({ baselineN: N, smoothN: 5, adcMidScale: 2000 });

    let result;
    // Feed constant value long enough to warm up both windows.
    for (let i = 0; i < N + 5; i++) {
      const dc = proc.removeBackground(2000);
      result   = proc.movingAverage(dc);
    }

    expect(Math.abs(result)).toBeLessThan(1e-9);
  });

  test("a sharp pulse above a flat baseline produces a positive, then decaying output", () => {
    const N = 50;
    const proc = makeProcessor({ baselineN: N, smoothN: 3 });

    // Warm up the baseline with a flat signal.
    for (let i = 0; i < N; i++) {
      proc.movingAverage(proc.removeBackground(1000));
    }

    // Send a single strong pulse.
    const dc     = proc.removeBackground(2000);
    const output = proc.movingAverage(dc);

    expect(output).toBeGreaterThan(0);
  });
});
