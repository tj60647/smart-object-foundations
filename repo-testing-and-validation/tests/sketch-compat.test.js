// =============================================================================
// File:    tests/sketch-compat.test.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// Browser and OpenProcessing compatibility checks for each stage's sketch.js.
//
// When a student pastes sketch.js into OpenProcessing or the p5.js web editor,
// the code runs as a plain browser script in p5's "global mode" — there is no
// Node.js runtime, no module bundler, and no require(). These tests catch any
// accidental use of Node.js-specific syntax or missing p5.js entry points
// before a student ever opens the editor.
//
// Checks per sketch:
//   1. File exists and is non-empty
//   2. No require() calls          — Node.js module system, absent in browsers
//   3. No import / export / module.exports — ES/CJS module syntax that
//      OpenProcessing does not support when code is pasted as a single file
//   4. No __dirname / __filename / process.  — Node.js globals that throw
//      ReferenceError when the browser encounters them
//   5. Defines function setup()    — p5.js calls this once on page load
//   6. Defines function draw()     — p5.js calls this on every animation frame
//   7. Calls createCanvas()        — creates the rendering surface in setup()
//   8. References navigator.serial — the WebSerial API entry point
//   9. Syntactically valid JavaScript

"use strict";

const fs   = require("fs");
const path = require("path");

// ROOT points two levels up from this file (repo-testing-and-validation/tests/)
// to the repository root where the stage folders live.
const ROOT = path.resolve(__dirname, "../..");

const SKETCHES = {
  "stage-1": path.join(ROOT, "stage-1-raw-waveform",        "p5", "sketch.js"),
  "stage-2": path.join(ROOT, "stage-2-clean-signal",        "p5", "sketch.js"),
  "stage-3": path.join(ROOT, "stage-3-heartbeat-detection", "p5", "sketch.js"),
};

// Helper: read a file as a string (throws if the file does not exist).
function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// Helper: return null when the code parses cleanly, or an error message when
// it does not. The code is wrapped in an async function body so that await
// keywords inside async function declarations parse correctly.
function syntaxError(code) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(`(async () => {\n${code}\n})()`);
    return null;
  } catch (e) {
    return e.message;
  }
}

// =============================================================================
// 1. File existence and size
// =============================================================================

describe("sketch.js — file existence", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    describe(name, () => {
      test("sketch.js exists", () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      test("sketch.js is non-empty (> 1 KB)", () => {
        const size = fs.statSync(filePath).size;
        expect(size).toBeGreaterThan(1024);
      });
    });
  }
});

// =============================================================================
// 2 & 3. No Node.js module syntax (require / import / export / module.exports)
// =============================================================================

describe("sketch.js — no Node.js or ES module syntax", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    describe(name, () => {
      let code;
      beforeAll(() => { code = read(filePath); });

      test("does not call require() — Node.js module system is absent in browsers", () => {
        // Match require( with optional whitespace before the paren.
        expect(code).not.toMatch(/\brequire\s*\(/);
      });

      test("does not use import statements — not supported in OpenProcessing paste mode", () => {
        // Match import as a statement keyword at the start of a line (after
        // optional leading whitespace) to avoid matching the word "import" in
        // comments or identifiers.
        expect(code).not.toMatch(/^\s*import\s+/m);
      });

      test("does not use export statements — not supported in OpenProcessing paste mode", () => {
        expect(code).not.toMatch(/^\s*export\s+/m);
      });

      test("does not use module.exports — Node.js only, meaningless in browsers", () => {
        expect(code).not.toMatch(/\bmodule\.exports\b/);
      });
    });
  }
});

// =============================================================================
// 4. No Node.js-only globals
// =============================================================================

describe("sketch.js — no Node.js-only globals", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    describe(name, () => {
      let code;
      beforeAll(() => { code = read(filePath); });

      test("does not reference __dirname — throws ReferenceError in browsers", () => {
        expect(code).not.toMatch(/\b__dirname\b/);
      });

      test("does not reference __filename — throws ReferenceError in browsers", () => {
        expect(code).not.toMatch(/\b__filename\b/);
      });

      test("does not use process. (e.g. process.env) — Node.js global absent in browsers", () => {
        // Match the word "process" immediately followed by a dot, which is the
        // sign of a Node.js API access (process.env, process.argv, etc.).
        // Plain uses of the word "process" in comments (e.g. "the process of
        // removing DC drift") never have a dot directly after the word, so this
        // pattern does not produce false positives.
        expect(code).not.toMatch(/\bprocess\./);
      });
    });
  }
});

// =============================================================================
// 5 & 6. p5.js global-mode entry points
// =============================================================================

describe("sketch.js — p5.js global-mode entry points", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    describe(name, () => {
      let code;
      beforeAll(() => { code = read(filePath); });

      test("defines function setup() — p5.js calls this once when the page loads", () => {
        // Match a top-level function declaration (no leading whitespace, which
        // would indicate it is nested inside another function).
        expect(code).toMatch(/^function setup\s*\(\s*\)/m);
      });

      test("defines function draw() — p5.js calls this on every animation frame", () => {
        expect(code).toMatch(/^function draw\s*\(\s*\)/m);
      });
    });
  }
});

// =============================================================================
// 7. createCanvas() call
// =============================================================================

describe("sketch.js — createCanvas()", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    test(`${name}: calls createCanvas() to create the p5.js rendering surface`, () => {
      const code = read(filePath);
      expect(code).toMatch(/\bcreateCanvas\s*\(/);
    });
  }
});

// =============================================================================
// 8. WebSerial API reference
// =============================================================================

describe("sketch.js — WebSerial API", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    test(`${name}: references navigator.serial — the browser WebSerial entry point`, () => {
      const code = read(filePath);
      expect(code).toMatch(/\bnavigator\.serial\b/);
    });
  }
});

// =============================================================================
// 9. JavaScript syntax validity
// =============================================================================

describe("sketch.js — JavaScript syntax validity", () => {
  for (const [name, filePath] of Object.entries(SKETCHES)) {
    test(`${name}: sketch.js is syntactically valid JavaScript`, () => {
      const code = read(filePath);
      const err  = syntaxError(code);
      expect(err).toBeNull();
    });
  }
});
