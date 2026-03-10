// =============================================================================
// File:    tests/stage-1.test.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   1 — Raw Waveform Display
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// Tests for the Stage 1 signal module:
//   • updateBuffer — rolling fixed-length buffer behaviour
//   • parseSerialLine — "timestamp,value" line parsing
//   • Constants — correct values for ADC range and buffer size

"use strict";

const {
  SAMPLE_INTERVAL_MS,
  YMIN,
  YMAX,
  ADC_MID_SCALE,
  BUFFER_SIZE,
  updateBuffer,
  parseSerialLine,
} = require("../stage-1-raw-waveform/signal");

// =============================================================================
// Constants
// =============================================================================

describe("Stage 1 — constants", () => {
  test("SAMPLE_INTERVAL_MS is 10 ms (100 Hz sampling)", () => {
    expect(SAMPLE_INTERVAL_MS).toBe(10);
  });

  test("YMIN is 0 (minimum ADC value)", () => {
    expect(YMIN).toBe(0);
  });

  test("YMAX is 4095 (maximum 12-bit ADC value)", () => {
    expect(YMAX).toBe(4095);
  });

  test("ADC_MID_SCALE is the midpoint of the ADC range (2047.5)", () => {
    expect(ADC_MID_SCALE).toBe(2047.5);
  });

  test("BUFFER_SIZE is 500 (5 seconds of history at 100 Hz)", () => {
    expect(BUFFER_SIZE).toBe(500);
  });
});

// =============================================================================
// updateBuffer
// =============================================================================

describe("Stage 1 — updateBuffer()", () => {
  test("keeps the buffer at its original length after an update", () => {
    const buf = [1, 2, 3, 4, 5];
    updateBuffer(buf, 99);
    expect(buf.length).toBe(5);
  });

  test("appends the new value at the end of the buffer", () => {
    const buf = [1, 2, 3, 4, 5];
    updateBuffer(buf, 99);
    expect(buf[buf.length - 1]).toBe(99);
  });

  test("removes the oldest value (index 0) from the buffer", () => {
    const buf = [1, 2, 3, 4, 5];
    updateBuffer(buf, 99);
    expect(buf[0]).toBe(2);
  });

  test("all remaining original values shift left by one position", () => {
    const buf = [10, 20, 30, 40, 50];
    updateBuffer(buf, 60);
    expect(buf).toEqual([20, 30, 40, 50, 60]);
  });

  test("works on a single-element buffer", () => {
    const buf = [42];
    updateBuffer(buf, 7);
    expect(buf).toEqual([7]);
  });

  test("successive updates scroll values through the buffer correctly", () => {
    const buf = [0, 0, 0];
    updateBuffer(buf, 1);
    updateBuffer(buf, 2);
    updateBuffer(buf, 3);
    expect(buf).toEqual([1, 2, 3]);
  });

  test("pre-filling a buffer with ADC_MID_SCALE and updating once works", () => {
    const buf = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE);
    updateBuffer(buf, 2500);
    expect(buf.length).toBe(BUFFER_SIZE);
    expect(buf[BUFFER_SIZE - 1]).toBe(2500);
    expect(buf[0]).toBe(ADC_MID_SCALE);
  });
});

// =============================================================================
// parseSerialLine
// =============================================================================

describe("Stage 1 — parseSerialLine()", () => {
  test("parses a standard 'timestamp,value' line", () => {
    expect(parseSerialLine("1234,2048")).toEqual({ ts: 1234, val: 2048 });
  });

  test("trims leading and trailing whitespace from the line", () => {
    expect(parseSerialLine("  500,1000  ")).toEqual({ ts: 500, val: 1000 });
  });

  test("handles Windows-style carriage-return line endings", () => {
    expect(parseSerialLine("9999,4095\r")).toEqual({ ts: 9999, val: 4095 });
  });

  test("parses the minimum ADC value (0)", () => {
    expect(parseSerialLine("0,0")).toEqual({ ts: 0, val: 0 });
  });

  test("parses the maximum ADC value (4095)", () => {
    expect(parseSerialLine("60000,4095")).toEqual({ ts: 60000, val: 4095 });
  });

  test("returns null for an empty string", () => {
    expect(parseSerialLine("")).toBeNull();
  });

  test("returns null when there is no comma", () => {
    expect(parseSerialLine("12342048")).toBeNull();
  });

  test("returns null when there are more than two comma-separated parts", () => {
    expect(parseSerialLine("1234,2048,extra")).toBeNull();
  });

  test("returns null when the value part is not a number", () => {
    expect(parseSerialLine("1234,abc")).toBeNull();
  });

  test("returns null for a line that is only a comma", () => {
    expect(parseSerialLine(",")).toBeNull();
  });

  test("returns null when the value part is missing (trailing comma)", () => {
    expect(parseSerialLine("1234,")).toBeNull();
  });

  test("returns a result even when the timestamp part is not a valid number", () => {
    // The sketch skips lines only when val is NaN; ts being NaN is allowed.
    const result = parseSerialLine("abc,2048");
    expect(result).not.toBeNull();
    expect(result.val).toBe(2048);
    expect(isNaN(result.ts)).toBe(true);
  });
});
