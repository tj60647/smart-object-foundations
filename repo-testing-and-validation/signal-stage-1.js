// =============================================================================
// File:    signal-stage-1.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   1 — Raw Waveform Display
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// This module extracts the pure signal-processing and data-parsing logic from
// sketch.js so that it can be imported and tested in a Node.js environment
// without any dependency on p5.js or the WebSerial API.
//
// The functions here are identical in behaviour to those in sketch.js;
// they are split into a separate file only to enable automated testing.

// =============================================================================
// CONSTANTS
// =============================================================================

// Time between Arduino samples (must match the Arduino sketch): 10 ms = 100 Hz.
const SAMPLE_INTERVAL_MS = 10;

// The ESP32 ADC produces integers from 0 (0 V) to 4095 (3.3 V).
const YMIN = 0;
const YMAX = 4095;

// Midpoint of the ADC range, used to pre-fill the buffer so the waveform
// starts as a flat line in the centre of the canvas.
const ADC_MID_SCALE = (YMIN + YMAX) / 2;

// Number of samples to keep in the rolling display buffer (5 s × 100 Hz).
const BUFFER_SIZE = 500;

// =============================================================================
// FUNCTIONS
// =============================================================================

// updateBuffer() — appends a new value to a fixed-length rolling buffer and
// removes the oldest value from the front so the length never changes.
//
// buf   — the array to update (mutated in place)
// value — the new number to add
function updateBuffer(buf, value) {
  buf.push(value);  // add new value at the end
  buf.shift();      // remove oldest value from the front
}

// parseSerialLine() — parses one "timestamp,value" line from the ESP32.
//
// Returns { ts, val } if the line is valid, or null if it is malformed.
// Matches the inline parsing logic inside readLoop() in sketch.js:
//   • The line is trimmed and split on a comma.
//   • Exactly two parts must be present.
//   • val must be a finite integer (not NaN).
//   • ts is parsed but is not required to be a valid integer.
//
// line — a single text line, e.g. "1234,2048" or "  1234,2048\r"
function parseSerialLine(line) {
  const parts = line.trim().split(",");
  if (parts.length !== 2) return null;

  const ts  = parseInt(parts[0], 10);
  const val = parseInt(parts[1], 10);

  if (isNaN(val)) return null;

  return { ts, val };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  SAMPLE_INTERVAL_MS,
  YMIN,
  YMAX,
  ADC_MID_SCALE,
  BUFFER_SIZE,
  updateBuffer,
  parseSerialLine,
};
